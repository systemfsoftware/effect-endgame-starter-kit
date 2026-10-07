import { Clock, Config, ConfigProvider, Effect } from 'effect'
import type { Page } from 'playwright'

import { Chromium } from '../../../__fixtures__/browser.fixture'

const siteUrl = Effect.orDie(
  Config.String('SITE_URL').pipe(
    Config.withDefault('http://localhost:1337'),
    (config) => config.parse(ConfigProvider.fromEnv()),
  ),
)

export const uniqueMessage: Effect.Effect<string> = Effect.map(
  Clock.currentTimeNanos,
  (nanos) => `signed by a journey at ${nanos}`,
)

export interface Entry {
  readonly name: string
  readonly message: string
}

export interface PageVisit {
  readonly entries: ReadonlyArray<string>
  readonly notice: string
}

const signedOrRefused = (message: string): boolean =>
  document.querySelector('[role=alert]')?.textContent !== '' ||
  (message !== '' && document.querySelector('ol')?.textContent.includes(message) === true)

const submitEnabled = (): boolean => document.querySelector('button[type=submit]')?.hasAttribute('disabled') === false

const sign = (page: Page, origin: string, entry: Entry) =>
  Effect.gen(function*() {
    yield* Effect.promise(() => page.goto(`${origin}/guestbook`))
    yield* Effect.promise(() => page.waitForFunction(submitEnabled))
    yield* Effect.promise(() => page.getByLabel('Name').fill(entry.name))
    yield* Effect.promise(() => page.getByLabel('Message').fill(entry.message))
    yield* Effect.promise(() => page.getByRole('button', { name: 'Sign the guestbook' }).click())
    yield* Effect.promise(() => page.waitForFunction(signedOrRefused, entry.message.trim()))
    const entries = yield* Effect.promise(() => page.locator('ol li').allTextContents())
    const notice = yield* Effect.promise(() => page.getByRole('alert').textContent())
    return { entries, notice: notice ?? '' } satisfies PageVisit
  })

export const signOnPage = (entry: Entry): Effect.Effect<PageVisit, never, Chromium> =>
  Effect.gen(function*() {
    const origin = yield* siteUrl
    const browser = yield* Chromium
    return yield* Effect.acquireUseRelease(
      Effect.promise(() => browser.newContext()),
      (context) => Effect.flatMap(Effect.promise(() => context.newPage()), (page) => sign(page, origin, entry)),
      (context) => Effect.promise(() => context.close()),
    )
  })
