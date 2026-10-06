import { NodeServices } from '@effect/platform-node'
import { type RatstackCacheInputs, ratstackCacheKey } from '@starter/ratstack-scorecard'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'

const Feature = makeFeature({ it })

const base: RatstackCacheInputs = {
  family: 'static',
  ratstackCommit: 'a'.repeat(40),
  instrumentHash: 'b'.repeat(40),
  nixpkgsRev: 'c'.repeat(40),
}

const fields = ['family', 'ratstackCommit', 'instrumentHash', 'nixpkgsRev'] as const

const variants: Readonly<Record<(typeof fields)[number], RatstackCacheInputs>> = {
  family: { ...base, family: 'cold-path' },
  ratstackCommit: { ...base, ratstackCommit: 'd'.repeat(40) },
  instrumentHash: { ...base, instrumentHash: 'e'.repeat(40) },
  nixpkgsRev: { ...base, nixpkgsRev: 'f'.repeat(40) },
}

const comparisons = (): readonly { readonly field: string; readonly moved: boolean; readonly same: boolean }[] =>
  fields.map((field) => ({
    field,
    moved: ratstackCacheKey(base) !== ratstackCacheKey(variants[field]),
    same: ratstackCacheKey(base) === ratstackCacheKey({ ...base }),
  }))

Feature('Deriving the rat-stack cache key')
  .withScenarioLayer(NodeServices.layer)
  .body(({ scenario }) => {
    scenario(
      'A key moves exactly when the family, the rat-stack commit, the instrument hash or the nixpkgs rev moves',
      Gherkin.Do.pipe(
        Given('one base input and a variant that changes each field')('base', () => Effect.succeed(base)),
        When('every variant is compared with the base')('comparisons', () => Effect.sync(comparisons)),
        Then('each changed field moves the key and an unchanged input does not')((scope, expect) =>
          expect(scope.comparisons).toEqual(fields.map((field) => ({ field, moved: true, same: true })))
        ),
      ),
    )
  })
