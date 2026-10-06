import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import { HttpClientRequest, HttpServerRequest, HttpServerResponse } from 'effect/http'

import { frontDoor, HtmlPort } from '@endgame/site'

const unparseableRequest = HttpServerRequest.fromClientRequest(HttpClientRequest.make('GET')('http://[::1'))

const HtmlPortUnreached = Layer.succeed(HtmlPort, {
  render: () => Effect.die(new Error('the page renderer must not be reached by an unparseable URL')),
})

const callFrontDoor = (request: HttpServerRequest.HttpServerRequest) =>
  Effect.gen(function*() {
    const port = yield* HtmlPort
    const response = yield* frontDoor.pipe(
      Effect.provideService(HttpServerRequest.HttpServerRequest, request),
      Effect.provideService(HtmlPort, port),
    )
    return { status: response.status, body: yield* Effect.promise(() => HttpServerResponse.toWeb(response).text()) }
  })

const Feature = makeFeature({ it })

Feature('Routing a request that the front door cannot parse').withLayer(HtmlPortUnreached).body(({ scenario }) => {
  scenario(
    'A request whose URL is not parseable is refused',
    Gherkin.Do.pipe(
      When('a request arrives whose URL is not parseable')('response', () => callFrontDoor(unparseableRequest)),
      Then('the front door answers with a bad request carrying the reason')((s, expect) =>
        expect(s.response).toMatchObject({ status: 400, body: expect.stringContaining('could not be parsed') })
      ),
    ),
  )
})
