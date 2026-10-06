import type {
  Cell,
  CellProvenance,
  Citation,
  CitationCheck,
  DocumentProvenance,
  Family,
  Flag,
  JudgedRow,
  MainBaseline,
  MeasuredCell,
  MetricId,
  Ratchet,
  RatstackSupport,
  Row,
  RowDefinition,
  RowId,
  RowOutcome,
  ScorecardDocument,
  Side,
  Verdict,
} from '../model/cell.ts'
import type { CellsByRow, FamilyResult, RowFlag, SideCell } from '../model/scorecard-document.ts'
import { at, arrayAt, numberAt, objectAt, stringAt, type JsonObject, type JsonValue } from './decode.ts'

const failure = (what: string, detail: string): never => {
  throw new Error(`${what}: ${detail}`)
}

const textOf = (value: JsonValue, key: string, what: string): string => stringAt(value, [key], what)

const scalarText = (value: JsonValue, what: string): string => stringAt(value, [], what)

const scalarNumber = (value: JsonValue, what: string): number => numberAt(value, [], what)

const objectOf = (value: JsonValue, key: string, what: string): JsonObject => objectAt(value, [key], what)

const arrayOf = (value: JsonValue, key: string, what: string): readonly JsonValue[] => arrayAt(value, [key], what)

const optionalOf = (value: JsonValue, key: string): JsonValue | undefined => at(value, key)

const tagOf = (value: JsonValue, what: string): string => stringAt(value, ['_tag'], what)

const oneOfValues = <T extends string>(options: readonly T[], value: JsonValue, what: string): T =>
  options.find((option) => option === scalarText(value, what)) ?? failure(what, `expected one of ${options.join(', ')}`)

const isMetricId = (text: string): text is MetricId => /^M[0-9]+$/u.test(text)

const isRowId = (text: string): text is RowId => /^M[0-9]+(?:\.[a-z0-9-]+)?$/u.test(text)

const metricIdOf = (value: JsonValue, what: string): MetricId => {
  const text = scalarText(value, what)
  return isMetricId(text) ? text : failure(what, `expected a metric id, got ${text}`)
}

const rowIdOf = (value: JsonValue, what: string): RowId => {
  const text = scalarText(value, what)
  return isRowId(text) ? text : failure(what, `expected a metric or row id, got ${text}`)
}

const sideOf = (value: JsonValue, what: string): Side => oneOfValues(['ratstack', 'starter'], value, what)

const familyOf = (value: JsonValue, what: string): Family =>
  oneOfValues(['static', 'cold-path', 'gate-mutation', 'running-stack', 'agent-surfaces', 'networked'], value, what)

const numberOrText = (value: JsonValue, what: string): number | string =>
  typeof value === 'string' || typeof value === 'number' ? value : failure(what, 'expected a number or string')

const recordOfText = (value: JsonValue, what: string): Readonly<Record<string, string>> =>
  Object.fromEntries(
    Object.entries(objectOf(value, 'tools', what)).map(([key, item]) => [key, scalarText(item, `${what}.tools.${key}`)]),
  )

const optionalText = (value: JsonValue, key: string, what: string): string | undefined => {
  const found = optionalOf(value, key)
  return found === undefined ? undefined : scalarText(found, `${what}.${key}`)
}

const optionalDetail = (
  value: JsonValue,
  key: string,
  what: string,
): Readonly<Record<string, number | string>> | undefined => {
  const found = optionalOf(value, key)
  if (found === undefined) return undefined
  return Object.fromEntries(
    Object.entries(objectAt(found, [], `${what}.${key}`)).map((
      [name, item],
    ) => [name, numberOrText(item, `${what}.${key}.${name}`)]),
  )
}

const pairOf = (value: JsonValue, key: string, what: string): readonly [JsonValue, JsonValue] => {
  const lines = arrayAt(value, [key], what)
  if (lines.length !== 2) return failure(what, `expected a pair at ${key}`)
  const first = lines[0] ?? failure(what, `expected a pair at ${key}`)
  const second = lines[1] ?? failure(what, `expected a pair at ${key}`)
  return [first, second]
}

const citationOf = (value: JsonValue, what: string): Citation => {
  const [first, second] = pairOf(value, 'lines', what)
  return {
    file: textOf(value, 'file', what),
    lines: [numberAt(first, [], what), numberAt(second, [], what)],
    text: textOf(value, 'text', what),
  }
}

const citationCheckOf = (value: JsonValue, what: string): CitationCheck =>
  tagOf(value, what) === 'Verified' ? { _tag: 'Verified' } : {
    _tag: 'Contradicted',
    found: textOf(value, 'found', what),
  }

