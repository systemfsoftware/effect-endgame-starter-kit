import type {
  DocumentProvenance,
  Flag,
  MainBaseline,
  MeasuredCell,
  Row,
  RowDefinition,
  ScorecardDocument,
  Side,
} from './cell.ts'
import { compareWithMain } from './compare-with-main.workflow.ts'
import { judgeRow } from './judge-row.workflow.ts'

export interface DefinedRow {
  readonly definition: RowDefinition
  readonly hash: string
}

export interface SideCell {
  readonly id: string
  readonly side: Side
  readonly measured: MeasuredCell
}

export interface RowFlag {
  readonly id: string
  readonly flag: Flag
}

export type CellsByRow = Readonly<Record<string, Readonly<Partial<Record<Side, MeasuredCell>>>>>

export interface AssembleInput {
  readonly rows: readonly DefinedRow[]
  readonly cells: CellsByRow
  readonly flags: readonly RowFlag[]
  readonly provenance: DocumentProvenance
  readonly main: MainBaseline
}

const missingCell = (provenance: DocumentProvenance, id: string, side: Side): MeasuredCell => ({
  cell: { _tag: 'InstrumentError', error: `no ${side} cell was produced for ${id}` },
  provenance: {
    side,
    commit: { ratstack: provenance.ratstackCommit, starter: provenance.commit }[side],
    instrumentHash: provenance.instrumentHash,
    nixpkgsRev: provenance.nixpkgsRev,
    runner: provenance.runner,
    measuredAt: provenance.generatedAt,
    tools: {},
  },
})

const cellFor = (input: AssembleInput, id: string, side: Side): MeasuredCell =>
  input.cells[id]?.[side] ?? missingCell(input.provenance, id, side)

const rowOf = (input: AssembleInput, defined: DefinedRow): Row => {
  const ratstack = cellFor(input, defined.definition.id, 'ratstack')
  const starter = cellFor(input, defined.definition.id, 'starter')
  return {
    definition: defined.definition,
    definitionHash: defined.hash,
    ratstack,
    starter,
    verdict: judgeRow({ definition: defined.definition, ratstack: ratstack.cell, starter: starter.cell }),
    flags: input.flags.filter((flag) => flag.id === defined.definition.id).map((flag) => flag.flag),
  }
}

export const assembleScorecard = (input: AssembleInput): ScorecardDocument => {
  const rows = input.rows.map((defined) => rowOf(input, defined))
  return {
    schemaVersion: 1,
    provenance: input.provenance,
    rows,
    ratchet: compareWithMain({ rows, main: input.main }),
  }
}
