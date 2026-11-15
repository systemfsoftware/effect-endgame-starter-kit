import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'

import { ChromiumLive } from '../../__fixtures__/browser.fixture'
import { addedAndReloaded, twoPersonsLists, workedThroughTheList } from './__fixtures__/todo.fixture'

const Feature = makeFeature({ it })

const CHROMIUM_TIMEOUT_MS = 60_000

Feature('Keeping a list of todos in the browser', { timeout: CHROMIUM_TIMEOUT_MS })
  .withLayer(ChromiumLive)
  .live('a real Chromium drives the todo page the running Worker serves, over its own local D1 database')
  .body(({ scenario }) => {
    scenario(
      'A visitor adds a todo and finds it again after a reload',
      Gherkin.Do.pipe(
        When('a visitor adds a todo and reloads the page')('visit', () => addedAndReloaded('buy milk')),
        Then('the todo is still on the list, with no notice')((s, expect) =>
          expect(s.visit).toEqual({ todos: ['buy milk'], notice: '' })
        ),
      ),
    )

    scenario(
      'A visitor completes, renames, moves and deletes todos',
      Gherkin.Do.pipe(
        When('a visitor works through the list')('visit', () => workedThroughTheList),
        Then('the renamed todo is first and the completed one is gone')((s, expect) =>
          expect(s.visit).toEqual({ todos: ['renamed task'], notice: '' })
        ),
      ),
    )

    scenario(
      "One person never sees another person's todos",
      Gherkin.Do.pipe(
        When('two people open their own lists')('lists', () => twoPersonsLists),
        Then('the first person sees their todo and the second sees none')((s, expect) =>
          expect(s.lists).toEqual({ first: ['a private task'], second: [] })
        ),
      ),
    )
  })
