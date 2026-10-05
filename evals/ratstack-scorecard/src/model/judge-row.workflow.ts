import type { Cell, Citation, Kind, RowDefinition, Verdict } from './cell.ts'
import { firstRule, matchCell, matchCheck, matchKind } from './dispatch.ts'
import { smallerIsBetter } from './runs.ts'

export interface JudgeRowInput {
  readonly definition: RowDefinition
  readonly ratstack: Cell
  readonly starter: Cell
}

const beaten: Verdict = { _tag: 'Beaten' }
const notBeaten: Verdict = { _tag: 'NotBeaten' }
const tie: Verdict = { _tag: 'Tie' }
const instrumentError = (error: string): Verdict => ({ _tag: 'InstrumentError', error })

const range = (runs: readonly number[]): string => `${Math.min(...runs)}..${Math.max(...runs)}`

const countDisagrees = (kind: Kind, runs: readonly number[]): boolean =>
  matchKind(kind, { count: () => new Set(runs).size > 1, measurement: () => false })

const reproducible = (
  side: string,
  definition: RowDefinition,
  runs: readonly number[],
  then: () => Verdict,
): Verdict =>
  firstRule<Verdict>([
    [
      runs.length !== definition.runs,
      () => instrumentError(`${side} produced ${runs.length} of ${definition.runs} runs`),
    ],
    [
      countDisagrees(definition.kind, runs),
      () => instrumentError(`${side} count runs disagree: ${runs.join(', ')}`),
    ],
  ], then)

const compareRuns = (definition: RowDefinition, ratstack: readonly number[], starter: readonly number[]): Verdict => {
  const r = smallerIsBetter(definition.direction, ratstack)
  const s = smallerIsBetter(definition.direction, starter)
  return firstRule<Verdict>([
    [range(r) === range(s), () => tie],
    [Math.max(...s) < Math.min(...r), () => beaten],
  ], () => notBeaten)
}

const contradicted = (citation: Citation, found: string): Verdict =>
  instrumentError(
    `rat-stack ${citation.file}:${citation.lines[0]}-${
      citation.lines[1]
    } no longer contains "${citation.text}" (found "${found}")`,
  )

const againstStarter = (
  input: JudgeRowInput,
  cases: { readonly measured: (runs: readonly number[]) => Verdict; readonly unsupported: Verdict },
): Verdict =>
  matchCell(input.starter, {
    Measured: (cell) => reproducible('starter', input.definition, cell.runs, () => cases.measured(cell.runs)),
    Unsupported: () => cases.unsupported,
    Absent: () => notBeaten,
    NoDeployment: () => notBeaten,
    Unmeasurable: () => notBeaten,
    NoSecret: () => notBeaten,
    InstrumentError: (cell) => instrumentError(`starter: ${cell.error}`),
  })

const againstNothing = (input: JudgeRowInput): Verdict =>
  againstStarter(input, { measured: () => notBeaten, unsupported: notBeaten })

export const judgeRow = (input: JudgeRowInput): Verdict =>
  matchCell(input.ratstack, {
    Measured: (ratstack) =>
      reproducible('rat-stack', input.definition, ratstack.runs, () =>
        againstStarter(input, {
          measured: (starter) => compareRuns(input.definition, ratstack.runs, starter),
          unsupported: notBeaten,
        })),
    Unsupported: (ratstack) =>
      matchCheck(ratstack.check, {
        Verified: () => againstStarter(input, { measured: () => beaten, unsupported: tie }),
        Contradicted: (check) => contradicted(ratstack.citation, check.found),
      }),
    Absent: () => againstNothing(input),
    NoDeployment: () => againstNothing(input),
    Unmeasurable: () => againstNothing(input),
    NoSecret: () => againstNothing(input),
    InstrumentError: (ratstack) => instrumentError(`rat-stack: ${ratstack.error}`),
  })
