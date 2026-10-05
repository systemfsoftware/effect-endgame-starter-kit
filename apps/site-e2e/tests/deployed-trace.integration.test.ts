import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { FetchHttpClient } from 'effect/http'

import { fetchSite } from './__fixtures__/site.fixture'
import { cloudflareAccess, readDeployedTraceSpans } from './__fixtures__/workers-observability.fixture'

const Feature = makeFeature({ it })

const SCENARIO_TIMEOUT_MS = 240_000

const rayIdOrDie = (rayId: string | null): Effect.Effect<string> =>
  rayId === null ? Effect.die(new Error('the site response carried no cf-ray header')) : Effect.succeed(rayId)

Feature("An agent's request reaches the deployed trace view", { timeout: SCENARIO_TIMEOUT_MS })
  .withLayer(FetchHttpClient.layer)
  .live('the deployed Worker and Cloudflare Observability answer over real sockets')
  .body(({ scenario }) => {
    scenario(
      "An agent's request reaches the deployed trace view",
      Gherkin.Do.pipe(
        Given('observability credentials from the environment')('cloudflare', () => cloudflareAccess),
        When('an agent requests the home page with no Accept header')('response', () => fetchSite({ path: '/' })),
        Then('the response carries a Ray ID')((s, expect) =>
          expect({ status: s.response.status, rayId: s.response.rayId }).toMatchObject({
            status: 200,
            rayId: expect.any(String),
          })
        ),
        When('the deployed trace for that Ray ID is read')(
          'spans',
          (s) =>
            Effect.flatMap(
              rayIdOrDie(s.response.rayId),
              (rayId) => readDeployedTraceSpans({ access: s.cloudflare, rayId }),
            ),
        ),
        Then('the deployed trace shows the page-serving span')((s, expect) => {
          const servePage = s.spans.find((span) => span.name === 'front_door.serve_page')
          return expect({ name: servePage?.name ?? null, attributes: servePage?.attributes ?? null }).toMatchObject({
            name: 'front_door.serve_page',
            attributes: {
              'app.front_door.route': 'home',
              'app.front_door.serve_page.decision': 'ServeMarkdownPage',
            },
          })
        }),
      ),
    )
  })
