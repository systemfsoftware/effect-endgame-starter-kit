import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { FetchHttpClient } from 'effect/http'

import { fetchSite, readmeH1, readmeOpening } from './__fixtures__/site.fixture'

const Feature = makeFeature({ it })

Feature('An agent reads the site from the running Worker')
  .withLayer(FetchHttpClient.layer)
  .live('the built Worker runs as a separate process reachable only over a real socket')
  .body(({ scenario }) => {
    scenario(
      'An agent reads the README opening as Markdown',
      Gherkin.Do.pipe(
        When('an agent requests the home page with no Accept header')('response', () => fetchSite({ path: '/' })),
        Then('the response is the README opening as text/markdown')((s, expect) =>
          expect(s.response).toMatchObject({
            status: 200,
            contentType: 'text/markdown; charset=utf-8',
            vary: 'Accept',
            body: readmeOpening(),
          })
        ),
      ),
    )

    scenario(
      'A browser default Accept is served SSR HTML',
      Gherkin.Do.pipe(
        When('a browser requests the home page with its navigation Accept header')(
          'response',
          () =>
            fetchSite({
              path: '/',
              accept:
                'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            }),
        ),
        Then('the HTML holds the README opening H1')((s, expect) =>
          expect(s.response).toMatchObject({
            status: 200,
            body: expect.stringContaining(readmeH1()),
          })
        ),
      ),
    )

    scenario(
      'An agent reads llms.txt',
      Gherkin.Do.pipe(
        When('an agent requests llms.txt')('response', () => fetchSite({ path: '/llms.txt' })),
        Then('the page catalog is returned as Markdown linking the origin')((s, expect) =>
          expect(s.response).toMatchObject({
            status: 200,
            contentType: 'text/markdown; charset=utf-8',
            body: expect.stringContaining(`](${s.response.origin}/`),
          })
        ),
      ),
    )
  })
