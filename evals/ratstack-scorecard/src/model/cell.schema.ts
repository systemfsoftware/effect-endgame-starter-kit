import { Schema as S } from 'effect'

export const SideBase = S.Literals(['ratstack', 'starter'])
export type Side = S.Schema.Type<typeof SideBase>

export const DirectionBase = S.Literals(['lower', 'higher'])
export type Direction = S.Schema.Type<typeof DirectionBase>

export const KindBase = S.Literals(['count', 'measurement'])
export type Kind = S.Schema.Type<typeof KindBase>

export const FamilyBase = S.Literals([
  'static',
  'cold-path',
  'gate-mutation',
  'running-stack',
  'agent-surfaces',
  'networked',
])
export type Family = S.Schema.Type<typeof FamilyBase>

const NonEmptyString = S.String.check(S.isMinLength(1))
const PositiveInt = S.Int.check(S.isGreaterThanOrEqualTo(1))
const DigitString = S.String.check(S.isPattern(/^[0-9]+$/))
const RowIdSuffix = S.String.check(S.isPattern(/^[a-z0-9-]+$/))

export const MetricIdBase = S.TemplateLiteral(['M', DigitString])
export type MetricId = S.Schema.Type<typeof MetricIdBase>

export const RowIdBase = S.Union([MetricIdBase, S.TemplateLiteral([MetricIdBase, '.', RowIdSuffix])])
export type RowId = S.Schema.Type<typeof RowIdBase>

export const CitationBase = S.Struct({
  file: NonEmptyString,
  lines: S.Tuple([PositiveInt, PositiveInt]),
  text: NonEmptyString,
})
export type Citation = S.Schema.Type<typeof CitationBase>

const CitationCheckVerified = S.TaggedStruct('Verified', {})
const CitationCheckContradicted = S.TaggedStruct('Contradicted', { found: S.String })
export const CitationCheckBase = S.Union([CitationCheckVerified, CitationCheckContradicted])
export type CitationCheck = S.Schema.Type<typeof CitationCheckBase>

const RatstackSupportRequired = S.TaggedStruct('Required', {})
const RatstackSupportMayBeUnsupported = S.TaggedStruct('MayBeUnsupported', { bar: S.Finite })
export const RatstackSupportBase = S.Union([RatstackSupportRequired, RatstackSupportMayBeUnsupported])
export type RatstackSupport = S.Schema.Type<typeof RatstackSupportBase>

const CellMeasured = S.TaggedStruct('Measured', { runs: S.Array(S.Finite) })
const CellAbsent = S.TaggedStruct('Absent', { reason: S.String })
const CellNoDeployment = S.TaggedStruct('NoDeployment', { sha: S.String })
const CellUnsupported = S.TaggedStruct('Unsupported', { citation: CitationBase, check: CitationCheckBase })
const CellUnmeasurable = S.TaggedStruct('Unmeasurable', { error: S.String })
const CellNoSecret = S.TaggedStruct('NoSecret', { name: S.String })
const CellInstrumentError = S.TaggedStruct('InstrumentError', { error: S.String })
export const CellBase = S.Union([
  CellMeasured,
  CellAbsent,
  CellNoDeployment,
  CellUnsupported,
  CellUnmeasurable,
  CellNoSecret,
  CellInstrumentError,
])
export type Cell = S.Schema.Type<typeof CellBase>
export type CellTag = Cell['_tag']

const VerdictBeaten = S.TaggedStruct('Beaten', {})
const VerdictNotBeaten = S.TaggedStruct('NotBeaten', {})
const VerdictTie = S.TaggedStruct('Tie', {})
const VerdictInstrumentError = S.TaggedStruct('InstrumentError', { error: S.String })
export const VerdictBase = S.Union([VerdictBeaten, VerdictNotBeaten, VerdictTie, VerdictInstrumentError])
export type Verdict = S.Schema.Type<typeof VerdictBase>
export type VerdictTag = Verdict['_tag']

const FlagLiveDiffersFromPin = S.TaggedStruct('LiveDiffersFromPin', { live: NonEmptyString, pin: NonEmptyString })
const FlagScannersDisagree = S.TaggedStruct('ScannersDisagree', { primary: S.Finite, crossCheck: S.Finite })
export const FlagBase = S.Union([FlagLiveDiffersFromPin, FlagScannersDisagree])
export type Flag = S.Schema.Type<typeof FlagBase>

