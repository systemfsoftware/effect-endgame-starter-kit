import { NodeServices } from '@effect/platform-node'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { type CacheCell, cacheRefusal } from '../decide/cache-check.ts'

const Feature = makeFeature({ it })

const cell = (id: string, side: CacheCell['side'], value: CacheCell['measured']['cell']): CacheCell => ({
  id,
  side,
  measured: { cell: value },
})

Feature('Refusing an unusable rat-stack cache entry')
  .withScenarioLayer(NodeServices.layer)
  .body(({ scenario }) => {
    scenario(
      'A rat-stack instrument error refuses the entry',
      Gherkin.Do.pipe(
        Given('a family result whose rat-stack cell is an instrument error')(
          'cells',
          () => Effect.succeed([cell('M23', 'ratstack', { _tag: 'InstrumentError', error: 'gate red' })]),
        ),
        When('the entry is judged')('refusal', (scope) => Effect.succeed(cacheRefusal(scope.cells))),
        Then('it is refused naming the row')((scope, expect) =>
          expect(scope.refusal).toEqual('rat-stack instrument errors on M23')
        ),
      ),
    )

    scenario(
      'A measured rat-stack cell is accepted',
      Gherkin.Do.pipe(
        Given('a family result whose rat-stack cell is measured')(
          'cells',
          () => Effect.succeed([cell('M23', 'ratstack', { _tag: 'Measured', runs: [1, 1, 1] })]),
        ),
        When('the entry is judged')('refusal', (scope) => Effect.succeed(cacheRefusal(scope.cells))),
        Then('it is accepted')((scope, expect) => expect(scope.refusal).toEqual(undefined)),
      ),
    )

    scenario(
      'A starter instrument error is not the rat-stack cache concern',
      Gherkin.Do.pipe(
        Given('a family result whose starter cell is an instrument error')(
          'cells',
          () => Effect.succeed([cell('M23', 'starter', { _tag: 'InstrumentError', error: 'no cell' })]),
        ),
        When('the entry is judged')('refusal', (scope) => Effect.succeed(cacheRefusal(scope.cells))),
        Then('it is accepted')((scope, expect) => expect(scope.refusal).toEqual(undefined)),
      ),
    )
  })
