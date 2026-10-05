import { fc, test } from '@fast-check/vitest'
import { describe } from 'vitest'
import { verifyCitation } from './verify-citation.workflow.ts'

const line = fc.stringMatching(/^[a-z ]{0,40}$/)
const claim = fc.stringMatching(/^[A-Z][A-Z ]{8,30}[A-Z]$/)

const fileWith = (lines: readonly string[], at: number, text: string): string =>
  [...lines.slice(0, at), text, ...lines.slice(at)].join('\n')

const checkAt = (source: string, text: string, line: number) =>
  verifyCitation({ citation: { file: 'f.ts', lines: [line, line], text }, source })._tag

describe('verifyCitation', () => {
  test.prop([fc.array(line, { minLength: 2, maxLength: 30 }), claim, fc.nat()])(
    'a citation verifies on the line holding the text and is contradicted one line either side',
    (lines, text, seed) => {
      const at = 1 + (seed % (lines.length - 1))
      const source = fileWith(lines, at, text)
      const cited = at + 1
      return checkAt(source, text, cited) === 'Verified' &&
        checkAt(source, text, cited - 1) === 'Contradicted' &&
        checkAt(source, text, cited + 1) === 'Contradicted'
    },
  )
})
