import { Context, Effect } from 'effect'
import { HttpEffect, HttpServerRequest, HttpServerResponse } from 'effect/http'
import * as Option from 'effect/Option'

import { CSP_REPORT_PATH } from './front-door/content-security-policy.schema'
import { HtmlPort } from './front-door/html-port.service'
import { recordCspViolationCell } from './front-door/record-csp-violation.cell'
import { CspReportBody, violationsOf } from './front-door/record-csp-violation.schema'
import { servePageCell } from './front-door/serve-page.cell'
import { RequestUrlUnparseable } from './front-door/serve-page.schema'

export { frontDoorTaxonomy, RecordCspViolation, ServePage } from './front-door/FrontDoorTaxonomy'
export { HtmlPort } from './front-door/html-port.service'

const ServerRequest = HttpServerRequest.HttpServerRequest

const platformRandom = globalThis.crypto

const isCspReport = (request: HttpServerRequest.HttpServerRequest, url: URL): boolean =>
  request.method === 'POST' && url.pathname === CSP_REPORT_PATH

const recordCspReport = () =>
  Effect.gen(function*() {
    const body = yield* HttpServerRequest.schemaBodyJson(CspReportBody)
    yield* Effect.forEach(violationsOf(body), (violation) => recordCspViolationCell.run(violation))
    return HttpServerResponse.empty()
  }).pipe(Effect.orElseSucceed(() => HttpServerResponse.empty({ status: 400 })))

const plainTextResponse = (body: string, status: number): HttpServerResponse.HttpServerResponse =>
  HttpServerResponse.text(`${body}\n`, { status, contentType: 'text/plain; charset=utf-8' })

export const frontDoor = Effect.flatMap(
  ServerRequest,
  (request) =>
    Option.match(Option.fromNullishOr(URL.parse(request.originalUrl)), {
      onNone: () => Effect.fail(new RequestUrlUnparseable({ url: request.originalUrl })),
      onSome: (url) =>
        isCspReport(request, url)
          ? recordCspReport()
          : servePageCell.run({ request, random: platformRandom, url }),
    }),
).pipe(Effect.catchTag('RequestUrlUnparseable', (error) => Effect.succeed(plainTextResponse(error.message, 400))))

export const frontDoorHandlerWith = (context: Context.Context<HtmlPort>) =>
  HttpEffect.toWebHandler(frontDoor.pipe(Effect.provideContext(context)))
