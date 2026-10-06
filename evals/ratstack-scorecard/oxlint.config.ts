import recommended from '@systemfsoftware/oxlint-config-recommended'
import { defineConfig } from 'oxlint'

// No host role exists in the presets, so this override names it once. The host
// (the Deno driver plus the sandboxed tools) runs outside the sandbox and loads
// no third-party code, so it keeps every preset rule that does not require
// importing Effect and drops only the rules that do: async-function,
// missing-pipeable-signature, no-unported-time-source, global-console,
// node-builtin-import, and — under the ids the linter prints — the node: import
// ban (no-restricted-imports), the clock ban (global-date) and the entrypoint
// interpretation edge (entrypoint-interprets-once).
const host = [
  'src/main.ts',
  'src/journeys.ts',
  'src/check-imports.ts',
  'src/harness/**/*.ts',
  'src/families/**/*.ts',
  'src/sides/**/*.ts',
  'src/tools/**/*.ts',
]

export default defineConfig({
  extends: [recommended],

  ignorePatterns: ['**/node_modules/**', '**/.cache/**', '**/journeys/__records__/**', '**/repos/**'],

  rules: {
    'typescript/no-unnecessary-condition': 'error',
    'typescript/strict-boolean-expressions': 'error',
    'typescript/no-non-null-assertion': 'error',
  },

  overrides: [
    {
      files: host,
      rules: {
        'effecttsgo/async-function': 'off',
        'effecttsgo/missing-pipeable-signature': 'off',
        'effecttsgo/global-console': 'off',
        'effecttsgo/global-date': 'off',
        'effecttsgo/node-builtin-import': 'off',
        'eslint/no-restricted-imports': 'off',
        '@systemfsoftware/effect-platform/no-unported-time-source': 'off',
        '@systemfsoftware/effect-platform/entrypoint-interprets-once': 'off',
      },
    },
  ],
})
