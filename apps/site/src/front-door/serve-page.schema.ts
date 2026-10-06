import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as S from 'effect/Schema'
import * as SchemaGetter from 'effect/SchemaGetter'

export const Route = S.Literals(['home', 'llms_txt', 'unknown'])
export type Route = S.Schema.Type<typeof Route>

export const Origin = S.String.pipe(S.check(S.isPattern(/^https?:\/\/[^\s/()]+$/)), S.brand('Origin'))
export type Origin = S.Schema.Type<typeof Origin>

export class PageFailure extends S.TaggedError<PageFailure>()('PageFailure', { detail: S.String }) {
  override get message(): string {
    return `the front door failed: ${this.detail}`
  }
}

export interface RouteSpec {
  readonly path: `/${string}`
  readonly llms: { readonly title: string } | null
}

export type RouteTable = { readonly [R in Route]: RouteSpec }

export const ROUTES: RouteTable = {
  home: { path: '/', llms: { title: 'Endgame Starter' } },
  llms_txt: { path: '/llms.txt', llms: null },
  unknown: { path: '/not-a-page', llms: null },
}

export interface LlmsCatalogEntry {
  readonly title: string
  readonly path: string
}

export type HomeCatalog = ReadonlyArray<LlmsCatalogEntry>

export const HOME_CATALOG: HomeCatalog = Arr.flatMap(Route.literals, (route) => {
  const spec = ROUTES[route]
  return spec.llms === null ? [] : [{ title: spec.llms.title, path: spec.path }]
})

export const MediaRange = S.Literals(['text/html', 'text/markdown', 'text/*', '*/*'])
export type MediaRange = S.Schema.Type<typeof MediaRange>

export const MediaPreference = S.Struct({
  pattern: MediaRange,
  q: S.Finite.pipe(S.check(S.isBetween({ minimum: 0, maximum: 1 }))),
})
export type MediaPreference = S.Schema.Type<typeof MediaPreference>

export const AcceptPreferences = S.Array(MediaPreference)
export type AcceptPreferences = S.Schema.Type<typeof AcceptPreferences>

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

export const prefersHtml = (preferences: AcceptPreferences): boolean =>
  effectiveQOf(preferences, 'text/html') > effectiveQOf(preferences, 'text/markdown')

export const routeOf = (pathname: string): Route =>
  Option.getOrElse(
    Arr.findFirst(Route.literals, (route) => ROUTES[route].path === pathname),
    (): Route => 'unknown',
  )

export const formatPath = (route: Route): string => ROUTES[route].path

export const PathRoute = S.String.pipe(
  S.decodeTo(Route, {
    decode: SchemaGetter.transform((path: string): Route => routeOf(path)),
    encode: SchemaGetter.transform((route: Route): string => formatPath(route)),
  }),
)

const normalizeRange = (token: string): Option.Option<MediaRange> =>
  Match.value(token.trim().toLowerCase()).pipe(
    Match.when('text/html', (): Option.Option<MediaRange> => Option.some('text/html')),
    Match.when('text/markdown', (): Option.Option<MediaRange> => Option.some('text/markdown')),
    Match.when('text/*', (): Option.Option<MediaRange> => Option.some('text/*')),
    Match.when('*/*', (): Option.Option<MediaRange> => Option.some('*/*')),
    Match.orElse((): Option.Option<MediaRange> => Option.none()),
  )

const qParamOf = (params: ReadonlyArray<string>): Option.Option<string> =>
  Arr.findFirst(params, (param) => param.trim().toLowerCase().startsWith('q='))

const qOfParams = (params: ReadonlyArray<string>): Option.Option<number> =>
  Option.match(qParamOf(params), {
    onNone: () => Option.some(1),
    onSome: (param) => {
      const raw = param.slice(param.indexOf('=') + 1)
      const parsed = Number(raw)
      return Number.isFinite(parsed) ? Option.some(parsed) : Option.none()
    },
  })

const preferenceOf = (item: string): Option.Option<MediaPreference> => {
  const [rawRange = '', ...params] = item.split(';')
  return Option.flatMap(normalizeRange(rawRange), (pattern) => Option.map(qOfParams(params), (q) => ({ pattern, q })))
}

export const parseAccept = (header: string): AcceptPreferences => Arr.getSomes(Arr.map(header.split(','), preferenceOf))

const formatQ = (q: number): string => Object.is(q, -0) ? '-0' : `${q}`

export const formatPreference = (preference: MediaPreference): string =>
  preference.q === 1 ? preference.pattern : `${preference.pattern};q=${formatQ(preference.q)}`

export const formatAccept = (preferences: AcceptPreferences): string =>
  Arr.join(Arr.map(preferences, formatPreference), ', ')

export const Accept = S.String.pipe(
  S.decodeTo(AcceptPreferences, {
    decode: SchemaGetter.transform((header: string): AcceptPreferences => parseAccept(header)),
    encode: SchemaGetter.transform((preferences: AcceptPreferences): string => formatAccept(preferences)),
  }),
)
