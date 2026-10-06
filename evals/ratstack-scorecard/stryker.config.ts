import { defineConfig } from '@systemfsoftware/stryker-js/config'

export default defineConfig({
  testRunner: 'vitest',
  checkers: ['typescript'],
  plugins: [
    '@systemfsoftware/stryker-js-vitest-runner',
    '@systemfsoftware/stryker-js-typescript-checker',
  ],
  mutate: ['src/model/**/*.workflow.ts'],
  thresholds: { high: 100, low: 100, break: 100 },
})
