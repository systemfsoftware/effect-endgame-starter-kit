import * as Arr from 'effect/Array'
import * as S from 'effect/Schema'

export const CspNonce = S.String.pipe(S.check(S.isPattern(/^[A-Za-z0-9+/]{22}==$/)), S.brand('CspNonce'))
export type CspNonce = S.Schema.Type<typeof CspNonce>

export const contentSecurityPolicyOf = (nonce: CspNonce): string =>
  Arr.join([
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
  ], '; ')
