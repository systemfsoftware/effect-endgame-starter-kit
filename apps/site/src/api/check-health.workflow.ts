import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

const CheckHealthTypeId: unique symbol = Symbol()

export class ProbeAnswered extends S.TaggedClass<ProbeAnswered>()('ProbeAnswered', {}) {}

export class ProbeUnanswered extends S.TaggedClass<ProbeUnanswered>()('ProbeUnanswered', {}) {}

export class CheckHealth extends S.Class<CheckHealth>('CheckHealth')({
  probe: S.Union([ProbeAnswered, ProbeUnanswered]),
}) {
  static readonly [Workflow.InstrumentationBrand]: Record<never, never> = {}
}

class Healthy extends S.TaggedClass<Healthy>()('Healthy', {}) {
  readonly [CheckHealthTypeId] = CheckHealthTypeId
}

export class DatabaseUnreachable extends S.TaggedError<DatabaseUnreachable>()('DatabaseUnreachable', {}) {
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
