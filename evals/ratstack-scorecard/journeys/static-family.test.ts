import { Schema } from 'effect'
import { describe, expect, test } from 'vitest'
import { launcherRun } from './launcher-run.ts'

const Cell = Schema.Union([
  Schema.Struct({ _tag: Schema.Literal('Measured'), runs: Schema.Array(Schema.Number) }),
  Schema.Struct({ _tag: Schema.Literal('InstrumentError'), error: Schema.String }),
])

const Family = Schema.Struct({
  family: Schema.Literal('static'),
  cells: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      side: Schema.Literals(['ratstack', 'starter']),
      measured: Schema.Struct({ cell: Cell }),
    }),
  ),
})

const familyOf = async (journey: string) =>
  Schema.decodeUnknownPromise(Family)(JSON.parse((await launcherRun(journey)).files['family.json'] ?? 'null'))

const cell = (family: typeof Family.Type, id: string, side: 'ratstack' | 'starter') =>
  family.cells.filter((c) => c.id === id && c.side === side).map((c) => c.measured.cell)

describe('measureStatic end to end in the launcher, over two fixture git repos', () => {
  test('each side gets one M23 and one M28 cell of three runs, counting only unvendored comment directives', async () => {
    const family = await familyOf('static-family')
    expect(cell(family, 'M23', 'ratstack')).toEqual([{ _tag: 'Measured', runs: [2, 2, 2] }])
    expect(cell(family, 'M23', 'starter')).toEqual([{ _tag: 'Measured', runs: [1, 1, 1] }])
    const [ratstackPackages] = cell(family, 'M28', 'ratstack')
    const [starterPackages] = cell(family, 'M28', 'starter')
    expect(ratstackPackages?._tag).toBe('Measured')
    expect(starterPackages).toEqual(ratstackPackages)
    expect(family.cells).toHaveLength(4)
  })

  test('a tool that exits non-zero gives an instrument error carrying its exit code, on both sides', async () => {
    const family = await familyOf('static-family-failing-tool')
    for (const side of ['ratstack', 'starter'] as const) {
      const [m23] = cell(family, 'M23', side)
      expect(m23?._tag).toBe('InstrumentError')
      expect(m23?._tag === 'InstrumentError' && m23.error).toContain('extract-comments exited 3')
    }
  })
})
