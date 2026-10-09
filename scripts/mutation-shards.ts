#!/usr/bin/env -S deno run --config=scripts/deno.json --allow-read --allow-write --allow-import=jsr.io

import { parseArgs } from '@std/cli/parse-args'
import { expandGlob } from '@std/fs/expand-glob'
import { dirname, join, relative } from '@std/path'
import { parse } from '@std/yaml'

import { packageStrykerConfig, WORKFLOW_FILES } from '../stryker.shared.ts'

type Manifest = { name?: string; scripts?: Record<string, string>; stryker?: { mutate?: unknown } }

export type Shard = { readonly package: string; readonly mutate: string[] }

export type Refusal =
  | { readonly _tag: 'OwnMutate'; readonly dir: string; readonly mutate: unknown }
  | { readonly _tag: 'MutationScriptNotStrykerRun'; readonly dir: string; readonly script: string }
  | { readonly _tag: 'NoWorkflowFiles'; readonly dir: string }
  | { readonly _tag: 'WorkflowFilesNotMutated'; readonly dir: string; readonly workflows: number }
  | { readonly _tag: 'UnsafeWorkflowPath'; readonly dir: string; readonly path: string }
  | { readonly _tag: 'NoWorkflowFilesInWorkspace' }

export type ShardPlan = { readonly shards: Shard[]; readonly refusals: Refusal[] }

const STRYKER_RUN = 'stryker run'

const UNSAFE_PATH = /[,*?[\]{}()!\\]/

const IGNORED_DIRS = [...(packageStrykerConfig.ignorePatterns ?? []), 'node_modules', '.stryker-tmp']

export const describeRefusal = (refusal: Refusal): string => {
  switch (refusal._tag) {
    case 'OwnMutate':
      return `${refusal.dir}: sets its own stryker.mutate ${
        JSON.stringify(refusal.mutate)
      }; the release gate mutates exactly the package's ${WORKFLOW_FILES} files`
    case 'MutationScriptNotStrykerRun':
      return `${refusal.dir}: the mutation script is ${
        JSON.stringify(refusal.script)
      }, not exactly "${STRYKER_RUN}"; the release gate passes the mutated files itself`
    case 'NoWorkflowFiles':
      return `${refusal.dir}: declares a mutation script but has no ${WORKFLOW_FILES} file`
    case 'WorkflowFilesNotMutated':
      return `${refusal.dir}: has ${refusal.workflows} ${WORKFLOW_FILES} file(s) but no package name or \`mutation\` script to mutate them`
    case 'UnsafeWorkflowPath':
      return `${refusal.dir}: ${
        JSON.stringify(refusal.path)
      } holds a comma or glob metacharacter, so the --mutate list would split or expand it; rename the file`
    case 'NoWorkflowFilesInWorkspace':
      return `no workspace package has a ${WORKFLOW_FILES} file; the release gate refuses an empty set`
  }
}

const workflowFilesOf = async (dir: string): Promise<string[]> => {
  const files: string[] = []
  const walk = expandGlob(WORKFLOW_FILES, {
    root: dir,
    exclude: IGNORED_DIRS.map((ignored) => `**/${ignored}/**`),
    includeDirs: false,
  })
  for await (const entry of walk) files.push(relative(dir, entry.path))
  return files.sort()
}

export const planMutationShards = async (root: string): Promise<ShardPlan> => {
  const workspace = parse(await Deno.readTextFile(join(root, 'pnpm-workspace.yaml'))) as { packages?: string[] }
  const shards: Shard[] = []
  const refusals: Refusal[] = []
  let workflows = 0
  for (const glob of workspace.packages ?? []) {
    for await (const entry of expandGlob(join(glob, 'package.json'), { root, exclude: ['**/node_modules/**'] })) {
      const packageDir = dirname(entry.path)
      const dir = relative(root, packageDir)
      const files = await workflowFilesOf(packageDir)
      workflows += files.length
      const manifest = JSON.parse(await Deno.readTextFile(entry.path)) as Manifest
      if (manifest.stryker?.mutate !== undefined) {
        refusals.push({ _tag: 'OwnMutate', dir, mutate: manifest.stryker.mutate })
      }
      const script = manifest.scripts?.mutation
      if (manifest.name === undefined || script === undefined) {
        if (files.length > 0) refusals.push({ _tag: 'WorkflowFilesNotMutated', dir, workflows: files.length })
      } else if (script !== STRYKER_RUN) {
        refusals.push({ _tag: 'MutationScriptNotStrykerRun', dir, script })
      } else if (files.length === 0) {
        refusals.push({ _tag: 'NoWorkflowFiles', dir })
      } else if (files.some((path) => UNSAFE_PATH.test(path))) {
        for (const path of files.filter((path) => UNSAFE_PATH.test(path))) {
          refusals.push({ _tag: 'UnsafeWorkflowPath', dir, path })
        }
      } else {
        shards.push({ package: manifest.name, mutate: files })
      }
    }
  }
  if (workflows === 0) return { shards: [], refusals: [{ _tag: 'NoWorkflowFilesInWorkspace' }] }
  return { shards: shards.sort((a, b) => a.package.localeCompare(b.package)), refusals }
}

if (import.meta.main) {
  const { output, root = '.' } = parseArgs(Deno.args, { string: ['output', 'root'] })
  const plan = await planMutationShards(root)
  if (plan.refusals.length > 0) {
    for (const refusal of plan.refusals) console.error(`mutation-shards: ${describeRefusal(refusal)}`)
    Deno.exit(1)
  }
  const line = `shards=${JSON.stringify(plan.shards)}`
  console.error(`mutation-shards: ${line}`)
  if (output) await Deno.writeTextFile(output, `${line}\n`, { append: true })
  else console.log(line)
}
