import * as NodeHttpServer from '@effect/platform-node/NodeHttpServer'
import { Context, Effect, Layer, Ref, Schema as S } from 'effect'
import { HttpServerRequest, HttpServerResponse } from 'effect/http'
import { createServer } from 'node:http'

const ReceivedStatus = S.Struct({ code: S.Finite, message: S.optional(S.String) })
const ReceivedEvent = S.Struct({ name: S.String })
const ReceivedSpan = S.Struct({
  name: S.String,
  status: S.optional(ReceivedStatus),
  events: S.Array(ReceivedEvent).pipe(S.optional, S.withDecodingDefaultType(Effect.succeed([]))),
})
const TraceData = S.Struct({
  resourceSpans: S.Array(
    S.Struct({ scopeSpans: S.Array(S.Struct({ spans: S.Array(ReceivedSpan) })) }),
  ),
})

export type ReceivedStatus = S.Schema.Type<typeof ReceivedStatus>
export type ReceivedEvent = S.Schema.Type<typeof ReceivedEvent>
export type OtlpSpan = S.Schema.Type<typeof ReceivedSpan>

const spansOf = (traces: S.Schema.Type<typeof TraceData>): ReadonlyArray<OtlpSpan> =>
  traces.resourceSpans.flatMap((resource) => resource.scopeSpans.flatMap((scope) => scope.spans))

export class OtlpReceiver extends Context.Service<OtlpReceiver, {
  readonly endpoint: string
  readonly spans: Effect.Effect<ReadonlyArray<OtlpSpan>>
}>()('OtlpReceiver') {}

export const otlpReceiverLayer = Layer.effect(
  OtlpReceiver,
  Effect.gen(function*() {
    const received = yield* Ref.make<ReadonlyArray<OtlpSpan>>([])
    const server = yield* NodeHttpServer.make(() => createServer(), { host: '127.0.0.1', port: 0 })
    yield* server.serve(
      Effect.gen(function*() {
        const traces = yield* HttpServerRequest.schemaBodyJson(TraceData)
        yield* Ref.update(received, (spans) => [...spans, ...spansOf(traces)])
        return HttpServerResponse.empty()
      }),
    )
    return { endpoint: `http://${server.address.toString()}`, spans: Ref.get(received) }
  }),
)
