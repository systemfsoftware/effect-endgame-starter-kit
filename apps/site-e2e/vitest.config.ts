import { defineConfig } from 'vitest/config'

const unit = { environment: 'node', globals: true, include: ['tests/**/*.integration.test.ts'] }

export default defineConfig({
  test: {
    projects: [
      { test: { ...unit, name: 'local', exclude: ['tests/**/deployed-*.integration.test.ts'] } },
      { test: { ...unit, name: 'deployed' } },
    ],
  },
})
