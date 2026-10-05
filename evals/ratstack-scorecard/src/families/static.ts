import { join } from 'node:path'
import { arrayAt, numberAt, stringAt } from '../harness/decode.ts'
import {
  type Instrument,
  materializeStarter,
  prepareTools,
  provenanceFor,
  trackedFiles,
  walkFiles,
} from '../harness/instrument.ts'
import { runSandboxed } from '../harness/sandbox.ts'
import type { Cell, FamilyResult, Side, SideCell } from '../model/cell.ts'
import { isSourceFile, tallyDirectives, totalDirectives, vendoredRootsOf } from '../model/directives.ts'
import { distinctPackages } from '../model/lockfile.ts'
import { ratstack } from '../sides/ratstack.ts'
import type { SideAdapter } from '../sides/side-adapter.ts'
import { starter } from '../sides/starter.ts'

const runs = 3

interface Subject {
  readonly adapter: SideAdapter
  readonly root: string
  readonly files: readonly string[]
}

interface CountedRun {
  readonly cell: Cell
  readonly detail: Readonly<Record<string, number | string>>
}

const instrumentError = (error: string): CountedRun => ({ cell: { _tag: 'InstrumentError', error }, detail: {} })

const node = async (instrument: Instrument, work: string, tools: string, args: readonly string[]) =>
  await runSandboxed(instrument.launcher, {
    project: work,
    cwd: tools,
    command: ['node', ...args],
    deadlineMs: 15 * 60_000,
  })

const subjectOf = async (instrument: Instrument, work: string, side: Side): Promise<Subject> =>
  side === 'ratstack'
    ? { adapter: ratstack, root: instrument.ratstackSrc, files: await walkFiles(instrument.ratstackSrc) }
    : {
      adapter: starter,
      root: await materializeStarter(instrument, work),
      files: await trackedFiles(instrument.checkout),
    }

const countDirectives = async (
  instrument: Instrument,
  work: string,
  tools: string,
  subject: Subject,
): Promise<CountedRun> => {
  const sources = subject.files.filter(isSourceFile)
  const excluded = subject.adapter.vendored.map((vendored) => ({
    ...vendored,
    files: sources.filter((file) => vendoredRootsOf(file, [vendored.root]).length > 0).length,
  }))
  const counted = sources.filter((file) =>
    vendoredRootsOf(file, subject.adapter.vendored.map((v) => v.root)).length === 0
  )
  const request = join(work, `directives-${subject.adapter.side}.request.json`)
  await Deno.writeTextFile(request, JSON.stringify({ root: subject.root, files: counted }))
  const totals: number[] = []
  let detail: Record<string, number | string> = {}
  for (let run = 0; run < runs; run++) {
    const output = join(work, `directives-${subject.adapter.side}-${run}.json`)
    const result = await node(instrument, work, tools, ['src/tools/extract-comments.mjs', request, output])
    if (result.code !== 0) {
      return instrumentError(`extract-comments exited ${result.code}: ${result.stderr.slice(-2000)}`)
    }
    const parsed = JSON.parse(await Deno.readTextFile(output))
    const files = arrayAt(parsed, ['files'], 'extract-comments output')
    const comments = files.flatMap((file) => arrayAt(file, ['comments'], 'extract-comments file').map(String))
    const tally = tallyDirectives(comments)
    totals.push(totalDirectives(tally))
    detail = {
      ...tally,
      filesCounted: counted.length,
      parseErrors: files.reduce<number>((sum, file) => sum + numberAt(file, ['errors'], 'extract-comments file'), 0),
      ...Object.fromEntries(excluded.map((v) => [`excluded:${v.root}`, `${v.files} files: ${v.reason}`])),
    }
  }
  return { cell: { _tag: 'Measured', runs: totals }, detail }
}

const countPackages = async (
  instrument: Instrument,
  work: string,
  tools: string,
  subject: Subject,
): Promise<CountedRun> => {
  const lockfile = join(subject.root, subject.adapter.lockfile)
  const counts: number[] = []
  let detail: Record<string, number | string> = {}
  for (let run = 0; run < runs; run++) {
    const output = join(work, `lockfile-${subject.adapter.side}-${run}.json`)
    const result = await node(instrument, work, tools, ['src/tools/parse-lockfile.mjs', lockfile, output])
    if (result.code !== 0) return instrumentError(`parse-lockfile exited ${result.code}: ${result.stderr.slice(-2000)}`)
    const documents = arrayAt(JSON.parse(await Deno.readTextFile(output)), ['documents'], 'parse-lockfile output')
    const keys = documents.flatMap((doc) => arrayAt(doc, ['packages'], 'lockfile document').map(String))
    counts.push(distinctPackages(keys).length)
    detail = {
      lockfile: subject.adapter.lockfile,
      documents: documents.length,
      lockfileVersions: documents.map((doc) => stringAt(doc, ['lockfileVersion'], 'lockfile document')).join(', '),
    }
  }
  return { cell: { _tag: 'Measured', runs: counts }, detail }
}

export const measureStatic = async (
  instrument: Instrument,
  work: string,
  sides: readonly Side[],
): Promise<FamilyResult> => {
  const started = performance.now()
  const tools = await prepareTools(instrument, work)
  const cells: SideCell[] = []
  for (const side of sides) {
    const subject = await subjectOf(instrument, work, side)
    const debt = await countDirectives(instrument, work, tools, subject)
    const packages = await countPackages(instrument, work, tools, subject)
    cells.push(
      { id: 'M23', side, measured: { cell: debt.cell, provenance: provenanceFor(instrument, side, debt.detail) } },
      {
        id: 'M28',
        side,
        measured: { cell: packages.cell, provenance: provenanceFor(instrument, side, packages.detail) },
      },
    )
  }
  return { family: 'static', wallMs: Math.round(performance.now() - started), cells, flags: [] }
}
