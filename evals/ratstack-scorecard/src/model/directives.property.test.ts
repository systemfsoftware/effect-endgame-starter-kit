import { fc, test } from '@fast-check/vitest'
import { describe } from 'vitest'
import { type DirectiveFamily, directivesIn, totalDirectives, vendoredRootsOf } from './directives.ts'

const directiveText: Readonly<Record<DirectiveFamily, fc.Arbitrary<string>>> = {
  'oxlint': fc.constantFrom('oxlint-disable', 'oxlint-disable-next-line', 'oxlint-disable-line'),
  'effect-diagnostics': fc.constantFrom('@effect-diagnostics', '@effect-diagnostics-next-line'),
  'typescript': fc.constantFrom('@ts-expect-error', '@ts-ignore', '@ts-nocheck'),
  'stryker': fc.constantFrom('Stryker disable', 'Stryker restore'),
  'eslint': fc.constantFrom('eslint-disable', 'eslint-disable-next-line', 'eslint-disable-line'),
  'biome': fc.constantFrom('biome-ignore', 'biome-ignore-all'),
  'dprint': fc.constantFrom('dprint-ignore', 'dprint-ignore-file'),
  'deno-lint': fc.constantFrom('deno-lint-ignore', 'deno-lint-ignore-file'),
  'coverage': fc.constantFrom('c8 ignore', 'istanbul ignore', 'v8 ignore'),
}

const family = fc.constantFrom<DirectiveFamily>(
  'oxlint',
  'effect-diagnostics',
  'typescript',
  'stryker',
  'eslint',
  'biome',
  'dprint',
  'deno-lint',
  'coverage',
)

const punctuation = fc.stringMatching(/^[0-9 ,.:;()*]{0,40}$/)

describe('directivesIn', () => {
  test.prop([family.chain((f) => fc.tuple(fc.constant(f), directiveText[f])), punctuation, punctuation])(
    'a comment carrying one directive counts once in its own family and nowhere else',
    ([f, directive], before, after) => {
      const tally = directivesIn(`${before} ${directive} ${after}`)
      return tally[f] === 1 && totalDirectives(tally) === 1
    },
  )
})

describe('vendoredRootsOf', () => {
  test.prop([
    fc.stringMatching(/^[a-z]{1,8}(\/[a-z]{1,8}){0,2}\/$/),
    fc.stringMatching(/^[a-z]{1,8}(\/[a-z]{1,8}){0,2}$/),
    fc.stringMatching(/^\.[a-z]{1,4}$/),
  ])(
    'a path under a declared root is excluded by that root, whatever its extension',
    (root, rest, extension) => vendoredRootsOf(`${root}${rest}${extension}`, [root]).length === 1,
  )
})
