import * as Arr from 'effect/Array'
import * as S from 'effect/Schema'

export const CspNonce = S.String.pipe(S.check(S.isPattern(/^[A-Za-z0-9+/]{22}==$/)), S.brand('CspNonce'))
export type CspNonce = S.Schema.Type<typeof CspNonce>

export const CspReportPath = S.Literal('/csp-report')
export type CspReportPath = S.Schema.Type<typeof CspReportPath>

export const CSP_REPORT_PATH: CspReportPath = '/csp-report'

export const CspHeaders = S.Struct({ contentSecurityPolicy: S.String, reportingEndpoints: S.String })
export type CspHeaders = S.Schema.Type<typeof CspHeaders>

export const cspHeadersOf = (nonce: CspNonce): CspHeaders => ({
  contentSecurityPolicy: Arr.join([
    "default-src 'self'",
    `script-src 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self'",
    "img-src 'self' data:",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "require-trusted-types-for 'script'",
    "trusted-types 'none'",
    'report-to csp',
    `report-uri ${CSP_REPORT_PATH}`,
  ], '; '),
  reportingEndpoints: `csp="${CSP_REPORT_PATH}"`,
})
