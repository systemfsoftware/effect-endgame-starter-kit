import { describe, it } from '@systemfsoftware/vitest'
import * as Arr from 'effect/Array'
import * as Result from 'effect/Result'
import { llmsTxt, LlmsTxtCommand } from '../llms-txt.workflow'

const occurrencesOf = (haystack: string, needle: string): number => haystack.split(needle).length - 1

const documentOf = (result: ReturnType<typeof llmsTxt>): string =>
  Result.match(result, { onFailure: () => '', onSuccess: (decision) => decision.document })

describe('llmsTxt — page catalog rendering', () => {
  it.prop(
    '∀c_Pages_⊨OneH1ThenSummaryAndLinks',
    { of: [LlmsTxtCommand], subject: llmsTxt },
    (subject, [command]) => {
      const document = documentOf(subject(command))
      const lines = document.split('\n')
      return lines[0] === '# Endgame Starter' &&
        (lines[2] ?? '').startsWith('> ') &&
        Arr.every(
          Arr.dedupe(command.pages),
          (page) => occurrencesOf(document, `- [${page.title}](${command.origin}${page.path})`) === 1,
        ) &&
        Arr.every(command.pages, (page) => document.includes(`${command.origin}${page.path}`))
    },
  )
})
