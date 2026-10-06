import { fc, test } from '@fast-check/vitest'
import { Result } from 'effect'
import type { Cell, RowDefinition } from '../cell.ts'
import { JudgeRow, judgeRow } from '../judge-row.workflow.ts'
import { cell, definition, runsFor, sha } from '../scorecard.arbitrary.ts'

const measured = (runs: readonly number[]): Cell => ({ _tag: 'Measured', runs })

const verifiedCitation: Cell = {
  _tag: 'Unsupported',
  citation: {
    file: 'packages/core/src/join-interest-contract.ts',
    lines: [22, 26],
    text: 'Confirmation is not a seat',
  },
  check: { _tag: 'Verified' },
}

const withRuns = (overrides: Partial<RowDefinition> = {}) =>
  definition(overrides).chain((d) => fc.tuple(fc.constant(d), runsFor(d)))

const missingStarter = fc.oneof(
  fc.string().map((reason): Cell => ({ _tag: 'Absent', reason })),
  sha.map((s): Cell => ({ _tag: 'NoDeployment', sha: s })),
  fc.string().map((error): Cell => ({ _tag: 'Unmeasurable', error })),
  fc.string().map((name): Cell => ({ _tag: 'NoSecret', name })),
)

const tagOf = (result: ReturnType<typeof judgeRow>): string =>
  Result.isSuccess(result) ? result.success._tag : 'InstrumentError'

const judge = (definition: RowDefinition, ratstack: Cell, starter: Cell): string =>
  tagOf(judgeRow(new JudgeRow({ definition, ratstack, starter })))

test.prop([withRuns(), fc.double({ min: 1e-3, max: 1e3, noNaN: true })])(
  'a starter strictly better than every rat-stack run is beaten, and swapping the sides is not',
  ([d, runs], gap) => {
    const spread = Math.max(...runs) - Math.min(...runs)
    const better = { lower: -1, higher: 1 }[d.direction]
    const ratstack = measured(runs)
    const starter = measured(runs.map((v) => v + better * (spread + gap)))
    return judge(d, ratstack, starter) === 'Beaten' && judge(d, starter, ratstack) === 'NotBeaten'
  },
)

test.prop([
  definition({ kind: 'measurement' }),
  fc.double({ min: -1e6, max: 1e6, noNaN: true }),
  fc.double({ min: 1e-3, max: 1e3, noNaN: true }),
])(
  "against an unsupported rat-stack, the starter is beaten exactly when its worst run meets the row's bar",
  (base, bar, gap) => {
    const d: RowDefinition = { ...base, ratstackSupport: { _tag: 'MayBeUnsupported', bar } }
    const better = { lower: -1, higher: 1 }[d.direction]
    const verdict = (worst: number) =>
      judge(d, verifiedCitation, measured([...Array.from({ length: d.runs - 1 }, () => bar + better * gap), worst]))
    return verdict(bar) === 'Beaten' && verdict(bar + better * gap) === 'Beaten' &&
      verdict(bar - better * gap) === 'NotBeaten'
  },
)

test.prop([definition({ ratstackSupport: { _tag: 'Required' } }), fc.double({ min: -1e6, max: 1e6, noNaN: true })])(
  'a row requiring a rat-stack measurement never counts an unsupported rat-stack as beaten',
  (d, v) => judge(d, verifiedCitation, measured(Array(d.runs).fill(v))) === 'InstrumentError',
)

test.prop([
  definition({ kind: 'measurement' }),
  fc.double({ min: -1e6, max: 1e6, noNaN: true }),
  fc.array(fc.double({ min: 1e-3, max: 1e3, noNaN: true }), { minLength: 4, maxLength: 4 }),
])("a starter whose every run only equals rat-stack's best run is not beaten", (d, best, gaps) => {
  const worse = { lower: 1, higher: -1 }[d.direction]
  const ratstack = measured([best, ...gaps.slice(0, d.runs - 1).map((gap) => best + worse * gap)])
  const starter = measured(Array.from({ length: d.runs }, () => best))
  return judge(d, ratstack, starter) === 'NotBeaten'
})

test.prop([withRuns()])(
  'identical run ranges are a tie',
  ([d, runs]) => judge(d, measured(runs), measured([...runs].reverse())) === 'Tie',
)

test.prop([withRuns(), fc.integer({ min: 1, max: 4 }), fc.boolean()])(
  'a side with fewer runs than its definition is an instrument error',
  ([d, runs], cut, cutStarter) => {
    const short = measured(runs.slice(Math.min(cut, d.runs - 1)))
    const full = measured(runs)
    const [ratstack, starter] = cutStarter ? [full, short] : [short, full]
    return judge(d, ratstack, starter) === 'InstrumentError'
  },
)

test.prop([withRuns({ kind: 'count' }), fc.double({ min: 1, max: 9, noNaN: true })])(
  'a starter count that does not reproduce is an instrument error, even against a verified citation',
  ([d, runs], bump) => {
    const first = runs[0] ?? 0
    return judge(d, verifiedCitation, measured([...runs.slice(1), first + bump])) === 'InstrumentError'
  },
)

test.prop([definition().chain((d) => fc.tuple(fc.constant(d), cell(d))), fc.string()])(
  'a contradicted rat-stack citation is an instrument error whatever the starter shows',
  ([d, starter], found) =>
    judge(d, { ...verifiedCitation, check: { _tag: 'Contradicted', found } }, starter) === 'InstrumentError',
)

test.prop([definition().chain((d) => fc.tuple(fc.constant(d), cell(d), runsFor(d))), missingStarter])(
  'a missing starter value is never beaten whatever a non-error rat-stack cell shows',
  ([d, ratstack, runs], starter) => {
    const measurement = measured(runs)
    return judge(d, ratstack, measurement) === 'InstrumentError' || judge(d, ratstack, starter) === 'NotBeaten'
  },
)
