import { Config, ConfigProvider, Data, Duration, Effect } from 'effect'
import { HttpClient, HttpClientError, HttpClientRequest } from 'effect/http'

import readmeSource from '../../../../README.md?raw'

const README_HOME_START = '<!-- home:start -->'
const README_HOME_END = '<!-- home:end -->'

const REQUEST_TIMEOUT = Duration.seconds(30)

export const readmeOpening = (): string =>
  readmeSource
    .slice(readmeSource.indexOf(README_HOME_START) + README_HOME_START.length, readmeSource.indexOf(README_HOME_END))
    .trim()

export const readmeH1 = (): string =>
  (readmeOpening().split('\n').find((line) => line.startsWith('# ')) ?? '').replace(/^#\s+/, '')

export class SiteRequestTimedOut extends Data.TaggedError('SiteRequestTimedOut')<{
  readonly url: string
  readonly elapsedMillis: number
}> {
  override get message(): string {
    return `site request to ${this.url} did not finish within ${this.elapsedMillis}ms`
  }
}

export interface FetchedPage {
  readonly origin: string
  readonly status: number
  readonly contentType: string | null
  readonly vary: string | null
  readonly body: string
}

export interface SiteRequest {
  readonly path: string
  readonly accept?: string
  readonly origin?: string
  readonly timeout?: Duration.Input
}

const withDeadline = <A, E, R>(
  url: string,
  timeout: Duration.Input,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E | SiteRequestTimedOut, R> =>
  Effect.gen(function*() {
    const startedAt = performance.now()
    return yield* effect.pipe(
      Effect.timeoutOrElse({
        duration: timeout,
        orElse: () =>
          Effect.fail(
            new SiteRequestTimedOut({ url, elapsedMillis: Math.round(performance.now() - startedAt) }),
          ),
      }),
    )
  })

export const fetchSite = (
  site: SiteRequest,
): Effect.Effect<FetchedPage, SiteRequestTimedOut | HttpClientError.HttpClientError, HttpClient.HttpClient> =>
  Effect.gen(function*() {
    const configuredOrigin = yield* Effect.orDie(
      Config.String('SITE_URL').pipe(
        Config.withDefault('http://localhost:1337'),
        (config) => config.parse(ConfigProvider.fromEnv()),
      ),
    )
    const origin = site.origin ?? configuredOrigin
    const client = yield* HttpClient.HttpClient
    const base = HttpClientRequest.get(`${origin}${site.path}`)
    const request = site.accept === undefined ? base : HttpClientRequest.setHeader(base, 'accept', site.accept)
    const timeout = site.timeout ?? REQUEST_TIMEOUT
    return yield* withDeadline(
      `${origin}${site.path}`,
      timeout,
      Effect.gen(function*() {
        const response = yield* client.execute(request)
        return {
          origin,
          status: response.status,
          contentType: response.headers['content-type'] ?? null,
          vary: response.headers['vary'] ?? null,
          body: yield* Effect.orDie(response.text),
        }
      }),
    )
  })
