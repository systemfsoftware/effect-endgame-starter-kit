import { Clock, Config, ConfigProvider, Effect, Redacted, Schedule } from 'effect'
import { HttpClient, HttpClientRequest } from 'effect/http'
import * as S from 'effect/Schema'

const API_BASE_URL = 'https://api.cloudflare.com/client/v4'
const TELEMETRY_PATH = '/workers/observability/telemetry/query'
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

export class TelemetryResponseUndecodable extends S.TaggedError<TelemetryResponseUndecodable>()(
  'TelemetryResponseUndecodable',
  { reason: S.String },
) {
  override get message(): string {
    return `The telemetry response did not decode: ${this.reason}`
  }
}

export interface TraceSpan {
  readonly name: string
  readonly attributes: Readonly<Record<string, S.Json>>
}

interface TelemetryFilter {
  readonly key: string
  readonly operation: 'eq' | 'starts_with'
  readonly type: 'string'
  readonly value: string
}

interface TelemetryQueryRequest {
  readonly queryId: string
  readonly view: typeof EVENT_VIEW
  readonly timeframe: { readonly from: number; readonly to: number }
  readonly parameters: {
    readonly filters: ReadonlyArray<TelemetryFilter>
    readonly limit: number
  }
}

const TelemetryMetadata = S.Struct({
  rayId: S.optional(S.String),
  traceId: S.optional(S.String),
  spanId: S.optional(S.String),
  spanName: S.optional(S.String),
  service: S.optional(S.String),
})

const TelemetrySource = S.Union([S.String, S.Record(S.String, S.Json)])
const TelemetryEvent = S.Struct({ '$metadata': TelemetryMetadata, source: S.optional(TelemetrySource) })
type TelemetryEvent = S.Schema.Type<typeof TelemetryEvent>

const TelemetryError = S.Struct({ message: S.String })
const TelemetryErrors = S.Array(TelemetryError)

const TelemetryEventBatch = S.Struct({ count: S.Finite, events: S.Array(TelemetryEvent) })

const TelemetryResult = S.Struct({ events: S.optional(TelemetryEventBatch) })

const CloudflareEnvelope = S.Struct({
  success: S.Boolean,
  errors: TelemetryErrors,
  messages: S.optional(TelemetryErrors),
  result: TelemetryResult,
})

const filterOf = (key: string, operation: TelemetryFilter['operation'], value: string): TelemetryFilter => ({
  key,
  operation,
  type: 'string',
  value,
})

const rayIdWithoutColo = (cfRay: string): string => cfRay.split('-')[0] ?? cfRay

const eventsOf = (result: S.Schema.Type<typeof TelemetryResult>): ReadonlyArray<TelemetryEvent> =>
  result.events?.events ?? []

const isJsonObject = (value: S.Json): value is S.JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const flattenedAttributes = (prefix: string, value: S.JsonObject): ReadonlyArray<readonly [string, S.Json]> =>
  Object.entries(value).flatMap(([key, nested]) =>
    isJsonObject(nested)
      ? flattenedAttributes(`${prefix}${key}.`, nested)
      : [[`${prefix}${key}`, nested] as const]
  )

const attributesOf = (event: TelemetryEvent): Readonly<Record<string, S.Json>> =>
  typeof event.source === 'object' ? Object.fromEntries(flattenedAttributes('', event.source)) : {}

const spansOf = (events: ReadonlyArray<TelemetryEvent>): ReadonlyArray<TraceSpan> =>
  events.flatMap((event) => {
    const name = event['$metadata'].spanName
    return name === undefined ? [] : [{ name, attributes: attributesOf(event) }]
  })

const queryTelemetry = (
  access: CloudflareAccess,
  filters: ReadonlyArray<TelemetryFilter>,
): Effect.Effect<
  S.Schema.Type<typeof TelemetryResult>,
  TelemetryQueryRejected | TelemetryResponseUndecodable,
  HttpClient.HttpClient
> =>
  Effect.gen(function*() {
    const client = yield* HttpClient.HttpClient
    const now = yield* Clock.currentTimeMillis
    const body: TelemetryQueryRequest = {
      queryId: QUERY_ID,
      view: EVENT_VIEW,
      timeframe: { from: now - TIMEFRAME_LOOKBACK_MS, to: now },
      parameters: { filters, limit: EVENTS_LIMIT },
    }
    const request = HttpClientRequest.setHeader(
      HttpClientRequest.post(`${API_BASE_URL}/accounts/${access.accountId}${TELEMETRY_PATH}`),
      'authorization',
      `Bearer ${Redacted.value(access.token)}`,
    )
    const withBody = yield* Effect.orDie(HttpClientRequest.bodyJson(request, body))
    const response = yield* Effect.orDie(client.execute(withBody))
    const payload = yield* Effect.orDie(response.json)
    const envelope = yield* S.decodeUnknownEffect(CloudflareEnvelope)(payload).pipe(
      Effect.mapError((issue) => new TelemetryResponseUndecodable({ reason: issue.message })),
    )
    if (!envelope.success) {
      return yield* new TelemetryQueryRejected({
        reason: envelope.errors.map((error) => error.message).join('; '),
      })
    }
    return envelope.result
  })

const findRayIdEvent = (
  access: CloudflareAccess,
  rayId: string,
): Effect.Effect<
  TelemetryEvent,
  RayIdNotObserved | TelemetryQueryRejected | TelemetryResponseUndecodable,
  HttpClient.HttpClient
> =>
  queryTelemetry(access, [filterOf(RAY_ID_KEY, 'starts_with', rayIdWithoutColo(rayId))]).pipe(
    Effect.flatMap((result) => {
      const first = eventsOf(result)[0]
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
  RayIdNotObserved | TelemetryQueryRejected | TelemetryResponseUndecodable,
  HttpClient.HttpClient
> =>
  Effect.gen(function*() {
    const event = yield* findRayIdEvent(query.access, query.rayId)
    const traceId = event['$metadata'].traceId
    if (traceId === undefined) {
      return yield* new TelemetryResponseUndecodable({
        reason: `the event matching Ray ID ${query.rayId} carried no ${TRACE_ID_KEY}`,
      })
    }
    const traceEvents = yield* queryTelemetry(query.access, [filterOf(TRACE_ID_KEY, 'eq', traceId)]).pipe(
      Effect.map(eventsOf),
    )
    return spansOf(traceEvents)
  })
