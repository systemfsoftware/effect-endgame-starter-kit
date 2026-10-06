import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as S from 'effect/Schema'

export const CspDirective = S.String.pipe(S.check(S.isPattern(/^[a-z]+(?:-[a-z]+)*$/)), S.brand('CspDirective'))
export type CspDirective = S.Schema.Type<typeof CspDirective>

export const BlockedOrigin = S.TaggedStruct('BlockedOrigin', { origin: S.String })
export const BlockedOpaqueScheme = S.TaggedStruct('BlockedOpaqueScheme', { scheme: S.String })
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
    Match.when('null', (): BlockedResource => ({ _tag: 'BlockedOpaqueScheme', scheme: url.protocol.slice(0, -1) })),
    Match.orElse((origin): BlockedResource => ({ _tag: 'BlockedOrigin', origin })),
  )

const blockedResourceOf = (blockedUri: string): BlockedResource =>
  Match.value(URL.canParse(blockedUri)).pipe(
    Match.when(true, () => urlResourceOf(new URL(blockedUri))),
    Match.when(false, (): BlockedResource => ({ _tag: 'BlockedToken', token: blockedUri })),
    Match.exhaustive,
  )

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
