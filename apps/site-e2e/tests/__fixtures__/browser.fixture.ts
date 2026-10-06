import { Config, ConfigProvider, Context, Effect, Layer } from 'effect'
import { type Browser, type BrowserContext, chromium } from 'playwright'

const SCREENSHOTS = new URL('../../artifacts/screenshots/', import.meta.url).pathname

const VIOLATION_LISTENER = `
  document.addEventListener('securitypolicyviolation', (event) => {
    window.recordCspViolation(event.violatedDirective + ' ' + event.blockedURI)
  })
`

export class Chromium extends Context.Service<Chromium, Browser>()('site-e2e/Chromium') {}

export const ChromiumLive = Layer.effect(
  Chromium,
  Effect.acquireRelease(
    Effect.promise(() => chromium.launch()),
    (browser) => Effect.promise(() => browser.close()),
  ),
)

export interface HomePageVisit {
  readonly status: number
  readonly headerNonce: string
  readonly scriptNonces: ReadonlyArray<string>
  readonly violations: ReadonlyArray<string>
  readonly consoleErrors: ReadonlyArray<string>
  readonly innerHtmlError: string
  readonly screenshot: string
}

const siteUrl = Effect.orDie(
  Config.String('SITE_URL').pipe(
    Config.withDefault('http://localhost:1337'),
    (config) => config.parse(ConfigProvider.fromEnv()),
  ),
)

const nonceOf = (policy: string): string => /'nonce-([^']+)'/.exec(policy)?.[1] ?? ''

const scriptNoncesOf = (html: string): ReadonlyArray<string> =>
  Array.from(html.matchAll(/<script\b[^>]*>/g), ([tag]) => /\bnonce="([^"]*)"/.exec(tag)?.[1] ?? '')

const visit = (context: BrowserContext, origin: string, scenario: string) =>
  Effect.gen(function*() {
    const page = yield* Effect.promise(() => context.newPage())
    const violations: Array<string> = []
    const consoleErrors: Array<string> = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    yield* Effect.promise(() =>
      page.exposeFunction('recordCspViolation', (violation: string) => {
        violations.push(violation)
      })
    )
    yield* Effect.promise(() => page.addInitScript(VIOLATION_LISTENER))
    const response = yield* Effect.promise(() => page.goto(`${origin}/`, { waitUntil: 'networkidle' }))
    const screenshot = `${SCREENSHOTS}${scenario}.png`
    yield* Effect.promise(() => page.screenshot({ path: screenshot, fullPage: true }))
    const headers: Record<string, string> = response === null ? {} : yield* Effect.promise(() => response.allHeaders())
    const html = response === null ? '' : yield* Effect.promise(() => response.text())
    const violationsBeforeProbe = [...violations]
    const consoleErrorsBeforeProbe = [...consoleErrors]
    const innerHtmlError = yield* Effect.promise(() =>
      page.evaluate(() => {
        try {
          document.body.innerHTML = '<b>untrusted</b>'
          return ''
        } catch (error) {
          return error instanceof TypeError ? `TypeError: ${error.message}` : 'non-TypeError thrown'
        }
      })
    )
    return {
      status: response?.status() ?? 0,
      headerNonce: nonceOf(headers['content-security-policy'] ?? ''),
      scriptNonces: scriptNoncesOf(html),
      violations: violationsBeforeProbe,
      consoleErrors: consoleErrorsBeforeProbe,
      innerHtmlError,
      screenshot,
    }
  })

export const visitHomePage = (scenario: string): Effect.Effect<HomePageVisit, never, Chromium> =>
  Effect.gen(function*() {
    const origin = yield* siteUrl
    const browser = yield* Chromium
    return yield* Effect.acquireUseRelease(
      Effect.promise(() => browser.newContext()),
      (context) => visit(context, origin, scenario),
      (context) => Effect.promise(() => context.close()),
    )
  })
