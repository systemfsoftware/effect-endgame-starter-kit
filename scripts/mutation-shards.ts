#!/usr/bin/env -S deno run --config=scripts/deno.json --allow-read --allow-write --allow-import=jsr.io

import { parseArgs } from '@std/cli/parse-args'
import { expandGlob } from '@std/fs/expand-glob'
import { dirname, join, relative } from '@std/path'
import { parse } from '@std/yaml'

type Manifest = { name?: string; scripts?: Record<string, string>; stryker?: { mutate?: string[] } }

export type ShardPlan = { readonly packages: string[]; readonly refusals: string[]; readonly decisions: number }

const DECISIONS = ['**/*.workflow.ts', '!**/.stryker-tmp/**']

const matchedFileCount = async (dir: string, mutate: string[]): Promise<number> => {
  const exclude = ['**/node_modules/**', ...mutate.filter((glob) => glob.startsWith('!')).map((glob) => glob.slice(1))]
  let count = 0
  for (const glob of mutate.filter((glob) => !glob.startsWith('!'))) {
    for await (const _ of expandGlob(glob, { root: dir, exclude, includeDirs: false })) count++
  }
  return count
}

export const planMutationShards = async (root: string): Promise<ShardPlan> => {
  const workspace = parse(await Deno.readTextFile(join(root, 'pnpm-workspace.yaml'))) as { packages?: string[] }
  const packages: string[] = []
  const refusals: string[] = []
  let decisions = 0
  for (const glob of workspace.packages ?? []) {
    for await (const entry of expandGlob(join(glob, 'package.json'), { root, exclude: ['**/node_modules/**'] })) {
      decisions += await matchedFileCount(dirname(entry.path), DECISIONS)
      const manifest = JSON.parse(await Deno.readTextFile(entry.path)) as Manifest
      if (manifest.name === undefined || manifest.scripts?.mutation === undefined) continue
      const mutate = manifest.stryker?.mutate ?? []
      if (await matchedFileCount(dirname(entry.path), mutate) === 0) {
        refusals.push(
          `${manifest.name} (${relative(root, dirname(entry.path))}): stryker.mutate ${
            JSON.stringify(mutate)
          } matches no files`,
        )
      } else {
        packages.push(manifest.name)
      }
    }
  }
  if (decisions === 0) return { packages: [], refusals: [], decisions }
  if (packages.length === 0 && refusals.length === 0) {
    refusals.push(
      `${decisions} *.workflow.ts file(s) but no workspace package declares a \`mutation\` script; the release gate refuses an empty set`,
    )
  }
  return { packages: packages.sort(), refusals, decisions }
}

if (import.meta.main) {
  const { output, root = '.' } = parseArgs(Deno.args, { string: ['output', 'root'] })
  const plan = await planMutationShards(root)
  if (plan.refusals.length > 0) {
    for (const refusal of plan.refusals) console.error(`mutation-shards: ${refusal}`)
    Deno.exit(1)
  }
  if (plan.decisions === 0) {
    console.log('::notice title=Release gate::No decisions to mutate: no workspace package has a *.workflow.ts file.')
  }
  const line = `packages=${JSON.stringify(plan.packages)}`
  console.error(`mutation-shards: ${line}`)
  if (output) await Deno.writeTextFile(output, `${line}\n`, { append: true })
  else console.log(line)
}
