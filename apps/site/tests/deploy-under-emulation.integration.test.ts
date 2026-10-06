import { NodeServices } from '@effect/platform-node'
import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'

import { deployUnderEmulation, EMULATED_STAGE } from './__fixtures__/alchemy-emulation.fixture'

const Feature = makeFeature({ it })

Feature('Deploying the site under Alchemy emulation', { timeout: 180_000 })
  .withLayer(NodeServices.layer)
  .live(
    "the real alchemy CLI deploys the stack once in dev mode: Alchemy's local Worker provider runs the build in workerd and keeps state on disk, with no Cloudflare account",
  )
  .body(({ scenario }) => {
    scenario(
      'The stack deploys locally and records its URL and worker name',
      Gherkin.Do.pipe(
        When('the site is deployed once under emulation')('deploy', () => deployUnderEmulation),
        Then('Alchemy created the Worker locally and recorded a localhost URL for the stage')((s, expect) =>
          expect({
            createdLocally: s.deploy.output.includes('[Site] created (local)'),
            host: new URL(s.deploy.stackOutput.url).hostname,
            namedForStage: s.deploy.stackOutput.workerName.startsWith(`endgame-site-${EMULATED_STAGE}-`),
          }).toEqual({ createdLocally: true, host: 'localhost', namedForStage: true })
        ),
      ),
    )
  })
