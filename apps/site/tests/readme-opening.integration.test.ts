import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'

import {
  assertHomeMarkers,
  homeMarkerProblemsOf,
  homeOpeningOf,
  README_HOME_END,
  README_HOME_START,
} from '../readme-opening-plugin.ts'

const Feature = makeFeature({ it })

Feature('Reading the README home block at build time').withLayer(Layer.empty).body(({ scenario }) => {
  scenario(
    'A README with no home markers frames nothing',
    Gherkin.Do.pipe(
      When('the home block is extracted from a README without markers')(
        'opening',
        () => Effect.succeed(homeOpeningOf('plain text\n')),
      ),
      Then('the opening is empty')((s, expect) => expect(s.opening).toEqual('')),
    ),
  )

  scenario(
    'A README with only the start marker frames nothing',
    Gherkin.Do.pipe(
      When('the home block is extracted from a README with a start marker only')(
        'opening',
        () => Effect.succeed(homeOpeningOf(`${README_HOME_START}\n# Title\n`)),
      ),
      Then('the opening is empty')((s, expect) => expect(s.opening).toEqual('')),
    ),
  )

  scenario(
    'A README with the end marker before the start frames nothing',
    Gherkin.Do.pipe(
      When('the home block is extracted from a README whose end marker precedes its start')(
        'opening',
        () => Effect.succeed(homeOpeningOf(`${README_HOME_END}\n# Title\n${README_HOME_START}\n`)),
      ),
      Then('the opening is empty')((s, expect) => expect(s.opening).toEqual('')),
    ),
  )

  scenario(
    'A README with both markers frames the trimmed section',
    Gherkin.Do.pipe(
      When('the home block is extracted from a README whose markers frame a section')('opening', () =>
        Effect.succeed(
          homeOpeningOf(`before\n${README_HOME_START}\n  # Title\n  Body  \n${README_HOME_END}\nafter`),
        )),
      Then('the opening is the trimmed section')((s, expect) => expect(s.opening).toEqual('# Title\n  Body')),
    ),
  )

  scenario(
    'A README missing its markers is reported with both absences',
    Gherkin.Do.pipe(
      When('the home markers are checked on a README without them')(
        'problems',
        () => Effect.succeed(homeMarkerProblemsOf('# Title\n')),
      ),
      Then('both markers are reported missing')((s, expect) =>
        expect(s.problems).toEqual([
          { line: 1, detail: `expected exactly one home start marker (${README_HOME_START}), found 0` },
          { line: 1, detail: `expected exactly one home end marker (${README_HOME_END}), found 0` },
        ])
      ),
    ),
  )

  scenario(
    'A README duplicating its start marker is reported on the extra line',
    Gherkin.Do.pipe(
      When('the home markers are checked on a README with two start markers')(
        'problems',
        () => Effect.succeed(homeMarkerProblemsOf(`x\n${README_HOME_START}\nmid\n${README_HOME_START}\ny\n`)),
      ),
      Then('the second start marker is reported on its line')((s, expect) =>
        expect(s.problems).toEqual([
          { line: 4, detail: `expected exactly one home start marker (${README_HOME_START}), found 2` },
          { line: 1, detail: `expected exactly one home end marker (${README_HOME_END}), found 0` },
        ])
      ),
    ),
  )

  scenario(
    'A README whose end marker precedes its start is reported in order',
    Gherkin.Do.pipe(
      When('the home markers are checked on a README whose end marker precedes its start')(
        'problems',
        () => Effect.succeed(homeMarkerProblemsOf(`${README_HOME_END}\n${README_HOME_START}\n`)),
      ),
      Then('the ordering problem names the end marker line')((s, expect) =>
        expect(s.problems).toEqual([
          { line: 1, detail: `${README_HOME_END} appears before ${README_HOME_START}` },
        ])
      ),
    ),
  )

  scenario(
    'A README quoting a marker inside a code fence is reported on that line',
    Gherkin.Do.pipe(
      When('the home markers are checked on a README quoting a marker in a fence')(
        'problems',
        () => Effect.succeed(homeMarkerProblemsOf(`\`\`\`\n${README_HOME_START}\n\`\`\`\n${README_HOME_END}\n`)),
      ),
      Then('the fenced marker is reported on its line')((s, expect) =>
        expect(s.problems).toEqual([
          { line: 2, detail: `home start marker (${README_HOME_START}) is inside a code fence` },
        ])
      ),
    ),
  )

  scenario(
    'A README with invalid markers stops the build naming the file and line',
    Gherkin.Do.pipe(
      When('an invalid README is accepted for the build')('message', () =>
        Effect.sync(() => {
          try {
            assertHomeMarkers('# Title\n')
            return null
          } catch (error) {
            return error instanceof Error ? error.message : null
          }
        })),
      Then('the refusal names the README line')((s, expect) =>
        expect(s.message).toSatisfy(
          (message) => message !== null && message.includes('README.md:1'),
          'names README.md:1',
        )
      ),
    ),
  )
})
