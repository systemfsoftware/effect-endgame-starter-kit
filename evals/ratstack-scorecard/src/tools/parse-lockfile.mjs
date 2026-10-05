import { readFile, writeFile } from 'node:fs/promises'
import { parseAllDocuments } from 'yaml'

const [lockfile, output] = process.argv.slice(2)
const documents = parseAllDocuments(await readFile(lockfile, 'utf8')).map((document) => {
  const value = document.toJS() ?? {}
  return {
    lockfileVersion: String(value.lockfileVersion ?? ''),
    packages: Object.keys(value.packages ?? {}),
    errors: document.errors.length,
  }
})

await writeFile(output, JSON.stringify({ parser: 'yaml', documents }))
