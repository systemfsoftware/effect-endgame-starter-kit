import { Match } from 'effect'
import type { Row, Verdict } from './cell.ts'
import { JudgeRow, judgeRow } from './judge-row.workflow.ts'

export const verdictOf = (row: Row): Verdict =>
  Match.value(
    judgeRow(new JudgeRow({ definition: row.definition, ratstack: row.ratstack.cell, starter: row.starter.cell })),
  ).pipe(
    Match.tag('Success', (success) =>
      Match.value(success.success).pipe(
        Match.tag('Beaten', (): Verdict => ({ _tag: 'Beaten' })),
        Match.tag('NotBeaten', (): Verdict => ({ _tag: 'NotBeaten' })),
        Match.tag('Tie', (): Verdict => ({ _tag: 'Tie' })),
        Match.exhaustive,
      )),
    Match.tag('Failure', (failure): Verdict => ({ _tag: 'InstrumentError', error: failure.failure.message })),
    Match.exhaustive,
  )
