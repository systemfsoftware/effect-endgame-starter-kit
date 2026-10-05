export type DirectiveFamily =
  | 'oxlint'
  | 'effect-diagnostics'
  | 'typescript'
  | 'stryker'
  | 'eslint'
  | 'biome'
  | 'dprint'
  | 'deno-lint'
  | 'coverage'

export type DirectiveTally = Readonly<Record<DirectiveFamily, number>>

const patterns: Readonly<Record<DirectiveFamily, RegExp>> = {
  'oxlint': /\boxlint-disable(?:-[a-z-]+)?\b/gu,
  'effect-diagnostics': /@effect-diagnostics(?:-next-line)?\b/gu,
  'typescript': /@ts-(?:expect-error|ignore|nocheck)\b/gu,
  'stryker': /\bStryker (?:disable|restore)\b/gu,
  'eslint': /\beslint-disable(?:-[a-z-]+)?\b/gu,
  'biome': /\bbiome-ignore(?:-[a-z-]+)?\b/gu,
  'dprint': /\bdprint-ignore(?:-[a-z-]+)?\b/gu,
  'deno-lint': /\bdeno-lint-ignore(?:-file)?\b/gu,
  'coverage': /\b(?:c8|istanbul|v8) ignore\b/gu,
}

const tallyOf = (count: (family: DirectiveFamily) => number): DirectiveTally => ({
  'oxlint': count('oxlint'),
  'effect-diagnostics': count('effect-diagnostics'),
  'typescript': count('typescript'),
  'stryker': count('stryker'),
  'eslint': count('eslint'),
  'biome': count('biome'),
  'dprint': count('dprint'),
  'deno-lint': count('deno-lint'),
  'coverage': count('coverage'),
})

export const directivesIn = (comment: string): DirectiveTally =>
  tallyOf((family) => [...comment.matchAll(patterns[family])].length)

export const tallyDirectives = (comments: readonly string[]): DirectiveTally =>
  comments.map(directivesIn).reduce((sum, next) => tallyOf((family) => sum[family] + next[family]), tallyOf(() => 0))

export const totalDirectives = (tally: DirectiveTally): number =>
  Object.values(tally).reduce((sum, count) => sum + count, 0)

export const isSourceFile = (path: string): boolean => /\.[cm]?[jt]sx?$/u.test(path)

export const vendoredRootsOf = (path: string, roots: readonly string[]): readonly string[] =>
  roots.filter((root) => path.startsWith(root))
