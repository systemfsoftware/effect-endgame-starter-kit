import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

const CheckHealthTypeId: unique symbol = Symbol.for('site/CheckHealth')

export class ProbeAnswered
  extends S.TaggedClass<ProbeAnswered, { readonly brand: unique symbol }>()('ProbeAnswered', {})
{}

export class ProbeUnanswered
  extends S.TaggedClass<ProbeUnanswered, { readonly brand: unique symbol }>()('ProbeUnanswered', {})
{}

export class CheckHealth extends S.Class<CheckHealth, { readonly brand: unique symbol }>('CheckHealth')({
  probe: S.Union([ProbeAnswered, ProbeUnanswered]),
}) {
  static readonly [Workflow.InstrumentationBrand]: Record<never, never> = {}
}

class Healthy extends S.TaggedClass<Healthy, { readonly brand: unique symbol }>()('Healthy', {}) {
  readonly [CheckHealthTypeId] = CheckHealthTypeId
}

export class DatabaseUnreachable
  extends S.TaggedError<DatabaseUnreachable, { readonly brand: unique symbol }>()('DatabaseUnreachable', {})
{
  override get message(): string {
    return 'The database did not answer the health probe.'
  }
}

export const checkHealth = Workflow.make({
  command: CheckHealth,
  decision: Healthy,
  error: DatabaseUnreachable,
  decide: (command) =>
    Match.value(command.probe).pipe(
      Match.tag('ProbeAnswered', () => Result.succeed(new Healthy({}))),
      Match.tag('ProbeUnanswered', () => Result.fail(new DatabaseUnreachable({}))),
      Match.exhaustive,
    ),
})
