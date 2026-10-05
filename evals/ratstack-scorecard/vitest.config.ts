import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'model', environment: 'node', include: ['src/**/*.test.ts'] } },
      { test: { name: 'journeys', environment: 'node', include: ['journeys/**/*.journey.test.ts'] } },
    ],
  },
})
