import { Cell, Sandwich } from '@systemfsoftware/effect-cell-types'
import { Cause, Effect, Result } from 'effect'
import { HttpServerRequest, HttpServerResponse } from 'effect/http'
import * as S from 'effect/Schema'

import { markdown } from 'virtual:readme-opening'
import { cspHeadersOf, CspNonce } from './content-security-policy.schema'
import { ServePage } from './FrontDoorTaxonomy'
import { HtmlPort } from './html-port.service'
import { llmsTxt, LlmsTxtCommand } from './llms-txt.workflow'
import { HOME_CATALOG, Origin, PageFailure, parseAccept, prefersHtml } from './serve-page.schema'
import { servePage } from './serve-page.workflow'

const ServerRequest = HttpServerRequest.HttpServerRequest

const NOT_FOUND_BODY = '# Not found\n\nThe page you asked for is not here. Try `/`.\n'

const FAILURE_BODY = '# Internal Server Error\n\nThe page could not be rendered.\n'

const FAILURE_HTML =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Internal Server Error</title></head><body><h1>Internal Server Error</h1><p>The page could not be rendered.</p></body></html>'
export interface ServePageRequest {
  readonly request: HttpServerRequest.HttpServerRequest
  readonly random: Crypto
}

const drawNonce = (random: Crypto) =>
  Effect.gen(function*() {
    const bytes = random.getRandomValues(new Uint8Array(16))
    return yield* S.decodeEffect(CspNonce)(btoa(String.fromCharCode(...Array.from(bytes))))
  })

const markdownBody = (body: string, status: number): HttpServerResponse.HttpServerResponse =>
  HttpServerResponse.setHeader(
    HttpServerResponse.text(body, { contentType: 'text/markdown; charset=utf-8', status }),
    'Vary',
    'Accept',
  )

const htmlBody = (body: string, status: number): HttpServerResponse.HttpServerResponse =>
  HttpServerResponse.setHeader(
    HttpServerResponse.text(body, { contentType: 'text/html; charset=utf-8', status }),
    'Vary',
    'Accept',
  )

const withCsp = (response: HttpServerResponse.HttpServerResponse, nonce: CspNonce) => {
  const csp = cspHeadersOf(nonce)
  return HttpServerResponse.setHeaders(response, {
    'Content-Security-Policy': csp.contentSecurityPolicy,
    'Reporting-Endpoints': csp.reportingEndpoints,
  })
}

const acceptOf = (request: HttpServerRequest.HttpServerRequest): string => request.headers['accept'] ?? ''

const failureResponseOf = ({ request, random }: ServePageRequest) =>
  prefersHtml(parseAccept(acceptOf(request)))
    ? Effect.map(Effect.orDie(drawNonce(random)), (nonce) => withCsp(htmlBody(FAILURE_HTML, 500), nonce))
    : Effect.succeed(markdownBody(FAILURE_BODY, 500))

const llmsDocumentOf = (origin: string): string =>
  Result.getOrThrow(llmsTxt(LlmsTxtCommand.make({ origin: Origin.make(origin), pages: HOME_CATALOG }))).document

const renderHtml = (command: { readonly nonce: CspNonce }) =>
  Effect.gen(function*() {
    const request = yield* ServerRequest
    const port = yield* HtmlPort
    const web = yield* HttpServerRequest.toWeb(request).pipe(
      Effect.catchCause((cause) => Effect.fail(new PageFailure({ detail: Cause.pretty(cause) }))),
    )
    const response = yield* port.render(web, command.nonce).pipe(
      Effect.catchCause((cause) => Effect.fail(new PageFailure({ detail: Cause.pretty(cause) }))),
    )
    return withCsp(HttpServerResponse.setHeader(HttpServerResponse.fromWeb(response), 'Vary', 'Accept'), command.nonce)
  })

const read = ({ request, random }: ServePageRequest) =>
  Effect.gen(function*() {
    const web = yield* HttpServerRequest.toWeb(request).pipe(
      Effect.catchCause((cause) => Effect.fail(new PageFailure({ detail: Cause.pretty(cause) }))),
    )
    const url = new URL(web.url)
    return {
      path: url.pathname,
      accept: request.headers['accept'] ?? '',
      origin: url.origin,
      nonce: yield* drawNonce(random),
    }
  })

const failureCell = Cell.flatMap(Cell.id<ServePageRequest>(), (input) => Cell.fromEffect(failureResponseOf(input)))

export const servePageCell = Sandwich.named(ServePage.name)(read)
  .decide(servePage)
  .write({
    ServeMarkdownPage: () => Effect.succeed(markdownBody(markdown, 200)),
    ServeHtmlPage: (_value, command) => renderHtml(command),
    ServeLlmsTxt: (_value, command) =>
      Effect.succeed(
        HttpServerResponse.text(llmsDocumentOf(command.origin), { contentType: 'text/markdown; charset=utf-8' }),
      ),
    ServeMarkdownNotFound: () => Effect.succeed(markdownBody(NOT_FOUND_BODY, 404)),
    CommandRejected: (rejected) => Effect.succeed(markdownBody(`# Bad Request\n\n${rejected.issue}\n`, 400)),
  })
  .pipe(Cell.orElse(failureCell))
