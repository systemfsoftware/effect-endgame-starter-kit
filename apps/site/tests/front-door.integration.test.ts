import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Context, Effect, Layer } from 'effect'

import { frontDoorHandlerWith, HtmlPort } from '@endgame/site'
import readmeSource from '../../../README.md?raw'

const README_HOME_START = '<!-- home:start -->'
const README_HOME_END = '<!-- home:end -->'

const readme = readmeSource
const opening = readme
  .slice(readme.indexOf(README_HOME_START) + README_HOME_START.length, readme.indexOf(README_HOME_END))
  .trim()

const BROWSER_ACCEPT =
  'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'

const POLICY_PARTS = [
  "default-src 'self'",
  "script-src 'nonce-{nonce}' 'strict-dynamic'",
  "style-src 'self'",
  "img-src 'self' data:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "require-trusted-types-for 'script'",
  "trusted-types 'none'",
  'report-to csp',
  'report-uri /csp-report',
] as const

const expectedPolicy = (nonce: string): string => POLICY_PARTS.map((part) => part.replace('{nonce}', nonce)).join('; ')

const nonceOf = (policy: string): string => /'nonce-([^']+)'/.exec(policy)?.[1] ?? ''

const LEGACY_REPORT = JSON.stringify({
  'csp-report': { 'effective-directive': 'script-src', 'blocked-uri': 'https://evil.example/path?q=1' },
})

const HOME_REPORT = JSON.stringify({
  'csp-report': { 'effective-directive': 'script-src', 'blocked-uri': 'https://evil.example/' },
})

const padToBytes = (json: string, bytes: number): string => json + ' '.repeat(bytes - json.length)

const AT_BODY_CAP = padToBytes(HOME_REPORT, 64 * 1024)
const OVER_BODY_CAP = padToBytes(HOME_REPORT, 64 * 1024 + 1)

