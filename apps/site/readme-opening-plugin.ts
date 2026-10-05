import { compile } from '@mdx-js/mdx'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

export const README_OPENING_ID = 'virtual:readme-opening'
export const README_HOME_START = '<!-- home:start -->'
export const README_HOME_END = '<!-- home:end -->'

const RESOLVED_ID = `\0${README_OPENING_ID}`

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
    const markdown = homeOpeningOf(source)
    const compiled = await compile(markdown, { format: 'md' })
    return `${readmeBodyOf(compiled)}\nexport const markdown = ${JSON.stringify(markdown)}\n`
  },
})
