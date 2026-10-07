import type * as Alchemy from 'alchemy/Cloudflare'

import type { Site } from '../alchemy.run'

declare global {
  namespace Cloudflare {
    interface Env extends Alchemy.InferEnv<typeof Site> {}
  }
}
