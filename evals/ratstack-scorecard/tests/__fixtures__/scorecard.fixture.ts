import type { AssembleInput, CellProvenance, MeasuredCell, RowDefinition, Side } from '@starter/ratstack-scorecard'

const repeated = (letter: string): string => letter.repeat(40)

const provenance = (side: Side): CellProvenance => ({
  side,
  commit: repeated('a'),
  instrumentHash: repeated('b'),
  nixpkgsRev: repeated('c'),
  runner: 'fixture-runner',
  measuredAt: '2026-10-06T00:00:00.000Z',
  tools: {},
})

const measured = (side: Side, runs: readonly number[]): MeasuredCell => ({
  cell: { _tag: 'Measured', runs },
  provenance: provenance(side),
})

const unsupportedVerified = (side: Side): MeasuredCell => ({
  cell: {
    _tag: 'Unsupported',
    citation: {
      file: 'packages/core/src/join-interest-contract.ts',
      lines: [22, 26],
      text: 'Confirmation is not a seat',
    },
    check: { _tag: 'Verified' },
  },
  provenance: provenance(side),
})

const count: RowDefinition = {
  id: 'M23',
  metric: 'M23',
  bin: 'fixture debt counter',
  label: 'comment directives',
  unit: 'directives',
  direction: 'lower',
  kind: 'count',
  runs: 3,
  family: 'static',
  ratstackSupport: { _tag: 'Required' },
}

const bar: RowDefinition = {
  ...count,
  id: 'M12',
  metric: 'M12',
  label: 'seats beyond capacity',
  ratstackSupport: { _tag: 'MayBeUnsupported', bar: 0 },
}

const rows = [
  { definition: count, hash: repeated('d') },
  { definition: bar, hash: repeated('e') },
]

const provenanceOfDocument = {
  commit: repeated('f'),
  ratstackCommit: repeated('0'),
  instrumentHash: repeated('1'),
  nixpkgsRev: repeated('2'),
  runner: 'fixture-runner',
  generatedAt: '2026-10-06T00:00:00.000Z',
} as const

export const sampleInput: AssembleInput = {
  rows,
  cells: {
    M23: { ratstack: measured('ratstack', [2, 2, 2]), starter: measured('starter', [1, 1, 1]) },
    M12: { ratstack: unsupportedVerified('ratstack'), starter: measured('starter', [0, 0, 0]) },
  },
  flags: [],
  provenance: provenanceOfDocument,
  main: { _tag: 'Missing' },
}

export const sampleWithoutCells: AssembleInput = { ...sampleInput, cells: {} }
