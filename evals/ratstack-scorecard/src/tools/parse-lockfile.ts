import { type Document, isMap, parseAllDocuments } from 'yaml'

const EMPTY: readonly never[] = []

const requiredArg = (args: readonly string[], index: number, name: string): string => {
  const value = args[index]
  if (value === undefined) throw new Error(`${name} is required`)
  return value
}

const isText = (value: unknown): value is string | number => typeof value === 'string' || typeof value === 'number'

const versionOf = (document: Document.Parsed): string => {
  const version = document.get('lockfileVersion')
  return isText(version) ? String(version) : ''
}

const packageKeysOf = (document: Document.Parsed): readonly string[] => {
  const packages = document.get('packages')
  return isMap(packages) ? packages.items.map((pair) => String(pair.key)) : EMPTY
}

const lockfileDocument = (document: Document.Parsed) => ({
  lockfileVersion: versionOf(document),
  packages: packageKeysOf(document),
  errors: document.errors.length,
})

const lockfile = requiredArg(Deno.args, 0, 'lockfile')
const documents = parseAllDocuments(await Deno.readTextFile(lockfile)).map(lockfileDocument)
await Deno.writeTextFile(requiredArg(Deno.args, 1, 'output'), JSON.stringify({ parser: 'yaml', documents }))
