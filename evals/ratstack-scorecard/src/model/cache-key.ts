import type { Family } from './cell.ts'

export interface RatstackCacheInputs {
  readonly family: Family
  readonly ratstackCommit: string
  readonly instrumentHash: string
  readonly nixpkgsRev: string
}

export const ratstackCacheKey = (inputs: RatstackCacheInputs): string =>
  [
    'scorecard-ratstack',
    inputs.family,
    `rat-stack=${inputs.ratstackCommit}`,
    `instrument=${inputs.instrumentHash}`,
    `nixpkgs=${inputs.nixpkgsRev}`,
  ].join('/')
