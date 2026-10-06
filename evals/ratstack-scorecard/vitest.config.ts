import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    maxWorkers: 4,
    include: ['src/**/*.test.ts', 'journeys/**/*.test.ts'],
  },
})
