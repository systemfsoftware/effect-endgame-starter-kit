import * as Credentials from '@distilled.cloud/cloudflare/Credentials'
import * as workers from '@distilled.cloud/cloudflare/workers'
import { Clock, Config, ConfigProvider, Effect, Option, Redacted, Schedule } from 'effect'
import type { HttpClient } from 'effect/http'
import * as S from 'effect/Schema'

const QUERY_ID = 'endgame-deployed-trace'
const EVENT_VIEW = 'events'
const EVENTS_LIMIT = 100

const POLL_INTERVAL_MS = 5_000
const POLL_ATTEMPTS = 36
const POLL_BUDGET_MS = 180_000
const TIMEFRAME_LOOKBACK_MS = 600_000

const RAY_ID_KEY = '$metadata.rayId'
const TRACE_ID_KEY = '$metadata.traceId'

export interface CloudflareAccess {
  readonly accountId: string
  readonly token: Redacted.Redacted<string>
}

const cloudflareAccessConfig = Config.all({
  accountId: Config.String('CLOUDFLARE_ACCOUNT_ID'),
  token: Config.Redacted('CLOUDFLARE_API_TOKEN'),
})

export const cloudflareAccess: Effect.Effect<CloudflareAccess, Config.ConfigError> = cloudflareAccessConfig.parse(
  ConfigProvider.fromEnv(),
)

export class RayIdNotObserved extends S.TaggedError<RayIdNotObserved>()('RayIdNotObserved', {
  rayId: S.String,
}) {
  override get message(): string {
    return `No telemetry events observed for Ray ID ${this.rayId} within ${POLL_BUDGET_MS} ms`
  }
}

export class TelemetryQueryRejected extends S.TaggedError<TelemetryQueryRejected>()('TelemetryQueryRejected', {
  reason: S.String,
}) {
  override get message(): string {
    return `Cloudflare rejected the telemetry query: ${this.reason}`
  }
}

export class TraceIdMissing extends S.TaggedError<TraceIdMissing>()('TraceIdMissing', {
  rayId: S.String,
}) {
  override get message(): string {
    return `The event matching Ray ID ${this.rayId} carried no ${TRACE_ID_KEY}`
  }
}

export interface TraceSpan {
  readonly name: string
  readonly attributes: Readonly<Record<string, S.Json>>
}

type TelemetryEvent = workers.ObservabilityTelemetryQueryResponseEventsEventsItem
type TelemetryFilter = workers.ObservabilityTelemetryQueryRequestParametersFiltersItem

const JsonObject = S.Record(S.String, S.Json)

const filterOf = (key: string, operation: 'eq' | 'starts_with', value: string): TelemetryFilter => ({
  key,
  operation,
  type: 'string',
  value,
})

const rayIdWithoutColo = (cfRay: string): string => cfRay.split('-')[0] ?? cfRay

const isJsonObject = (value: S.Json): value is S.JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const flattenedAttributes = (prefix: string, value: S.JsonObject): ReadonlyArray<readonly [string, S.Json]> =>
  Object.entries(value).flatMap(([key, nested]) =>
    isJsonObject(nested)
      ? flattenedAttributes(`${prefix}${key}.`, nested)
      : [[`${prefix}${key}`, nested] as const]
  )

const attributesOf = (event: TelemetryEvent): Readonly<Record<string, S.Json>> =>
  Option.match(S.decodeUnknownOption(JsonObject)(event.source), {
    onNone: () => ({}),
    onSome: (source) => Object.fromEntries(flattenedAttributes('', source)),
  })

const spansOf = (events: ReadonlyArray<TelemetryEvent>): ReadonlyArray<TraceSpan> =>
  events.flatMap((event) => {
    const name = event.metadata.spanName
    return name === undefined || name === null ? [] : [{ name, attributes: attributesOf(event) }]
  })

const queryTelemetry = (
  access: CloudflareAccess,
  filters: ReadonlyArray<TelemetryFilter>,
): Effect.Effect<ReadonlyArray<TelemetryEvent>, TelemetryQueryRejected, HttpClient.HttpClient> =>
  Effect.gen(function*() {
    const now = yield* Clock.currentTimeMillis
    const result = yield* workers.queryObservabilityTelemetry({
      accountId: access.accountId,
      queryId: QUERY_ID,
      view: EVENT_VIEW,
      timeframe: { from: now - TIMEFRAME_LOOKBACK_MS, to: now },
      parameters: { filters: [...filters], limit: EVENTS_LIMIT },
    })
    return result.events?.events ?? []
  }).pipe(
    Effect.mapError((error) => new TelemetryQueryRejected({ reason: error.message })),
    Effect.provide(Credentials.fromApiToken({ apiToken: Redacted.value(access.token) })),
  )

const findRayIdEvent = (
  access: CloudflareAccess,
  rayId: string,
): Effect.Effect<TelemetryEvent, RayIdNotObserved | TelemetryQueryRejected, HttpClient.HttpClient> =>
  queryTelemetry(access, [filterOf(RAY_ID_KEY, 'starts_with', rayIdWithoutColo(rayId))]).pipe(
    Effect.flatMap((events) => {
      const first = events[0]
      return first === undefined ? Effect.fail(new RayIdNotObserved({ rayId })) : Effect.succeed(first)
    }),
    Effect.retry({
      schedule: Schedule.spaced(POLL_INTERVAL_MS).pipe(
        Schedule.upTo({ duration: POLL_BUDGET_MS, times: POLL_ATTEMPTS }),
      ),
      while: (error) => S.is(RayIdNotObserved)(error),
    }),
  )

export interface DeployedTraceQuery {
  readonly access: CloudflareAccess
  readonly rayId: string
}

export const readDeployedTraceSpans = (
  query: DeployedTraceQuery,
): Effect.Effect<
  ReadonlyArray<TraceSpan>,
  RayIdNotObserved | TelemetryQueryRejected | TraceIdMissing,
  HttpClient.HttpClient
> =>
  Effect.gen(function*() {
    const event = yield* findRayIdEvent(query.access, query.rayId)
    const traceId = event.metadata.traceId
    if (traceId === undefined || traceId === null) {
      return yield* new TraceIdMissing({ rayId: query.rayId })
    }
    const traceEvents = yield* queryTelemetry(query.access, [filterOf(TRACE_ID_KEY, 'eq', traceId)])
    return spansOf(traceEvents)
  })
