import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    maxWorkers: 4,
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    includeSource: ['src/**/*.ts'],
  },
})
