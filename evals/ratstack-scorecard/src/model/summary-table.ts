import type { Cell, Flag, Kind, Row, RowOutcome, ScorecardDocument, Verdict } from './cell.ts'
import { matchCell, matchFlag, matchKind, matchOutcome, matchRatchet, matchVerdict } from './dispatch.ts'
import { median } from './runs.ts'

const cellText = (text: string): string => text.replace(/\s+/g, ' ').replace(/\|/g, '\\|').slice(0, 160)

const short = (sha: string): string => sha.slice(0, 7)

const number = (value: number): string => String(Number(value.toFixed(3)))

const measured = (kind: Kind, unit: string, runs: readonly number[]): string =>
  matchKind(kind, {
    count: () => `${number(median(runs))} ${unit}`,
    measurement: () =>
      `${number(median(runs))} ${unit} (${number(Math.min(...runs))}–${number(Math.max(...runs))}, n=${runs.length})`,
  })

const showCell = (row: Row, cell: Cell): string =>
  matchCell(cell, {
    Measured: (c) => measured(row.definition.kind, row.definition.unit, c.runs),
    Absent: (c) => `absent: ${c.reason}`,
    NoDeployment: (c) => `absent: no deployment for ${short(c.sha)}`,
    Unsupported: (c) => `unsupported: ${c.citation.file}:${c.citation.lines[0]}-${c.citation.lines[1]}`,
    Unmeasurable: (c) => `unmeasurable: ${c.error}`,
    NoSecret: (c) => `no secret: ${c.name}`,
    InstrumentError: (c) => `instrument error: ${c.error}`,
  })

const showVerdict = (verdict: Verdict): string =>
  matchVerdict(verdict, {
    Beaten: () => '**beaten**',
    NotBeaten: () => 'not beaten',
    Tie: () => 'tie',
    InstrumentError: () => '**instrument error**',
  })

const showFlag = (flag: Flag): string =>
  matchFlag(flag, {
    LiveDiffersFromPin: (f) => `live ${short(f.live)}≠pin`,
    ScannersDisagree: (f) => `scanners disagree (${f.primary} vs ${f.crossCheck})`,
  })

const showOutcome = (outcome: RowOutcome): string =>
  matchOutcome(outcome, {
    Held: () => 'held',
    New: () => 'new',
    ReBaselined: (o) => `re-baselined (definition \`${short(o.mainHash)}\` → \`${short(o.prHash)}\`)`,
    Neutral: (o) => `neutral (${o.cause})`,
    InstrumentError: (o) => `**failed**: ${o.error}`,
    LostBeaten: (o) => `**failed**: no longer beaten (rat-stack ${o.ratstack}, starter ${o.starter})`,
    Regressed: (o) => `**failed**: regressed from ${o.main} to ${o.pr}`,
  })

const outcomesOf = (doc: ScorecardDocument): readonly RowOutcome[] =>
  matchRatchet(doc.ratchet, { FirstBaseline: (r) => r.outcomes, Compared: (r) => r.outcomes })

const failuresOf = (doc: ScorecardDocument): readonly RowOutcome[] =>
  matchRatchet(doc.ratchet, { FirstBaseline: (r) => r.failures, Compared: (r) => r.failures })

const rebaselinedOf = (outcome: RowOutcome): readonly { id: string; mainHash: string; prHash: string }[] =>
  matchOutcome(outcome, {
    Held: () => [],
    New: () => [],
    ReBaselined: (o) => [o],
    Neutral: () => [],
    InstrumentError: () => [],
    LostBeaten: () => [],
    Regressed: () => [],
  })

const drift = (outcomes: readonly RowOutcome[]): readonly string[] => {
  const rebaselined = outcomes.flatMap(rebaselinedOf)
  return [
    ...rebaselined.slice(0, 1).flatMap(() => [
      `**Definition drift:** ${rebaselined.length} rows re-baselined; their ratchet starts over from this run.`,
      '',
    ]),
    ...rebaselined.map((o) => `- ${o.id}: \`${o.mainHash}\` on \`main\`, \`${o.prHash}\` here`),
    ...rebaselined.slice(0, 1).map(() => ''),
  ]
}

const ratchetLine = (doc: ScorecardDocument): string =>
  matchRatchet(doc.ratchet, {
    FirstBaseline: (r) => `first baseline (no \`main\` artifact), ${r.failures.length} failing rows`,
    Compared: (r) => `compared with \`main\` at \`${short(r.mainCommit)}\`, ${r.failures.length} failing rows`,
  })

const tableRow = (row: Row, outcomes: readonly RowOutcome[]): string =>
  `| ${
    [
      row.definition.id,
      row.definition.bin,
      row.definition.label,
      showCell(row, row.ratstack.cell),
      showCell(row, row.starter.cell),
      showVerdict(row.verdict),
      outcomes.filter((o) => o.id === row.definition.id).map(showOutcome).join(', '),
      row.flags.map(showFlag).join(', '),
    ].map(cellText).join(' | ')
  } |`

export const renderSummary = (doc: ScorecardDocument): string =>
  [
    '## rat-stack scorecard',
    '',
    `Starter \`${short(doc.provenance.commit)}\` against rat-stack \`${
      short(doc.provenance.ratstackCommit)
    }\`, instrument \`${short(doc.provenance.instrumentHash)}\`, nixpkgs \`${
      short(doc.provenance.nixpkgsRev)
    }\`, runner \`${cellText(doc.provenance.runner)}\`, ${doc.provenance.generatedAt}.`,
    '',
    `**Ratchet:** ${ratchetLine(doc)}.`,
    '',
    ...failuresOf(doc).map((failure) => `- ${failure.id}: ${cellText(showOutcome(failure))}`),
    '',
    ...drift(outcomesOf(doc)),
    `Beaten: ${doc.rows.filter((row) => row.verdict._tag === 'Beaten').length} of ${doc.rows.length} rows.`,
    '',
    '| Row | Bin | Metric | rat-stack | starter | Verdict | Ratchet | Flags |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...doc.rows.map((row) => tableRow(row, outcomesOf(doc))),
    '',
  ].join('\n')
