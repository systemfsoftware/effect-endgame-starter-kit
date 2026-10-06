import Ajv from 'ajv'
import { describe, expect, test } from 'vitest'
import schema from '../scorecard.schema.json' with { type: 'json' }
import { launcherRun } from './launcher-run.ts'

const validate = new Ajv({ allErrors: true, strict: true }).compile(schema)

describe('aggregate through the real CLI (J3)', () => {
  test('a row beaten on main and tied on the PR fails the job, names the row, and still writes a valid scorecard', async () => {
    const run = await launcherRun('aggregate-regressed')
    expect(run.code).toBe(1)
    expect(run.stderr).toContain('M23')
    expect(run.stderr).not.toContain('M28')
    expect(validate(JSON.parse(run.files['scorecard.json'] ?? 'null'))).toBe(true)
  })

  test('without a main artifact the same families are a passing first baseline', async () => {
    const run = await launcherRun('aggregate-first-baseline')
    expect(run.code).toBe(0)
    expect(validate(JSON.parse(run.files['scorecard.json'] ?? 'null'))).toBe(true)
  })
})
