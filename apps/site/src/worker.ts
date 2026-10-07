import startHandler from '@tanstack/react-start/server-entry'
import * as Effect from 'effect/Effect'
import { HttpRouter } from 'effect/http'
import * as S from 'effect/Schema'

import { SiteRpcLive } from './api/site-rpc-server'
import { SITE_RPC_PATH } from './api/site-rpcs'
import { contentSecurityPolicyOf, CspNonce } from './csp/content-security-policy.schema'

const siteRpc = HttpRouter.toWebHandler(SiteRpcLive)

const isRpcRequest = (request: Request): boolean => new URL(request.url).pathname === SITE_RPC_PATH

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
    isRpcRequest(request) ? siteRpc.handler(request) : Effect.runPromise(serve(request, globalThis.crypto)),
}
