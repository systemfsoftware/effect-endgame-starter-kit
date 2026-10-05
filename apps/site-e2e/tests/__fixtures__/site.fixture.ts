import { Config, ConfigProvider, Effect } from 'effect'
import { HttpClient, HttpClientRequest } from 'effect/http'

import readmeSource from '../../../../README.md?raw'

const README_HOME_START = '<!-- home:start -->'
const README_HOME_END = '<!-- home:end -->'

export const readmeOpening = (): string =>
  readmeSource
    .slice(readmeSource.indexOf(README_HOME_START) + README_HOME_START.length, readmeSource.indexOf(README_HOME_END))
    .trim()

export const readmeH1 = (): string =>
  (readmeOpening().split('\n').find((line) => line.startsWith('# ')) ?? '').replace(/^#\s+/, '')

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
}

export const fetchSite = (site: SiteRequest): Effect.Effect<FetchedPage, never, HttpClient.HttpClient> =>
  Effect.gen(function*() {
    const origin = yield* Effect.orDie(
      Config.String('SITE_URL').pipe(
        Config.withDefault('http://localhost:1337'),
        (config) => config.parse(ConfigProvider.fromEnv()),
      ),
    )
    const client = yield* HttpClient.HttpClient
    const base = HttpClientRequest.get(`${origin}${site.path}`)
    const request = site.accept === undefined ? base : HttpClientRequest.setHeader(base, 'accept', site.accept)
    const response = yield* Effect.orDie(client.execute(request))
    return {
      origin,
      status: response.status,
      contentType: response.headers['content-type'] ?? null,
      vary: response.headers['vary'] ?? null,
      body: yield* Effect.orDie(response.text),
    }
  })
