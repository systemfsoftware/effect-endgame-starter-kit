import * as Alchemy from 'alchemy'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as Effect from 'effect/Effect'

export const Site = Cloudflare.Website.Vite('Site', {
  main: 'src/worker.ts',
  compatibility: { date: '2026-10-05', flags: ['webcrypto_modern_algorithms'] },
})

export default Alchemy.Stack(
  'Endgame',
  { providers: Cloudflare.providers(), state: Alchemy.localState() },
  Effect.gen(function*() {
    const site = yield* Site
    return { url: site.url }
  }),
)
