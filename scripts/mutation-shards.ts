#!/usr/bin/env -S deno run --config=scripts/deno.json --allow-read --allow-write --allow-import=jsr.io

import { parseArgs } from '@std/cli/parse-args'
import { expandGlob } from '@std/fs/expand-glob'
import { join } from '@std/path'
import { parse } from '@std/yaml'

type Manifest = { name?: string; scripts?: Record<string, string> }

const { output, root = '.' } = parseArgs(Deno.args, { string: ['output', 'root'] })

const workspace = parse(await Deno.readTextFile(join(root, 'pnpm-workspace.yaml'))) as {
  packages?: string[]
}

const shards: string[] = []
for (const glob of workspace.packages ?? []) {
  for await (const entry of expandGlob(join(glob, 'package.json'), { root, exclude: ['**/node_modules/**'] })) {
    const manifest = JSON.parse(await Deno.readTextFile(entry.path)) as Manifest
    if (manifest.name !== undefined && manifest.scripts?.mutation !== undefined) shards.push(manifest.name)
  }
}

if (shards.length === 0) {
  console.error(
    'mutation-shards: no workspace package declares a `mutation` script; the release gate refuses an empty set',
  )
  Deno.exit(1)
}

const line = `packages=${JSON.stringify(shards.sort())}`
console.error(`mutation-shards: ${line}`)
if (output) await Deno.writeTextFile(output, `${line}\n`, { append: true })
else console.log(line)