const REPORTING_BATCH = JSON.stringify([
  { type: 'csp-violation', body: { effectiveDirective: 'img-src', blockedURL: 'data:text/html,blocked' } },
])
const HtmlPortDouble = Layer.succeed(HtmlPort, {
  render: (web: Request) =>
    Effect.succeed(
      new Response(`<h1>Rendered README opening at ${web.url}</h1>`, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    ),
})

const handler = () =>
  Effect.gen(function*() {
    const port = yield* HtmlPort
    return frontDoorHandlerWith(Context.make(HtmlPort, port))
  })

const callPage = (path: string, accept?: string) =>
  Effect.gen(function*() {
    const h = yield* handler()
    const init = accept === undefined ? {} : { headers: { accept } }
    const response = yield* Effect.promise(() => h(new Request(`https://site.example${path}`, init)))
    return {
      status: response.status,
      contentType: response.headers.get('content-type'),
      vary: response.headers.get('vary'),
      body: yield* Effect.promise(() => response.text()),
      contentSecurityPolicy: response.headers.get('content-security-policy') ?? '',
      reportingEndpoints: response.headers.get('reporting-endpoints') ?? '',
    }
  })

const postReport = (body: string) =>
  Effect.gen(function*() {
    const h = yield* handler()
    const response = yield* Effect.promise(() =>
      h(
        new Request('https://site.example/csp-report', {
          method: 'POST',
          headers: { 'content-type': 'application/csp-report' },
          body,
        }),
      )
    )
    return response.status
  })

const Feature = makeFeature({ it })

Feature('Reading the site as an agent').withLayer(HtmlPortDouble).body(({ scenario }) => {
  scenario(
    'An agent with no Accept header gets the README opening as Markdown',
    Gherkin.Do.pipe(
      When('an agent requests the home page with no Accept header')('response', () => callPage('/')),
      Then('the README opening is returned as Markdown')((s, expect) =>
        expect(s.response).toMatchObject({
          status: 200,
          contentType: 'text/markdown; charset=utf-8',
          vary: 'Accept',
          body: opening,
        })
      ),
    ),
  )

  scenario(
    'A client that prefers HTML is handed to the HTML renderer',
    Gherkin.Do.pipe(
      When('a browser requests the home page with its navigation Accept header')(
        'response',
        () => callPage('/', BROWSER_ACCEPT),
      ),
      Then('the HTML renderer answers with the composed request')((s, expect) =>
        expect(s.response).toMatchObject({
          status: 200,
          contentType: 'text/html',
          vary: 'Accept',
          body: expect.stringContaining('https://site.example/'),
        })
      ),
    ),
  )

  scenario(
    'A client that ranks Markdown higher gets Markdown',
    Gherkin.Do.pipe(
      When('a client requests the home page preferring Markdown')(
        'response',
        () => callPage('/', 'text/html;q=0.5, text/markdown'),
      ),
      Then('the README opening is returned as Markdown')((s, expect) =>
        expect(s.response).toMatchObject({
          status: 200,
          contentType: 'text/markdown; charset=utf-8',
          vary: 'Accept',
          body: opening,
        })
      ),
    ),
  )

  scenario(
    "curl's default Accept gets Markdown",
    Gherkin.Do.pipe(
      When('curl requests the home page')('response', () => callPage('/', '*/*')),
      Then('the README opening is returned as Markdown')((s, expect) =>
        expect(s.response).toMatchObject({
          status: 200,
          contentType: 'text/markdown; charset=utf-8',
          vary: 'Accept',
          body: opening,
        })
      ),
    ),
  )

  scenario(
    'An agent is pointed at the llms.txt catalog',
    Gherkin.Do.pipe(
      When('an agent requests the home page with no Accept header')('response', () => callPage('/')),
      Then('the Markdown body links the llms.txt catalog')((s, expect) =>
        expect(s.response.body).toContain('](/llms.txt)')
      ),
    ),
  )

  scenario(
    'Every HTML response carries the strict policy and its reporting endpoint',
    Gherkin.Do.pipe(
      When('a browser opens the home page twice')('pages', () =>
        Effect.gen(function*() {
          const first = yield* callPage('/', BROWSER_ACCEPT)
          const second = yield* callPage('/', BROWSER_ACCEPT)
          return { first, second }
        })),
      Then('each response carries a fresh nonce and the strict policy')((s, expect) => {
        const firstNonce = nonceOf(s.pages.first.contentSecurityPolicy)
        const secondNonce = nonceOf(s.pages.second.contentSecurityPolicy)
        return expect({
          firstPolicy: s.pages.first.contentSecurityPolicy,
          secondPolicy: s.pages.second.contentSecurityPolicy,
          firstReporting: s.pages.first.reportingEndpoints,
          secondReporting: s.pages.second.reportingEndpoints,
          freshNonces: firstNonce !== secondNonce,
          wellFormed: [firstNonce, secondNonce].map((nonce) => /^[A-Za-z0-9+/]{22}==$/.test(nonce)),
        }).toEqual({
          firstPolicy: expectedPolicy(firstNonce),
          secondPolicy: expectedPolicy(secondNonce),
          firstReporting: 'csp="/csp-report"',
          secondReporting: 'csp="/csp-report"',
          freshNonces: true,
          wellFormed: [true, true],
        })
      }),
    ),
  )

  scenario(
    'An agent asking for an unknown path gets a Markdown 404',
    Gherkin.Do.pipe(
      When('an agent requests a path the site does not have')('response', () => callPage('/nope')),
      Then('a Markdown 404 is returned')((s, expect) =>
        expect(s.response).toMatchObject({
          status: 404,
          contentType: 'text/markdown; charset=utf-8',
          vary: 'Accept',
        })
      ),
    ),
  )

  scenario(
    'An agent reads llms.txt',
    Gherkin.Do.pipe(
      When('an agent requests llms.txt')('response', () => callPage('/llms.txt')),
      Then('the page catalog is returned as Markdown linking the origin')((s, expect) =>
        expect(s.response).toMatchObject({
          status: 200,
          contentType: 'text/markdown; charset=utf-8',
          body: expect.stringMatching('\\]\\(https://site\\.example/'),
        })
      ),
    ),
  )

  scenario(
    'A posted violation report is accepted',
    Gherkin.Do.pipe(
      When('a browser posts both report formats and a malformed body')('responses', () =>
        Effect.gen(function*() {
          return {
            legacy: yield* postReport(LEGACY_REPORT),
            reporting: yield* postReport(REPORTING_BATCH),
            malformed: yield* postReport('{not json'),
          }
        })),
      Then('both formats are accepted and the malformed body is refused')((s, expect) =>
        expect(s.responses).toEqual({ legacy: 204, reporting: 204, malformed: 400 })
      ),
    ),
  )

  scenario(
    'A report body at the size cap is accepted and one over it is refused',
    Gherkin.Do.pipe(
      When('a browser posts a report body at the cap and one byte over it')('responses', () =>
        Effect.gen(function*() {
          return {
            atCap: yield* postReport(AT_BODY_CAP),
            overCap: yield* postReport(OVER_BODY_CAP),
          }
        })),
      Then('the body at the cap is accepted and the one over it is refused for size')((s, expect) =>
        expect(s.responses).toEqual({ atCap: 204, overCap: 413 })
      ),
    ),
  )
})
