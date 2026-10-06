import { compile } from '@mdx-js/mdx'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

export const README_OPENING_ID = 'virtual:readme-opening'
export const README_HOME_START = '<!-- home:start -->'
export const README_HOME_END = '<!-- home:end -->'

const RESOLVED_ID = `\0${README_OPENING_ID}`

export interface HomeMarkerProblem {
  readonly line: number
  readonly detail: string
}

const lineNumberAt = (readme: string, index: number): number => readme.slice(0, index).split('\n').length

const indicesOf = (readme: string, marker: string): ReadonlyArray<number> => {
  const indices: Array<number> = []
  let from = readme.indexOf(marker)
  while (from !== -1) {
    indices.push(from)
    from = readme.indexOf(marker, from + marker.length)
  }
  return indices
}

const insideCodeFence = (readme: string, index: number): boolean =>
  readme.slice(0, index).split('\n').filter((line) => line.trimStart().startsWith('```')).length % 2 === 1

const markerProblems = (
  readme: string,
  marker: string,
  kind: string,
  indices: ReadonlyArray<number>,
): ReadonlyArray<HomeMarkerProblem> => {
  const [first = 0, second = first] = indices
  const countProblems = indices.length === 1
    ? []
    : [{
      line: indices.length === 0 ? 1 : lineNumberAt(readme, second),
      detail: `expected exactly one ${kind} marker (${marker}), found ${indices.length}`,
    }]
  const fenceProblems = indices
    .filter((index) => insideCodeFence(readme, index))
    .map((index) => ({
      line: lineNumberAt(readme, index),
      detail: `${kind} marker (${marker}) is inside a code fence`,
    }))
  return [...countProblems, ...fenceProblems]
}

export const homeMarkerProblemsOf = (readme: string): ReadonlyArray<HomeMarkerProblem> => {
  const starts = indicesOf(readme, README_HOME_START)
  const ends = indicesOf(readme, README_HOME_END)
  const [firstStart = 0] = starts
  const [firstEnd = 0] = ends
  const orderProblem = starts.length === 1 && ends.length === 1 && firstEnd < firstStart
    ? [{
      line: lineNumberAt(readme, firstEnd),
      detail: `${README_HOME_END} appears before ${README_HOME_START}`,
    }]
    : []
  return [
    ...markerProblems(readme, README_HOME_START, 'home start', starts),
    ...markerProblems(readme, README_HOME_END, 'home end', ends),
    ...orderProblem,
  ]
}

export const assertHomeMarkers = (readme: string): void => {
  const problems = homeMarkerProblemsOf(readme)
  if (problems.length > 0) {
    const lines = problems.map((problem) => `README.md:${problem.line}: ${problem.detail}`).join('\n')
    throw new Error(`the README home markers are invalid:\n${lines}`)
  }
}

export const homeOpeningOf = (readme: string): string => {
  const start = readme.indexOf(README_HOME_START)
  const end = readme.indexOf(README_HOME_END)
  return start === -1 || end === -1 || end < start
    ? ''
    : readme.slice(start + README_HOME_START.length, end).trim()
}

const readmeBodyOf = (compiled: { readonly value: string | Uint8Array | undefined }): string => {
  const value = compiled.value
  return typeof value === 'string' ? value : new TextDecoder().decode(value)
}

export const readmeOpening = (options?: { readonly readme?: string }): Plugin => ({
  name: 'readme-opening',
  enforce: 'pre',
  resolveId(id) {
    return id === README_OPENING_ID ? RESOLVED_ID : null
  },
  async load(id) {
    if (id !== RESOLVED_ID) return null
    const source = options?.readme ?? readFileSync(fileURLToPath(new URL('../../README.md', import.meta.url)), 'utf8')
    assertHomeMarkers(source)
    const markdown = homeOpeningOf(source)
    const compiled = await compile(markdown, { format: 'md' })
    return `${readmeBodyOf(compiled)}\nexport const markdown = ${JSON.stringify(markdown)}\n`
  },
})
