import * as Alchemy from 'alchemy'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as Effect from 'effect/Effect'

const LOCAL_OTLP_BASE_URL = 'http://127.0.0.1:4318'

export const isCloudStage = (stage: string): boolean => stage === 'prod' || /^pr-\d+$/.test(stage)

export const Site = Cloudflare.Website.Vite(
  'Site',
  Effect.gen(function*() {
    const stage = yield* Alchemy.Stage
    return {
      main: 'src/worker.ts',
      compatibility: { date: '2026-10-05', flags: ['webcrypto_modern_algorithms'] },
      observability: {
        enabled: true,
        headSamplingRate: 1,
        logs: { enabled: true, invocationLogs: true, headSamplingRate: 1, persist: true },
        traces: { enabled: true, headSamplingRate: 1, persist: true },
      },
      ...(isCloudStage(stage) ? {} : { env: { OTLP_BASE_URL: LOCAL_OTLP_BASE_URL } }),
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
