import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Result, Schema as S } from 'effect'
import {
  type Cell,
  CellBase,
  type Citation,
  type Direction,
  type Kind,
  type RowDefinition,
  RowDefinitionBase,
} from './cell.schema.ts'

const VerdictTypeId: unique symbol = Symbol.for('@starter/ratstack-scorecard/Verdict')

class Beaten extends S.TaggedClass<Beaten>()('Beaten', {}) {
  readonly [VerdictTypeId] = VerdictTypeId
}

class NotBeaten extends S.TaggedClass<NotBeaten>()('NotBeaten', {}) {
  readonly [VerdictTypeId] = VerdictTypeId
}

class Tie extends S.TaggedClass<Tie>()('Tie', {}) {
  readonly [VerdictTypeId] = VerdictTypeId
}

class RowInstrumentError extends S.TaggedError<RowInstrumentError>()('RowInstrumentError', { message: S.String }) {}

export class JudgeRow extends S.TaggedClass<JudgeRow>()('JudgeRow', {
  definition: RowDefinitionBase,
  ratstack: CellBase,
  starter: CellBase,
}) {
  static readonly [Workflow.InstrumentationBrand] = { definition: 'app.scorecard.row.definition' } as const
}

const BEATEN = new Beaten()
const NOT_BEATEN = new NotBeaten()
const TIE = new Tie()

type Outcome = Beaten | NotBeaten | Tie
type Judgement = Result.Result<Outcome, RowInstrumentError>

const pass = (outcome: Outcome): Judgement => Result.succeed(outcome)
const fail = (message: string): Judgement => Result.fail(new RowInstrumentError({ message }))

const ORIENT: Record<Direction, (runs: readonly number[]) => readonly number[]> = {
  lower: (runs) => runs,
  higher: (runs) => runs.map((value) => -value),
}

const oriented = (direction: Direction, runs: readonly number[]): readonly number[] => ORIENT[direction](runs)

const ordered = (runs: readonly number[]): readonly number[] => [...runs].sort((a, b) => a - b)

const lowest = (runs: readonly number[]): number =>
  Match.value(ordered(runs)[0]).pipe(
    Match.when(undefined, () => 0),
    Match.orElse((value) => value),
  )

const highest = (runs: readonly number[]): number =>
  Match.value(ordered(runs).at(-1)).pipe(
    Match.when(undefined, () => 0),
    Match.orElse((value) => value),
  )

const rangeOf = (runs: readonly number[]): string => `${lowest(runs)}..${highest(runs)}`

const countDisagrees = (kind: Kind, runs: readonly number[]): boolean =>
  Match.value(kind).pipe(
    Match.when('count', () => runs.some((value) => value !== runs[0])),
    Match.orElse(() => false),
  )

const runCountProblem = (side: string, definition: RowDefinition, runs: readonly number[]): string | undefined =>
  Match.value(runs.length === definition.runs).pipe(
    Match.when(true, () => undefined),
    Match.orElse(() => `${side} produced ${runs.length} of ${definition.runs} runs`),
  )

const countProblem = (side: string, definition: RowDefinition, runs: readonly number[]): string | undefined =>
  Match.value(countDisagrees(definition.kind, runs)).pipe(
    Match.when(true, () => `${side} count runs disagree: ${runs.join(', ')}`),
    Match.orElse(() => undefined),
  )

const reproducibilityProblem = (
  side: string,
  definition: RowDefinition,
  runs: readonly number[],
): string | undefined =>
  Match.value(runCountProblem(side, definition, runs)).pipe(
    Match.when(undefined, () => countProblem(side, definition, runs)),
    Match.orElse((problem) => problem),
  )

const sameRange = (
  definition: RowDefinition,
  ratstackRuns: readonly number[],
  starterRuns: readonly number[],
): boolean =>
  rangeOf(oriented(definition.direction, ratstackRuns)) === rangeOf(oriented(definition.direction, starterRuns))

const beatsByRange = (
  definition: RowDefinition,
  ratstackRuns: readonly number[],
  starterRuns: readonly number[],
): boolean =>
  highest(oriented(definition.direction, starterRuns)) < lowest(oriented(definition.direction, ratstackRuns))

const meetsBar = (definition: RowDefinition, bar: number, runs: readonly number[]): boolean =>
  highest(oriented(definition.direction, runs)) <= lowest(oriented(definition.direction, [bar]))

