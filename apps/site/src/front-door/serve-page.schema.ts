import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as S from 'effect/Schema'
import * as SchemaGetter from 'effect/SchemaGetter'

export const Route = S.Literals(['home', 'llms_txt', 'unknown'])
export type Route = S.Schema.Type<typeof Route>

export const MediaRange = S.Literals(['text/html', 'text/markdown', 'text/*', '*/*'])
export type MediaRange = S.Schema.Type<typeof MediaRange>

export const MediaPreference = S.Struct({
  pattern: MediaRange,
  q: S.Finite.pipe(S.check(S.isBetween({ minimum: 0, maximum: 1 }))),
})
export type MediaPreference = S.Schema.Type<typeof MediaPreference>

export const AcceptPreferences = S.Array(MediaPreference)
export type AcceptPreferences = S.Schema.Type<typeof AcceptPreferences>

export const routeOf = (pathname: string): Route =>
  Match.value(pathname).pipe(
    Match.when('/', (): Route => 'home'),
    Match.when('/llms.txt', (): Route => 'llms_txt'),
    Match.orElse((): Route => 'unknown'),
  )

export const formatPath = (route: Route): string =>
  Match.value(route).pipe(
    Match.when('home', () => '/'),
    Match.when('llms_txt', () => '/llms.txt'),
    Match.when('unknown', () => '/not-a-page'),
    Match.exhaustive,
  )

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
