import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect, Layer, Schedule } from 'effect'
import { FetchHttpClient } from 'effect/http'

import { workerdWorkerLayer } from '../__fixtures__/miniflare-worker.layer.ts'
import { OtlpReceiver, otlpReceiverLayer, type OtlpSpan } from '../__fixtures__/otlp-receiver.layer.ts'
import { TraceNotReceived } from '../__fixtures__/render-failure.schema.ts'
import { BROWSER_ACCEPT, fetchPage } from '../__fixtures__/site-fixture.ts'

const FAILED_RENDER_STEP = 'front_door.serve_page.write'

const renderFailureWorker = Layer.unwrap(
  OtlpReceiver.pipe(
    Effect.map((receiver) =>
      workerdWorkerLayer({
        entry: 'tests/__fixtures__/render-failure.worker.ts',
        outDir: 'dist/workerd/render-failure',
        define: { __OTLP_ENDPOINT__: JSON.stringify(receiver.endpoint) },
      })
    ),
  ),
).pipe(Layer.provideMerge(otlpReceiverLayer), Layer.orDie)

const recordedFailure = () =>
  Effect.gen(function*() {
    const receiver = yield* OtlpReceiver
    const spans = yield* receiver.spans
    return spans.find((span) => span.name === FAILED_RENDER_STEP && span.status?.code === 2)
  }).pipe(
    Effect.filterOrFail(
      (span): span is OtlpSpan => span !== undefined,
      () => new TraceNotReceived({ spanName: FAILED_RENDER_STEP }),
    ),
    Effect.retry({ schedule: Schedule.spaced('100 millis') }),
    Effect.timeout(Duration.seconds(15)),
  )

const failedRender = () =>
  Effect.gen(function*() {
    const response = yield* fetchPage('/', BROWSER_ACCEPT)
    return { response, span: yield* recordedFailure() }
  })

const Feature = makeFeature({ it })

Feature('Answering a caller when the page cannot be rendered', { timeout: 120_000 })
  .withLayer(Layer.merge(renderFailureWorker, FetchHttpClient.layer))
  .live('a failing renderer runs in real workerd and its trace is posted to a real receiver')
  .body(({ scenario }) => {
    scenario(
      'A browser is told the page could not be rendered',
      Gherkin.Do.pipe(
        When('a browser asks for the home page while the rendering is failing')(
          'response',
          () => fetchPage('/', BROWSER_ACCEPT),
        ),
        Then('the browser is answered an HTML error rather than an escaped failure')((s, expect) =>
          expect({
            status: s.response.status,
            contentType: s.response.contentType,
            vary: s.response.vary,
            unhandled: /unhandled/i.test(s.response.logs.join('\n')),
          }).toEqual({
            status: 500,
            contentType: 'text/html; charset=utf-8',
            vary: 'Accept',
            unhandled: false,
          })
        ),
      ),
    )

    scenario(
      'An agent receives the Markdown page, unaffected by the failing renderer',
      Gherkin.Do.pipe(
        When('an agent asks for the home page while the rendering is failing')(
          'response',
          () => fetchPage('/', undefined),
        ),
        Then('the answer is the Markdown page that varies by Accept')((s, expect) =>
          expect(s.response).toMatchObject({
            status: 200,
            contentType: 'text/markdown; charset=utf-8',
            vary: 'Accept',
          })
        ),
      ),
    )

    scenario(
      'An operator can see the failed render in the trace',
      Gherkin.Do.pipe(
        When('a browser asks for the home page while the rendering is failing')('traced', () => failedRender()),
        Then('the failed render is recorded with the error it carried')((s, expect) =>
          expect(s.traced.span).toMatchObject({
            status: { code: 2 },
            events: expect.arrayContaining([expect.objectContaining({ name: 'exception' })]),
          })
        ),
      ),
    )
  })
