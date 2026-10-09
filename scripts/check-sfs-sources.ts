#!/usr/bin/env -S deno run --config=scripts/deno.json --allow-read=pnpm-lock.yaml --allow-import=jsr.io
import { parseAll } from '@std/yaml'

const SCOPE = '@systemfsoftware/'

const packageKeysOf = (document: unknown): readonly string[] => {
  if (typeof document !== 'object' || document === null) throw new Error('pnpm-lock.yaml holds a non-map document')
  if (!('packages' in document)) return []
  const { packages } = document
  if (typeof packages !== 'object' || packages === null) throw new Error('pnpm-lock.yaml packages is not a map')
  return Object.keys(packages)
}

const resolutionOf = (key: string): string => key.slice(key.indexOf('@', SCOPE.length) + 1)

const keys = parseAll(await Deno.readTextFile('pnpm-lock.yaml'))
  .flatMap(packageKeysOf)
  .filter((key) => key.startsWith(SCOPE))
const fromRegistry = keys.filter((key) => !resolutionOf(key).startsWith('file:'))

if (keys.length === 0) {
  console.error('check-sfs-sources: pnpm-lock.yaml lists no @systemfsoftware/* package, so there is nothing to certify')
  Deno.exit(1)
}
if (fromRegistry.length > 0) {
  console.error(
    `check-sfs-sources: ${fromRegistry.length} @systemfsoftware/* package(s) resolve from the npm registry, not from the .sfs-deps tarballs our flake inputs build:\n${
      fromRegistry.map((key) => `  ${key}`).join('\n')
    }`,
  )
  Deno.exit(1)
}
console.log(
  `check-sfs-sources: all ${keys.length} @systemfsoftware/* packages resolve from the .sfs-deps tarballs our flake inputs build`,
)
