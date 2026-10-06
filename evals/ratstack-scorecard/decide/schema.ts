import { Schema } from 'effect'
import type {
  Cell,
  CellProvenance,
  FamilyResult,
  Flag,
  MeasuredCell,
  Ratchet,
  Row,
  RowDefinition,
  RowOutcome,
  ScorecardDocument,
  Verdict,
} from '../src/model/cell.ts'

const side = Schema.Literals(['ratstack', 'starter'])
const family = Schema.Literals(['static', 'cold-path', 'gate-mutation', 'running-stack', 'agent-surfaces', 'networked'])
const cellTag = Schema.Literals([
  'Measured',
  'Absent',
  'NoDeployment',
  'Unsupported',
  'Unmeasurable',
  'NoSecret',
  'InstrumentError',
])

export const Sha = Schema.String.check(Schema.isPattern(/^[0-9a-f]{40}$/u))

const tagged = <const T extends string, F extends Schema.Struct.Fields>(tag: T, fields: F) =>
  Schema.Struct({ _tag: Schema.Literal(tag), ...fields })

export const CellSchema: Schema.Codec<Cell> = Schema.Union([
  tagged('Measured', { runs: Schema.Array(Schema.Finite) }),
  tagged('Absent', { reason: Schema.String }),
  tagged('NoDeployment', { sha: Schema.String }),
  tagged('Unsupported', {
    citation: Schema.Struct({
      file: Schema.String,
      lines: Schema.Tuple([Schema.Finite, Schema.Finite]),
      text: Schema.String,
    }),
    check: Schema.Union([tagged('Verified', {}), tagged('Contradicted', { found: Schema.String })]),
  }),
  tagged('Unmeasurable', { error: Schema.String }),
  tagged('NoSecret', { name: Schema.String }),
  tagged('InstrumentError', { error: Schema.String }),
])

const CellProvenanceSchema: Schema.Codec<CellProvenance> = Schema.Struct({
  side,
  commit: Schema.String,
  instrumentHash: Schema.String,
  nixpkgsRev: Schema.String,
  runner: Schema.String,
  measuredAt: Schema.String,
  tools: Schema.Record(Schema.String, Schema.String),
  liveCommit: Schema.optionalKey(Schema.String),
  detail: Schema.optionalKey(Schema.Record(Schema.String, Schema.Union([Schema.Finite, Schema.String]))),
})

const MeasuredCellSchema: Schema.Codec<MeasuredCell> = Schema.Struct({
  cell: CellSchema,
  provenance: CellProvenanceSchema,
})

const FlagSchema: Schema.Codec<Flag> = Schema.Union([
  tagged('LiveDiffersFromPin', { live: Schema.String, pin: Schema.String }),
  tagged('ScannersDisagree', { primary: Schema.Finite, crossCheck: Schema.Finite }),
])

const RowDefinitionSchema: Schema.Codec<RowDefinition> = Schema.Struct({
  id: Schema.String,
  metric: Schema.String,
  bin: Schema.String,
  label: Schema.String,
  unit: Schema.String,
  direction: Schema.Literals(['lower', 'higher']),
  kind: Schema.Literals(['count', 'measurement']),
  runs: Schema.Finite,
  family,
  ratstackSupport: Schema.Union([tagged('Required', {}), tagged('MayBeUnsupported', { bar: Schema.Finite })]),
})

const VerdictSchema: Schema.Codec<Verdict> = Schema.Union([
  tagged('Beaten', {}),
  tagged('NotBeaten', {}),
  tagged('Tie', {}),
  tagged('InstrumentError', { error: Schema.String }),
])

const RowSchema: Schema.Codec<Row> = Schema.Struct({
  definition: RowDefinitionSchema,
  definitionHash: Schema.String,
  ratstack: MeasuredCellSchema,
  starter: MeasuredCellSchema,
  verdict: VerdictSchema,
  flags: Schema.Array(FlagSchema),
})

const OutcomeSchema: Schema.Codec<RowOutcome> = Schema.Union([
  tagged('Held', { id: Schema.String }),
  tagged('New', { id: Schema.String }),
  tagged('ReBaselined', { id: Schema.String, mainHash: Schema.String, prHash: Schema.String }),
  tagged('Neutral', { id: Schema.String, cause: cellTag }),
  tagged('InstrumentError', { id: Schema.String, error: Schema.String }),
  tagged('LostBeaten', { id: Schema.String, ratstack: cellTag, starter: cellTag }),
  tagged('Regressed', { id: Schema.String, main: Schema.String, pr: Schema.String }),
])

const RatchetSchema: Schema.Codec<Ratchet> = Schema.Union([
  tagged('FirstBaseline', { outcomes: Schema.Array(OutcomeSchema), failures: Schema.Array(OutcomeSchema) }),
  tagged('Compared', {
    mainCommit: Schema.String,
    outcomes: Schema.Array(OutcomeSchema),
    failures: Schema.Array(OutcomeSchema),
  }),
])

export const ScorecardDocumentSchema: Schema.Codec<ScorecardDocument> = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  provenance: Schema.Struct({
    commit: Schema.String,
    ratstackCommit: Schema.String,
    instrumentHash: Schema.String,
    nixpkgsRev: Schema.String,
    runner: Schema.String,
    generatedAt: Schema.String,
  }),
  rows: Schema.Array(RowSchema),
  ratchet: RatchetSchema,
})

export const FamilyResultSchema: Schema.Codec<FamilyResult> = Schema.Struct({
  family,
  wallMs: Schema.Finite,
  cells: Schema.Array(Schema.Struct({ id: Schema.String, side, measured: MeasuredCellSchema })),
  flags: Schema.Array(Schema.Struct({ id: Schema.String, flag: FlagSchema })),
  definitionHashes: Schema.Array(Schema.Struct({ id: Schema.String, hash: Schema.String })),
})

export const WorkflowRunsSchema = Schema.Struct({
  workflow_runs: Schema.Array(Schema.Struct({ id: Schema.Finite, head_sha: Sha })),
})

export const GitRefSchema = Schema.Struct({ object: Schema.Struct({ sha: Sha }) })

export const ArtifactsSchema = Schema.Struct({
  artifacts: Schema.Array(Schema.Struct({ id: Schema.Finite, archive_download_url: Schema.String })),
})
