import { Context, Effect } from 'effect'
import * as Arr from 'effect/Array'
import { HttpEffect, HttpServerError, HttpServerRequest, HttpServerResponse } from 'effect/http'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as S from 'effect/Schema'
import * as Stream from 'effect/Stream'

import { CSP_REPORT_PATH } from './front-door/content-security-policy.schema'
import { RecordCspReport } from './front-door/FrontDoorTaxonomy'
import { HtmlPort } from './front-door/html-port.service'
import { recordCspViolationCell } from './front-door/record-csp-violation.cell'
import {
  boundedCspAttributeText,
  CspReportBody,
  CspReportFailed,
  CspReportOutcome,
  CspReportRefused,
  CspReportTooLarge,
  violationsOf,
} from './front-door/record-csp-violation.schema'
import { servePageCell } from './front-door/serve-page.cell'
import { RequestUrlUnparseable } from './front-door/serve-page.schema'

export { frontDoorTaxonomy, RecordCspReport, RecordCspViolation, ServePage } from './front-door/FrontDoorTaxonomy'
export { HtmlPort } from './front-door/html-port.service'

const ServerRequest = HttpServerRequest.HttpServerRequest

const platformRandom = globalThis.crypto

const MAX_CSP_REQUEST_BODY_BYTES = 64 * 1024

const MAX_CSP_REPORTS_PER_REQUEST = 100

const isCspReport = (request: HttpServerRequest.HttpServerRequest, url: URL): boolean =>
  request.method === 'POST' && url.pathname === CSP_REPORT_PATH

const plainTextResponse = (body: string, status: number): HttpServerResponse.HttpServerResponse =>
  HttpServerResponse.text(`${body}\n`, { status, contentType: 'text/plain; charset=utf-8' })

const declaredLengthOf = (request: HttpServerRequest.HttpServerRequest): number => {
  const declared = Number(request.headers['content-length'])
  return Number.isFinite(declared) ? declared : 0
}

const readBoundedBody = (
  request: HttpServerRequest.HttpServerRequest,
): Effect.Effect<string, HttpServerError.HttpServerError | CspReportTooLarge> => {
  const decoder = new TextDecoder()
  return Stream.runFoldEffect(
    request.stream,
    (): readonly [number, string] => [0, ''],
    ([received, text], chunk) => {
      const total = received + chunk.length
      return total > MAX_CSP_REQUEST_BODY_BYTES
        ? Effect.fail(new CspReportTooLarge({ limit: MAX_CSP_REQUEST_BODY_BYTES, received: total }))
        : Effect.succeed([total, text + decoder.decode(chunk, { stream: true })] as const)
    },
  ).pipe(Effect.map(([, text]) => text + decoder.decode()))
}

const decodeReport = (text: string): Effect.Effect<CspReportBody, CspReportRefused> =>
  S.decodeEffect(CspReportBody.pipe(S.toCodecJson, S.fromJsonString))(text).pipe(
    Effect.mapError((error) => new CspReportRefused({ reason: error.message })),
  )

const cappedViolations = (body: CspReportBody) => {
  const violations = violationsOf(body)
  const processed = Arr.take(violations, MAX_CSP_REPORTS_PER_REQUEST)
  return { processed, dropped: violations.length - processed.length }
}

const recordViolations = (body: CspReportBody): Effect.Effect<{ readonly dropped: number }> => {
  const { processed, dropped } = cappedViolations(body)
  return Effect.forEach(processed, (violation) => recordCspViolationCell.run(violation), { discard: true }).pipe(
    Effect.as({ dropped }),
  )
}

const failedOutcomeOf = (detail: string): CspReportOutcome => ({
  _tag: 'Failed',
  reason: new CspReportFailed({ reason: detail }).message,
})

const reportOutcome = (request: HttpServerRequest.HttpServerRequest): Effect.Effect<CspReportOutcome> => {
  const declared = declaredLengthOf(request)
  const read = declared > MAX_CSP_REQUEST_BODY_BYTES
    ? Effect.fail(new CspReportTooLarge({ limit: MAX_CSP_REQUEST_BODY_BYTES, received: declared }))
    : readBoundedBody(request)
  return read.pipe(
    Effect.flatMap(decodeReport),
    Effect.flatMap(recordViolations),
    Effect.map(({ dropped }): CspReportOutcome => ({ _tag: 'Accepted', dropped })),
    Effect.catchTags({
      CspReportTooLarge: (error): Effect.Effect<CspReportOutcome> =>
        Effect.succeed({
          _tag: 'TooLarge',
          reason: error.message,
        }),
      CspReportRefused: (error): Effect.Effect<CspReportOutcome> =>
        Effect.succeed({
          _tag: 'Refused',
          reason: error.message,
        }),
      HttpServerError: (error): Effect.Effect<CspReportOutcome> => Effect.succeed(failedOutcomeOf(error.message)),
    }),
    Effect.catchDefect((defect): Effect.Effect<CspReportOutcome> =>
      Effect.succeed(failedOutcomeOf(defect instanceof Error ? defect.message : 'an unexpected defect'))
    ),
  )
}

const reportAttributesOf = (outcome: CspReportOutcome): Record<string, string | number> =>
  Match.value(outcome).pipe(
    Match.tag('Accepted', ({ dropped }) =>
      dropped === 0
        ? { 'app.csp.report.outcome': 'accepted' }
        : { 'app.csp.report.outcome': 'accepted', 'app.csp.report.dropped': dropped }),
    Match.tag('TooLarge', ({ reason }) => ({
      'app.csp.report.outcome': 'too-large',
      'app.csp.report.reason': boundedCspAttributeText(reason),
    })),
    Match.tag('Refused', ({ reason }) => ({
      'app.csp.report.outcome': 'refused',
      'app.csp.report.reason': boundedCspAttributeText(reason),
    })),
    Match.tag('Failed', ({ reason }) => ({
      'app.csp.report.outcome': 'failed',
      'app.csp.report.reason': boundedCspAttributeText(reason),
    })),
    Match.exhaustive,
  )

const reportResponse = (outcome: CspReportOutcome): HttpServerResponse.HttpServerResponse =>
  Match.value(outcome).pipe(
    Match.tag('Accepted', () => HttpServerResponse.empty()),
    Match.tag('TooLarge', ({ reason }) => plainTextResponse(reason, 413)),
    Match.tag('Refused', ({ reason }) => plainTextResponse(reason, 400)),
    Match.tag('Failed', ({ reason }) => plainTextResponse(reason, 500)),
    Match.exhaustive,
  )

const recordCspReport = Effect.fn(RecordCspReport.name)(function*() {
  const request = yield* ServerRequest
  const outcome = yield* reportOutcome(request)
  yield* Effect.annotateCurrentSpan(reportAttributesOf(outcome))
  return reportResponse(outcome)
})

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
