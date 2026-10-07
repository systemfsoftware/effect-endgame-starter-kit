import { defineConfig, type StrykerConfig } from '@systemfsoftware/stryker-js/config'

import manifest from './package.json' with { type: 'json' }

const config: StrykerConfig = defineConfig({
  checkers: [{ plugin: '@systemfsoftware/stryker-js-typescript-checker' }],
  coverageAnalysis: 'perTest',
  disableBail: true,
  htmlReporter: { fileName: 'reports/mutation-report.html' },
  ignorePatterns: ['reports', 'coverage', 'dist'],
  incremental: true,
  incrementalFile: 'reports/stryker-incremental.json',
  ignorers: ['@systemfsoftware/stryker-ignorer-effect-schema-declarations'],
  jsonReporter: { fileName: 'reports/mutation-report.json' },
  mutate: [...manifest.stryker.mutate],
  packageManager: 'pnpm',
  reporters: ['progress', 'html', 'json', 'progress-stream'],
  testRunner: {
    plugin: '@systemfsoftware/stryker-js-vitest-runner',
    options: { configFile: 'vitest.config.ts', dir: '.', related: true },
  },
  thresholds: { break: 100, high: 100, low: 100 },
})

export default config
