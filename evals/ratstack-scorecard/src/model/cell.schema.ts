import { Schema as S } from 'effect'

export type Side = 'ratstack' | 'starter'
export type Direction = 'lower' | 'higher'
export type Kind = 'count' | 'measurement'

export type MetricId = `M${number}`
export type RowId = MetricId | `${MetricId}.${string}`

export type Family =
  | 'static'
  | 'cold-path'
  | 'gate-mutation'
  | 'running-stack'
  | 'agent-surfaces'
  | 'networked'

const CitationBase = S.Struct({
  file: S.String,
  lines: S.Tuple([S.Finite, S.Finite]),
  text: S.String,
})
export type Citation = S.Schema.Type<typeof CitationBase>

const CitationCheckVerified = S.TaggedStruct('Verified', {})
const CitationCheckContradicted = S.TaggedStruct('Contradicted', { found: S.String })
const CitationCheckBase = S.Union([CitationCheckVerified, CitationCheckContradicted])
export type CitationCheck = S.Schema.Type<typeof CitationCheckBase>

const RatstackSupportRequired = S.TaggedStruct('Required', {})
const RatstackSupportMayBeUnsupported = S.TaggedStruct('MayBeUnsupported', { bar: S.Finite })
const RatstackSupportBase = S.Union([RatstackSupportRequired, RatstackSupportMayBeUnsupported])
export type RatstackSupport = S.Schema.Type<typeof RatstackSupportBase>

const CellMeasured = S.TaggedStruct('Measured', { runs: S.Array(S.Finite) })
const CellAbsent = S.TaggedStruct('Absent', { reason: S.String })
const CellNoDeployment = S.TaggedStruct('NoDeployment', { sha: S.String })
const CellUnsupported = S.TaggedStruct('Unsupported', { citation: CitationBase, check: CitationCheckBase })
const CellUnmeasurable = S.TaggedStruct('Unmeasurable', { error: S.String })
const CellNoSecret = S.TaggedStruct('NoSecret', { name: S.String })
const CellInstrumentError = S.TaggedStruct('InstrumentError', { error: S.String })
const CellBase = S.Union([
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
const VerdictBase = S.Union([VerdictBeaten, VerdictNotBeaten, VerdictTie, VerdictInstrumentError])
export type Verdict = S.Schema.Type<typeof VerdictBase>
export type VerdictTag = Verdict['_tag']

const FlagLiveDiffersFromPin = S.TaggedStruct('LiveDiffersFromPin', { live: S.String, pin: S.String })
const FlagScannersDisagree = S.TaggedStruct('ScannersDisagree', { primary: S.Finite, crossCheck: S.Finite })
const FlagBase = S.Union([FlagLiveDiffersFromPin, FlagScannersDisagree])
export type Flag = S.Schema.Type<typeof FlagBase>

const RowOutcomeHeld = S.TaggedStruct('Held', {})
const RowOutcomeNew = S.TaggedStruct('New', {})
const RowOutcomeReBaselined = S.TaggedStruct('ReBaselined', {})
const RowOutcomeNeutral = S.TaggedStruct('Neutral', { cause: S.String })
const RowOutcomeInstrumentError = S.TaggedStruct('InstrumentError', { error: S.String })
const RowOutcomeLostBeaten = S.TaggedStruct('LostBeaten', { ratstack: S.String, starter: S.String })
const RowOutcomeRegressed = S.TaggedStruct('Regressed', { main: S.String, pr: S.String })
const RowOutcomeBase = S.Union([
  RowOutcomeHeld,
  RowOutcomeNew,
  RowOutcomeReBaselined,
  RowOutcomeNeutral,
  RowOutcomeInstrumentError,
  RowOutcomeLostBeaten,
  RowOutcomeRegressed,
])
export type RowOutcome = S.Schema.Type<typeof RowOutcomeBase> & { readonly id: RowId }
export type RowOutcomeTag = RowOutcome['_tag']

const RatchetFirstBaseline = S.TaggedStruct('FirstBaseline', {})
const RatchetCompared = S.TaggedStruct('Compared', { mainCommit: S.String })
const RatchetBase = S.Union([RatchetFirstBaseline, RatchetCompared])
export type Ratchet = S.Schema.Type<typeof RatchetBase> & {
  readonly outcomes: readonly RowOutcome[]
  readonly failures: readonly RowOutcome[]
}

const MainBaselineMissing = S.TaggedStruct('Missing', {})
const MainBaselineFound = S.TaggedStruct('Found', { commit: S.String })
export type MainBaseline =
  | S.Schema.Type<typeof MainBaselineMissing>
  | (S.Schema.Type<typeof MainBaselineFound> & { readonly rows: readonly Row[] })

export interface RowDefinition {
  readonly id: RowId
  readonly metric: MetricId
  readonly bin: string
  readonly label: string
  readonly unit: string
  readonly direction: Direction
  readonly kind: Kind
  readonly runs: number
  readonly family: Family
  readonly ratstackSupport: RatstackSupport
}

export interface CellProvenance {
  readonly side: Side
  readonly commit: string
  readonly instrumentHash: string
  readonly nixpkgsRev: string
  readonly runner: string
  readonly measuredAt: string
  readonly tools: Readonly<Record<string, string>>
  readonly liveCommit?: string
  readonly detail?: Readonly<Record<string, number | string>>
}

export interface MeasuredCell {
  readonly cell: Cell
  readonly provenance: CellProvenance
}

export interface Row {
  readonly definition: RowDefinition
  readonly definitionHash: string
  readonly ratstack: MeasuredCell
  readonly starter: MeasuredCell
  readonly flags: readonly Flag[]
}

export interface JudgedRow extends Row {
  readonly verdict: Verdict
}

export interface DocumentProvenance {
  readonly commit: string
  readonly ratstackCommit: string
  readonly instrumentHash: string
  readonly nixpkgsRev: string
  readonly runner: string
  readonly generatedAt: string
}

export interface ScorecardDocument {
  readonly schemaVersion: 1
  readonly provenance: DocumentProvenance
  readonly rows: readonly JudgedRow[]
  readonly ratchet: Ratchet
}
