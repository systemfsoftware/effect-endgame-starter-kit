import { NodeServices } from '@effect/platform-node'
import { cacheAccepted, cacheSave } from '@starter/ratstack-scorecard'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'

const Feature = makeFeature({ it })

Feature('Gating the rat-stack cache from the host')
  .withScenarioLayer(NodeServices.layer)
  .body(({ scenario }) => {
    scenario(
      'A refused cache-check measures again and a clean one restores',
      Gherkin.Do.pipe(
        Given('the cache-check exit codes')('codes', () => Effect.succeed([1, 0])),
        When('each is read as an accepted cache')(
          'accepted',
          (scope) => Effect.succeed(scope.codes.map(cacheAccepted)),
        ),
        Then('only the zero exit restores')((scope, expect) => expect(scope.accepted).toEqual([false, true])),
      ),
    )

    scenario(
      'Only a non-pull-request event saves the cache',
      Gherkin.Do.pipe(
        Given('a pull request and a push')('events', () => Effect.succeed([true, false])),
        When('each is read as a save')('saves', (scope) => Effect.succeed(scope.events.map(cacheSave))),
        Then('only the push saves')((scope, expect) => expect(scope.saves).toEqual([false, true])),
      ),
    )
  })
