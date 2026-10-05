import { fc, test } from '@fast-check/vitest'
import { describe } from 'vitest'
import type { Cell, Row, Verdict } from './cell.ts'
import { compareWithMain } from './compare-with-main.workflow.ts'
import { row, runsFor, sha } from './scorecard.arbitrary.ts'

const passing = (verdict: Verdict): boolean => verdict._tag !== 'InstrumentError'

const withStarter = (r: Row, cell: Cell): Row => ({ ...r, starter: { ...r.starter, cell } })

const ids = (rows: readonly { readonly id: string }[]): string => rows.map((r) => r.id).sort().join(',')

const uniqueRows = fc.uniqueArray(row(), { selector: (r) => r.definition.id, maxLength: 16 })

describe('compareWithMain', () => {
  test.prop([uniqueRows, sha])('rows compared with themselves fail only where the verdict is an instrument error', (
    rows,
    commit,
  ) => {
    const ratchet = compareWithMain({ rows, main: { _tag: 'Found', commit, rows } })
    return ids(ratchet.failures) === ids(rows.filter((r) => !passing(r.verdict)).map((r) => r.definition))
  })

  test.prop([uniqueRows])('without a main artifact the ratchet is a first baseline failing only instrument errors', (
    rows,
  ) => {
    const ratchet = compareWithMain({ rows, main: { _tag: 'Missing' } })
    return ratchet._tag === 'FirstBaseline' &&
      ids(ratchet.failures) === ids(rows.filter((r) => !passing(r.verdict)).map((r) => r.definition))
  })

  test.prop([row(), fc.constantFrom<Verdict>({ _tag: 'NotBeaten' }, { _tag: 'Tie' }), sha])(
    'a row beaten on main and not beaten on the PR fails as lost',
    (main, prVerdict, commit) => {
      const pr = { ...main, verdict: prVerdict }
      const ratchet = compareWithMain({
        rows: [pr],
        main: { _tag: 'Found', commit, rows: [{ ...main, verdict: { _tag: 'Beaten' } }] },
      })
      return ratchet.failures.length === 1 && ratchet.failures[0]!._tag === 'LostBeaten'
    },
  )

  test.prop([row(), sha, sha])('a changed metric definition is re-baselined and never fails', (main, hash, commit) => {
    fc.pre(hash !== main.definitionHash)
    const pr = { ...main, definitionHash: hash, verdict: { _tag: 'NotBeaten' } as const }
    const ratchet = compareWithMain({
      rows: [pr],
      main: { _tag: 'Found', commit, rows: [{ ...main, verdict: { _tag: 'Beaten' } }] },
    })
    return ratchet.failures.length === 0 && ratchet.outcomes[0]!._tag === 'ReBaselined'
  })

  test.prop([
    row().chain((r) => fc.tuple(fc.constant(r), runsFor(r.definition))),
    fc.constantFrom<Cell>(
      { _tag: 'Absent', reason: 'bin removed' },
      { _tag: 'Unmeasurable', error: 'gate red at baseline' },
    ),
    sha,
  ])('a starter value present on main and gone on the PR regresses', ([base, runs], gone, commit) => {
    const main = withStarter({ ...base, verdict: { _tag: 'NotBeaten' } }, { _tag: 'Measured', runs })
    const pr = withStarter(main, gone)
    const ratchet = compareWithMain({ rows: [pr], main: { _tag: 'Found', commit, rows: [main] } })
    return ratchet.failures.length === 1 && ratchet.failures[0]!._tag === 'Regressed'
  })

  test.prop([
    row().chain((r) => fc.tuple(fc.constant(r), runsFor(r.definition))),
    fc.constantFrom<Cell>({ _tag: 'NoSecret', name: 'ANTHROPIC_API_KEY' }, { _tag: 'NoDeployment', sha: 'abc1234' }),
    sha,
  ])('a starter value missing for a secret or a fork deployment is neutral', ([base, runs], missing, commit) => {
    const main = withStarter({ ...base, verdict: { _tag: 'NotBeaten' } }, { _tag: 'Measured', runs })
    const pr = withStarter(main, missing)
    const ratchet = compareWithMain({ rows: [pr], main: { _tag: 'Found', commit, rows: [main] } })
    return ratchet.failures.length === 0 && ratchet.outcomes[0]!._tag === 'Neutral'
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
      const main = withStarter({ ...base, verdict: { _tag: 'NotBeaten' } }, { _tag: 'Measured', runs: mainRuns })
      const at = (value: number) =>
        compareWithMain({
          rows: [withStarter(main, { _tag: 'Measured', runs: mainRuns.map(() => value) })],
          main: { _tag: 'Found', commit, rows: [main] },
        }).failures.map((f) => f._tag).join(',')
      return at(inside) === '' && at(worst + worse * beyond) === 'Regressed'
    },
  )
})
