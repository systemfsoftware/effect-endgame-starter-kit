import { fc, test } from '@fast-check/vitest'
import { describe } from 'vitest'
import type { Cell, Row } from './cell.ts'
import { compareWithMain } from './compare-with-main.workflow.ts'
import { verdictOf } from './judge-row.workflow.ts'
import { row, runsFor, sha } from './scorecard.arbitrary.ts'

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

const passing = (r: Row): boolean => verdictOf(r)._tag !== 'InstrumentError'

const withCells = (r: Row, ratstack: Cell, starter: Cell): Row => ({
  ...r,
  ratstack: { ...r.ratstack, cell: ratstack },
  starter: { ...r.starter, cell: starter },
})

const ids = (rows: readonly { readonly id: string }[]): string => rows.map((r) => r.id).sort().join(',')

const uniqueRows = fc.uniqueArray(row(), { selector: (r) => r.definition.id, maxLength: 16 })

const withRuns = row().chain((base) => runsFor(base.definition).map((runs) => [base, runs] as const))

describe('compareWithMain', () => {
  test.prop([uniqueRows, sha])('rows compared with themselves fail only where the verdict is an instrument error', (
    rows,
    commit,
  ) => {
    const ratchet = compareWithMain({ rows, main: { _tag: 'Found', commit, rows } })
    return ratchet._tag === 'Compared' &&
      ratchet.outcomes.every((outcome) => outcome._tag === 'InstrumentError' || outcome._tag === 'Held') &&
      ids(ratchet.failures) === ids(rows.filter((r) => !passing(r)).map((r) => r.definition))
  })

  test.prop([uniqueRows])('without a main artifact the ratchet is a first baseline failing only instrument errors', (
    rows,
  ) => {
    const ratchet = compareWithMain({ rows, main: { _tag: 'Missing' } })
    return ratchet._tag === 'FirstBaseline' &&
      ratchet.outcomes.every((outcome) => outcome._tag === 'InstrumentError' || outcome._tag === 'New') &&
      ids(ratchet.failures) === ids(rows.filter((r) => !passing(r)).map((r) => r.definition))
  })

  test.prop([withRuns, sha])('a row beaten on main and not beaten on the PR fails as lost', ([base, runs], commit) => {
    const spread = Math.max(...runs) - Math.min(...runs)
    const better = { lower: -1, higher: 1 }[base.definition.direction]
    const beaten = runs.map((v) => v + better * (spread + 1))
    const main = withCells(base, measured(runs), measured(beaten))
    const pr = withCells(base, measured(runs), measured(runs))
    const ratchet = compareWithMain({ rows: [pr], main: { _tag: 'Found', commit, rows: [main] } })
    return ratchet.failures.length === 1 && ratchet.failures[0]?._tag === 'LostBeaten'
  })

  test.prop([withRuns, sha])('a changed metric definition is re-baselined and never fails', ([base, runs], commit) => {
    const main = withCells(base, measured(runs), measured(runs))
    const pr = { ...main, definitionHash: `${main.definitionHash} changed` }
    const ratchet = compareWithMain({ rows: [pr], main: { _tag: 'Found', commit, rows: [main] } })
    return ratchet.failures.length === 0 && ratchet.outcomes[0]?._tag === 'ReBaselined'
  })

  test.prop([
    withRuns,
    fc.constantFrom<Cell>(
      { _tag: 'Absent', reason: 'bin removed' },
      { _tag: 'Unmeasurable', error: 'gate red at baseline' },
    ),
    sha,
  ])('a starter value present on main and gone on the PR regresses', ([base, runs], gone, commit) => {
    const main = withCells(base, measured(runs), measured(runs))
    const pr = { ...main, starter: { ...main.starter, cell: gone } }
    const ratchet = compareWithMain({ rows: [pr], main: { _tag: 'Found', commit, rows: [main] } })
    return ratchet.failures.length === 1 && ratchet.failures[0]?._tag === 'Regressed'
  })

  test.prop([
    withRuns,
    fc.constantFrom<Cell>({ _tag: 'NoSecret', name: 'ANTHROPIC_API_KEY' }, { _tag: 'NoDeployment', sha: 'abc1234' }),
    sha,
  ])('a starter value missing for a secret or a fork deployment is neutral', ([base, runs], missing, commit) => {
    const main = withCells(base, measured(runs), measured(runs))
    const pr = { ...main, starter: { ...main.starter, cell: missing } }
    const ratchet = compareWithMain({ rows: [pr], main: { _tag: 'Found', commit, rows: [main] } })
    return ratchet.failures.length === 0 && ratchet.outcomes[0]?._tag === 'Neutral'
  })

  test.prop([
    row({ kind: 'measurement' }).chain((r) => fc.tuple(fc.constant(r), runsFor(r.definition))),
    fc.double({ min: 0, max: 1, noNaN: true }),
    fc.double({ min: 1e-3, max: 1e3, noNaN: true }),
    sha,
  ])(
    "a PR median inside main's run range holds and one past main's worst run regresses",
    ([base, mainRuns], position, beyond, commit) => {
      const lo = Math.min(...mainRuns)
      const hi = Math.max(...mainRuns)
      const worst = { lower: hi, higher: lo }[base.definition.direction]
      const worse = { lower: 1, higher: -1 }[base.definition.direction]
      const inside = Math.min(hi, Math.max(lo, lo + (hi - lo) * position))
      const main = withCells(base, measured(mainRuns), measured(mainRuns))
      const at = (value: number) =>
        compareWithMain({
          rows: [withCells(base, measured(mainRuns), measured(mainRuns.map(() => value)))],
          main: { _tag: 'Found', commit, rows: [main] },
        }).failures.map((f) => f._tag).join(',')
      return at(inside) === '' && at(worst + worse * beyond) === 'Regressed'
    },
  )

  test.prop([withRuns, sha])(
    'an unsupported PR starter of equal verdict weight regresses exactly once',
    ([base, runs], commit) => {
      const main = withCells(base, measured(runs), measured(runs))
      const pr = withCells(base, measured(runs), verifiedCitation)
      const ratchet = compareWithMain({ rows: [pr], main: { _tag: 'Found', commit, rows: [main] } })
      return ratchet.failures.length === 1 && ratchet.failures[0]?._tag === 'Regressed'
    },
  )
})
