import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Result, Schema as S } from 'effect'
import {
  type Cell,
  type Direction,
  MainBaselineBase,
  type Row,
  RowBase,
  type RowId,
  type RowOutcome,
  RowOutcomeBase,
  type Verdict,
  VerdictBase,
} from './cell.schema.ts'

const RatchetTypeId: unique symbol = Symbol.for('@starter/ratstack-scorecard/Ratchet')

class FirstBaseline extends S.TaggedClass<FirstBaseline>()('FirstBaseline', {
  outcomes: S.Array(RowOutcomeBase),
  failures: S.Array(RowOutcomeBase),
}) {
  readonly [RatchetTypeId] = RatchetTypeId
}

class Compared extends S.TaggedClass<Compared>()('Compared', {
  mainCommit: S.String,
  outcomes: S.Array(RowOutcomeBase),
  failures: S.Array(RowOutcomeBase),
}) {
  readonly [RatchetTypeId] = RatchetTypeId
}

export class CompareWithMain extends S.TaggedClass<CompareWithMain>()('CompareWithMain', {
  rows: S.Array(RowBase),
  main: MainBaselineBase,
  verdicts: S.Record(S.String, VerdictBase),
  mainVerdicts: S.Record(S.String, VerdictBase),
}) {
  static readonly [Workflow.InstrumentationBrand] = { main: 'app.scorecard.ratchet.main' } as const
}

const NOT_BEATEN: Verdict = { _tag: 'NotBeaten' }

const ORIENT: Record<Direction, (runs: readonly number[]) => readonly number[]> = {
  lower: (runs) => runs,
  higher: (runs) => runs.map((value) => -value),
}

const oriented = (direction: Direction, runs: readonly number[]): readonly number[] => ORIENT[direction](runs)

const ordered = (runs: readonly number[]): readonly number[] => [...runs].sort((a, b) => a - b)

const at = (runs: readonly number[], index: number): number =>
  Match.value(runs.at(index)).pipe(
    Match.when(undefined, () => 0),
    Match.orElse((value) => value),
  )

const highest = (runs: readonly number[]): number => at(ordered(runs), -1)

const median = (runs: readonly number[]): number => {
  const sorted = ordered(runs)
  const size = sorted.length
  const upper = (size - (size % 2)) / 2
  const lower = (size + (size % 2)) / 2 - 1
  return (at(sorted, lower) + at(sorted, upper)) / 2
}

const held = (id: RowId): RowOutcome => ({ _tag: 'Held', id })

const newRow = (id: RowId): RowOutcome => ({ _tag: 'New', id })

const neutral = (id: RowId, cause: string): RowOutcome => ({ _tag: 'Neutral', id, cause })

const instrumentError = (id: RowId, error: string): RowOutcome => ({ _tag: 'InstrumentError', id, error })

const tagOf = (cell: Cell): string =>
  Match.value(cell).pipe(
    Match.tag('Measured', () => 'Measured'),
    Match.tag('Absent', () => 'Absent'),
    Match.tag('NoDeployment', () => 'NoDeployment'),
    Match.tag('Unsupported', () => 'Unsupported'),
    Match.tag('Unmeasurable', () => 'Unmeasurable'),
    Match.tag('NoSecret', () => 'NoSecret'),
    Match.tag('InstrumentError', () => 'InstrumentError'),
    Match.exhaustive,
  )

const verdictAt = (verdicts: Record<string, Verdict>, id: RowId): Verdict =>
  Match.value(verdicts[id]).pipe(
    Match.when(undefined, () => NOT_BEATEN),
    Match.orElse((verdict) => verdict),
  )

const beatenWeight = (verdict: Verdict): number =>
  Match.value(verdict).pipe(
    Match.tag('Beaten', () => 1),
    Match.tag('NotBeaten', () => 0),
    Match.tag('Tie', () => 0),
    Match.tag('InstrumentError', () => 0),
    Match.exhaustive,
  )

const describe = (cell: Cell): string =>
  Match.value(cell).pipe(
    Match.tag('Measured', (measured) => `runs ${measured.runs.join(', ')}`),
    Match.tag('Absent', (absent) => `absent: ${absent.reason}`),
    Match.tag('NoDeployment', (deployment) => `no deployment for ${deployment.sha}`),
    Match.tag('Unsupported', () => 'unsupported'),
    Match.tag('Unmeasurable', (unmeasureable) => `unmeasurable: ${unmeasureable.error}`),
    Match.tag('NoSecret', (secret) => `no secret ${secret.name}`),
    Match.tag('InstrumentError', (error) => `instrument error: ${error.error}`),
    Match.exhaustive,
  )

const regressed = (main: Row, pr: Row): RowOutcome => ({
  _tag: 'Regressed',
  id: pr.definition.id,
  main: describe(main.starter.cell),
  pr: describe(pr.starter.cell),
})

const runsRegressed = (direction: Direction, main: readonly number[], pr: readonly number[]): boolean =>
  median(oriented(direction, pr)) > highest(oriented(direction, main))

