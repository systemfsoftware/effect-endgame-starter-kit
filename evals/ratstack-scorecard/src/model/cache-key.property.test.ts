import { fc, test } from '@fast-check/vitest'
import { describe } from 'vitest'
import { ratstackCacheKey } from './cache-key.ts'
import { sha } from './scorecard.arbitrary.ts'

const family = fc.constantFrom(
  'static' as const,
  'cold-path' as const,
  'gate-mutation' as const,
  'running-stack' as const,
  'agent-surfaces' as const,
  'networked' as const,
)

const inputs = fc.record({ family, ratstackCommit: sha, instrumentHash: sha, nixpkgsRev: sha })

describe('ratstackCacheKey', () => {
  test.prop([inputs, fc.constantFrom('family', 'ratstackCommit', 'instrumentHash', 'nixpkgsRev' as const), inputs])(
    'a key moves exactly when the family, the rat-stack commit, the instrument hash or the nixpkgs rev moves',
    (base, field, other) => {
      const changed = { ...base, [field]: other[field] }
      return (ratstackCacheKey(base) === ratstackCacheKey(changed)) === (base[field] === other[field])
    },
  )
})