const byRange = (definition: RowDefinition, ratstackRuns: readonly number[], starterRuns: readonly number[]): Outcome =>
  Match.value(beatsByRange(definition, ratstackRuns, starterRuns)).pipe(
    Match.when(true, () => BEATEN),
    Match.orElse(() => NOT_BEATEN),
  )

const compareRuns = (
  definition: RowDefinition,
  ratstackRuns: readonly number[],
  starterRuns: readonly number[],
): Judgement =>
  Match.value(sameRange(definition, ratstackRuns, starterRuns)).pipe(
    Match.when(true, () => pass(TIE)),
    Match.orElse(() => pass(byRange(definition, ratstackRuns, starterRuns))),
  )

interface StarterCases {
  readonly measured: (runs: readonly number[]) => Judgement
  readonly unsupported: Outcome
}

const measuredStarter = (definition: RowDefinition, runs: readonly number[], cases: StarterCases): Judgement =>
  Match.value(reproducibilityProblem('starter', definition, runs)).pipe(
    Match.when(undefined, () => cases.measured(runs)),
    Match.orElse((problem) => fail(problem)),
  )

const againstStarter = (definition: RowDefinition, starter: Cell, cases: StarterCases): Judgement =>
  Match.value(starter).pipe(
    Match.tag('Measured', (cell) => measuredStarter(definition, cell.runs, cases)),
    Match.tag('Unsupported', () => pass(cases.unsupported)),
    Match.tag('Absent', () => pass(NOT_BEATEN)),
    Match.tag('NoDeployment', () => pass(NOT_BEATEN)),
    Match.tag('Unmeasurable', () => pass(NOT_BEATEN)),
    Match.tag('NoSecret', () => pass(NOT_BEATEN)),
    Match.tag('InstrumentError', (cell) => fail(`starter: ${cell.error}`)),
    Match.exhaustive,
  )

const againstNothing = (definition: RowDefinition, starter: Cell): Judgement =>
  againstStarter(definition, starter, { measured: () => pass(NOT_BEATEN), unsupported: NOT_BEATEN })

const againstBar = (definition: RowDefinition, starter: Cell): Judgement =>
  Match.value(definition.ratstackSupport).pipe(
    Match.tag(
      'Required',
      () => fail(`rat-stack is unsupported on ${definition.id}, which requires a rat-stack measurement`),
    ),
    Match.tag('MayBeUnsupported', ({ bar }) =>
      againstStarter(definition, starter, {
        measured: (runs) =>
          Match.value(meetsBar(definition, bar, runs)).pipe(
            Match.when(true, () => pass(BEATEN)),
            Match.orElse(() => pass(NOT_BEATEN)),
          ),
        unsupported: TIE,
      })),
    Match.exhaustive,
  )

const contradicted = (citation: Citation, found: string): RowInstrumentError =>
  new RowInstrumentError({
    message: `rat-stack ${citation.file}:${citation.lines[0]}-${
      citation.lines[1]
    } no longer contains "${citation.text}" (found "${found}")`,
  })

const measuredRatstack = (definition: RowDefinition, runs: readonly number[], starter: Cell): Judgement =>
  Match.value(reproducibilityProblem('rat-stack', definition, runs)).pipe(
    Match.when(
      undefined,
      () =>
        againstStarter(definition, starter, {
          measured: (starterRuns) => compareRuns(definition, runs, starterRuns),
          unsupported: NOT_BEATEN,
        }),
    ),
    Match.orElse((problem) => fail(problem)),
  )

const decide = ({ definition, ratstack, starter }: JudgeRow): Judgement =>
  Match.value(ratstack).pipe(
    Match.tag('Measured', (cell) => measuredRatstack(definition, cell.runs, starter)),
    Match.tag('Unsupported', (cell) =>
      Match.value(cell.check).pipe(
        Match.tag('Verified', () => againstBar(definition, starter)),
        Match.tag('Contradicted', ({ found }) => Result.fail(contradicted(cell.citation, found))),
        Match.exhaustive,
      )),
    Match.tag('Absent', () => againstNothing(definition, starter)),
    Match.tag('NoDeployment', () => againstNothing(definition, starter)),
    Match.tag('Unmeasurable', () => againstNothing(definition, starter)),
    Match.tag('NoSecret', () => againstNothing(definition, starter)),
    Match.tag('InstrumentError', (cell) => fail(`rat-stack: ${cell.error}`)),
    Match.exhaustive,
  )

export const judgeRow = Workflow.make({
  command: JudgeRow,
  decision: S.Union([Beaten, NotBeaten, Tie]),
  error: RowInstrumentError,
  decide,
})
