import { describe, expect, test } from 'vitest'
import type { Cell, MeasuredCell, Row, RowDefinition } from './cell.ts'
import { compareWithMain } from './compare-with-main.workflow.ts'
import { judgeRow } from './judge-row.workflow.ts'

const lcp: RowDefinition = {
  id: 'M3.lcp',
  metric: 'M3',
  bin: 'apps/mischief home page',
  label: 'Largest Contentful Paint on /',
  unit: 'ms',
  direction: 'lower',
  kind: 'measurement',
  runs: 5,
  family: 'networked',
  ratstackSupport: { _tag: 'Required' },
}
const debt: RowDefinition = { ...lcp, id: 'M23', metric: 'M23', kind: 'count', runs: 3, family: 'static' }
const passwords: RowDefinition = { ...debt, id: 'M14', metric: 'M14', family: 'running-stack' }
const cli: RowDefinition = { ...lcp, id: 'M9', metric: 'M9', family: 'agent-surfaces' }
const oversold: RowDefinition = {
  ...debt,
  id: 'M12',
  metric: 'M12',
  family: 'running-stack',
  ratstackSupport: { _tag: 'MayBeUnsupported', bar: 0 },
}

const measured = (runs: readonly number[]): Cell => ({ _tag: 'Measured', runs })

const at = (cell: Cell): MeasuredCell => ({
  cell,
  provenance: {
    side: 'starter',
    commit: 'a'.repeat(40),
    instrumentHash: 'b'.repeat(40),
    nixpkgsRev: 'c'.repeat(40),
    runner: 'fleet-large-1',
    measuredAt: '2026-10-05T00:00:00.000Z',
    tools: {},
  },
})

const row = (definition: RowDefinition, ratstack: Cell, starter: Cell): Row => ({
  definition,
  definitionHash: 'd'.repeat(40),
  ratstack: at(ratstack),
  starter: at(starter),
  verdict: judgeRow({ definition, ratstack, starter }),
  flags: [],
})

const seats = {
  file: 'packages/core/src/join-interest-contract.ts',
  lines: [22, 26] as const,
  text: 'Confirmation is not a seat',
}

describe('plan acceptance examples', () => {
  test('AE1: overlapping LCP ranges are not beaten; a starter whose worst run is 409 is', () => {
    const ratstack = measured([410, 420, 455, 430, 418])
    expect(judgeRow({ definition: lcp, ratstack, starter: measured([380, 395, 412, 390, 401]) })._tag).toBe(
      'NotBeaten',
    )
    expect(judgeRow({ definition: lcp, ratstack, starter: measured([380, 395, 409, 390, 401]) })._tag).toBe('Beaten')
  })

  test('AE2: count runs of 217, 217, 216 are an instrument error', () => {
    expect(judgeRow({ definition: debt, ratstack: measured([217, 217, 216]), starter: measured([3, 3, 3]) })._tag)
      .toBe('InstrumentError')
  })

  test('AE3: the seat citation no longer holding is an instrument error; holding, a measured starter beats it', () => {
    const starter = measured([0, 0, 0])
    const contradicted: Cell = {
      _tag: 'Unsupported',
      citation: seats,
      check: { _tag: 'Contradicted', found: 'export const seats = confirmations' },
    }
    expect(judgeRow({ definition: oversold, ratstack: contradicted, starter })._tag).toBe('InstrumentError')
    expect(judgeRow({ definition: oversold, ratstack: { ...contradicted, check: { _tag: 'Verified' } }, starter })._tag)
      .toBe('Beaten')
  })

  test('M12: rat-stack unsupported is beaten only by a starter that oversells nothing on every run', () => {
    const ratstack: Cell = { _tag: 'Unsupported', citation: seats, check: { _tag: 'Verified' } }
    const verdict = (runs: readonly number[]) =>
      judgeRow({ definition: oversold, ratstack, starter: measured(runs) })._tag
    expect(verdict([5, 5, 5])).toBe('NotBeaten')
    expect(verdict([0, 0, 0])).toBe('Beaten')
    expect(verdict([0, 1, 0])).toBe('InstrumentError')
  })

  test('a row that requires a rat-stack measurement turns an unsupported rat-stack cell into an instrument error', () => {
    const ratstack: Cell = { _tag: 'Unsupported', citation: seats, check: { _tag: 'Verified' } }
    expect(judgeRow({ definition: debt, ratstack, starter: measured([0, 0, 0]) })._tag).toBe('InstrumentError')
  })

  test('AE4: main beats rat-stack on M14 and a PR re-enabling a password route fails, naming M14', () => {
    const main = row(passwords, measured([1, 1, 1]), measured([0, 0, 0]))
    const pr = row(passwords, measured([1, 1, 1]), measured([1, 1, 1]))
    const ratchet = compareWithMain({ rows: [pr], main: { _tag: 'Found', commit: 'e'.repeat(40), rows: [main] } })
    expect(ratchet.failures).toEqual([{ _tag: 'LostBeaten', id: 'M14', ratstack: 'Measured', starter: 'Measured' }])
  })

  test("AE5: a PR median of 139 ms is inside main's M9 band and passes; 141 ms fails", () => {
    const ratstack = measured([90, 91, 92, 93, 94])
    const main = row(cli, ratstack, measured([120, 131, 140, 125, 128]))
    const prWith = (runs: readonly number[]) =>
      compareWithMain({
        rows: [row(cli, ratstack, measured(runs))],
        main: { _tag: 'Found', commit: 'e'.repeat(40), rows: [main] },
      }).failures.map((f) => [f._tag, f.id])
    expect(prWith([130, 135, 139, 140, 141])).toEqual([])
    expect(prWith([130, 135, 141, 142, 143])).toEqual([['Regressed', 'M9']])
  })

  test('AE7: a fork PR with no preview leaves the starter absent and the ratchet neutral', () => {
    const scanner: RowDefinition = { ...debt, id: 'M1.level', metric: 'M1', family: 'networked' }
    const main = row(scanner, measured([5, 5, 5]), measured([5, 5, 5]))
    const pr = row(scanner, measured([5, 5, 5]), { _tag: 'NoDeployment', sha: 'f'.repeat(40) })
    const ratchet = compareWithMain({ rows: [pr], main: { _tag: 'Found', commit: 'e'.repeat(40), rows: [main] } })
    expect(ratchet.failures).toEqual([])
    expect(ratchet.outcomes).toEqual([{ _tag: 'Neutral', id: 'M1.level', cause: 'NoDeployment' }])
  })
})
