import { Effect, Schema } from 'effect'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, test } from 'vitest'
import { isSourceFile, tallyDirectives, totalDirectives, vendoredRootsOf } from '../src/model/directives.ts'
import { distinctPackages } from '../src/model/lockfile.ts'

const run = promisify(execFile)
const instrument = join(import.meta.dirname ?? '.', '..')
const fixtures = join(import.meta.dirname ?? '.', '__fixtures__')

const Extracted = Schema.Struct({ files: Schema.Array(Schema.Struct({ comments: Schema.Array(Schema.String) })) })
const LockfileDocuments = Schema.Struct({
  documents: Schema.Array(Schema.Struct({ packages: Schema.Array(Schema.String) })),
})

const debtTree: Readonly<Record<string, string>> = {
  'src/flagged.ts': [
    '// oxlint-disable-next-line no-console -- the one directive in this tree',
    "const text = 'oxlint-disable-next-line written inside a string'",
    'const pattern = /@ts-ignore/u',
    'const template = `eslint-disable ${text}`',
    'export { pattern, template, text }',
    '',
  ].join('\n'),
  'vendor/copied.ts': '// @ts-nocheck vendored code keeps its own directives\nexport const copied = 1\n',
  'README.md': '<!-- oxlint-disable -->\n',
}

const writeTree = async (root: string, files: Readonly<Record<string, string>>): Promise<void> => {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), content)
  }
}

const tool = async (name: string, args: readonly string[]): Promise<string> => {
  const output = join(await mkdtemp(join(tmpdir(), 'journey-')), 'out.json')
  await run('deno', [
    'run',
    '--allow-read',
    '--allow-write',
    '--allow-env',
    '--allow-ffi',
    join(instrument, 'src/tools', name),
    ...args,
    output,
  ], { cwd: instrument })
  return await readFile(output, 'utf8')
}

describe('static family through the real tools (J2)', () => {
  test('only the directive in a comment counts; strings, regex literals, templates and vendored files do not', async () => {
    const root = await mkdtemp(join(tmpdir(), 'debt-tree-'))
    await writeTree(root, debtTree)
    const files = Object.keys(debtTree)
      .filter(isSourceFile)
      .filter((file) => vendoredRootsOf(file, ['vendor/']).length === 0)
    const list = join(root, 'files.txt')
    await writeFile(list, `${files.join('\n')}\n`)
    const extracted = await Effect.runPromise(
      Schema.decodeUnknownEffect(Schema.fromJsonString(Extracted))(
        await tool('extract-comments.ts', [root, list]),
      ),
    )
    const comments = extracted.files.flatMap((file) => file.comments)
    const tally = tallyDirectives(comments)
    expect(files).toEqual(['src/flagged.ts'])
    expect(tally.oxlint).toBe(1)
    expect(totalDirectives(tally)).toBe(1)
  })

  test('pnpm 11 and pnpm 12 lockfiles list their packages across both YAML documents, without peer suffixes', async () => {
    const packagesOf = async (fixture: string) => {
      const parsed = await Effect.runPromise(
        Schema.decodeUnknownEffect(Schema.fromJsonString(LockfileDocuments))(
          await tool('parse-lockfile.ts', [join(fixtures, 'lockfiles', fixture)]),
        ),
      )
      return distinctPackages(parsed.documents.flatMap((document) => document.packages))
    }
    const application = ['@effect/vitest@4.0.0', 'effect@4.0.0', 'vitest@5.0.3']
    expect(await packagesOf('pnpm11.yaml')).toEqual([...application, '@pnpm/exe@11.3.0', 'pnpm@11.3.0'].sort())
    expect(await packagesOf('pnpm12.yaml')).toEqual(
      [...application, '@pnpm/exe.linux-x64@12.4.2', 'pnpm@12.4.2'].sort(),
    )
  })
})
