import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import { HttpClient } from 'effect/http'

import { fetchSite } from './__fixtures__/site.fixture'

const HangingClient = Layer.succeed(HttpClient.HttpClient, HttpClient.make(() => Effect.never))

const Feature = makeFeature({ it })

Feature('Reaching a site that never answers')
  .withLayer(HangingClient)
  .live('the deadline is a real 200 milliseconds against a stalled client')
  .body(({ scenario }) => {
    scenario(
      'A request that never gets a response is abandoned at its deadline',
      Gherkin.Do.pipe(
        When('an agent requests a page with a short deadline')(
          'failure',
          () => fetchSite({ path: '/', origin: 'http://site.example', timeout: '200 millis' }).pipe(Effect.flip),
        ),
        Then('the failure names the URL and the time it waited')((s, expect) =>
          expect(s.failure.message).toSatisfy(
            (message) => message.includes('http://site.example/') && /\d+ms$/.test(message),
            'the failure names the URL and the elapsed milliseconds',
          )
        ),
      ),
    )
  })
