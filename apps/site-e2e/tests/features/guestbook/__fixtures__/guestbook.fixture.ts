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

export interface Moderation {
  readonly message: string
  readonly event: 'Flag' | 'Vouch'
}

const signedOrRefused = (message: string): boolean =>
  document.querySelector('[role=alert]')?.textContent !== '' ||
  (message !== '' && document.querySelector('ol')?.textContent.includes(message) === true)

const submitEnabled = (): boolean => document.querySelector('button[type=submit]')?.hasAttribute('disabled') === false

const entryLines = (page: Page): Promise<ReadonlyArray<string>> =>
  page.locator('ol li').evaluateAll((items) =>
    items.map((item) => Array.from(item.querySelectorAll(':scope > span'), (part) => part.textContent).join(' '))
  )

const rpcAnswered = (page: Page, procedure: string) =>
  page.waitForResponse((response) =>
    response.url().endsWith('/api/rpc') && response.request().postData()?.includes(`"tag":"${procedure}"`) === true
  )

const clickToModerate = async (page: Page, moderation: Moderation): Promise<void> => {
  const answered = Promise.all([rpcAnswered(page, 'moderate'), rpcAnswered(page, 'list')])
  const button = moderation.event === 'Flag' ? /^Flag / : /^Vouch for /
  await page.getByRole('listitem').filter({ hasText: moderation.message }).getByRole('button', { name: button }).click()
  await answered
  await page.waitForFunction(submitEnabled)
}

const visitOf = (page: Page) =>
  Effect.gen(function*() {
    const entries = yield* Effect.promise(() => entryLines(page))
    const notice = yield* Effect.promise(() => page.getByRole('alert').textContent())
    return { entries, notice: notice ?? '' } satisfies PageVisit
  })

const sign = (page: Page, origin: string, entry: Entry) =>
  Effect.gen(function*() {
    yield* Effect.promise(() => page.goto(`${origin}/guestbook`))
    yield* Effect.promise(() => page.waitForFunction(submitEnabled))
    yield* Effect.promise(() => page.getByLabel('Name').fill(entry.name))
    yield* Effect.promise(() => page.getByLabel('Message').fill(entry.message))
    yield* Effect.promise(() => page.getByRole('button', { name: 'Sign the guestbook' }).click())
    yield* Effect.promise(() => page.waitForFunction(signedOrRefused, entry.message.trim()))
    return yield* visitOf(page)
  })

const moderate = (page: Page, origin: string, moderation: Moderation) =>
  Effect.gen(function*() {
    yield* Effect.promise(() => page.goto(`${origin}/guestbook`))
    yield* Effect.promise(() => page.waitForFunction(submitEnabled))
    yield* Effect.promise(() => clickToModerate(page, moderation))
    return yield* visitOf(page)
  })

const inFreshContext = <A, R = never>(
  use: (page: Page, origin: string) => Effect.Effect<A, never, R>,
): Effect.Effect<A, never, Chromium | R> =>
  Effect.gen(function*() {
    const origin = yield* siteUrl
    const browser = yield* Chromium
    return yield* Effect.acquireUseRelease(
      Effect.promise(() => browser.newContext()),
      (context) => Effect.flatMap(Effect.promise(() => context.newPage()), (page) => use(page, origin)),
      (context) => Effect.promise(() => context.close()),
    )
  })

export const signOnPage = (entry: Entry): Effect.Effect<PageVisit, never, Chromium> =>
  inFreshContext((page, origin) => sign(page, origin, entry))

export const listedOnPage: Effect.Effect<ReadonlyArray<string>, never, Chromium> = inFreshContext((page, origin) =>
  Effect.gen(function*() {
    yield* Effect.promise(() => page.goto(`${origin}/guestbook`))
    yield* Effect.promise(() => page.waitForFunction(submitEnabled))
    return yield* Effect.promise(() => entryLines(page))
  })
)

export const moderateOnPage = (moderation: Moderation): Effect.Effect<PageVisit, never, Chromium> =>
  inFreshContext((page, origin) => moderate(page, origin, moderation))

const opened = async (page: Page, origin: string): Promise<void> => {
  await page.goto(`${origin}/guestbook`)
  await page.waitForFunction(submitEnabled)
}

const answerOf = (notice: string | null): string =>
  notice === '' ? 'ok' : notice?.includes("can't take") === true
    ? 'illegal'
    : notice?.includes('changed after it was read') === true
    ? 'conflict'
    : `${notice}`

const stateOf = (listed: ReadonlyArray<string>, message: string): string => {
  const line = listed.find((entry) => entry.includes(message))
  return line === undefined ? 'Hidden' : line.endsWith(' Flagged') ? 'Flagged' : 'Visible'
}

export const raceOnPage = (message: string): Effect.Effect<string, never, Chromium> =>
  inFreshContext((vouchPage, origin) =>
    inFreshContext((flagPage) =>
      Effect.promise(async () => {
        await Promise.all([opened(vouchPage, origin), opened(flagPage, origin)])
        await Promise.all([
          clickToModerate(vouchPage, { message, event: 'Vouch' }),
          clickToModerate(flagPage, { message, event: 'Flag' }),
        ])
        const [vouch, flag] = await Promise.all([
          vouchPage.getByRole('alert').textContent(),
          flagPage.getByRole('alert').textContent(),
        ])
        return `${answerOf(vouch)}/${answerOf(flag)}`
      })
    )
  ).pipe(Effect.flatMap((answers) => Effect.map(listedOnPage, (listed) => `${answers}/${stateOf(listed, message)}`)))
