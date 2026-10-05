import recommended from '@systemfsoftware/oxlint-config-recommended'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [recommended],
  rules: {
    'typescript/no-unnecessary-condition': 'error',
    'typescript/strict-boolean-expressions': 'error',
    'typescript/no-non-null-assertion': 'error',
  },
})
