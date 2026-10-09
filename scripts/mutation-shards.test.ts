import { assertEquals } from '@std/assert'
import { dirname, join } from '@std/path'

import { planMutationShards } from './mutation-shards.ts'

type PackageFixture = {
  readonly name: string
  readonly mutation?: string | false
  readonly mutate?: string[]
  readonly files: string[]
}

const workspaceOf = async (packages: PackageFixture[]): Promise<string> => {
  const root = await Deno.makeTempDir({ prefix: 'mutation-shards-' })
  await Deno.writeTextFile(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
  for (const fixture of packages) {
    const dir = join(root, 'packages', fixture.name)
    await Deno.mkdir(dir, { recursive: true })
    const stryker = fixture.mutate === undefined ? {} : { stryker: { mutate: fixture.mutate } }
    const scripts = fixture.mutation === false ? {} : { scripts: { mutation: fixture.mutation ?? 'stryker run' } }
    await Deno.writeTextFile(
      join(dir, 'package.json'),
      JSON.stringify({ name: `@fixture/${fixture.name}`, ...scripts, ...stryker }),
    )
    for (const file of fixture.files) {
      await Deno.mkdir(dirname(join(dir, file)), { recursive: true })
      await Deno.writeTextFile(join(dir, file), 'export {}\n')
    }
  }
  return root
}

Deno.test('a shard mutates exactly the package workflow files, never tests, other source or dependencies', async () => {
  const root = await workspaceOf([{
    name: 'core',
    files: [
      'src/order.workflow.ts',
      'src/billing/invoice.workflow.ts',
      'src/order.test.ts',
      'src/__tests__/order.workflow.property.test.ts',
      'src/page.tsx',
      'src/order.schema.ts',
      'node_modules/dep/x.workflow.ts',
      '.stryker-tmp/sandbox-1/src/order.workflow.ts',
    ],
  }])
  assertEquals(await planMutationShards(root), {
    shards: [{ package: '@fixture/core', mutate: ['src/billing/invoice.workflow.ts', 'src/order.workflow.ts'] }],
    refusals: [],
  })
})

Deno.test('a package that widens its own mutated set is refused', async () => {
  const root = await workspaceOf([{ name: 'core', mutate: ['src/**/*.ts'], files: ['src/order.workflow.ts'] }])
  assertEquals((await planMutationShards(root)).refusals, [
    { _tag: 'OwnMutate', dir: 'packages/core', mutate: ['src/**/*.ts'] },
  ])
})

Deno.test('a package that points its mutated set at test files is refused', async () => {
  const root = await workspaceOf([{
    name: 'core',
    mutate: ['src/**/*.test.ts'],
    files: ['src/order.workflow.ts', 'src/order.test.ts'],
  }])
  assertEquals((await planMutationShards(root)).refusals, [
    { _tag: 'OwnMutate', dir: 'packages/core', mutate: ['src/**/*.test.ts'] },
  ])
})

Deno.test('a package that sets its own mutated set without a mutation script is still refused', async () => {
  const root = await workspaceOf([
    { name: 'core', files: ['src/order.workflow.ts'] },
    { name: 'tools', mutation: false, mutate: ['src/**/*.ts'], files: ['src/cli.ts'] },
  ])
  assertEquals((await planMutationShards(root)).refusals, [
    { _tag: 'OwnMutate', dir: 'packages/tools', mutate: ['src/**/*.ts'] },
  ])
})

Deno.test('a mutation script that passes its own files to stryker is refused', async () => {
  const root = await workspaceOf([{
    name: 'core',
    mutation: 'stryker run -m src/**/*.ts',
    files: ['src/order.workflow.ts'],
  }])
  assertEquals(await planMutationShards(root), {
    shards: [],
    refusals: [{
      _tag: 'MutationScriptNotStrykerRun',
      dir: 'packages/core',
      script: 'stryker run -m src/**/*.ts',
    }],
  })
})

Deno.test('a mutating package without a workflow file is refused by name', async () => {
  const root = await workspaceOf([
    { name: 'core', files: ['src/order.workflow.ts'] },
    { name: 'site', files: ['src/page.tsx'] },
  ])
  assertEquals(await planMutationShards(root), {
    shards: [{ package: '@fixture/core', mutate: ['src/order.workflow.ts'] }],
    refusals: [{ _tag: 'NoWorkflowFiles', dir: 'packages/site' }],
  })
})

Deno.test('a workspace without a single *.workflow.ts file is refused as an empty set', async () => {
  const root = await workspaceOf([
    { name: 'site', files: ['src/page.tsx'] },
    { name: 'tools', mutation: false, files: ['src/cli.ts'] },
  ])
  assertEquals(await planMutationShards(root), { shards: [], refusals: [{ _tag: 'NoWorkflowFilesInWorkspace' }] })
})

Deno.test('workflow files in a package without a mutation script are refused by package', async () => {
  const root = await workspaceOf([
    { name: 'core', files: ['src/order.workflow.ts'] },
    { name: 'billing', mutation: false, files: ['src/invoice.workflow.ts', 'src/refund.workflow.ts'] },
  ])
  assertEquals(await planMutationShards(root), {
    shards: [{ package: '@fixture/core', mutate: ['src/order.workflow.ts'] }],
    refusals: [{ _tag: 'WorkflowFilesNotMutated', dir: 'packages/billing', workflows: 2 }],
  })
})

Deno.test('decisions that no package mutates are refused', async () => {
  const root = await workspaceOf([{ name: 'core', mutation: false, files: ['src/order.workflow.ts'] }])
  assertEquals(await planMutationShards(root), {
    shards: [],
    refusals: [{ _tag: 'WorkflowFilesNotMutated', dir: 'packages/core', workflows: 1 }],
  })
})

Deno.test('a workflow copy in a directory Stryker ignores is not planned', async () => {
  const root = await workspaceOf([{ name: 'core', files: ['src/order.workflow.ts', 'dist/order.workflow.ts'] }])
  assertEquals(await planMutationShards(root), {
    shards: [{ package: '@fixture/core', mutate: ['src/order.workflow.ts'] }],
    refusals: [],
  })
})

Deno.test('a workflow path the comma-joined --mutate list would split or expand is refused by name', async () => {
  const root = await workspaceOf([{
    name: 'core',
    files: ['src/order.workflow.ts', 'src/a,b.workflow.ts', 'src/page[1].workflow.ts'],
  }])
  assertEquals(await planMutationShards(root), {
    shards: [],
    refusals: [
      { _tag: 'UnsafeWorkflowPath', dir: 'packages/core', path: 'src/a,b.workflow.ts' },
      { _tag: 'UnsafeWorkflowPath', dir: 'packages/core', path: 'src/page[1].workflow.ts' },
    ],
  })
})
