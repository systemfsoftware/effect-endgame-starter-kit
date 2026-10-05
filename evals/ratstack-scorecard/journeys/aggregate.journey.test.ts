import Ajv from 'ajv'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import schema from '../scorecard.schema.json' with { type: 'json' }

const instrument = join(import.meta.dirname, '..')
const fixtures = join(import.meta.dirname, '__fixtures__/aggregate')

interface Exit {
  readonly code: number
  readonly stderr: string
}

const aggregate = (args: readonly string[]): Promise<Exit> => {
  const { promise, resolve } = Promise.withResolvers<Exit>()
  execFile(
    'deno',
    ['run', '--no-config', '--allow-read', '--allow-write', '--allow-env', 'src/main.ts', 'aggregate', ...args],
    { cwd: instrument, env: { ...process.env, DENO_NO_PACKAGE_JSON: '1' } },
    (error, _stdout, stderr) => resolve({ code: error === null ? 0 : Number(error.code), stderr }),
  )
  return promise
}

describe('aggregate through the real CLI (J3)', () => {
  test('a row beaten on main and tied on the PR fails the job, names the row, and still writes a valid scorecard', async () => {
    const out = await mkdtemp(join(tmpdir(), 'aggregate-'))
    const exit = await aggregate([
      '--families',
      join(fixtures, 'families'),
      '--main',
      join(fixtures, 'main/scorecard.json'),
      '--out',
      join(out, 'scorecard.json'),
      '--summary',
      join(out, 'summary.md'),
    ])
    const written = JSON.parse(await readFile(join(out, 'scorecard.json'), 'utf8'))
    const validate = new Ajv({ allErrors: true, strict: true }).compile(schema)
    expect(exit.code).toBe(1)
    expect(exit.stderr).toContain('M23')
    expect(exit.stderr).not.toContain('M28')
    expect(validate(written)).toBe(true)
  })

  test('without a main artifact the same families are a passing first baseline', async () => {
    const out = await mkdtemp(join(tmpdir(), 'aggregate-'))
    const exit = await aggregate([
      '--families',
      join(fixtures, 'families'),
      '--out',
      join(out, 'scorecard.json'),
      '--summary',
      join(out, 'summary.md'),
    ])
    expect(exit.code).toBe(0)
  })
})
