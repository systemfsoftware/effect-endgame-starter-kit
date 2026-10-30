// Mints the scoped Cloudflare token CI deploys with and stores it as repository secrets.
// Run once per roll-out repository, from the host, with an admin-scoped Cloudflare token.
// Never run it through bin/cloud or a sandbox. Stage: ci-credentials (README, "Credentials for CI").
// A new resource type needs its permission group added here.
import * as Cloudflare from '@alchemy.run/cloudflare'
import * as GitHub from '@alchemy.run/github'
import * as Alchemy from 'alchemy'
import * as Config from 'effect/Config'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Redacted from 'effect/Redacted'
import * as Schema from 'effect/Schema'

export default Alchemy.Stack(
  'github',
  { providers: Layer.mergeAll(Cloudflare.providers(), GitHub.providers()), state: Cloudflare.state() },
  Effect.gen(function*() {
    const slug = yield* Config.schema(Schema.String.check(Schema.isPattern(/^[^/]+\/[^/]+$/)), 'GITHUB_REPOSITORY')
    const hostname = yield* Config.NonEmptyString('SITE_DOMAIN')
    const owner = slug.slice(0, slug.indexOf('/'))
    const repository = slug.slice(slug.indexOf('/') + 1)
    const { accountId } = yield* yield* Cloudflare.CloudflareEnvironment
    const zoneId = yield* Cloudflare.Zone.resolveZoneId({ accountId, zone: undefined, hostname }).pipe(Effect.orDie)
    const accountKey = `com.cloudflare.api.account.${accountId}` as const

    const token = yield* Cloudflare.ApiToken.AccountApiToken('CIToken', {
      accountId,
      policies: [
        {
          effect: 'allow',
          permissionGroups: ['Workers Scripts Write', 'D1 Write', 'Workers Tail Read', 'Secrets Store Write'],
          resources: { [accountKey]: '*' },
        },
        {
          effect: 'allow',
          permissionGroups: ['Workers Routes Write', 'DNS Write', 'Zone Read'],
          resources: { [accountKey]: { [`com.cloudflare.api.account.zone.${zoneId}`]: '*' } },
        },
      ],
    })

    yield* GitHub.Secret('CloudflareApiToken', {
      owner,
      repository,
      name: 'CLOUDFLARE_API_TOKEN',
      value: token.value,
    })
    yield* GitHub.Secret('CloudflareAccountId', {
      owner,
      repository,
      name: 'CLOUDFLARE_ACCOUNT_ID',
      value: Redacted.make(accountId),
    })
  }),
)
