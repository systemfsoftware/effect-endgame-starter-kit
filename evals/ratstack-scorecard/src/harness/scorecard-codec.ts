import type {
  Cell,
  CellProvenance,
  FamilyResult,
  Flag,
  MeasuredCell,
  Ratchet,
  RatstackSupport,
  Row,
  RowDefinition,
  RowOutcome,
  ScorecardDocument,
  Side,
  SideCell,
  Verdict,
} from '../model/cell.ts'
import type { CellsByRow } from '../model/scorecard-document.ts'
import {
  array,
  type Decoder,
  literal,
  number,
  oneOf,
  optional,
  record,
  string,
  struct,
  tuple2,
  union,
} from './decode.ts'

const cellTags = [
  'Measured',
  'Absent',
  'NoDeployment',
  'Unsupported',
  'Unmeasurable',
  'NoSecret',
  'InstrumentError',
] as const

const side = oneOf(['ratstack', 'starter'])

export const cell: Decoder<Cell> = union<Cell>(
  struct({ _tag: literal('Measured'), runs: array(number) }),
  struct({ _tag: literal('Absent'), reason: string }),
  struct({ _tag: literal('NoDeployment'), sha: string }),
  struct({
    _tag: literal('Unsupported'),
    citation: struct({ file: string, lines: tuple2(number, number), text: string }),
    check: union<{ readonly _tag: 'Verified' } | { readonly _tag: 'Contradicted'; readonly found: string }>(
      struct({ _tag: literal('Verified') }),
      struct({ _tag: literal('Contradicted'), found: string }),
    ),
  }),
  struct({ _tag: literal('Unmeasurable'), error: string }),
  struct({ _tag: literal('NoSecret'), name: string }),
  struct({ _tag: literal('InstrumentError'), error: string }),
)

const provenanceFields = struct({
  side,
  commit: string,
  instrumentHash: string,
  nixpkgsRev: string,
  runner: string,
  measuredAt: string,
  tools: record(string),
  liveCommit: optional(string),
  detail: optional(record(union<number | string>(number, string))),
})

export const cellProvenance: Decoder<CellProvenance> = (value, path) => {
  const { liveCommit, detail, ...required } = provenanceFields(value, path)
  return {
    ...required,
    ...(liveCommit === undefined ? {} : { liveCommit }),
    ...(detail === undefined ? {} : { detail }),
  }
}

const measuredCell: Decoder<MeasuredCell> = struct({ cell, provenance: cellProvenance })

const flag: Decoder<Flag> = union<Flag>(
  struct({ _tag: literal('LiveDiffersFromPin'), live: string, pin: string }),
  struct({ _tag: literal('ScannersDisagree'), primary: number, crossCheck: number }),
)

const rowDefinition: Decoder<RowDefinition> = struct({
  id: string,
  metric: string,
  bin: string,
  label: string,
  unit: string,
  direction: oneOf(['lower', 'higher']),
  kind: oneOf(['count', 'measurement']),
  runs: number,
  family: oneOf(['static', 'cold-path', 'gate-mutation', 'running-stack', 'agent-surfaces', 'networked']),
  ratstackSupport: union<RatstackSupport>(
    struct({ _tag: literal('Required') }),
    struct({ _tag: literal('MayBeUnsupported'), bar: number }),
  ),
})

const verdict: Decoder<Verdict> = union<Verdict>(
  struct({ _tag: oneOf(['Beaten', 'NotBeaten', 'Tie']) }),
  struct({ _tag: literal('InstrumentError'), error: string }),
)

const row: Decoder<Row> = struct({
  definition: rowDefinition,
  definitionHash: string,
  ratstack: measuredCell,
  starter: measuredCell,
  verdict,
  flags: array(flag),
})

const cellTag = oneOf(cellTags)

const outcome: Decoder<RowOutcome> = union<RowOutcome>(
  struct({ _tag: oneOf(['Held', 'New', 'ReBaselined']), id: string }),
  struct({ _tag: literal('Neutral'), id: string, cause: cellTag }),
  struct({ _tag: literal('InstrumentError'), id: string, error: string }),
  struct({ _tag: literal('LostBeaten'), id: string, ratstack: cellTag, starter: cellTag }),
  struct({ _tag: literal('Regressed'), id: string, main: string, pr: string }),
)

const ratchet: Decoder<Ratchet> = union<Ratchet>(
  struct({ _tag: literal('FirstBaseline'), outcomes: array(outcome), failures: array(outcome) }),
  struct({ _tag: literal('Compared'), mainCommit: string, outcomes: array(outcome), failures: array(outcome) }),
)

export const scorecardDocument: Decoder<ScorecardDocument> = struct({
  schemaVersion: literal(1),
  provenance: struct({
    commit: string,
    ratstackCommit: string,
    instrumentHash: string,
    nixpkgsRev: string,
    runner: string,
    generatedAt: string,
  }),
  rows: array(row),
  ratchet,
})

export const familyResult: Decoder<FamilyResult> = struct({
  family: oneOf(['static', 'cold-path', 'gate-mutation', 'running-stack', 'agent-surfaces', 'networked']),
  wallMs: number,
  cells: array(struct({ id: string, side, measured: measuredCell })),
  flags: array(struct({ id: string, flag })),
  definitionHashes: array(struct({ id: string, hash: string })),
})

export class DuplicateCell extends Error {
  constructor(readonly id: string, readonly side: Side) {
    super(`two family results carry a ${side} cell for ${id}; each (row, side) is measured once`)
  }
}

export const cellsByRow = (cells: readonly SideCell[]): CellsByRow => {
  const keyed: Record<string, Partial<Record<Side, MeasuredCell>>> = {}
  for (const { id, side, measured } of cells) {
    const row = keyed[id] ?? {}
    if (row[side] !== undefined) throw new DuplicateCell(id, side)
    keyed[id] = { ...row, [side]: measured }
  }
  return keyed
}
