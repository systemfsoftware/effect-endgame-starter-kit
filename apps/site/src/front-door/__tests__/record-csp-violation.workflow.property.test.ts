import { describe, it } from '@systemfsoftware/vitest'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as S from 'effect/Schema'

import {
  type BlockedResource,
  CspAttributeText,
  CspBlockedScheme,
  LegacyCspReport,
  ReportingApiCspReport,
  violationsOf,
} from '../record-csp-violation.schema'

const attributeOf = (blocked: BlockedResource): string =>
  Match.value(blocked).pipe(
    Match.tag('BlockedOrigin', ({ origin }) => origin),
    Match.tag('BlockedOpaqueScheme', ({ scheme }) => scheme),
    Match.tag('BlockedToken', ({ token }) => token),
    Match.exhaustive,
  )

const boundedAndAllowed = (blocked: BlockedResource): boolean =>
  Option.isSome(S.decodeOption(CspAttributeText)(attributeOf(blocked))) &&
  Match.value(blocked).pipe(
    Match.tag('BlockedOpaqueScheme', ({ scheme }) => Arr.contains(CspBlockedScheme.literals, scheme)),
    Match.orElse(() => true),
  )

describe('violationsOf — blocked-URI span attributes', () => {
  it.prop('∀c_Legacy_⊨CarriedAndBounded', { of: [LegacyCspReport], subject: violationsOf }, (subject, [body]) => {
    const violations = subject(body)
    return violations.length === 1 &&
      Arr.every(
        violations,
        (violation) =>
          violation.directive === body['csp-report']['effective-directive'] && boundedAndAllowed(violation.blocked),
      )
  })

  it.prop(
    '∀c_Batch_⊨CarriedAndBounded',
    { of: [S.Array(ReportingApiCspReport)], subject: violationsOf },
    (subject, [body]) => {
      const violations = subject(body)
      return violations.length === body.length &&
        Arr.every(
          Arr.zip(violations, body),
          ([violation, report]) =>
            violation.directive === report.body.effectiveDirective && boundedAndAllowed(violation.blocked),
        )
    },
  )
})
