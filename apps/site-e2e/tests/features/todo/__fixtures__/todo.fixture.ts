import { Config, ConfigProvider, Effect } from 'effect'
import type { Page } from 'playwright'

import { Chromium } from '../../../__fixtures__/browser.fixture'

const siteUrl = Effect.orDie(
  Config.String('SITE_URL').pipe(
    Config.withDefault('http://localhost:1337'),
    (config) => config.parse(ConfigProvider.fromEnv()),
  ),
)

export interface TodoVisit {
  readonly todos: ReadonlyArray<string>
  readonly notice: string
}

export interface TwoPersons {
  readonly first: ReadonlyArray<string>
  readonly second: ReadonlyArray<string>
}

const composerReady = (): boolean => {
  const button = document.querySelector('button.todo__add')
  return button !== null && !button.hasAttribute('disabled')
}

const todoLines = (page: Page): Promise<ReadonlyArray<string>> =>
  page.locator('ol.todo__list li .todo__text').allTextContents()

const noticeOf = (page: Page): Promise<string> => page.locator('.todo__notice').textContent().then((text) => text ?? '')

const rpcAnswered = (page: Page, procedure: string) =>
  page.waitForResponse((response) =>
    response.url().endsWith('/api/rpc') && response.request().postData()?.includes(`"tag":"${procedure}"`) === true
  )

const visitOf = (page: Page) =>
  Effect.gen(function*() {
    const todos = yield* Effect.promise(() => todoLines(page))
    const notice = yield* Effect.promise(() => noticeOf(page))
    return { todos, notice } satisfies TodoVisit
  })

const opened = async (page: Page, origin: string): Promise<void> => {
  await page.goto(`${origin}/todo`)
  await page.waitForFunction(composerReady)
}

const addTodo = async (page: Page, text: string): Promise<void> => {
  const answered = rpcAnswered(page, 'todo_add')
  await page.locator('#todo-new').fill(text)
  await page.getByRole('button', { name: 'Add' }).click()
  await answered
}

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

export const addedAndReloaded = (text: string): Effect.Effect<TodoVisit, never, Chromium> =>
  inFreshContext((page, origin) =>
    Effect.gen(function*() {
      yield* Effect.promise(() => opened(page, origin))
      yield* Effect.promise(() => addTodo(page, text))
      yield* Effect.promise(() => page.reload())
      yield* Effect.promise(() => page.waitForFunction(composerReady))
      yield* Effect.promise(() => page.waitForFunction(() => document.querySelectorAll('ol.todo__list li').length > 0))
      return yield* visitOf(page)
    })
  )

export const workedThroughTheList: Effect.Effect<TodoVisit, never, Chromium> = inFreshContext((page, origin) =>
  Effect.gen(function*() {
    yield* Effect.promise(() => opened(page, origin))
    yield* Effect.promise(async () => {
      await addTodo(page, 'first task')
      await addTodo(page, 'second task')

      const completed = rpcAnswered(page, 'todo_complete')
      await page.getByRole('button', { name: 'Mark first task done' }).click()
      await completed

      const renamed = rpcAnswered(page, 'todo_rename')
      await page.getByRole('button', { name: 'Rename second task' }).click()
      await page.getByLabel('Rename second task').fill('renamed task')
      await page.getByLabel('Rename second task').press('Enter')
      await renamed

      const moved = rpcAnswered(page, 'todo_reorder')
      await page.getByRole('button', { name: 'Move renamed task up' }).click()
      await moved

      const removed = rpcAnswered(page, 'todo_remove')
      await page.getByRole('button', { name: 'Delete first task' }).click()
      await removed
    })
    return yield* visitOf(page)
  })
)

export const twoPersonsLists: Effect.Effect<TwoPersons, never, Chromium> = inFreshContext((firstPage, origin) =>
  inFreshContext((secondPage) =>
    Effect.gen(function*() {
      yield* Effect.promise(() => opened(firstPage, origin))
      yield* Effect.promise(() => addTodo(firstPage, 'a private task'))
      yield* Effect.promise(() => opened(secondPage, origin))
      const first = yield* Effect.promise(() => todoLines(firstPage))
      const second = yield* Effect.promise(() => todoLines(secondPage))
      return { first, second } satisfies TwoPersons
    })
  )
)