const cellBuilders: Readonly<Record<string, (value: JsonValue, what: string) => Cell>> = {
  Measured: (value, what) => ({
    _tag: 'Measured',
    runs: arrayOf(value, 'runs', what).map((run) => scalarNumber(run, `${what}.runs`)),
  }),
  Absent: (value, what) => ({ _tag: 'Absent', reason: textOf(value, 'reason', what) }),
  NoDeployment: (value, what) => ({ _tag: 'NoDeployment', sha: textOf(value, 'sha', what) }),
  Unsupported: (value, what) => ({
    _tag: 'Unsupported',
    citation: citationOf(objectOf(value, 'citation', what), `${what}.citation`),
    check: citationCheckOf(objectOf(value, 'check', what), `${what}.check`),
  }),
  Unmeasurable: (value, what) => ({ _tag: 'Unmeasurable', error: textOf(value, 'error', what) }),
  NoSecret: (value, what) => ({ _tag: 'NoSecret', name: textOf(value, 'name', what) }),
  InstrumentError: (value, what) => ({ _tag: 'InstrumentError', error: textOf(value, 'error', what) }),
}

const cellOf = (value: JsonValue, what: string): Cell =>
  (cellBuilders[tagOf(value, what)] ?? failure(what, 'expected a known cell tag'))(value, what)

const provenanceOf = (value: JsonValue, what: string): CellProvenance => {
  const liveCommit = optionalText(value, 'liveCommit', what)
  const detail = optionalDetail(value, 'detail', what)
  return {
    side: sideOf(objectOf(value, 'side', what), `${what}.side`),
    commit: textOf(value, 'commit', what),
    instrumentHash: textOf(value, 'instrumentHash', what),
    nixpkgsRev: textOf(value, 'nixpkgsRev', what),
    runner: textOf(value, 'runner', what),
    measuredAt: textOf(value, 'measuredAt', what),
    tools: recordOfText(value, what),
    ...(liveCommit === undefined ? {} : { liveCommit }),
    ...(detail === undefined ? {} : { detail }),
  }
}

const measuredCellOf = (value: JsonValue, what: string): MeasuredCell => ({
  cell: cellOf(objectOf(value, 'cell', what), `${what}.cell`),
  provenance: provenanceOf(objectOf(value, 'provenance', what), `${what}.provenance`),
})

const ratstackSupportOf = (value: JsonValue, what: string): RatstackSupport =>
  tagOf(value, what) === 'Required' ? { _tag: 'Required' } : {
    _tag: 'MayBeUnsupported',
    bar: numberAt(value, ['bar'], what),
  }

const rowDefinitionOf = (value: JsonValue, what: string): RowDefinition => ({
  id: rowIdOf(objectOf(value, 'id', what), `${what}.id`),
  metric: metricIdOf(objectOf(value, 'metric', what), `${what}.metric`),
  bin: textOf(value, 'bin', what),
  label: textOf(value, 'label', what),
  unit: textOf(value, 'unit', what),
  direction: oneOfValues(['lower', 'higher'], objectOf(value, 'direction', what), `${what}.direction`),
  kind: oneOfValues(['count', 'measurement'], objectOf(value, 'kind', what), `${what}.kind`),
  runs: numberAt(value, ['runs'], what),
  family: familyOf(objectOf(value, 'family', what), `${what}.family`),
  ratstackSupport: ratstackSupportOf(objectOf(value, 'ratstackSupport', what), `${what}.ratstackSupport`),
})

const flagOf = (value: JsonValue, what: string): Flag =>
  tagOf(value, what) === 'LiveDiffersFromPin'
    ? { _tag: 'LiveDiffersFromPin', live: textOf(value, 'live', what), pin: textOf(value, 'pin', what) }
    : {
      _tag: 'ScannersDisagree',
      primary: numberAt(value, ['primary'], what),
      crossCheck: numberAt(value, ['crossCheck'], what),
    }

const rowOf = (value: JsonValue, what: string): Row => ({
  definition: rowDefinitionOf(objectOf(value, 'definition', what), `${what}.definition`),
  definitionHash: textOf(value, 'definitionHash', what),
  ratstack: measuredCellOf(objectOf(value, 'ratstack', what), `${what}.ratstack`),
  starter: measuredCellOf(objectOf(value, 'starter', what), `${what}.starter`),
  flags: arrayOf(value, 'flags', what).map((flag, index) => flagOf(flag, `${what}.flags[${index}]`)),
})

const verdictBuilders: Readonly<Record<string, (value: JsonValue, what: string) => Verdict>> = {
  Beaten: () => ({ _tag: 'Beaten' }),
  NotBeaten: () => ({ _tag: 'NotBeaten' }),
  Tie: () => ({ _tag: 'Tie' }),
  InstrumentError: (value, what) => ({ _tag: 'InstrumentError', error: textOf(value, 'error', what) }),
}

const verdictOf = (value: JsonValue, what: string): Verdict =>
  (verdictBuilders[tagOf(value, what)] ?? failure(what, 'expected a known verdict tag'))(value, what)

