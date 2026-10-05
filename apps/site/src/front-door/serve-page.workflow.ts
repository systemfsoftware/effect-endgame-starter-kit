import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import { Accept, type AcceptPreferences, Origin, PathRoute, prefersHtml } from './serve-page.schema.ts'

const ServePageTypeId: unique symbol = Symbol.for('endgame/site/ServePageDecision')

export class ServeMarkdownPage extends S.TaggedClass<ServeMarkdownPage>()('ServeMarkdownPage', {}) {
  readonly [ServePageTypeId] = ServePageTypeId
}

export class ServeHtmlPage extends S.TaggedClass<ServeHtmlPage>()('ServeHtmlPage', {}) {
  readonly [ServePageTypeId] = ServePageTypeId
}

export class ServeLlmsTxt extends S.TaggedClass<ServeLlmsTxt>()('ServeLlmsTxt', {}) {
  readonly [ServePageTypeId] = ServePageTypeId
}

export class ServeMarkdownNotFound extends S.TaggedClass<ServeMarkdownNotFound>()('ServeMarkdownNotFound', {}) {
  readonly [ServePageTypeId] = ServePageTypeId
}

export const ServePageDecision = S.Union([
  ServeMarkdownPage,
  ServeHtmlPage,
  ServeLlmsTxt,
  ServeMarkdownNotFound,
])

type ServePageDecisionTag = S.Schema.Type<typeof ServePageDecision>['_tag']

const decisionTags = {
  ServeMarkdownPage: 'ServeMarkdownPage',
  ServeHtmlPage: 'ServeHtmlPage',
  ServeLlmsTxt: 'ServeLlmsTxt',
  ServeMarkdownNotFound: 'ServeMarkdownNotFound',
} as const satisfies { readonly [K in ServePageDecisionTag]: K }

export const ServePageDecisionTagSchema = S.Literals(Object.values(decisionTags))

export class ServePageCommand extends S.Class<ServePageCommand>('ServePageCommand')({
  path: PathRoute,
  accept: Accept,
  origin: Origin,
}) {
  static readonly [Workflow.InstrumentationBrand]: { readonly path: 'app.front_door.route' } = {
    path: 'app.front_door.route',
  }
}

const pageOf = (preferences: AcceptPreferences): ServeMarkdownPage | ServeHtmlPage =>
  Match.value(prefersHtml(preferences)).pipe(
    Match.when(true, () => new ServeHtmlPage({})),
    Match.when(false, () => new ServeMarkdownPage({})),
    Match.exhaustive,
  )

const notFoundOf = (preferences: AcceptPreferences): ServeMarkdownNotFound | ServeHtmlPage =>
  Match.value(prefersHtml(preferences)).pipe(
    Match.when(true, () => new ServeHtmlPage({})),
    Match.when(false, () => new ServeMarkdownNotFound({})),
    Match.exhaustive,
  )

export const servePage = Workflow.make({
  command: ServePageCommand,
  decision: ServePageDecision,
  error: S.Never,
  decide: (command) =>
    Match.value(command.path).pipe(
      Match.when('llms_txt', () => Result.succeed(new ServeLlmsTxt({}))),
      Match.when('home', () => Result.succeed(pageOf(command.accept))),
      Match.when('unknown', () => Result.succeed(notFoundOf(command.accept))),
      Match.exhaustive,
    ),
})
