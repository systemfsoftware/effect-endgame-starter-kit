import { Context, Effect, Layer } from 'effect'
import { FetchHttpClient, HttpEffect } from 'effect/http'
import { Flusher } from 'effect/observability/OtlpExporter'
import { layerJson as otlpJsonSerialization } from 'effect/observability/OtlpSerialization'
import * as OtlpTracer from 'effect/observability/OtlpTracer'
import * as Scope from 'effect/Scope'

import { HtmlPort } from '@endgame/site'
import { frontDoor } from '@endgame/site'

declare const __OTLP_ENDPOINT__: string

const renderUnavailable = Layer.succeed(HtmlPort, {
  render: () => Effect.promise(() => Promise.reject(new Error('renderer unavailable'))),
})

const exportDependencies = Layer.mergeAll(otlpJsonSerialization, FetchHttpClient.layer)

const tracesToReceiver = OtlpTracer.layer({
  url: `${__OTLP_ENDPOINT__}/v1/traces`,
  resource: { serviceName: 'endgame-site' },
  exportInterval: '250 millis',
}).pipe(Layer.provide(exportDependencies))

const frontDoorLayer = Layer.mergeAll(renderUnavailable, tracesToReceiver)

const buildHandler = () =>
  Effect.runPromise(
    Effect.gen(function*() {
      const context = yield* Layer.buildWithScope(frontDoorLayer, Scope.makeUnsafe())
      const flusher = Context.get(context, Flusher)
      return HttpEffect.toWebHandler(
        frontDoor.pipe(Effect.provideContext(context), Effect.ensuring(flusher.flush)),
      )
    }),
  )

let handler: Promise<(request: Request) => Promise<Response>> | undefined

export default {
  fetch: (request: Request) => {
    handler ??= buildHandler()
    return handler.then((serve) => serve(request))
  },
}
