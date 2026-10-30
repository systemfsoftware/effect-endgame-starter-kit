import type * as Alchemy from '@alchemy.run/cloudflare'

import type { Site } from '../alchemy.run'

declare global {
  namespace Cloudflare {
    interface Env extends Alchemy.InferEnv<typeof Site> {}
  }
}
