import { join } from 'node:path'
import { parseSync } from 'oxc-parser'

interface ParsedFile {
  readonly path: string
  readonly comments: readonly string[]
  readonly errors: number
}

const requiredArg = (args: readonly string[], index: number, name: string): string => {
  const value = args[index]
  if (value === undefined) throw new Error(`${name} is required`)
  return value
}

const fileList = (text: string): readonly string[] => text.split('\n').filter((line) => line !== '')

const parseFile = async (root: string, file: string): Promise<ParsedFile> => {
  const source = await Deno.readTextFile(join(root, file))
  const result = parseSync(file, source)
  return {
    path: file,
    comments: result.comments.map((comment) => comment.value),
    errors: result.errors.length,
  }
}

const root = requiredArg(Deno.args, 0, 'root')
const files = fileList(await Deno.readTextFile(requiredArg(Deno.args, 1, 'files list')))
const parsed = await Promise.all(files.map((file) => parseFile(root, file)))
await Deno.writeTextFile(requiredArg(Deno.args, 2, 'output'), JSON.stringify({ parser: 'oxc-parser', files: parsed }))
