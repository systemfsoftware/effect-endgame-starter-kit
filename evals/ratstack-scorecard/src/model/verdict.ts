import { Result } from 'effect'
import type { Row, Verdict } from './cell.ts'
import { JudgeRow, judgeRow } from './judge-row.workflow.ts'

export const verdictOf = (row: Row): Verdict => {
  const verdict = judgeRow(
    new JudgeRow({ definition: row.definition, ratstack: row.ratstack.cell, starter: row.starter.cell }),
  )
  return Result.isSuccess(verdict) ? verdict.success : { _tag: 'InstrumentError', error: verdict.failure.message }
}
