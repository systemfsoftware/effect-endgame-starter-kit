import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { FetchHttpClient } from 'effect/http'

import { fetchJson } from './__fixtures__/site.fixture'

const Feature = makeFeature({ it })

Feature('Calling the site API from the running Worker')
  .withLayer(FetchHttpClient.layer)
  .live('the Worker runs as a separate process reachable only over a real socket')
  .body(({ scenario }) => {
    scenario(
      'A client discovers the health check from the API description',
      Gherkin.Do.pipe(
        When('a client fetches the API description')('description', () => fetchJson({ path: '/api/openapi.json' })),
        Then('the description offers the health check')((s, expect) =>
          expect(s.description).toMatchObject({
            status: 200,
            json: { openapi: expect.stringMatching(/^3\.1\./), paths: { '/api/health': { get: expect.any(Object) } } },
          })
        ),
      ),
    )
    scenario(
      'A client asks whether the site is healthy',
      Gherkin.Do.pipe(
        When('a client asks the API whether the site is healthy')('health', () => fetchJson({ path: '/api/health' })),
        Then('the site answers that it is healthy')((s, expect) =>
          expect(s.health).toEqual({
            status: 200,
            contentType: expect.stringContaining('application/json'),
            json: { status: 'ok' },
          })
        ),
      ),
    )
  })