const RowOutcomeHeld = S.TaggedStruct('Held', { id: RowIdBase })
const RowOutcomeNew = S.TaggedStruct('New', { id: RowIdBase })
const RowOutcomeReBaselined = S.TaggedStruct('ReBaselined', {
  id: RowIdBase,
  mainHash: S.String,
  prHash: S.String,
})
const RowOutcomeNeutral = S.TaggedStruct('Neutral', { id: RowIdBase, cause: S.String })
const RowOutcomeInstrumentError = S.TaggedStruct('InstrumentError', { id: RowIdBase, error: S.String })
const RowOutcomeLostBeaten = S.TaggedStruct('LostBeaten', { id: RowIdBase, ratstack: S.String, starter: S.String })
const RowOutcomeRegressed = S.TaggedStruct('Regressed', { id: RowIdBase, main: S.String, pr: S.String })
export const RowOutcomeBase = S.Union([
  RowOutcomeHeld,
  RowOutcomeNew,
  RowOutcomeReBaselined,
  RowOutcomeNeutral,
  RowOutcomeInstrumentError,
  RowOutcomeLostBeaten,
  RowOutcomeRegressed,
])
export type RowOutcome = S.Schema.Type<typeof RowOutcomeBase>
export type RowOutcomeTag = RowOutcome['_tag']

const RatchetFirstBaseline = S.TaggedStruct('FirstBaseline', {
  outcomes: S.Array(RowOutcomeBase),
  failures: S.Array(RowOutcomeBase),
})
const RatchetCompared = S.TaggedStruct('Compared', {
  mainCommit: S.String,
  outcomes: S.Array(RowOutcomeBase),
  failures: S.Array(RowOutcomeBase),
})
export const RatchetBase = S.Union([RatchetFirstBaseline, RatchetCompared])
export type Ratchet = S.Schema.Type<typeof RatchetBase>

export const RowDefinitionBase = S.Struct({
  id: RowIdBase,
  metric: MetricIdBase,
  bin: NonEmptyString,
  label: NonEmptyString,
  unit: NonEmptyString,
  direction: DirectionBase,
  kind: KindBase,
  runs: PositiveInt,
  family: FamilyBase,
  ratstackSupport: RatstackSupportBase,
})
export type RowDefinition = S.Schema.Type<typeof RowDefinitionBase>

export const CellProvenanceBase = S.Struct({
  side: SideBase,
  commit: NonEmptyString,
  instrumentHash: NonEmptyString,
  nixpkgsRev: NonEmptyString,
  runner: NonEmptyString,
  measuredAt: NonEmptyString,
  tools: S.Record(S.String, S.String),
  liveCommit: S.optional(S.String),
  detail: S.optional(S.Record(S.String, S.Union([S.String, S.Finite]))),
})
export type CellProvenance = S.Schema.Type<typeof CellProvenanceBase>

export const MeasuredCellBase = S.Struct({
  cell: CellBase,
  provenance: CellProvenanceBase,
})
export type MeasuredCell = S.Schema.Type<typeof MeasuredCellBase>

export const RowBase = S.Struct({
  definition: RowDefinitionBase,
  definitionHash: S.String,
  ratstack: MeasuredCellBase,
  starter: MeasuredCellBase,
  flags: S.Array(FlagBase),
})
export type Row = S.Schema.Type<typeof RowBase>

const MainBaselineMissing = S.TaggedStruct('Missing', {})
const MainBaselineFound = S.TaggedStruct('Found', { commit: S.String, rows: S.Array(RowBase) })
export const MainBaselineBase = S.Union([MainBaselineMissing, MainBaselineFound])
export type MainBaseline = S.Schema.Type<typeof MainBaselineBase>

export interface JudgedRow extends Row {
  readonly verdict: Verdict
}

export const DocumentProvenanceBase = S.Struct({
  commit: NonEmptyString,
  ratstackCommit: NonEmptyString,
  instrumentHash: NonEmptyString,
  nixpkgsRev: NonEmptyString,
  runner: NonEmptyString,
  generatedAt: NonEmptyString,
})
export type DocumentProvenance = S.Schema.Type<typeof DocumentProvenanceBase>

export interface ScorecardDocument {
  readonly schemaVersion: 1
  readonly provenance: DocumentProvenance
  readonly rows: readonly JudgedRow[]
  readonly ratchet: Ratchet
}
