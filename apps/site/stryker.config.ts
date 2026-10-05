import { packageStrykerConfig } from '../../stryker.shared.ts'

export default packageStrykerConfig(['src/**/*.workflow.ts', '!src/**/*.test.ts'])
