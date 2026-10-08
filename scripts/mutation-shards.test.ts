import { assertEquals } from '@std/assert'
import { join } from '@std/path'

import { planMutationShards } from './mutation-shards.ts'

type PackageFixture = {
  readonly name: string
  readonly mutation?: false
  readonly mutate?: string[]
  readonly files: string[]
}

const workspaceOf = async (packages: PackageFixture[]): Promise<string> => {
  const root = await Deno.makeTempDir({ prefix: 'mutation-shards-' })
  await Deno.writeTextFile(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
  for (const fixture of packages) {
    const dir = join(root, 'packages', fixture.name)
    await Deno.mkdir(join(dir, 'src'), { recursive: true })
    const stryker = fixture.mutate === undefined ? {} : { stryker: { mutate: fixture.mutate } }
    const scripts = fixture.mutation === false ? {} : { scripts: { mutation: 'stryker run' } }
    await Deno.writeTextFile(
      join(dir, 'package.json'),
      JSON.stringify({ name: `@fixture/${fixture.name}`, ...scripts, ...stryker }),
    )
    for (const file of fixture.files) await Deno.writeTextFile(join(dir, file), 'export {}\n')
  }
  return root
}

Deno.test('a package whose mutate globs match files becomes a shard', async () => {
  const root = await workspaceOf([{ name: 'core', mutate: ['src/**/*.workflow.ts'], files: ['src/order.workflow.ts'] }])
  assertEquals(await planMutationShards(root), { packages: ['@fixture/core'], refusals: [], decisions: 1 })
})

Deno.test('a package whose mutate globs match no file is refused by name and globs', async () => {
  const root = await workspaceOf([
    { name: 'core', mutate: ['src/**/*.workflow.ts'], files: ['src/order.workflow.ts'] },
    { name: 'site', mutate: ['src/**/*.workflow.ts'], files: ['src/page.tsx'] },
  ])
  assertEquals(await planMutationShards(root), {
    packages: ['@fixture/core'],
    refusals: ['@fixture/site (packages/site): stryker.mutate ["src/**/*.workflow.ts"] matches no files'],
    decisions: 1,
  })
})

Deno.test('negated globs that remove every match leave the package refused', async () => {
  const root = await workspaceOf([{
    name: 'core',
    mutate: ['src/**/*.ts', '!src/**/*.test.ts', '!src/**/*.workflow.ts'],
    files: ['src/a.test.ts', 'src/order.workflow.ts'],
  }])
  assertEquals(await planMutationShards(root), {
    packages: [],
    refusals: [
      '@fixture/core (packages/core): stryker.mutate ["src/**/*.ts","!src/**/*.test.ts","!src/**/*.workflow.ts"] matches no files',
    ],
    decisions: 1,
  })
})

Deno.test('a mutation script without declared mutate globs is refused', async () => {
  const root = await workspaceOf([{ name: 'core', files: ['src/order.workflow.ts'] }])
  assertEquals(await planMutationShards(root), {
    packages: [],
    refusals: ['@fixture/core (packages/core): stryker.mutate [] matches no files'],
    decisions: 1,
  })
})

Deno.test('a workspace without a single *.workflow.ts file is refused as an empty set', async () => {
  const root = await workspaceOf([
    { name: 'site', mutate: ['src/**/*.workflow.ts'], files: ['src/page.tsx'] },
    { name: 'tools', mutation: false, files: ['src/cli.ts'] },
  ])
  assertEquals(await planMutationShards(root), {
    packages: [],
    refusals: ['no workspace package has a *.workflow.ts file; the release gate refuses an empty set'],
    decisions: 0,
  })
})

Deno.test('decisions that no package mutates are refused as an empty set', async () => {
  const root = await workspaceOf([{ name: 'core', mutation: false, files: ['src/order.workflow.ts'] }])
  assertEquals(await planMutationShards(root), {
    packages: [],
    refusals: [
      '1 *.workflow.ts file(s) but no workspace package declares a `mutation` script; the release gate refuses an empty set',
    ],
    decisions: 1,
  })
})