const outcomeBuilders: Readonly<Record<string, (id: RowId, value: JsonValue, what: string) => RowOutcome>> = {
  Held: (id) => ({ _tag: 'Held', id }),
  New: (id) => ({ _tag: 'New', id }),
  ReBaselined: (id) => ({ _tag: 'ReBaselined', id }),
  Neutral: (id, value, what) => ({ _tag: 'Neutral', id, cause: textOf(value, 'cause', what) }),
  InstrumentError: (id, value, what) => ({ _tag: 'InstrumentError', id, error: textOf(value, 'error', what) }),
  LostBeaten: (id, value, what) => ({
    _tag: 'LostBeaten',
    id,
    ratstack: textOf(value, 'ratstack', what),
    starter: textOf(value, 'starter', what),
  }),
  Regressed: (id, value, what) => ({
    _tag: 'Regressed',
    id,
    main: textOf(value, 'main', what),
    pr: textOf(value, 'pr', what),
  }),
}

const outcomeOf = (value: JsonValue, what: string): RowOutcome =>
  (outcomeBuilders[tagOf(value, what)] ?? failure(what, 'expected a known row outcome tag'))(
    rowIdOf(objectOf(value, 'id', what), `${what}.id`),
    value,
    what,
  )

const outcomesOf = (value: JsonValue, key: string, what: string): readonly RowOutcome[] =>
  arrayOf(value, key, what).map((outcome, index) => outcomeOf(outcome, `${what}.${key}[${index}]`))

const ratchetOf = (value: JsonValue, what: string): Ratchet =>
  tagOf(value, what) === 'FirstBaseline'
    ? {
      _tag: 'FirstBaseline',
      outcomes: outcomesOf(value, 'outcomes', what),
      failures: outcomesOf(value, 'failures', what),
    }
    : {
      _tag: 'Compared',
      mainCommit: textOf(value, 'mainCommit', what),
      outcomes: outcomesOf(value, 'outcomes', what),
      failures: outcomesOf(value, 'failures', what),
    }

export const cellsByRow = (cells: readonly SideCell[]): CellsByRow => {
  const byRow = new Map<RowId, Partial<Record<Side, MeasuredCell>>>()
  for (const cell of cells) {
    const row = byRow.get(cell.id) ?? {}
    row[cell.side] = cell.measured
    byRow.set(cell.id, row)
  }
  return Object.fromEntries(byRow)
}

const documentProvenanceOf = (value: JsonValue, what: string): DocumentProvenance => ({
  commit: textOf(value, 'commit', what),
  ratstackCommit: textOf(value, 'ratstackCommit', what),
  instrumentHash: textOf(value, 'instrumentHash', what),
  nixpkgsRev: textOf(value, 'nixpkgsRev', what),
  runner: textOf(value, 'runner', what),
  generatedAt: textOf(value, 'generatedAt', what),
})

const versionOf = (value: JsonValue, what: string): 1 =>
  numberAt(value, ['schemaVersion'], what) === 1 ? 1 : failure(what, 'expected schemaVersion 1')

export const scorecardDocumentOf = (value: JsonValue, what: string): ScorecardDocument => ({
  schemaVersion: versionOf(value, what),
  provenance: documentProvenanceOf(objectOf(value, 'provenance', what), `${what}.provenance`),
  rows: arrayOf(value, 'rows', what).map((row, index): JudgedRow => {
    const base = rowOf(row, `${what}.rows[${index}]`)
    return { ...base, verdict: verdictOf(objectOf(row, 'verdict', what), `${what}.rows[${index}].verdict`) }
  }),
  ratchet: ratchetOf(objectOf(value, 'ratchet', what), `${what}.ratchet`),
})

export const mainBaselineOf = (value: JsonValue, what: string): MainBaseline =>
  tagOf(value, what) === 'Found'
    ? {
      _tag: 'Found',
      commit: textOf(value, 'commit', what),
      rows: arrayOf(value, 'rows', what).map((row, index) => rowOf(row, `${what}.rows[${index}]`)),
    }
    : { _tag: 'Missing' }

export const familyResultOf = (value: JsonValue, what: string): FamilyResult => ({
  family: familyOf(objectOf(value, 'family', what), `${what}.family`),
  wallMs: numberAt(value, ['wallMs'], what),
  cells: arrayOf(value, 'cells', what).map((entry, index): SideCell => ({
    id: rowIdOf(objectOf(entry, 'id', what), `${what}.cells[${index}].id`),
    side: sideOf(objectOf(entry, 'side', what), `${what}.cells[${index}].side`),
    measured: measuredCellOf(objectOf(entry, 'measured', what), `${what}.cells[${index}].measured`),
  })),
  flags: arrayOf(value, 'flags', what).map((entry, index): RowFlag => ({
    id: rowIdOf(objectOf(entry, 'id', what), `${what}.flags[${index}].id`),
    flag: flagOf(objectOf(entry, 'flag', what), `${what}.flags[${index}].flag`),
  })),
  definitionHashes: arrayOf(value, 'definitionHashes', what).map((entry, index) => ({
    id: rowIdOf(objectOf(entry, 'id', what), `${what}.definitionHashes[${index}].id`),
    hash: textOf(entry, 'hash', what),
  })),
})
