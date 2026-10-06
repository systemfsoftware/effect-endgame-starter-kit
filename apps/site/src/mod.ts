import { Context, Effect } from 'effect'
import { HttpEffect, HttpServerRequest, HttpServerResponse } from 'effect/http'
import * as Option from 'effect/Option'

import { CSP_REPORT_PATH } from './front-door/content-security-policy.schema'
import { HtmlPort } from './front-door/html-port.service'
import { recordCspViolationCell } from './front-door/record-csp-violation.cell'
import { CspReportBody, violationsOf } from './front-door/record-csp-violation.schema'
import { servePageCell } from './front-door/serve-page.cell'

export { frontDoorTaxonomy, RecordCspViolation, ServePage } from './front-door/FrontDoorTaxonomy'
export { HtmlPort } from './front-door/html-port.service'

const ServerRequest = HttpServerRequest.HttpServerRequest

const platformRandom = globalThis.crypto

const isCspReport = (request: HttpServerRequest.HttpServerRequest): boolean =>
  request.method === 'POST' &&
  Option.exists(HttpServerRequest.toURL(request), (url) => url.pathname === CSP_REPORT_PATH)

const recordCspReport = () =>
  Effect.gen(function*() {
    const body = yield* HttpServerRequest.schemaBodyJson(CspReportBody)
    yield* Effect.forEach(violationsOf(body), (violation) => recordCspViolationCell.run(violation))
    return HttpServerResponse.empty()
  }).pipe(Effect.orElseSucceed(() => HttpServerResponse.empty({ status: 400 })))

export const frontDoor = Effect.flatMap(
  ServerRequest,
  (request) => isCspReport(request) ? recordCspReport() : servePageCell.run({ request, random: platformRandom }),
)

export const frontDoorHandlerWith = (context: Context.Context<HtmlPort>) =>
  HttpEffect.toWebHandler(frontDoor.pipe(Effect.provideContext(context)))
