import { describe, it } from '@systemfsoftware/vitest'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import { CheckHealth, checkHealth, DatabaseUnreachable, ProbeAnswered } from '../check-health.workflow.ts'

describe('checkHealth — the Worker is healthy exactly when the database answers the probe', () => {
  it.prop(
    '∀c_Healthy_=ProbeAnswered',
    { of: { command: CheckHealth }, subject: checkHealth },
    (subject, { command }) =>
      Result.match(subject(command), {
        onSuccess: () => S.is(ProbeAnswered)(command.probe),
        onFailure: (refused) =>
          S.is(DatabaseUnreachable)(refused) &&
          refused.message === 'The database did not answer the health probe.' &&
          !S.is(ProbeAnswered)(command.probe),
      }),
  )
})
