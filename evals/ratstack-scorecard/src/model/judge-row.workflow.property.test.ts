import { fc, test } from '@fast-check/vitest'
import { describe } from 'vitest'
import type { Cell, RowDefinition } from './cell.ts'
import { judgeRow } from './judge-row.workflow.ts'
import { cell, definition, runsFor } from './scorecard.arbitrary.ts'

const measured = (runs: readonly number[]): Cell => ({ _tag: 'Measured', runs })

const negated = (c: Cell): Cell => c._tag === 'Measured' ? measured(c.runs.map((v) => -v)) : c

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

describe('judgeRow', () => {
  test.prop([withRuns(), fc.double({ min: 1e-3, max: 1e3, noNaN: true })])(
    'a starter strictly better than every rat-stack run is beaten, and swapping the sides is not',
    ([d, runs], gap) => {
      const spread = Math.max(...runs) - Math.min(...runs)
      const better = { lower: -1, higher: 1 }[d.direction]
      const ratstack = measured(runs)
      const starter = measured(runs.map((v) => v + better * (spread + gap)))
      return judgeRow({ definition: d, ratstack, starter })._tag === 'Beaten' &&
        judgeRow({ definition: d, ratstack: starter, starter: ratstack })._tag === 'NotBeaten'
    },
  )

  test.prop([
    definition({ kind: 'measurement' }),
    fc.double({ min: -1e6, max: 1e6, noNaN: true }),
    fc.array(fc.double({ min: 1e-3, max: 1e3, noNaN: true }), { minLength: 4, maxLength: 4 }),
  ])("a starter whose every run only equals rat-stack's best run is not beaten", (d, best, gaps) => {
    const worse = { lower: 1, higher: -1 }[d.direction]
    const ratstack = measured([best, ...gaps.slice(0, d.runs - 1).map((gap) => best + worse * gap)])
    const starter = measured(Array.from({ length: d.runs }, () => best))
    return judgeRow({ definition: d, ratstack, starter })._tag === 'NotBeaten'
  })

  test.prop([withRuns()])(
    'identical run ranges are a tie',
    ([d, runs]) =>
      judgeRow({ definition: d, ratstack: measured(runs), starter: measured([...runs].reverse()) })._tag === 'Tie',
  )

  test.prop([definition().chain((d) => fc.tuple(fc.constant(d), cell(d), cell(d)))])(
    'direction higher mirrors direction lower under negation',
    ([d, ratstack, starter]) => {
      const flipped = { ...d, direction: ({ lower: 'higher', higher: 'lower' } as const)[d.direction] }
      return judgeRow({ definition: flipped, ratstack: negated(ratstack), starter: negated(starter) })._tag ===
        judgeRow({ definition: d, ratstack, starter })._tag
    },
  )

  test.prop([withRuns(), fc.integer({ min: 1, max: 4 }), fc.boolean()])(
    'a side with fewer runs than its definition is an instrument error',
    ([d, runs], cut, cutStarter) => {
      const short = measured(runs.slice(Math.min(cut, d.runs - 1)))
      const full = measured(runs)
      const [ratstack, starter] = cutStarter ? [full, short] : [short, full]
      return judgeRow({ definition: d, ratstack, starter })._tag === 'InstrumentError'
    },
  )

  test.prop([withRuns({ kind: 'count' }), fc.double({ min: 1, max: 9, noNaN: true })])(
    'a starter count that does not reproduce is an instrument error, even against a verified citation',
    ([d, runs], bump) =>
      judgeRow({
        definition: d,
        ratstack: verifiedCitation,
        starter: measured([...runs.slice(1), runs[0]! + bump]),
      })._tag === 'InstrumentError',
  )

  test.prop([definition().chain((d) => fc.tuple(fc.constant(d), cell(d))), fc.string()])(
    'a contradicted rat-stack citation is an instrument error whatever the starter shows',
    ([d, starter], found) =>
      judgeRow({
        definition: d,
        ratstack: { ...verifiedCitation, check: { _tag: 'Contradicted', found } },
        starter,
      })._tag === 'InstrumentError',
  )
})
