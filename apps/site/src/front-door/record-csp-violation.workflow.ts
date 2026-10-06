import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import { CspViolation } from './record-csp-violation.schema'

const RecordCspViolationTypeId: unique symbol = Symbol.for('endgame/site/RecordCspViolationDecision')

export class RecordBlockedOrigin extends S.TaggedClass<RecordBlockedOrigin>()('RecordBlockedOrigin', {
  origin: S.String,
}) {
  readonly [RecordCspViolationTypeId] = RecordCspViolationTypeId
  static readonly [Workflow.InstrumentationBrand]: { readonly origin: 'app.csp.blocked' } = {
    origin: 'app.csp.blocked',
  }
}

export class RecordBlockedKeyword extends S.TaggedClass<RecordBlockedKeyword>()('RecordBlockedKeyword', {
  keyword: S.String,
}) {
  readonly [RecordCspViolationTypeId] = RecordCspViolationTypeId
  static readonly [Workflow.InstrumentationBrand]: { readonly keyword: 'app.csp.blocked' } = {
    keyword: 'app.csp.blocked',
  }
}

export class RecordBlockedUnrecognized extends S.TaggedClass<RecordBlockedUnrecognized>()(
  'RecordBlockedUnrecognized',
  {},
) {
  readonly [RecordCspViolationTypeId] = RecordCspViolationTypeId
  static readonly [Workflow.InstrumentationBrand]: Record<string, never> = {}
}

export const RecordCspViolationDecision = S.Union([
  RecordBlockedOrigin,
  RecordBlockedKeyword,
  RecordBlockedUnrecognized,
])

type RecordCspViolationDecisionTag = S.Schema.Type<typeof RecordCspViolationDecision>['_tag']

const decisionTags = {
  RecordBlockedOrigin: 'RecordBlockedOrigin',
  RecordBlockedKeyword: 'RecordBlockedKeyword',
  RecordBlockedUnrecognized: 'RecordBlockedUnrecognized',
} as const satisfies { readonly [K in RecordCspViolationDecisionTag]: K }

export const RecordCspViolationDecisionTagSchema = S.Literals(Object.values(decisionTags))

export class RecordCspViolationCommand extends S.Class<RecordCspViolationCommand>('RecordCspViolationCommand')(
  CspViolation.fields,
) {
  static readonly [Workflow.InstrumentationBrand]: { readonly directive: 'app.csp.directive' } = {
    directive: 'app.csp.directive',
  }
}

const CSP_KEYWORD = /^[a-z][a-z0-9-]*$/

const keywordOf = (token: string): RecordBlockedKeyword | RecordBlockedUnrecognized =>
  Match.value(CSP_KEYWORD.test(token)).pipe(
    Match.when(true, () => new RecordBlockedKeyword({ keyword: token })),
    Match.when(false, () => new RecordBlockedUnrecognized({})),
    Match.exhaustive,
  )

export const recordCspViolation = Workflow.make({
  command: RecordCspViolationCommand,
  decision: RecordCspViolationDecision,
  error: S.Never,
  decide: (command) =>
    Result.succeed(
      Match.value(command.blocked).pipe(
        Match.tag('BlockedOrigin', ({ origin }) => new RecordBlockedOrigin({ origin })),
        Match.tag('BlockedOpaqueScheme', ({ scheme }) => new RecordBlockedKeyword({ keyword: scheme })),
        Match.tag('BlockedToken', ({ token }) => keywordOf(token)),
        Match.exhaustive,
      ),
    ),
})
