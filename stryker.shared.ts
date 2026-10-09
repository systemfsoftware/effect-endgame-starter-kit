import type { StrykerConfig } from '@systemfsoftware/stryker-js/config'

export const WORKFLOW_FILES = '**/*.workflow.ts'

export const packageStrykerConfig: StrykerConfig = {
  checkers: [{ plugin: '@systemfsoftware/stryker-js-typescript-checker' }],
  coverageAnalysis: 'perTest',
  disableBail: true,
  htmlReporter: { fileName: 'reports/mutation-report.html' },
  ignorePatterns: ['reports', 'coverage', 'dist'],
  incremental: true,
  incrementalFile: 'reports/stryker-incremental.json',
  ignorers: ['@systemfsoftware/stryker-ignorer-effect-schema-declarations'],
  jsonReporter: { fileName: 'reports/mutation-report.json' },
  mutate: [WORKFLOW_FILES],
  packageManager: 'pnpm',
  reporters: ['progress', 'html', 'json', 'progress-stream'],
  testRunner: {
    plugin: '@systemfsoftware/stryker-js-vitest-runner',
    options: { configFile: 'vitest.config.ts', dir: '.', related: true },
  },
  thresholds: { break: 100, high: 100, low: 100 },
}
