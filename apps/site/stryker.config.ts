import { packageStrykerConfig } from '../../stryker.shared.ts'

export default packageStrykerConfig(['src/**/*.workflow.ts', 'readme-opening-plugin.ts', '!src/**/*.test.ts'])
