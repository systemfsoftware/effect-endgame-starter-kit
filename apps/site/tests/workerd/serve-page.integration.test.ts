import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Layer } from 'effect'
import { FetchHttpClient } from 'effect/http'

import { siteWorker } from '../../site-worker.ts'
import { workerdWorkerLayer } from '../__fixtures__/miniflare-worker.layer.ts'
import { BROWSER_ACCEPT, fetchPage, readmeHeading, readmeOpening } from '../__fixtures__/site-fixture.ts'

const productionWorkerLayer = workerdWorkerLayer({
  entry: siteWorker.main,
  outDir: 'dist/workerd/production',
}).pipe(Layer.orDie)

const Feature = makeFeature({ it })

Feature('Serving the site from its production build', { timeout: 120_000 })
  .withLayer(Layer.merge(productionWorkerLayer, FetchHttpClient.layer))
  .live('the built worker runs as a real workerd child process, reachable only over a socket')
  .body(({ scenario }) => {
    scenario(
      'A browser receives the server-rendered page',
      Gherkin.Do.pipe(
        When('a browser asks for the home page')('response', () => fetchPage('/', BROWSER_ACCEPT)),
        Then('the page is HTML carrying the README heading')((s, expect) =>
          expect(s.response).toMatchObject({
            status: 200,
            contentType: 'text/html; charset=utf-8',
            body: expect.stringContaining(readmeHeading()),
          })
        ),
      ),
    )

    scenario(
      'An agent receives the Markdown page',
      Gherkin.Do.pipe(
        When('an agent asks for the home page')('response', () => fetchPage('/', undefined)),
        Then('the body is the README opening as Markdown')((s, expect) =>
          expect(s.response).toMatchObject({
            status: 200,
            contentType: 'text/markdown; charset=utf-8',
            body: readmeOpening(),
          })
        ),
      ),
    )
  })
