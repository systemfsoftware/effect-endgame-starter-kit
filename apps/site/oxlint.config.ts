import { defineConfig } from 'oxlint'
import shared from '../../oxlint.shared.ts'

export default defineConfig({
  extends: [shared],
  overrides: [
    {
      files: ['**/todo-ids.ts'],
      rules: {
        '@systemfsoftware/effect-platform/no-unported-time-source': [
          'error',
          { ports: ['apps/site/src/features/todo/todo-ids.ts'] },
        ],
      },
    },
  ],
})
