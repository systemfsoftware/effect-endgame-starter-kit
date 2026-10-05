import type { SideAdapter } from './side-adapter.ts'

export const ratstack: SideAdapter = {
  side: 'ratstack',
  lockfile: 'pnpm-lock.yaml',
  vendored: [
    {
      root: 'tools/oxlint/anti-slop/',
      reason: 'copied from dmmulroy/anti-slop (tools/oxlint/anti-slop/UPSTREAM.md); rat-stack’s own ledger excludes it',
    },
    { root: 'vendor/', reason: 'vendored dependency sources (vendor/README.md); rat-stack’s own ledger excludes it' },
  ],
}
