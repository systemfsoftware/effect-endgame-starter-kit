import { Match, Result } from 'effect'
import type {
  DocumentProvenance,
  Family,
  Flag,
  JudgedRow,
  MainBaseline,
  MeasuredCell,
  Row,
  RowDefinition,
  RowId,
  ScorecardDocument,
  Side,
  Verdict,
} from './cell.ts'
import { CompareWithMain, compareWithMain } from './compare-with-main.workflow.ts'
import { verdictOf } from './verdict.ts'

export interface DefinedRow {
  readonly definition: RowDefinition
  readonly hash: string
}

export interface SideCell {
  readonly id: RowId
  readonly side: Side
  readonly measured: MeasuredCell
}

export interface RowFlag {
  readonly id: RowId
  readonly flag: Flag
}

export interface FamilyResult {
  readonly family: Family
  readonly wallMs: number
  readonly cells: readonly SideCell[]
  readonly flags: readonly RowFlag[]
}

export type CellsByRow = Readonly<Record<RowId, Readonly<Partial<Record<Side, MeasuredCell>>>>>

export interface AssembleInput {
  readonly rows: readonly DefinedRow[]
  readonly cells: CellsByRow
  readonly flags: readonly RowFlag[]
  readonly provenance: DocumentProvenance
  readonly main: MainBaseline
}

const missingCell = (provenance: DocumentProvenance, id: RowId, side: Side): MeasuredCell => ({
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

const cellAt = (input: AssembleInput, id: RowId, side: Side): MeasuredCell | undefined => {
  const bySide = input.cells[id]
  return bySide?.[side]
}

const cellFor = (input: AssembleInput, id: RowId, side: Side): MeasuredCell =>
  cellAt(input, id, side) ?? missingCell(input.provenance, id, side)

const rowOf = (input: AssembleInput, defined: DefinedRow): Row => {
  const ratstack = cellFor(input, defined.definition.id, 'ratstack')
  const starter = cellFor(input, defined.definition.id, 'starter')
  return {
    definition: defined.definition,
    definitionHash: defined.hash,
    ratstack,
    starter,
    flags: input.flags.filter((flag) => flag.id === defined.definition.id).map((flag) => flag.flag),
  }
}

const judged = (row: Row): JudgedRow => ({ ...row, verdict: verdictOf(row) })

const mainRows = (main: MainBaseline): readonly Row[] =>
  Match.value(main).pipe(
    Match.tag('Missing', () => []),
    Match.tag('Found', (found) => found.rows),
    Match.exhaustive,
  )

const verdictsOf = (rows: readonly Row[]): Record<string, Verdict> =>
  Object.fromEntries(rows.map((row) => [row.definition.id, verdictOf(row)]))

export const assembleScorecard = (input: AssembleInput): ScorecardDocument => {
  const rows = input.rows.map((defined) => rowOf(input, defined))
  const verdicts = verdictsOf(rows)
  const mainVerdicts = verdictsOf(mainRows(input.main))
  return {
    schemaVersion: 1,
    provenance: input.provenance,
    rows: rows.map(judged),
    ratchet: Result.getOrThrow(
      compareWithMain(new CompareWithMain({ rows, main: input.main, verdicts, mainVerdicts })),
    ),
  }
}
