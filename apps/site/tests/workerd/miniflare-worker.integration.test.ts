import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'

import { workerdWorkerLayer } from '../__fixtures__/miniflare-worker.layer.ts'

const neverReadyWorker = workerdWorkerLayer({
  entry: 'tests/__fixtures__/never-ready.worker.ts',
  outDir: 'dist/workerd/never-ready',
  startupTimeout: '2 seconds',
})

const startNeverReadyWorker = () =>
  Layer.build(neverReadyWorker).pipe(
    Effect.scoped,
    Effect.as('started'),
    Effect.catchTag('WorkerdStartupTimedOut', (error) =>
      Effect.succeed({ tag: error._tag, timeoutMillis: error.timeoutMillis })),
  )

const Feature = makeFeature({ it })

Feature('Holding a worker to its startup deadline', { timeout: 120_000 })
  .withLayer(Layer.empty)
  .live('the worker is built and started as a real process')
  .body(({ scenario }) => {
    scenario(
      'A worker that never finishes starting is reported as a startup timeout',
      Gherkin.Do.pipe(
        When('a worker whose startup never completes is started')('outcome', () => startNeverReadyWorker()),
        Then('the start is reported as a startup timeout')((s, expect) =>
          expect(s.outcome).toEqual({ tag: 'WorkerdStartupTimedOut', timeoutMillis: 2000 })
        ),
      ),
    )
  })
