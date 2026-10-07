import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { FetchHttpClient } from 'effect/http'

import { fetchSite } from './__fixtures__/site.fixture'

const Feature = makeFeature({ it })

Feature('Opening the site from the running Worker')
  .withLayer(FetchHttpClient.layer)
  .live('the Worker runs as a separate process reachable only over a real socket')
  .body(({ scenario }) => {
    scenario(
      'A visitor opening the home page gets the server-rendered page',
      Gherkin.Do.pipe(
        When('a visitor requests the home page')('response', () => fetchSite({ path: '/' })),
        Then('the HTML page carries the starter heading')((s, expect) =>
          expect(s.response).toMatchObject({
            status: 200,
            contentType: expect.stringContaining('text/html'),
            body: expect.stringContaining('<h1>Endgame Starter</h1>'),
          })
        ),
      ),
    )
  })
