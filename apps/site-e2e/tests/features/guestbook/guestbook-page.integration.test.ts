import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'

import { ChromiumLive } from '../../__fixtures__/browser.fixture'
import { signOnPage, uniqueMessage } from './__fixtures__/guestbook.fixture'

const Feature = makeFeature({ it })

const CHROMIUM_TIMEOUT_MS = 30_000

Feature('Signing the guestbook from its page', { timeout: CHROMIUM_TIMEOUT_MS })
  .withLayer(ChromiumLive)
  .live('a real Chromium drives the page the running Worker serves, over its local D1 database')
  .body(({ scenario }) => {
    scenario(
      'A visitor signs with spaces around their words and sees the entry listed, trimmed',
      Gherkin.Do.pipe(
        When('a visitor signs the guestbook')('signed', () =>
          Effect.flatMap(uniqueMessage, (message) =>
            Effect.map(
              signOnPage({ name: '  Grace  ', message: `  ${message}  ` }),
              (visit) => ({ message, visit }),
            ))),
        Then('the entry appears in the list with no notice')((s, expect) =>
          expect(s.signed.visit).toEqual({
            notice: '',
            entries: expect.arrayContaining([`Grace ${s.signed.message}`]),
          })
        ),
      ),
    )

    scenario(
      'A visitor who submits an empty entry is told what is missing',
      Gherkin.Do.pipe(
        When('a visitor submits the form empty')('visit', () => signOnPage({ name: '', message: '' })),
        Then('the page shows the refusal the guestbook gave')((s, expect) =>
          expect(s.visit.notice).toBe('Write your name.')
        ),
      ),
    )
  })
