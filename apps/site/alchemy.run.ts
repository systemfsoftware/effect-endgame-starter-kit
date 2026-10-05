import * as Alchemy from 'alchemy'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import { siteWorker } from './site-worker.ts'

const PRODUCTION_DOMAIN = 'endgame.systemfsoftware.com'

export const isCloudStage = (stage: string): boolean => stage === 'prod' || /^pr-\d+$/.test(stage)

export const Site = Cloudflare.Website.Vite(
  'Site',
  Effect.gen(function*() {
    const stage = yield* Alchemy.Stage
    return {
      main: siteWorker.main,
      compatibility: { date: siteWorker.compatibilityDate, flags: [...siteWorker.compatibilityFlags] },
      observability: {
        enabled: true,
        headSamplingRate: 1,
        logs: { enabled: true, invocationLogs: true, headSamplingRate: 1, persist: true },
        traces: { enabled: true, headSamplingRate: 1, persist: true },
      },
      ...(stage === 'prod' ? { domain: PRODUCTION_DOMAIN } : {}),
      ...(isCloudStage(stage) ? {} : { env: { OTLP_BASE_URL: siteWorker.localOtlpBaseUrl } }),
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
    return { url: site.url }
  }),
)
