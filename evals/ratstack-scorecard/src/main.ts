import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { measureStatic } from './families/static.ts'
import { runCheck } from './harness/gates.ts'
import { type Instrument, loadInstrument } from './harness/instrument.ts'
import { runJourneys } from './journeys.ts'
import type { Side } from './model/cell.ts'
import type { FamilyResult } from './model/scorecard-document.ts'

const usage = [
  'usage:',
  '  scorecard measure --family <family> [--side ratstack|starter] [--out <file>] [--checkout <dir>]',
  '  scorecard journeys [--checkout <dir>]',
  '  scorecard check [--checkout <dir>]   (import-graph rules, then journeys)',
].join('\n')

const families: Readonly<
  Record<string, (instrument: Instrument, work: string, sides: readonly Side[]) => Promise<FamilyResult>>
> = {
  static: measureStatic,
}

const sidesOf = (side: string | undefined): readonly Side[] => {
  if (side === undefined) return ['ratstack', 'starter']
  if (side === 'ratstack' || side === 'starter') return [side]
  throw new Error(`unknown side ${side}\n${usage}`)
}

const measure = async (args: readonly string[]): Promise<void> => {
  const { values } = parseArgs({
    args: [...args],
    options: {
      family: { type: 'string' },
      side: { type: 'string' },
      out: { type: 'string' },
      checkout: { type: 'string' },
    },
    strict: true,
  })
  const run = families[values.family ?? '']
  if (run === undefined) throw new Error(`unknown family ${values.family}\n${usage}`)
  const instrument = await loadInstrument(values.checkout)
  const work = await Deno.makeTempDir({ prefix: `scorecard-${values.family}-` })
  try {
    const result: FamilyResult = await run(instrument, work, sidesOf(values.side))
    const json = `${JSON.stringify(result, null, 2)}\n`
    if (values.out === undefined) await Deno.stdout.write(new TextEncoder().encode(json))
    else await Deno.writeTextFile(values.out, json)
  } finally {
    await Deno.remove(work, { recursive: true })
  }
}

const journeys = async (args: readonly string[]): Promise<void> => {
  const { values } = parseArgs({ args: [...args], options: { checkout: { type: 'string' } }, strict: true })
  const instrument = await loadInstrument(values.checkout)
  Deno.exit(await runJourneys(instrument, join(instrument.checkout, 'evals/ratstack-scorecard')))
}

const check = async (args: readonly string[]): Promise<void> => {
  const { values } = parseArgs({ args: [...args], options: { checkout: { type: 'string' } }, strict: true })
  const instrument = await loadInstrument(values.checkout)
  const root = join(instrument.checkout, 'evals/ratstack-scorecard')
  Deno.exit(await runCheck(instrument, root))
}

const commands: Readonly<Record<string, (args: readonly string[]) => Promise<void>>> = { measure, journeys, check }

const [command, ...rest] = Deno.args
const handler = commands[command ?? '']
if (handler === undefined) {
  console.error(usage)
  Deno.exit(2)
}
await handler(rest)
