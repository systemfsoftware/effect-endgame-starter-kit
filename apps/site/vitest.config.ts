import { inlineSchemaTests } from '@systemfsoftware/effect-schema-vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [inlineSchemaTests()],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
})
