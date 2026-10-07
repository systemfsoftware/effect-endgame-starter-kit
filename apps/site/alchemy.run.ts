import * as Alchemy from 'alchemy'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import { siteWorker } from './site-worker.ts'

export const isCloudStage = (stage: string): boolean => stage === 'prod' || /^pr-\d+$/.test(stage)

const productionDomain = (stage: string): { readonly domain?: string } => {
  const domain = process.env['SITE_DOMAIN']
  return stage === 'prod' && domain !== undefined && domain !== '' ? { domain } : {}
}

export const Database = Cloudflare.D1.Database('Database')

export const Site = Cloudflare.Website.Vite(
  'Site',
  Effect.gen(function*() {
    const stage = yield* Alchemy.Stage
    return {
      main: siteWorker.main,
      compatibility: { date: siteWorker.compatibilityDate, flags: [...siteWorker.compatibilityFlags] },
      dev: { port: 1337, strictPort: true },
      env: { DB: yield* Database },
      ...productionDomain(stage),
    }
  }),
)

const stateOfStage = Layer.unwrap(
  Effect.map(Alchemy.Stage, (stage) => isCloudStage(stage) ? Cloudflare.state() : Alchemy.localState()),
)

export default Alchemy.Stack(
  'Endgame',
  { providers: Cloudflare.providers(), state: stateOfStage },
  Effect.gen(function*() {
    const site = yield* Site
    return { url: site.url, workerName: site.workerName }
  }),
)
