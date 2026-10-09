import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'

import { ChromiumLive } from '../../__fixtures__/browser.fixture'
import { listedOnPage, moderateOnPage, raceOnPage, signOnPage, uniqueMessage } from './__fixtures__/guestbook.fixture'

const Feature = makeFeature({ it })

const CHROMIUM_TIMEOUT_MS = 180_000

const RACES = 6

const SERIAL_OUTCOMES = ['ok/conflict/Visible', 'conflict/ok/Hidden', 'illegal/ok/Hidden', 'ok/ok/Flagged']

const signed = (name: string, suffix: string) =>
  Effect.flatMap(uniqueMessage, (base) => {
    const message = `${base} ${suffix}`
    return Effect.as(signOnPage({ name, message }), message)
  })

const flagged = (suffix: string) =>
  Effect.flatMap(signed('Ray', suffix), (message) => Effect.as(moderateOnPage({ message, event: 'Flag' }), message))

Feature('Flagging and vouching for guestbook entries from the page', { timeout: CHROMIUM_TIMEOUT_MS })
  .withLayer(ChromiumLive)
  .live('a real Chromium drives the page the running Worker serves, over its local D1 database')
  .body(({ scenario }) => {
    scenario(
      'Two flags with no vouch between them hide an entry; one flag leaves it listed as Flagged',
      Gherkin.Do.pipe(
        Given('Ada, Ben and Cy have each signed the guestbook')(
          'messages',
          () => Effect.all({ ada: signed('Ada', 'first'), ben: signed('Ben', 'second'), cy: signed('Cy', 'third') }),
        ),
        When("a visitor flags Ada's entry")(
          'flagged',
          (s) => moderateOnPage({ message: s.messages.ada, event: 'Flag' }),
        ),
        Then("Ada's entry is listed as Flagged")((s, expect) =>
          expect(s.flagged).toEqual({ notice: '', entries: expect.arrayContaining([`Ada ${s.messages.ada} Flagged`]) })
        ),
        When('another visitor vouches for it')(
          'vouched',
          (s) => moderateOnPage({ message: s.messages.ada, event: 'Vouch' }),
        ),
        Then("Ada's entry is listed without the Flagged label")((s, expect) =>
          expect(s.vouched).toEqual({ notice: '', entries: expect.arrayContaining([`Ada ${s.messages.ada}`]) })
        ),
        When('a visitor flags it again')(
          'reflagged',
          (s) => moderateOnPage({ message: s.messages.ada, event: 'Flag' }),
        ),
        Then('it is Flagged once more')((s, expect) =>
          expect(s.reflagged.entries).toContain(`Ada ${s.messages.ada} Flagged`)
        ),
        When('a visitor flags it a second time with no vouch between')(
          'hidden',
          (s) => moderateOnPage({ message: s.messages.ada, event: 'Flag' }),
        ),
        When("a visitor flags Ben's entry once")(
          'benFlagged',
          (s) => moderateOnPage({ message: s.messages.ben, event: 'Flag' }),
        ),
        When('another visitor opens the guestbook in their own browser')('listed', () => listedOnPage),
        Then("Ada's entry is gone, Ben's is Flagged and Cy's is listed as signed")((s, expect) =>
          expect({
            ada: s.listed.filter((line) => line.includes(s.messages.ada)),
            ben: s.listed.filter((line) => line.includes(s.messages.ben)),
            cy: s.listed.filter((line) => line.includes(s.messages.cy)),
          }).toEqual({ ada: [], ben: [`Ben ${s.messages.ben} Flagged`], cy: [`Cy ${s.messages.cy}`] })
        ),
      ),
    )

    scenario(
      'A vouch for an entry nobody flagged is refused and changes nothing',
      Gherkin.Do.pipe(
        Given('Dee has signed the guestbook')('message', () => signed('Dee', 'unflagged')),
        Given('the entry as any visitor sees it')('before', () => listedOnPage),
        When("a visitor vouches for Dee's entry")(
          'visit',
          (s) => moderateOnPage({ message: s.message, event: 'Vouch' }),
        ),
        Then('the page names the state and the event, and the entry is what it was')((s, expect) =>
          expect({ notice: s.visit.notice, entry: s.visit.entries.filter((line) => line.includes(s.message)) }).toEqual(
            {
              notice: "An entry that is Visible can't take Vouch.",
              entry: s.before.filter((line) => line.includes(s.message)),
            },
          )
        ),
      ),
    )

    scenario(
      'A vouch and a flag sent at the same moment end as one of them happening first',
      Gherkin.Do.pipe(
        Given('several entries that one visitor has flagged')(
          'messages',
          () => Effect.forEach(Array.from({ length: RACES }, (_, race) => `race ${race}`), flagged),
        ),
        When('for each entry, one visitor vouches while another flags it')(
          'outcomes',
          (s) => Effect.forEach(s.messages, raceOnPage),
        ),
        Then('each answer pair and final state is one some serial order of the two would give')((s, expect) =>
          expect(s.outcomes.filter((outcome) => !SERIAL_OUTCOMES.includes(outcome))).toEqual([])
        ),
      ),
    )
  })
