import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'

import { ChromiumLive, visitHomePage } from './__fixtures__/browser.fixture'

const Feature = makeFeature({ it })

const CHROMIUM_TIMEOUT_MS = 30_000

Feature('A browser loads the home page under the strict policy', { timeout: CHROMIUM_TIMEOUT_MS })
  .withLayer(ChromiumLive)
  .live('only a real Chromium enforces the Content Security Policy and Trusted Types on the running Worker')
  .body(({ scenario }) => {
    scenario(
      'A browser loads the home page under the strict policy',
      Gherkin.Do.pipe(
        When('a browser opens the home page')('visit', () => visitHomePage('home-strict-policy')),
        Then('the page is served under a fresh nonce policy with no violations')((s, expect) =>
          expect({
            status: s.visit.status,
            headerNonce: s.visit.headerNonce,
            hasScripts: s.visit.scriptNonces.length > 0,
            scriptNonces: s.visit.scriptNonces,
            violations: s.visit.violations,
            consoleErrors: s.visit.consoleErrors,
            innerHtmlError: s.visit.innerHtmlError,
          }).toEqual({
            status: 200,
            headerNonce: expect.stringMatching(/^[A-Za-z0-9+/]{22}==$/),
            hasScripts: true,
            scriptNonces: s.visit.scriptNonces.map(() => s.visit.headerNonce),
            violations: [],
            consoleErrors: [],
            innerHtmlError: expect.stringMatching(/^TypeError: .*TrustedHTML/),
          })
        ),
      ),
    )
  })
