import { fc, test } from '@fast-check/vitest'
import { Result } from 'effect'
import { VerifyCitation, verifyCitation } from '../verify-citation.workflow.ts'

const line = fc.stringMatching(/^[a-z ]{0,40}$/)
const claim = fc.stringMatching(/^[A-Z][A-Z ]{8,30}[A-Z]$/)

const fileWith = (lines: readonly string[], at: number, text: string): string =>
  [...lines.slice(0, at), text, ...lines.slice(at)].join('\n')

const tagAt = (source: string, text: string, line: number): string =>
  Result.getOrThrow(
    verifyCitation(new VerifyCitation({ citation: { file: 'f.ts', lines: [line, line], text }, source })),
  )._tag

test.prop([fc.array(line, { minLength: 2, maxLength: 30 }), claim, fc.nat()])(
  'a citation verifies on the line holding the text and is contradicted one line either side',
  (lines, text, seed) => {
    const at = 1 + (seed % (lines.length - 1))
    const source = fileWith(lines, at, text)
    const cited = at + 1
    return tagAt(source, text, cited) === 'Verified' &&
      tagAt(source, text, cited - 1) === 'Contradicted' &&
      tagAt(source, text, cited + 1) === 'Contradicted'
  },
)
