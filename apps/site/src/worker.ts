import startHandler from '@tanstack/react-start/server-entry'
import * as Effect from 'effect/Effect'
import { HttpRouter } from 'effect/http'
import * as S from 'effect/Schema'

import { SiteApiLive } from './api/site-api-handlers'
import { contentSecurityPolicyOf, CspNonce } from './csp/content-security-policy.schema'

const siteApi = HttpRouter.toWebHandler(SiteApiLive)

const isApiRequest = (request: Request): boolean => new URL(request.url).pathname.startsWith('/api/')

const drawNonce = (random: Crypto) =>
  S.decodeEffect(CspNonce)(btoa(String.fromCharCode(...random.getRandomValues(new Uint8Array(16)))))

const withPolicy = (response: Response, nonce: CspNonce): Response => {
  const headers = new Headers(response.headers)
  headers.set('Content-Security-Policy', contentSecurityPolicyOf(nonce))
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

const serve = (request: Request, random: Crypto) =>
  Effect.gen(function*() {
    const nonce = yield* Effect.orDie(drawNonce(random))
    const response = yield* Effect.promise(() => Promise.resolve(startHandler.fetch(request, { context: { nonce } })))
    return withPolicy(response, nonce)
  })

export default {
  fetch: (request: Request): Promise<Response> =>
    isApiRequest(request) ? siteApi.handler(request) : Effect.runPromise(serve(request, globalThis.crypto)),
}
