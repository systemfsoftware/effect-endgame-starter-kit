export type Side = 'ratstack' | 'starter'
export type Direction = 'lower' | 'higher'
export type Kind = 'count' | 'measurement'

export type Family =
  | 'static'
  | 'cold-path'
  | 'gate-mutation'
  | 'running-stack'
  | 'agent-surfaces'
  | 'networked'

export interface RowDefinition {
  readonly id: string
  readonly metric: string
  readonly bin: string
  readonly label: string
  readonly unit: string
  readonly direction: Direction
  readonly kind: Kind
  readonly runs: number
  readonly family: Family
}

export interface Citation {
  readonly file: string
  readonly lines: readonly [number, number]
  readonly text: string
}

export type CitationCheck =
  | { readonly _tag: 'Verified' }
  | { readonly _tag: 'Contradicted'; readonly found: string }

export type Cell =
  | { readonly _tag: 'Measured'; readonly runs: readonly number[] }
  | { readonly _tag: 'Absent'; readonly reason: string }
  | { readonly _tag: 'NoDeployment'; readonly sha: string }
  | { readonly _tag: 'Unsupported'; readonly citation: Citation; readonly check: CitationCheck }
  | { readonly _tag: 'Unmeasurable'; readonly error: string }
  | { readonly _tag: 'NoSecret'; readonly name: string }
  | { readonly _tag: 'InstrumentError'; readonly error: string }

export type CellTag = Cell['_tag']

export type Verdict =
  | { readonly _tag: 'Beaten' }
  | { readonly _tag: 'NotBeaten' }
  | { readonly _tag: 'Tie' }
  | { readonly _tag: 'InstrumentError'; readonly error: string }

export type VerdictTag = Verdict['_tag']

export interface CellProvenance {
  readonly side: Side
  readonly commit: string
  readonly instrumentHash: string
  readonly nixpkgsRev: string
  readonly runner: string
  readonly measuredAt: string
  readonly tools: Readonly<Record<string, string>>
  readonly liveCommit?: string
}

export interface MeasuredCell {
  readonly cell: Cell
  readonly provenance: CellProvenance
}

export type Flag =
  | { readonly _tag: 'LiveDiffersFromPin'; readonly live: string; readonly pin: string }
  | { readonly _tag: 'ScannersDisagree'; readonly primary: number; readonly crossCheck: number }

export interface Row {
  readonly definition: RowDefinition
  readonly definitionHash: string
  readonly ratstack: MeasuredCell
  readonly starter: MeasuredCell
  readonly verdict: Verdict
  readonly flags: readonly Flag[]
}

export type RowOutcome =
  | { readonly _tag: 'Held'; readonly id: string }
  | { readonly _tag: 'New'; readonly id: string }
  | { readonly _tag: 'ReBaselined'; readonly id: string }
  | { readonly _tag: 'Neutral'; readonly id: string; readonly cause: CellTag }
  | { readonly _tag: 'InstrumentError'; readonly id: string; readonly error: string }
  | { readonly _tag: 'LostBeaten'; readonly id: string; readonly ratstack: CellTag; readonly starter: CellTag }
  | { readonly _tag: 'Regressed'; readonly id: string; readonly main: string; readonly pr: string }

export type RowOutcomeTag = RowOutcome['_tag']

export type Ratchet =
  | {
    readonly _tag: 'FirstBaseline'
    readonly outcomes: readonly RowOutcome[]
    readonly failures: readonly RowOutcome[]
  }
  | {
    readonly _tag: 'Compared'
    readonly mainCommit: string
    readonly outcomes: readonly RowOutcome[]
    readonly failures: readonly RowOutcome[]
  }

export type MainBaseline =
  | { readonly _tag: 'Missing' }
  | { readonly _tag: 'Found'; readonly commit: string; readonly rows: readonly Row[] }

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
  readonly rows: readonly Row[]
  readonly ratchet: Ratchet
}
