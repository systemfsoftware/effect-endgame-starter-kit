import startHandler from '@tanstack/react-start/server-entry'
import { layer as cloudflareTracerLayer } from 'alchemy/Cloudflare/Workers/CloudflareTracer'
import { Context, Effect, Layer } from 'effect'
import { FetchHttpClient } from 'effect/http'
import { Otlp } from 'effect/observability'

import type { CspNonce } from './front-door/content-security-policy.schema'
import { frontDoorHandlerWith, HtmlPort } from './mod'

interface Env {
  readonly OTLP_BASE_URL?: string | undefined
}

let otlpLayerCache: Layer.Layer<never> | undefined

const otlpLayer = (
  baseUrl: string,
) => (otlpLayerCache ??= Otlp.layerJson({ baseUrl, resource: { serviceName: 'endgame-site' } }).pipe(
  Layer.provide(FetchHttpClient.layer),
))

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const context = Context.make(HtmlPort, {
      render: (web: Request, nonce: CspNonce) =>
        Effect.promise(() => Promise.resolve(startHandler.fetch(web, { context: { nonce } }))),
    })
    const handler = frontDoorHandlerWith(context)
    const layer = env.OTLP_BASE_URL === undefined ? cloudflareTracerLayer : otlpLayer(env.OTLP_BASE_URL)
    return Effect.runPromise(
      Effect.scoped(
        Effect.gen(function*() {
          const traceContext = yield* Layer.build(layer)
          return yield* Effect.promise(() => handler(request, traceContext))
        }),
      ),
    )
  },
}
