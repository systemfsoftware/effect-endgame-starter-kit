import { NodeServices } from '@effect/platform-node'
import { directivesIn, tallyDirectives, totalDirectives, vendoredRootsOf } from '@starter/ratstack-scorecard'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'

const Feature = makeFeature({ it })

Feature('Tallying comment directives')
  .withScenarioLayer(NodeServices.layer)
  .body(({ scenario }) => {
    scenario(
      'A comment carrying one directive counts once in its own family',
      Gherkin.Do.pipe(
        Given('a comment holding one oxlint directive')(
          'comment',
          () => Effect.succeed('// oxlint-disable-next-line no-console'),
        ),
        When('the directive tally is computed')('tally', (scope) => Effect.succeed(tallyDirectives([scope.comment]))),
        Then('it lands once in the oxlint family and nowhere else')((scope, expect) =>
          expect({
            oxlint: scope.tally.oxlint,
            total: totalDirectives(scope.tally),
            family: directivesIn(scope.comment).oxlint,
          })
            .toEqual({ oxlint: 1, total: 1, family: 1 })
        ),
      ),
    )

    scenario(
      'A path under a declared vendored root is excluded by that root',
      Gherkin.Do.pipe(
        Given('a path inside the vendored tree')('vendoredPath', () => Effect.succeed('vendor/copied.ts')),
        When('the declared roots are applied')(
          'roots',
          (scope) => Effect.succeed(vendoredRootsOf(scope.vendoredPath, ['vendor/', 'src/'])),
        ),
        Then('only the matching root keeps the path')((scope, expect) =>
          expect({ roots: scope.roots, inside: vendoredRootsOf('src/claim.ts', ['vendor/', 'src/']) })
            .toEqual({ roots: ['vendor/'], inside: ['src/'] })
        ),
      ),
    )
  })
