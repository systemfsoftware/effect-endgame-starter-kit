import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Context, Effect, Layer } from 'effect'

import { frontDoorHandlerWith, HtmlPort } from '@endgame/site'

const BROWSER_ACCEPT =
  'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'

const BrokenRenderer = Layer.succeed(HtmlPort, {
  render: () => Effect.promise(() => Promise.reject(new Error('renderer unavailable'))),
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

Feature('Serving a page when the renderer is unavailable').withLayer(BrokenRenderer).body(({ scenario }) => {
  scenario(
    'A browser receives an HTML internal error',
    Gherkin.Do.pipe(
      When('a browser asks for the home page while the renderer is down')(
        'response',
        () => callPage('/', BROWSER_ACCEPT),
      ),
      Then('the browser receives an HTML internal error, not a rejection')((s, expect) =>
        expect(s.response).toMatchObject({
          status: 500,
          contentType: 'text/html; charset=utf-8',
          vary: 'Accept',
        })
      ),
    ),
  )

  scenario(
    'An agent is unaffected by the renderer',
    Gherkin.Do.pipe(
      When('an agent asks for the home page while the renderer is down')('response', () => callPage('/')),
      Then('the agent receives the Markdown page')((s, expect) =>
        expect(s.response).toMatchObject({
          status: 200,
          contentType: 'text/markdown; charset=utf-8',
          vary: 'Accept',
        })
      ),
    ),
  )
})
