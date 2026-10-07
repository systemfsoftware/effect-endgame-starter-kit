import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'

import { ChromiumLive } from '../../__fixtures__/browser.fixture'
import { listedOnPage, signOnPage, uniqueMessage } from './__fixtures__/guestbook.fixture'

const Feature = makeFeature({ it })

const CHROMIUM_TIMEOUT_MS = 30_000

Feature('Signing the guestbook from its page', { timeout: CHROMIUM_TIMEOUT_MS })
  .withLayer(ChromiumLive)
  .live('a real Chromium drives the page the running Worker serves, over its local D1 database')
  .body(({ scenario }) => {
    scenario(
      'A visitor signs the guestbook and is not refused',
      Gherkin.Do.pipe(
        When('a visitor signs with spaces around their words')(
          'signed',
          () =>
            Effect.flatMap(uniqueMessage, (message) =>
              Effect.map(
                signOnPage({ name: '  Grace  ', message: `  ${message}  ` }),
                (visit) => ({ message, visit }),
              )),
        ),
        Then('the entry is accepted, trimmed, with no notice')((s, expect) =>
          expect(s.signed.visit).toEqual({
            notice: '',
            entries: expect.arrayContaining([`Grace ${s.signed.message}`]),
          })
        ),
      ),
    )

    scenario(
      'Another visitor sees a signed entry in the list',
      Gherkin.Do.pipe(
        When('a guest signs the guestbook')(
          'message',
          () => Effect.flatMap(uniqueMessage, (message) => Effect.as(signOnPage({ name: 'Ada', message }), message)),
        ),
        When('another visitor opens the guestbook in their own browser')('listed', () => listedOnPage),
        Then('the entry is in the list')((s, expect) => expect(s.listed).toContain(`Ada ${s.message}`)),
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
