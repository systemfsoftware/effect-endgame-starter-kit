import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'

import { ChromiumLive, readWorkerHealth } from './__fixtures__/browser.fixture'

const Feature = makeFeature({ it })

const CHROMIUM_TIMEOUT_MS = 30_000

Feature('Seeing that the Worker is healthy', { timeout: CHROMIUM_TIMEOUT_MS })
  .withLayer(ChromiumLive)
  .live('a real Chromium loads the page the running Worker serves')
  .body(({ scenario }) => {
    scenario(
      'The home page reports a healthy Worker',
      Gherkin.Do.pipe(
        When('a visitor opens the home page')('health', () => readWorkerHealth),
        Then('the page says the Worker is healthy')((s, expect) => expect(s.health).toBe('Worker health: ok')),
      ),
    )
  })
