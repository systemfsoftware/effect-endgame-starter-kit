import type { SideAdapter } from './side-adapter.ts'

export const starter: SideAdapter = {
  side: 'starter',
  lockfile: 'pnpm-lock.yaml',
  vendored: [
    { root: 'repos/', reason: 'git subtrees vendored from other repositories (subtrees.toml)' },
    { root: 'evals/', reason: 'the scorecard instrument itself, which grades the starter and is not starter code' },
  ],
}
