import { Cell, Sandwich } from '@systemfsoftware/effect-cell-types'
import { Cause, Effect, Result } from 'effect'
import { HttpServerRequest, HttpServerResponse } from 'effect/http'

import { markdown } from 'virtual:readme-opening'
import { ServePage } from './FrontDoorTaxonomy'
import { HtmlPort } from './html-port.service'
import { llmsTxt, LlmsTxtCommand } from './llms-txt.workflow'
import { HOME_CATALOG, Origin, PageFailure } from './serve-page.schema'
import { servePage } from './serve-page.workflow'

const ServerRequest = HttpServerRequest.HttpServerRequest

const NOT_FOUND_BODY = '# Not found\n\nThe page you asked for is not here. Try `/`.\n'

const FAILURE_HTML =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Internal Server Error</title></head><body><h1>Internal Server Error</h1><p>The page could not be rendered.</p></body></html>'

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

const failureResponse = (): HttpServerResponse.HttpServerResponse => htmlBody(FAILURE_HTML, 500)

const llmsDocumentOf = (origin: string): string =>
  Result.getOrThrow(llmsTxt(LlmsTxtCommand.make({ origin: Origin.make(origin), pages: HOME_CATALOG }))).document

const renderHtml = () =>
  Effect.gen(function*() {
    const request = yield* ServerRequest
    const port = yield* HtmlPort
    const web = yield* HttpServerRequest.toWeb(request).pipe(
      Effect.catchCause((cause) => Effect.fail(new PageFailure({ detail: Cause.pretty(cause) }))),
    )
    const response = yield* port.render(web).pipe(
      Effect.catchCause((cause) => Effect.fail(new PageFailure({ detail: Cause.pretty(cause) }))),
    )
    return HttpServerResponse.setHeader(HttpServerResponse.fromWeb(response), 'Vary', 'Accept')
  })

const read = (request: HttpServerRequest.HttpServerRequest) =>
  Effect.gen(function*() {
    const web = yield* HttpServerRequest.toWeb(request).pipe(
      Effect.catchCause((cause) => Effect.fail(new PageFailure({ detail: Cause.pretty(cause) }))),
    )
    const url = new URL(web.url)
    return {
      path: url.pathname,
      accept: request.headers['accept'] ?? '',
      origin: url.origin,
    }
  })

const failureCell = Cell.map(
  Cell.id<HttpServerRequest.HttpServerRequest>(),
  () => failureResponse(),
)

export const servePageCell = Sandwich.named(ServePage.name)(read)
  .decide(servePage)
  .write({
    ServeMarkdownPage: () => Effect.succeed(markdownBody(markdown, 200)),
    ServeHtmlPage: () => renderHtml(),
    ServeLlmsTxt: (_value, command) =>
      Effect.succeed(
        HttpServerResponse.text(llmsDocumentOf(command.origin), { contentType: 'text/markdown; charset=utf-8' }),
      ),
    ServeMarkdownNotFound: () => Effect.succeed(markdownBody(NOT_FOUND_BODY, 404)),
    CommandRejected: (rejected) => Effect.succeed(markdownBody(`# Bad Request\n\n${rejected.issue}\n`, 400)),
  })
  .pipe(Cell.orElse(failureCell))
