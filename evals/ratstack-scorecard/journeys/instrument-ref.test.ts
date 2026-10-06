import { Effect, Schema } from 'effect'
import { describe, expect, test } from 'vitest'
import { launcherRun } from './launcher-run.ts'

const Selection = Schema.Struct({
  code: Schema.Number,
  stdout: Schema.String,
  stderr: Schema.String,
  base: Schema.String,
  head: Schema.String,
  graded: Schema.NullOr(Schema.String),
})

const selection = async (name: string) => {
  const run = await launcherRun('instrument-ref')
  return Effect.runPromise(Schema.decodeUnknownEffect(Schema.fromJsonString(Selection))(run.files[`${name}.json`]))
}

describe('which instrument grades a pull request (bootstrap ruling)', () => {
  test('a base without the scorecard workflow is the only case that grades with the PR head, and says BOOTSTRAP', async () => {
    const s = await selection('bootstrap')
    expect(s.code).toBe(0)
    expect(s.stdout).toBe(`ref=${s.head}\nmode=bootstrap\n`)
  })

  test.each(['edits-instrument', 'deletes-instrument', 'deletes-workflow'])(
    'when the base has the workflow, a PR that %s is still graded by the base instrument, so the base verdict (red) stands',
    async (name) => {
      const s = await selection(name)
      expect(s.code).toBe(0)
      expect(s.stdout).toBe(`ref=${s.base}\nmode=base\n`)
      expect(s.graded).toBe('red')
    },
  )

  test('a base commit missing from the clone fails instead of falling back to bootstrap', async () => {
    const s = await selection('base-missing')
    expect(s.code).toBe(1)
    expect(s.stdout).toBe('')
    expect(s.stderr).toContain('is not in this clone')
  })
})
