import * as Alchemy from 'alchemy'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as Effect from 'effect/Effect'

import { siteWorker } from './site-worker.ts'

export const Site = Cloudflare.Website.Vite('Site', {
  main: siteWorker.main,
  compatibility: { date: siteWorker.compatibilityDate, flags: [...siteWorker.compatibilityFlags] },
  dev: { port: 1337, strictPort: true },
})

export default Alchemy.Stack(
  'Endgame',
  { providers: Cloudflare.providers(), state: Alchemy.localState() },
  Effect.gen(function*() {
    const site = yield* Site
    return { url: site.url }
  }),
)
