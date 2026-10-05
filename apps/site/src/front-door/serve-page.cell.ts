import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Effect, Result } from 'effect'
import { HttpServerRequest, HttpServerResponse } from 'effect/http'

import { markdown } from 'virtual:readme-opening'
import { ServePage } from './FrontDoorTaxonomy'
import { HtmlPort } from './html-port.service'
import { LlmsPage, llmsTxt, LlmsTxtCommand } from './llms-txt.workflow'
import { servePage } from './serve-page.workflow'

const ServerRequest = HttpServerRequest.HttpServerRequest

const HOME_CATALOG: ReadonlyArray<LlmsPage> = [{ title: 'Endgame Starter', path: '/' }]

const NOT_FOUND_BODY = '# Not found\n\nThe page you asked for is not here. Try `/`.\n'

const markdownBody = (body: string, status: number): HttpServerResponse.HttpServerResponse =>
  HttpServerResponse.setHeader(
    HttpServerResponse.text(body, { contentType: 'text/markdown; charset=utf-8', status }),
    'Vary',
    'Accept',
  )

const llmsDocumentOf = (origin: string): string =>
  Result.getOrThrow(llmsTxt(LlmsTxtCommand.make({ origin, pages: HOME_CATALOG }))).document

const renderHtml = () =>
  Effect.gen(function*() {
    const request = yield* ServerRequest
    const port = yield* HtmlPort
    const web = yield* Effect.orDie(HttpServerRequest.toWeb(request))
    const response = yield* port.render(web)
    return HttpServerResponse.setHeader(HttpServerResponse.fromWeb(response), 'Vary', 'Accept')
  })

const read = (request: HttpServerRequest.HttpServerRequest) =>
  Effect.gen(function*() {
    const web = yield* Effect.orDie(HttpServerRequest.toWeb(request))
    const url = new URL(web.url)
    return {
      path: url.pathname,
      accept: request.headers['accept'] ?? '',
      origin: url.origin,
    }
  })

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
