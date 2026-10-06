import { inlineSchemaTests } from '@systemfsoftware/effect-schema-vite'
import { defineConfig } from 'vitest/config'

import { packageTestConfig } from '../../vitest.shared.ts'

export default defineConfig({
  ...packageTestConfig([]),
  plugins: [inlineSchemaTests()],
})
