import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Result, Schema as S } from 'effect'
import { type Citation, CitationBase } from './cell.schema.ts'

const CitationCheckTypeId: unique symbol = Symbol.for('@starter/ratstack-scorecard/CitationCheck')

export class VerifyCitation extends S.TaggedClass<VerifyCitation>()('VerifyCitation', {
  citation: CitationBase,
  source: S.String,
}) {
  static readonly [Workflow.InstrumentationBrand] = { source: 'app.scorecard.citation.source' } as const
}

class Verified extends S.TaggedClass<Verified>()('Verified', {}) {
  readonly [CitationCheckTypeId] = CitationCheckTypeId
}

class Contradicted extends S.TaggedClass<Contradicted>()('Contradicted', { found: S.String }) {
  readonly [CitationCheckTypeId] = CitationCheckTypeId
}

const normalized = (text: string): string => text.replace(/\s+/gu, ' ').trim()

const citedText = (citation: Citation, source: string): string =>
  normalized(source.split(/\r?\n/u).slice(citation.lines[0] - 1, citation.lines[1]).join('\n'))

const citationCheck = (citation: Citation, source: string): Verified | Contradicted => {
  const cited = citedText(citation, source)
  return Match.value(cited.includes(normalized(citation.text))).pipe(
    Match.when(true, () => new Verified()),
    Match.orElse(() => new Contradicted({ found: cited.slice(0, 200) })),
  )
}

export const verifyCitation = Workflow.make({
  command: VerifyCitation,
  decision: S.Union([Verified, Contradicted]),
  error: S.Never,
  decide: ({ citation, source }) => Result.succeed(citationCheck(citation, source)),
})
