import { inlineSchemaTests } from '@systemfsoftware/effect-schema-vite'
import { defineConfig } from 'vitest/config'

import { packageTestConfig } from '../../vitest.shared.ts'

const entryPoint = new URL('./src/mod.ts', import.meta.url).pathname

export default defineConfig({
  ...packageTestConfig([{ find: /^@endgame\/registration$/, replacement: entryPoint }]),
  plugins: [inlineSchemaTests()],
})