const starterAgainstMainMeasurement = (main: Row, mainRuns: readonly number[], pr: Row): RowOutcome =>
  Match.value(pr.starter.cell).pipe(
    Match.tag('Measured', (cell) =>
      Match.value(runsRegressed(pr.definition.direction, mainRuns, cell.runs)).pipe(
        Match.when(true, () => regressed(main, pr)),
        Match.orElse(() => held(pr.definition.id)),
      )),
    Match.tag('Absent', () => regressed(main, pr)),
    Match.tag('Unsupported', () => regressed(main, pr)),
    Match.tag('Unmeasurable', () => regressed(main, pr)),
    Match.tag('NoDeployment', (cell) => neutral(pr.definition.id, tagOf(cell))),
    Match.tag('NoSecret', (cell) => neutral(pr.definition.id, tagOf(cell))),
    Match.tag('InstrumentError', (cell) => instrumentError(pr.definition.id, cell.error)),
    Match.exhaustive,
  )

const starterAgainstMain = (main: Row, pr: Row): RowOutcome =>
  Match.value(main.starter.cell).pipe(
    Match.tag('Measured', (cell) => starterAgainstMainMeasurement(main, cell.runs, pr)),
    Match.tag('Absent', () => held(pr.definition.id)),
    Match.tag('NoDeployment', () => held(pr.definition.id)),
    Match.tag('Unsupported', () => held(pr.definition.id)),
    Match.tag('Unmeasurable', () => held(pr.definition.id)),
    Match.tag('NoSecret', () => held(pr.definition.id)),
    Match.tag('InstrumentError', () => held(pr.definition.id)),
    Match.exhaustive,
  )

const lostBeaten = (main: Row, pr: Row): RowOutcome => ({
  _tag: 'LostBeaten',
  id: pr.definition.id,
  ratstack: tagOf(pr.ratstack.cell),
  starter: tagOf(pr.starter.cell),
})

const reBaselinedOr = (main: Row, pr: Row, otherwise: () => RowOutcome): RowOutcome =>
  Match.value(main.definitionHash === pr.definitionHash).pipe(
    Match.when(true, otherwise),
    Match.orElse((): RowOutcome => ({ _tag: 'ReBaselined', id: pr.definition.id })),
  )

const lostBeatenOr = (
  mainVerdicts: Record<string, Verdict>,
  verdicts: Record<string, Verdict>,
  main: Row,
  pr: Row,
  otherwise: () => RowOutcome,
): RowOutcome =>
  Match.value(
    beatenWeight(verdictAt(mainVerdicts, main.definition.id)) > beatenWeight(verdictAt(verdicts, pr.definition.id)),
  )
    .pipe(
      Match.when(true, () => lostBeaten(main, pr)),
      Match.orElse(otherwise),
    )

const compareRow = (
  mainVerdicts: Record<string, Verdict>,
  verdicts: Record<string, Verdict>,
  main: Row,
  pr: Row,
): RowOutcome =>
  reBaselinedOr(main, pr, () => lostBeatenOr(mainVerdicts, verdicts, main, pr, () => starterAgainstMain(main, pr)))

const unlessInstrumentError = (
  verdicts: Record<string, Verdict>,
  pr: Row,
  otherwise: () => RowOutcome,
): RowOutcome =>
  Match.value(verdictAt(verdicts, pr.definition.id)).pipe(
    Match.tag('InstrumentError', (verdict) => instrumentError(pr.definition.id, verdict.error)),
    Match.tag('Beaten', otherwise),
    Match.tag('NotBeaten', otherwise),
    Match.tag('Tie', otherwise),
    Match.exhaustive,
  )

const againstMainRows = (
  mainVerdicts: Record<string, Verdict>,
  verdicts: Record<string, Verdict>,
  pr: Row,
  mainRows: readonly Row[],
): RowOutcome =>
  mainRows
    .filter((main) => main.definition.id === pr.definition.id)
    .reduce<RowOutcome>((_, main) => compareRow(mainVerdicts, verdicts, main, pr), newRow(pr.definition.id))

const fails = (outcome: RowOutcome): boolean =>
  Match.value(outcome).pipe(
    Match.tag('Held', () => false),
    Match.tag('New', () => false),
    Match.tag('ReBaselined', () => false),
    Match.tag('Neutral', () => false),
    Match.tag('InstrumentError', () => true),
    Match.tag('LostBeaten', () => true),
    Match.tag('Regressed', () => true),
    Match.exhaustive,
  )

const decide = (
  { rows, main, verdicts, mainVerdicts }: CompareWithMain,
): Result.Result<FirstBaseline | Compared, never> =>
  Match.value(main).pipe(
    Match.tag('Missing', () => {
      const outcomes = rows.map((pr) => unlessInstrumentError(verdicts, pr, () => newRow(pr.definition.id)))
      return Result.succeed(new FirstBaseline({ outcomes, failures: outcomes.filter(fails) }))
    }),
    Match.tag('Found', (found) => {
      const outcomes = rows.map((pr) =>
        unlessInstrumentError(verdicts, pr, () => againstMainRows(mainVerdicts, verdicts, pr, found.rows))
      )
      return Result.succeed(new Compared({ mainCommit: found.commit, outcomes, failures: outcomes.filter(fails) }))
    }),
    Match.exhaustive,
  )

export const compareWithMain = Workflow.make({
  command: CompareWithMain,
  decision: S.Union([FirstBaseline, Compared]),
  error: S.Never,
  decide,
})
