import type * as Alchemy from '@alchemy.run/cloudflare'

import type { Site } from '../alchemy.run'

declare global {
  namespace Cloudflare {
    interface Env extends Alchemy.InferEnv<typeof Site> {
      readonly OTEL_EXPORTER_OTLP_ENDPOINT: string
    }
  }
}
