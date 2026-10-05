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

const HTML_BODY = '<h1>Rendered README opening</h1>'

const HtmlPortDouble = Layer.succeed(HtmlPort, {
  render: () => Effect.succeed(new Response(HTML_BODY, { status: 200, headers: { 'content-type': 'text/html' } })),
})

const callPage = (path: string, accept?: string) =>
  Effect.gen(function*() {
    const port = yield* HtmlPort
    const handler = frontDoorHandlerWith(Context.make(HtmlPort, port))
    const init = accept === undefined ? {} : { headers: { accept } }
    const response = yield* Effect.promise(() => handler(new Request(`https://site.example${path}`, init)))
    return {
      status: response.status,
      contentType: response.headers.get('content-type'),
      vary: response.headers.get('vary'),
      body: yield* Effect.promise(() => response.text()),
    }
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
        () =>
          callPage(
            '/',
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          ),
      ),
      Then('the HTML renderer answers')((s, expect) =>
        expect(s.response).toMatchObject({ status: 200, contentType: 'text/html', vary: 'Accept', body: HTML_BODY })
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
})
