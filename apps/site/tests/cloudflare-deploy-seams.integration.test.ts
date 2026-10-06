import { NodeFileSystem, NodePath } from '@effect/platform-node'
import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { CLOUDFLARE_API_BASE_URL_ENV, logCloudflareApiRequests, resolveApiBaseUrl } from 'alchemy/Cloudflare'
import { Effect, FileSystem, Layer, Option, Path, Schema } from 'effect'
import { FetchHttpClient, HttpClient, HttpClientRequest } from 'effect/http'

import { ApiLogLineJson } from './__fixtures__/cloudflare-deploy.fixture'

const PUBLIC_API_BASE_URL = 'https://api.cloudflare.com/client/v4'
const OVERRIDE_API_BASE_URL = 'http://127.0.0.1:4319'

const StubApi = Layer.succeed(
  FetchHttpClient.Fetch,
  () =>
    Promise.resolve(
      new Response('{"success":true,"result":{},"errors":[],"messages":[]}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ),
)

const StubClient = FetchHttpClient.layer.pipe(Layer.provide(StubApi))

const Feature = makeFeature({ it })

Feature('The Cloudflare deploy test seams')
  .withLayer(Layer.merge(Layer.merge(NodeFileSystem.layer, NodePath.layer), StubClient))
  .live('the request log appends through the real file system and the base URL is read from the environment')
  .body(({ scenario }) => {
    scenario(
      'The API base URL is read from the environment, defaulting to the public API',
      Gherkin.Do.pipe(
        When('the base URL is resolved with and without the environment value')('urls', () =>
          Effect.succeed({
            envName: CLOUDFLARE_API_BASE_URL_ENV,
            defaultUrl: resolveApiBaseUrl({}),
            overrideUrl: resolveApiBaseUrl({ CLOUDFLARE_API_BASE_URL: OVERRIDE_API_BASE_URL }),
          })),
        Then('the public default and the environment override are returned')((s, expect) =>
          expect(s.urls).toEqual({
            envName: 'CLOUDFLARE_API_BASE_URL',
            defaultUrl: PUBLIC_API_BASE_URL,
            overrideUrl: OVERRIDE_API_BASE_URL,
          })
        ),
      ),
    )

    scenario(
      'Every Cloudflare API call is logged as method, path and status only',
      Gherkin.Do.pipe(
        When('a wrapped client runs a call that carries secret query parameters')(
          'logged',
          () =>
            Effect.gen(function*() {
              const fs = yield* FileSystem.FileSystem
              const path = yield* Path.Path
              const directory = yield* fs.makeTempDirectory({ prefix: 'cloudflare-api-log-' })
              const logPath = path.join(directory, 'api.jsonl')
              const client = yield* HttpClient.HttpClient
              const logged = logCloudflareApiRequests(client, logPath)
              const request = HttpClientRequest.get(
                `${PUBLIC_API_BASE_URL}/accounts/acct/workers/scripts/site/settings?cursor=abc&token=secret`,
              )
              yield* logged.execute(request)
              const raw = yield* fs.readFileString(logPath)
              const lines = raw
                .split('\n')
                .filter((line) => line.length > 0)
                .map((line) =>
                  Option.getOrThrowWith(
                    Schema.decodeOption(ApiLogLineJson)(line),
                    () => new Error(`unparsable log line: ${line}`),
                  )
                )
              yield* Effect.ignore(fs.remove(directory, { recursive: true, force: true }))
              return { raw, lines }
            }),
        ),
        Then('exactly one method/path/status line is written and no query parameters leak')((s, expect) =>
          expect({
            lines: s.logged.lines,
            leaked: /cursor|token|secret/.test(s.logged.raw),
            lineCount: s.logged.lines.length,
          }).toEqual({
            lines: [
              {
                method: 'GET',
                path: '/client/v4/accounts/acct/workers/scripts/site/settings',
                status: 200,
              },
            ],
            leaked: false,
            lineCount: 1,
          })
        ),
      ),
    )
  })
