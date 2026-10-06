import type { Row, Verdict } from './cell.ts'
import { judgeRow } from './judge-row.workflow.ts'

export const verdictOf = (row: Row): Verdict =>
  judgeRow({ definition: row.definition, ratstack: row.ratstack.cell, starter: row.starter.cell })
