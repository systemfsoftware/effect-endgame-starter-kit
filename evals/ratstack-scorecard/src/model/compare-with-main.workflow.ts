import type { Cell, Direction, MainBaseline, Ratchet, Row, RowOutcome, Verdict } from './cell.ts'
import { firstRule, matchBaseline, matchCell, matchOutcome, matchVerdict } from './dispatch.ts'
import { median, smallerIsBetter } from './runs.ts'

export interface CompareWithMainInput {
  readonly rows: readonly Row[]
  readonly main: MainBaseline
}

const held = (id: string): RowOutcome => ({ _tag: 'Held', id })

const beatenWeight = (verdict: Verdict): number =>
  matchVerdict(verdict, { Beaten: () => 1, NotBeaten: () => 0, Tie: () => 0, InstrumentError: () => 0 })

const describe = (cell: Cell): string =>
  matchCell(cell, {
    Measured: (c) => `runs ${c.runs.join(', ')}`,
    Absent: (c) => `absent: ${c.reason}`,
    NoDeployment: (c) => `no deployment for ${c.sha}`,
    Unsupported: () => 'unsupported',
    Unmeasurable: (c) => `unmeasurable: ${c.error}`,
    NoSecret: (c) => `no secret ${c.name}`,
    InstrumentError: (c) => `instrument error: ${c.error}`,
  })

const regressed = (main: Row, pr: Row): RowOutcome => ({
  _tag: 'Regressed',
  id: pr.definition.id,
  main: describe(main.starter.cell),
  pr: describe(pr.starter.cell),
})

const runsRegressed = (direction: Direction, main: readonly number[], pr: readonly number[]): boolean =>
  median(smallerIsBetter(direction, pr)) > Math.max(...smallerIsBetter(direction, main))

const starterAgainstMainMeasurement = (main: Row, mainRuns: readonly number[], pr: Row): RowOutcome =>
  matchCell(pr.starter.cell, {
    Measured: (cell) =>
      firstRule<RowOutcome>(
        [[runsRegressed(pr.definition.direction, mainRuns, cell.runs), () => regressed(main, pr)]],
        () => held(pr.definition.id),
      ),
    Absent: () => regressed(main, pr),
    Unsupported: () => regressed(main, pr),
    Unmeasurable: () => regressed(main, pr),
    NoDeployment: (cell) => ({ _tag: 'Neutral', id: pr.definition.id, cause: cell._tag }),
    NoSecret: (cell) => ({ _tag: 'Neutral', id: pr.definition.id, cause: cell._tag }),
    InstrumentError: (cell) => ({ _tag: 'InstrumentError', id: pr.definition.id, error: cell.error }),
  })

const starterAgainstMain = (main: Row, pr: Row): RowOutcome =>
  matchCell(main.starter.cell, {
    Measured: (cell) => starterAgainstMainMeasurement(main, cell.runs, pr),
    Absent: () => held(pr.definition.id),
    NoDeployment: () => held(pr.definition.id),
    Unsupported: () => held(pr.definition.id),
    Unmeasurable: () => held(pr.definition.id),
    NoSecret: () => held(pr.definition.id),
    InstrumentError: () => held(pr.definition.id),
  })

const compareRow = (main: Row, pr: Row): RowOutcome =>
  firstRule<RowOutcome>([
    [main.definitionHash !== pr.definitionHash, () => ({ _tag: 'ReBaselined', id: pr.definition.id })],
    [
      beatenWeight(main.verdict) > beatenWeight(pr.verdict),
      () => ({
        _tag: 'LostBeaten',
        id: pr.definition.id,
        ratstack: pr.ratstack.cell._tag,
        starter: pr.starter.cell._tag,
      }),
    ],
  ], () => starterAgainstMain(main, pr))

const unlessInstrumentError = (pr: Row, otherwise: () => RowOutcome): RowOutcome =>
  matchVerdict(pr.verdict, {
    InstrumentError: (verdict) => ({ _tag: 'InstrumentError', id: pr.definition.id, error: verdict.error }),
    Beaten: otherwise,
    NotBeaten: otherwise,
    Tie: otherwise,
  })

const againstMainRows = (pr: Row, mainRows: readonly Row[]): RowOutcome =>
  mainRows
    .filter((main) => main.definition.id === pr.definition.id)
    .reduce<RowOutcome>((_, main) => compareRow(main, pr), { _tag: 'New', id: pr.definition.id })

const fails = (outcome: RowOutcome): boolean =>
  matchOutcome(outcome, {
    Held: () => false,
    New: () => false,
    ReBaselined: () => false,
    Neutral: () => false,
    InstrumentError: () => true,
    LostBeaten: () => true,
    Regressed: () => true,
  })

export const compareWithMain = (input: CompareWithMainInput): Ratchet =>
  matchBaseline<Ratchet>(input.main, {
    Missing: () => {
      const outcomes = input.rows.map((pr) => unlessInstrumentError(pr, () => ({ _tag: 'New', id: pr.definition.id })))
      return { _tag: 'FirstBaseline', outcomes, failures: outcomes.filter(fails) }
    },
    Found: (main) => {
      const outcomes = input.rows.map((pr) => unlessInstrumentError(pr, () => againstMainRows(pr, main.rows)))
      return { _tag: 'Compared', mainCommit: main.commit, outcomes, failures: outcomes.filter(fails) }
    },
  })
