import type { Citation, CitationCheck } from './cell.ts'
import { firstRule } from './dispatch.ts'

export interface VerifyCitationInput {
  readonly citation: Citation
  readonly source: string
}

const normalized = (text: string): string => text.replace(/\s+/gu, ' ').trim()

export const verifyCitation = (input: VerifyCitationInput): CitationCheck => {
  const cited = normalized(
    input.source.split(/\r?\n/u).slice(input.citation.lines[0] - 1, input.citation.lines[1]).join('\n'),
  )
  return firstRule<CitationCheck>(
    [[cited.includes(normalized(input.citation.text)), () => ({ _tag: 'Verified' })]],
    () => ({ _tag: 'Contradicted', found: cited.slice(0, 200) }),
  )
}
