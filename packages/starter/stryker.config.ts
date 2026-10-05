import { packageStrykerConfig } from '../../stryker.shared.ts'

export default packageStrykerConfig(['src/**/*.ts', '!src/**/*.test.ts', '!src/**/*.d.ts'])
