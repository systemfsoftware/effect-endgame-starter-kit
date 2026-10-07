import { packageStrykerConfig } from '../../stryker.shared.ts'
import manifest from './package.json' with { type: 'json' }

export default packageStrykerConfig(manifest.stryker.mutate)
