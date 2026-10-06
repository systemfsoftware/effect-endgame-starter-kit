import { join } from 'node:path'
import { arrayAt, numberAt, parseJson, stringAt } from '../harness/decode.ts'
import {
  type Instrument,
  materializeRatstack,
  materializeStarter,
  prepareTools,
  provenanceFor,
  trackedFiles,
  walkFiles,
} from '../harness/instrument.ts'
import { runSandboxed } from '../harness/sandbox.ts'
import type { Cell, Side } from '../model/cell.ts'
import { isSourceFile, tallyDirectives, totalDirectives, vendoredRootsOf } from '../model/directives.ts'
import { distinctPackages } from '../model/lockfile.ts'
import type { FamilyResult, SideCell } from '../model/scorecard-document.ts'
import { ratstack } from '../sides/ratstack.ts'
import type { SideAdapter } from '../sides/side-adapter.ts'
import { starter } from '../sides/starter.ts'

const runs = 3

interface Subject {
  readonly adapter: SideAdapter
  readonly root: string
  readonly files: readonly string[]
}

interface Sample {
  readonly value: number
  readonly detail: Readonly<Record<string, number | string>>
}

interface CountedRun {
  readonly cell: Cell
  readonly detail: Readonly<Record<string, number | string>>
}

const instrumentError = (error: string): CountedRun => ({ cell: { _tag: 'InstrumentError', error }, detail: {} })

const tool = async (instrument: Instrument, work: string, tools: string, args: readonly string[]) =>
  await runSandboxed(instrument.launcher, {
    project: work,
    cwd: tools,
    command: ['deno', 'run', '--allow-read', '--allow-write', '--allow-env', '--allow-ffi', ...args],
    deadlineMs: 15 * 60_000,
  })

const subjectOf = async (instrument: Instrument, work: string, side: Side): Promise<Subject> =>
  side === 'ratstack'
    ? {
      adapter: ratstack,
      root: await materializeRatstack(instrument, work),
      files: await walkFiles(instrument.ratstackSrc),
    }
    : {
      adapter: starter,
      root: await materializeStarter(instrument, work),
      files: await trackedFiles(instrument.checkout),
    }

const sampleRuns = async (
  count: number,
  sample: (run: number) => Promise<Sample | string>,
): Promise<readonly (Sample | string)[]> => {
  const results: (Sample | string)[] = []
  for (let run = 0; run < count; run++) results.push(await sample(run))
  return results
}

const firstError = (samples: readonly (Sample | string)[]): string | undefined =>
  samples.find((sample): sample is string => typeof sample === 'string')

const measuredSamples = (samples: readonly (Sample | string)[]): readonly Sample[] =>
  samples.filter((sample): sample is Sample => typeof sample !== 'string')

const lastDetail = (samples: readonly Sample[]): Readonly<Record<string, number | string>> =>
  samples.reduce<Readonly<Record<string, number | string>>>((_, sample) => sample.detail, {})

const countedRun = (
  samples: readonly (Sample | string)[],
  enrich: (detail: Readonly<Record<string, number | string>>) => Readonly<Record<string, number | string>>,
): CountedRun => {
  const error = firstError(samples)
  if (error !== undefined) return instrumentError(error)
  const measured = measuredSamples(samples)
  return {
    cell: { _tag: 'Measured', runs: measured.map((sample) => sample.value) },
    detail: enrich(lastDetail(measured)),
  }
}

const directiveSample = async (
  instrument: Instrument,
  work: string,
  tools: string,
  subject: Subject,
  request: string,
  run: number,
): Promise<Sample | string> => {
  const output = join(work, `directives-${subject.adapter.side}-${run}.json`)
  const result = await tool(instrument, work, tools, ['src/tools/extract-comments.ts', subject.root, request, output])
  if (result.code !== 0) return `extract-comments exited ${result.code}: ${result.stderr.slice(-2000)}`
  const files = arrayAt(parseJson(await Deno.readTextFile(output)), ['files'], 'extract-comments output')
  const comments = files.flatMap((file) => arrayAt(file, ['comments'], 'extract-comments file').map(String))
  const tally = tallyDirectives(comments)
  return {
    value: totalDirectives(tally),
    detail: {
      ...tally,
      parseErrors: files.reduce<number>((sum, file) => sum + numberAt(file, ['errors'], 'extract-comments file'), 0),
    },
  }
}

const countDirectives = async (
  instrument: Instrument,
  work: string,
  tools: string,
  subject: Subject,
): Promise<CountedRun> => {
  const sources = subject.files.filter(isSourceFile)
  const vendorRoots = subject.adapter.vendored.map((vendored) => vendored.root)
  const excluded = subject.adapter.vendored.map((vendored) => ({
    ...vendored,
    files: sources.filter((file) => vendoredRootsOf(file, [vendored.root]).length > 0).length,
  }))
  const counted = sources.filter((file) => vendoredRootsOf(file, vendorRoots).length === 0)
  const request = join(work, `directives-${subject.adapter.side}.files`)
  await Deno.writeTextFile(request, `${counted.join('\n')}\n`)
  const samples = await sampleRuns(runs, (run) => directiveSample(instrument, work, tools, subject, request, run))
  return countedRun(samples, (detail) => ({
    ...detail,
    filesCounted: counted.length,
    ...Object.fromEntries(
      excluded.map((vendored) => [`excluded:${vendored.root}`, `${vendored.files} files: ${vendored.reason}`]),
    ),
  }))
}

const packageSample = async (
  instrument: Instrument,
  work: string,
  tools: string,
  subject: Subject,
  run: number,
): Promise<Sample | string> => {
  const output = join(work, `lockfile-${subject.adapter.side}-${run}.json`)
  const lockfile = join(subject.root, subject.adapter.lockfile)
  const result = await tool(instrument, work, tools, ['src/tools/parse-lockfile.ts', lockfile, output])
  if (result.code !== 0) return `parse-lockfile exited ${result.code}: ${result.stderr.slice(-2000)}`
  const documents = arrayAt(parseJson(await Deno.readTextFile(output)), ['documents'], 'parse-lockfile output')
  return {
    value: distinctPackages(documents.flatMap((doc) => arrayAt(doc, ['packages'], 'lockfile document').map(String)))
      .length,
    detail: {
      lockfile: subject.adapter.lockfile,
      documents: documents.length,
      lockfileVersions: documents.map((doc) => stringAt(doc, ['lockfileVersion'], 'lockfile document')).join(', '),
    },
  }
}

const countPackages = async (
  instrument: Instrument,
  work: string,
  tools: string,
  subject: Subject,
): Promise<CountedRun> => {
  const samples = await sampleRuns(runs, (run) => packageSample(instrument, work, tools, subject, run))
  return countedRun(samples, (detail) => detail)
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
