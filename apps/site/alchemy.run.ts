import * as Alchemy from 'alchemy'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as Effect from 'effect/Effect'

import { siteWorker } from './site-worker.ts'

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
      ...(isCloudStage(stage) ? {} : { env: { OTLP_BASE_URL: siteWorker.localOtlpBaseUrl } }),
    }
  }),
)

export default Alchemy.Stack(
  'Endgame',
  { providers: Cloudflare.providers(), state: Alchemy.localState() },
  Effect.gen(function*() {
    const site = yield* Site
    return { url: site.url }
  }),
)
