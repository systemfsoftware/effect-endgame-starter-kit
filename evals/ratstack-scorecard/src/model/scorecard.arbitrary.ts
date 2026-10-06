import fc from 'fast-check'
import type {
  Cell,
  CellProvenance,
  DocumentProvenance,
  Flag,
  MeasuredCell,
  Row,
  RowDefinition,
  Side,
  Verdict,
} from './cell.ts'
import type { AssembleInput } from './scorecard-document.ts'

export const sha = fc.stringMatching(/^[0-9a-f]{40}$/)
const text = fc.string({ minLength: 1, maxLength: 400 })
const value = fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true })

export const definition = (overrides: Partial<RowDefinition> = {}): fc.Arbitrary<RowDefinition> =>
  fc.record({
    id: fc.stringMatching(/^M[0-9]{1,2}(\.[a-z0-9]{1,8})?$/),
    metric: fc.stringMatching(/^M[0-9]{1,2}$/),
    bin: text,
    label: text,
    unit: text,
    direction: fc.constantFrom('lower' as const, 'higher' as const),
    kind: fc.constantFrom('count' as const, 'measurement' as const),
    runs: fc.constantFrom(3, 5),
    family: fc.constantFrom(
      'static' as const,
      'cold-path' as const,
      'gate-mutation' as const,
      'running-stack' as const,
      'agent-surfaces' as const,
      'networked' as const,
    ),
    ratstackSupport: fc.oneof(
      fc.constant({ _tag: 'Required' } as const),
      value.map((bar) => ({ _tag: 'MayBeUnsupported', bar }) as const),
    ),
  }).map((generated) => ({ ...generated, ...overrides }))

export const runsFor = (row: RowDefinition): fc.Arbitrary<readonly number[]> =>
  ({
    count: () => value.map((v) => Array.from({ length: row.runs }, () => v)),
    measurement: () => fc.array(value, { minLength: row.runs, maxLength: row.runs }),
  })[row.kind]()

export const cell = (row: RowDefinition): fc.Arbitrary<Cell> =>
  fc.oneof(
    runsFor(row).map((runs): Cell => ({ _tag: 'Measured', runs })),
    text.map((reason): Cell => ({ _tag: 'Absent', reason })),
    sha.map((s): Cell => ({ _tag: 'NoDeployment', sha: s })),
    fc.record({
      file: text,
      lines: fc.tuple(fc.integer({ min: 1, max: 999 }), fc.integer({ min: 1, max: 999 })),
      text,
      verified: fc.boolean(),
      found: fc.string(),
    }).map(({ file, lines, text, verified, found }): Cell => ({
      _tag: 'Unsupported',
      citation: { file, lines, text },
      check: ({ true: { _tag: 'Verified' }, false: { _tag: 'Contradicted', found } } as const)[`${verified}`],
    })),
    text.map((error): Cell => ({ _tag: 'Unmeasurable', error })),
    text.map((name): Cell => ({ _tag: 'NoSecret', name })),
    text.map((error): Cell => ({ _tag: 'InstrumentError', error })),
  )

export const cellProvenance = (side: Side): fc.Arbitrary<CellProvenance> =>
  fc.record({
    side: fc.constant(side),
    commit: sha,
    instrumentHash: sha,
    nixpkgsRev: sha,
    runner: text,
    measuredAt: fc.date({ noInvalidDate: true }).map((d) => d.toISOString()),
    tools: fc.dictionary(fc.string({ minLength: 1, maxLength: 20 }), fc.string({ maxLength: 20 })),
  })

export const measuredCell = (row: RowDefinition, side: Side): fc.Arbitrary<MeasuredCell> =>
  fc.record({ cell: cell(row), provenance: cellProvenance(side) })

export const documentProvenance: fc.Arbitrary<DocumentProvenance> = fc.record({
  commit: sha,
  ratstackCommit: sha,
  instrumentHash: sha,
  nixpkgsRev: sha,
  runner: text,
  generatedAt: fc.date({ noInvalidDate: true }).map((d) => d.toISOString()),
})

export const verdict: fc.Arbitrary<Verdict> = fc.oneof(
  fc.constant<Verdict>({ _tag: 'Beaten' }),
  fc.constant<Verdict>({ _tag: 'NotBeaten' }),
  fc.constant<Verdict>({ _tag: 'Tie' }),
  text.map((error): Verdict => ({ _tag: 'InstrumentError', error })),
)

const flag: fc.Arbitrary<Flag> = fc.oneof(
  fc.record({ _tag: fc.constant('LiveDiffersFromPin' as const), live: sha, pin: sha }),
  fc.record({ _tag: fc.constant('ScannersDisagree' as const), primary: value, crossCheck: value }),
)

export const row = (overrides: Partial<RowDefinition> = {}): fc.Arbitrary<Row> =>
  definition(overrides).chain((def) =>
    fc.record({
      definition: fc.constant(def),
      definitionHash: sha,
      ratstack: measuredCell(def, 'ratstack'),
      starter: measuredCell(def, 'starter'),
      verdict,
      flags: fc.array(flag, { maxLength: 2 }),
    })
  )

const uniqueDefinitions = fc.uniqueArray(definition(), { selector: (d) => d.id, maxLength: 64 })

export const assembleInput: fc.Arbitrary<AssembleInput> = uniqueDefinitions.chain((definitions) =>
  fc.record({
    rows: fc.tuple(...definitions.map((d) => sha.map((hash) => ({ definition: d, hash })))),
    cells: fc.tuple(
      ...definitions.flatMap((d) =>
        (['ratstack', 'starter'] as const).map((side) =>
          fc.option(measuredCell(d, side).map((measured) => ({ id: d.id, side, measured })), { nil: undefined })
        )
      ),
    ).map((cells) =>
      Object.fromEntries(
        definitions.map((d) => [
          d.id,
          Object.fromEntries(
            cells.filter((c) => c !== undefined && c.id === d.id).map((c) => [c!.side, c!.measured]),
          ),
        ]),
      )
    ),
    flags: fc.tuple(
      ...definitions.map((d) => fc.array(flag, { maxLength: 2 }).map((fs) => fs.map((f) => ({ id: d.id, flag: f })))),
    )
      .map((groups) => groups.flat()),
    provenance: documentProvenance,
    main: fc.oneof(
      fc.constant({ _tag: 'Missing' as const }),
      fc.record({
        _tag: fc.constant('Found' as const),
        commit: sha,
        rows: fc.array(row(), { maxLength: 8 }),
      }),
    ),
  })
)
