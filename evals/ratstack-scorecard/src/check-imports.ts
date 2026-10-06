import { join } from 'node:path'
import { walkFiles } from './harness/instrument.ts'

const specifiers = (source: string): readonly string[] =>
  [
    ...source.matchAll(
      /(?:^|\n)\s*(?:import|export)\b[^'"]*?from\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/gu,
    ),
  ].map((match) => match[1] ?? match[2] ?? match[3] ?? '')

const isThirdParty = (specifier: string): boolean =>
  !specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.startsWith('node:')

const driverGraph = async (root: string, entry: string, seen: Set<string>): Promise<readonly string[]> => {
  if (seen.has(entry)) return []
  seen.add(entry)
  const found: string[] = []
  for (const specifier of specifiers(await Deno.readTextFile(join(root, entry)))) {
    if (isThirdParty(specifier) || specifier.includes('node_modules')) found.push(`${entry} imports ${specifier}`)
    else if (specifier.startsWith('.')) found.push(...await driverGraph(root, join(entry, '..', specifier), seen))
  }
  return found
}

export const checkImports = async (root: string): Promise<readonly string[]> => {
  const driver = await driverGraph(root, 'src/main.ts', new Set())
  const fixtureImports = (await walkFiles(join(root, 'src')))
    .filter((file) => file.endsWith('.ts'))
    .map((file) => `src/${file}`)
  const misplacedJourneys: string[] = []
  for (const file of fixtureImports) {
    const imports = specifiers(await Deno.readTextFile(join(root, file)))
    if (imports.some((specifier) => specifier.endsWith('journeys/launcher-run.ts'))) {
      misplacedJourneys.push(`${file} imports the journey fixture; journeys live in journeys/, never beside the model`)
    }
  }
  return [
    ...driver.map((line) => `host driver loads third-party code: ${line}`),
    ...misplacedJourneys,
  ]
}
