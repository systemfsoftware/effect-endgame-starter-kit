import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as S from 'effect/Schema'

const MAX_CSP_REPORT_ATTRIBUTE_LENGTH = 256

export const CspAttributeText = S.String.pipe(S.check(S.isMaxLength(MAX_CSP_REPORT_ATTRIBUTE_LENGTH)))
export type CspAttributeText = S.Schema.Type<typeof CspAttributeText>

export const boundedCspAttributeText = (value: string): CspAttributeText =>
  value.slice(0, MAX_CSP_REPORT_ATTRIBUTE_LENGTH)

export class CspReportTooLarge extends S.TaggedError<CspReportTooLarge>()('CspReportTooLarge', {
  limit: S.Finite,
  received: S.Finite,
}) {
  override get message(): string {
    return `the csp report body is ${this.received} bytes, over the ${this.limit}-byte limit`
  }
}

export class CspReportRefused extends S.TaggedError<CspReportRefused>()('CspReportRefused', {
  reason: S.String,
}) {
  override get message(): string {
    return `the csp report body could not be decoded: ${this.reason}`
  }
}

export class CspReportFailed extends S.TaggedError<CspReportFailed>()('CspReportFailed', {
  reason: S.String,
}) {
  override get message(): string {
    return `the csp report could not be recorded: ${this.reason}`
  }
}

export const CspDirective = S.String.pipe(
  S.check(S.isPattern(/^[a-z]+(?:-[a-z]+)*$/)),
  S.check(S.isMaxLength(MAX_CSP_REPORT_ATTRIBUTE_LENGTH)),
  S.brand('CspDirective'),
)
export type CspDirective = S.Schema.Type<typeof CspDirective>

export const CspBlockedScheme = S.Literals([
  'about',
  'blob',
  'data',
  'eval',
  'filesystem',
  'http',
  'https',
  'inline',
  'javascript',
  'mediastream',
  'report-sample',
  'self',
  'wasm-eval',
  'other',
])
export type CspBlockedScheme = S.Schema.Type<typeof CspBlockedScheme>

const blockedSchemeOf = (scheme: string): CspBlockedScheme =>
  Option.getOrElse(
    Arr.findFirst(CspBlockedScheme.literals, (known) => known === scheme),
    (): CspBlockedScheme => 'other',
  )

export const BlockedOrigin = S.TaggedStruct('BlockedOrigin', { origin: S.String })
export const BlockedOpaqueScheme = S.TaggedStruct('BlockedOpaqueScheme', { scheme: CspBlockedScheme })
export const BlockedToken = S.TaggedStruct('BlockedToken', { token: S.String })
export const BlockedResource = S.Union([BlockedOrigin, BlockedOpaqueScheme, BlockedToken])
export type BlockedResource = S.Schema.Type<typeof BlockedResource>

export const CspViolation = S.Struct({ directive: CspDirective, blocked: BlockedResource })
export type CspViolation = S.Schema.Type<typeof CspViolation>

export const LegacyCspReport = S.Struct({
  'csp-report': S.Struct({ 'effective-directive': CspDirective, 'blocked-uri': S.String }),
})
export type LegacyCspReport = S.Schema.Type<typeof LegacyCspReport>

export const ReportingApiCspReport = S.Struct({
  type: S.Literal('csp-violation'),
  body: S.Struct({ effectiveDirective: CspDirective, blockedURL: S.String }),
})
export type ReportingApiCspReport = S.Schema.Type<typeof ReportingApiCspReport>

export const CspReportBody = S.Union([LegacyCspReport, S.Array(ReportingApiCspReport)])
export type CspReportBody = S.Schema.Type<typeof CspReportBody>

const urlResourceOf = (url: URL): BlockedResource =>
  Match.value(url.origin).pipe(
    Match.when('null', (): BlockedResource => ({
      _tag: 'BlockedOpaqueScheme',
      scheme: blockedSchemeOf(boundedCspAttributeText(url.protocol.slice(0, -1))),
    })),
    Match.orElse((origin): BlockedResource => ({ _tag: 'BlockedOrigin', origin: boundedCspAttributeText(origin) })),
  )

const blockedResourceOf = (blockedUri: string): BlockedResource =>
  Option.match(Option.fromNullishOr(URL.parse(blockedUri)), {
    onNone: (): BlockedResource => ({ _tag: 'BlockedToken', token: boundedCspAttributeText(blockedUri) }),
    onSome: urlResourceOf,
  })

const fromReportingApi = (report: ReportingApiCspReport): CspViolation => ({
  directive: report.body.effectiveDirective,
  blocked: blockedResourceOf(report.body.blockedURL),
})

const fromLegacy = (report: LegacyCspReport): CspViolation => ({
  directive: report['csp-report']['effective-directive'],
  blocked: blockedResourceOf(report['csp-report']['blocked-uri']),
})

const isReportingApiBatch = (body: CspReportBody): body is ReadonlyArray<ReportingApiCspReport> => Arr.isArray(body)

export const violationsOf = (body: CspReportBody): ReadonlyArray<CspViolation> =>
  Match.value(body).pipe(
    Match.when(isReportingApiBatch, (reports) => Arr.map(reports, fromReportingApi)),
    Match.orElse((legacy) => [fromLegacy(legacy)]),
  )

export const AcceptedReport = S.TaggedStruct('Accepted', { dropped: S.Finite })
export const TooLargeReport = S.TaggedStruct('TooLarge', { reason: S.String })
export const RefusedReport = S.TaggedStruct('Refused', { reason: S.String })
export const FailedReport = S.TaggedStruct('Failed', { reason: S.String })

export const CspReportOutcome = S.Union([AcceptedReport, TooLargeReport, RefusedReport, FailedReport])
export type CspReportOutcome = S.Schema.Type<typeof CspReportOutcome>
