import startHandler from '@tanstack/react-start/server-entry'
import { env } from 'cloudflare:workers'
import * as Effect from 'effect/Effect'
import { HttpRouter } from 'effect/http'
import * as Match from 'effect/Match'
import * as S from 'effect/Schema'

import { SITE_MCP_PATH, SiteMcpLive } from './api/site-mcp-server'
import { SiteRpcLive } from './api/site-rpc-server'
import { SITE_RPC_PATH } from './api/site-rpcs'
import { contentSecurityPolicyOf, CspNonce } from './csp/content-security-policy.schema'
import todoCss from './features/todo/todo.css?raw'

const siteRpc = HttpRouter.toWebHandler(SiteRpcLive)
const siteMcp = HttpRouter.toWebHandler(SiteMcpLive)

const isRpcRequest = (pathname: string): boolean => pathname === SITE_RPC_PATH
const isMcpRequest = (pathname: string): boolean => pathname === SITE_MCP_PATH
const isStyleRequest = (pathname: string): boolean => pathname === '/todo.css'
const isAppRequest = (pathname: string): boolean => pathname === '/app' || pathname.startsWith('/app/')

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

const appResponse = (request: Request): Promise<Response> => {
  const url = new URL(request.url)
  const lastSegment = url.pathname.slice(url.pathname.lastIndexOf('/') + 1)
  if (!lastSegment.includes('.')) url.pathname = '/app/'
  return env.ASSETS.fetch(new Request(url, request))
}

const styleResponse = (): Promise<Response> =>
  Promise.resolve(new Response(todoCss, { headers: { 'content-type': 'text/css; charset=utf-8' } }))

const siteResponse = (request: Request, pathname: string): Promise<Response> =>
  Match.value(pathname).pipe(
    Match.when(isRpcRequest, () => siteRpc.handler(request)),
    Match.when(isMcpRequest, () => siteMcp.handler(request)),
    Match.when(isStyleRequest, () => styleResponse()),
    Match.orElse(() => Effect.runPromise(serve(request, globalThis.crypto))),
  )

export default {
  fetch: (request: Request): Promise<Response> => {
    const pathname = new URL(request.url).pathname
    if (isAppRequest(pathname)) return appResponse(request)
    return siteResponse(request, pathname)
  },
}
