import { join } from 'node:path'
import { walkFiles } from './harness/instrument.ts'

const importPattern =
  /(?:^|\n)\s*(?:import|export)\b[^'"]*?from\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/gu

const captured = (match: RegExpMatchArray): readonly (string | undefined)[] => [match[1], match[2], match[3]]

const group = (match: RegExpMatchArray): string => captured(match).find((value) => value !== undefined) ?? ''

const specifiers = (source: string): readonly string[] => [...source.matchAll(importPattern)].map(group)

const externalPrefixes = ['.', '/', 'node:']

const isThirdParty = (specifier: string): boolean => !externalPrefixes.some((prefix) => specifier.startsWith(prefix))

const violates = (specifier: string): boolean => isThirdParty(specifier) || specifier.includes('node_modules')

const violationOf = (entry: string, specifier: string): readonly string[] =>
  violates(specifier) ? [`${entry} imports ${specifier}`] : []

const relativeChild = (entry: string, specifier: string): string | undefined =>
  specifier.startsWith('.') ? join(entry, '..', specifier) : undefined

const childOf = (entry: string, specifier: string): string | undefined =>
  violates(specifier) ? undefined : relativeChild(entry, specifier)

const edgesOf = async (
  root: string,
  entry: string,
  seen: Set<string>,
  specifier: string,
): Promise<readonly string[]> => {
  const child = childOf(entry, specifier)
  const nested = child === undefined ? [] : await driverGraph(root, child, seen)
  return [...violationOf(entry, specifier), ...nested]
}

const collectEdges = async (
  root: string,
  entry: string,
  seen: Set<string>,
  found: readonly string[],
): Promise<readonly string[]> => {
  const violations: string[] = []
  for (const specifier of found) violations.push(...await edgesOf(root, entry, seen, specifier))
  return violations
}

const driverGraph = async (root: string, entry: string, seen: Set<string>): Promise<readonly string[]> => {
  if (seen.has(entry)) return []
  seen.add(entry)
  return collectEdges(root, entry, seen, specifiers(await Deno.readTextFile(join(root, entry))))
}

const journeysOf = async (root: string, file: string): Promise<readonly string[]> => {
  const imports = specifiers(await Deno.readTextFile(join(root, file)))
  return imports.some((specifier) => specifier.endsWith('journeys/launcher-run.ts'))
    ? [`${file} imports the journey fixture; journeys live in journeys/, never beside the model`]
    : []
}

const misplacedJourneys = async (root: string, files: readonly string[]): Promise<readonly string[]> => {
  const found: string[] = []
  for (const file of files) found.push(...await journeysOf(root, file))
  return found
}

export const checkImports = async (root: string): Promise<readonly string[]> => {
  const driver = await driverGraph(root, 'src/main.ts', new Set())
  const sources = (await walkFiles(join(root, 'src')))
    .filter((file) => file.endsWith('.ts'))
    .map((file) => `src/${file}`)
  return [
    ...driver.map((line) => `host driver loads third-party code: ${line}`),
    ...await misplacedJourneys(root, sources),
  ]
}
