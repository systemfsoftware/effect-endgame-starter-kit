import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import { Accept, type AcceptPreferences, PathRoute } from './serve-page.schema'

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

export class ServePageCommand extends S.Class<ServePageCommand>('ServePageCommand')({
  path: PathRoute,
  accept: Accept,
  origin: S.String,
}) {
  static readonly [Workflow.InstrumentationBrand]: { readonly path: 'app.front_door.route' } = {
    path: 'app.front_door.route',
  }
}

const qOf = (preferences: AcceptPreferences, pattern: string): Option.Option<number> =>
  Option.map(
    Arr.findFirst(preferences, (preference) => preference.pattern === pattern),
    (preference) => preference.q,
  )

const effectiveQOf = (preferences: AcceptPreferences, media: string): number => {
  const major = media.slice(0, media.indexOf('/'))
  return Option.getOrElse(
    Option.orElse(
      Option.orElse(qOf(preferences, media), () => qOf(preferences, `${major}/*`)),
      () => qOf(preferences, '*/*'),
    ),
    () => 0,
  )
}

const htmlWinsOf = (preferences: AcceptPreferences): boolean =>
  effectiveQOf(preferences, 'text/html') > effectiveQOf(preferences, 'text/markdown')

const pageOf = (preferences: AcceptPreferences): ServeMarkdownPage | ServeHtmlPage =>
  Match.value(htmlWinsOf(preferences)).pipe(
    Match.when(true, () => new ServeHtmlPage({})),
    Match.when(false, () => new ServeMarkdownPage({})),
    Match.exhaustive,
  )

const notFoundOf = (preferences: AcceptPreferences): ServeMarkdownNotFound | ServeHtmlPage =>
  Match.value(htmlWinsOf(preferences)).pipe(
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
