import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

const LlmsTxtTypeId: unique symbol = Symbol.for('endgame/site/LlmsTxtDecision')

export const LlmsPage = S.Struct({
  title: S.String.pipe(S.check(S.isPattern(/^[^[\]\r\n]+$/))),
  path: S.String.pipe(S.check(S.isPattern(/^\/[^\s()]*$/))),
})
export type LlmsPage = S.Schema.Type<typeof LlmsPage>

export class LlmsTxtWithPages extends S.TaggedClass<LlmsTxtWithPages>()('LlmsTxtWithPages', { document: S.String }) {
  readonly [LlmsTxtTypeId] = LlmsTxtTypeId
}

export class LlmsTxtWithoutPages extends S.TaggedClass<LlmsTxtWithoutPages>()('LlmsTxtWithoutPages', {
  document: S.String,
}) {
  readonly [LlmsTxtTypeId] = LlmsTxtTypeId
}

export const LlmsTxtDecision = S.Union([LlmsTxtWithPages, LlmsTxtWithoutPages])

export class LlmsTxtCommand extends S.Class<LlmsTxtCommand>('LlmsTxtCommand')({
  origin: S.String.pipe(S.check(S.isPattern(/^https?:\/\/[^\s/()]+$/))),
  pages: S.Array(LlmsPage),
}) {
  static readonly [Workflow.InstrumentationBrand]: { readonly origin: 'app.front_door.origin' } = {
    origin: 'app.front_door.origin',
  }
}

const linkLineOf = (origin: string, page: LlmsPage): string => `- [${page.title}](${origin}${page.path})`

const documentOf = (origin: string, pages: ReadonlyArray<LlmsPage>): string =>
  Arr.join([
    '# Endgame Starter',
    '',
    "> One Worker serving the starter's home page as Markdown to agents and HTML to browsers.",
    '',
    Arr.join(Arr.map(Arr.dedupe(pages), (page) => linkLineOf(origin, page)), '\n'),
    '',
  ], '\n')

export const llmsTxt = Workflow.make({
  command: LlmsTxtCommand,
  decision: LlmsTxtDecision,
  error: S.Never,
  decide: (command) =>
    Match.value(command.pages.length === 0).pipe(
      Match.when(true, () =>
        Result.succeed(new LlmsTxtWithoutPages({ document: documentOf(command.origin, command.pages) }))),
      Match.when(false, () =>
        Result.succeed(new LlmsTxtWithPages({ document: documentOf(command.origin, command.pages) }))),
      Match.exhaustive,
    ),
})
