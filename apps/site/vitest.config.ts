import { inlineSchemaTests } from '@systemfsoftware/effect-schema-vite'
import { defineConfig } from 'vitest/config'

import { packageTestConfig } from '../../vitest.shared.ts'
import { readmeOpening } from './readme-opening-plugin.ts'

const srcUrl = (module: string): string => new URL(`./src/${module}`, import.meta.url).pathname

export default defineConfig({
  ...packageTestConfig([{ find: /^@endgame\/site$/, replacement: srcUrl('mod.ts') }]),
  plugins: [readmeOpening(), inlineSchemaTests()],
})
