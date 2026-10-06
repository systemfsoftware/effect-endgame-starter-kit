import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Effect, Result } from 'effect'
import { HttpServerRequest, HttpServerResponse } from 'effect/http'
import * as S from 'effect/Schema'

import { markdown } from 'virtual:readme-opening'
import { cspHeadersOf, CspNonce } from './content-security-policy.schema'
import { ServePage } from './FrontDoorTaxonomy'
import { HtmlPort } from './html-port.service'
import { LlmsPage, llmsTxt, LlmsTxtCommand } from './llms-txt.workflow'
import { servePage } from './serve-page.workflow'

const ServerRequest = HttpServerRequest.HttpServerRequest

const HOME_CATALOG: ReadonlyArray<LlmsPage> = [{ title: 'Endgame Starter', path: '/' }]

const NOT_FOUND_BODY = '# Not found\n\nThe page you asked for is not here. Try `/`.\n'

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

const llmsDocumentOf = (origin: string): string =>
  Result.getOrThrow(llmsTxt(LlmsTxtCommand.make({ origin, pages: HOME_CATALOG }))).document

const renderHtml = (command: { readonly nonce: CspNonce }) =>
  Effect.gen(function*() {
    const request = yield* ServerRequest
    const port = yield* HtmlPort
    const web = yield* Effect.orDie(HttpServerRequest.toWeb(request))
    const response = yield* port.render(web, command.nonce)
    const csp = cspHeadersOf(command.nonce)
    return HttpServerResponse.setHeaders(
      HttpServerResponse.setHeader(HttpServerResponse.fromWeb(response), 'Vary', 'Accept'),
      {
        'Content-Security-Policy': csp.contentSecurityPolicy,
        'Reporting-Endpoints': csp.reportingEndpoints,
      },
    )
  })

const read = ({ request, random }: ServePageRequest) =>
  Effect.gen(function*() {
    const web = yield* Effect.orDie(HttpServerRequest.toWeb(request))
    const url = new URL(web.url)
    return {
      path: url.pathname,
      accept: request.headers['accept'] ?? '',
      origin: url.origin,
      nonce: yield* drawNonce(random),
    }
  })

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
