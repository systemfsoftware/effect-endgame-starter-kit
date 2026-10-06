import recommended from '@systemfsoftware/oxlint-config-recommended'
import { defineConfig } from 'oxlint'

// No host role exists in the presets, so this override names it once. The host
// is the Effect-free Deno driver and its coprocesses: it runs outside the
// sandbox and loads no third-party code, so it never imports Effect. Every
// preset rule that can be satisfied without Effect stays on for it; only these
// eight are dropped, and each drops because the only way to satisfy it is to
// import Effect into the unsandboxed host:
//   effecttsgo/async-function — the async driver is the host's shape; the compliant alternative returns an Effect
//   effecttsgo/missing-pipeable-signature — a pipeable signature is an Effect member; without Effect there is no pipe
//   effecttsgo/global-console — the Effect console is an Effect import the host cannot take; it writes to stdio directly
//   effecttsgo/global-date — the host reads the wall clock once at the edge and passes measuredAt as data; the ported source is Effect
//   effecttsgo/node-builtin-import — the host is Deno shell code; the only documented escape from the node: ban is an Effect platform import
//   eslint/no-restricted-imports — the restriction's allowed replacement is an Effect module; the host may only reach node: and Deno
//   @systemfsoftware/effect-platform/no-unported-time-source — the ported time source is an Effect layer, so naming it needs Effect
//   @systemfsoftware/effect-platform/entrypoint-interprets-once — interpreting an Effect entrypoint needs the Effect runtime the host lacks
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
