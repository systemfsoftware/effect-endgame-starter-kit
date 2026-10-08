#!/usr/bin/env -S deno run --config=scripts/deno.json --allow-net=api.github.com --allow-env=GITHUB_TOKEN,GITHUB_REPOSITORY
import { Result, Schema as S } from 'effect'

export const REQUIRED_CHECKS = [
  'check (format)',
  'check (lint)',
  'check (typecheck)',
  'check (test)',
  'check (dist)',
  'check (sfs-sources)',
  'journeys',
  'lint PR commits',
  'changeset · shared tooling / a publishable-package change needs an intent',
  'rules',
] as const

const StatusChecksRule = S.Struct({
  type: S.Literal('required_status_checks'),
  parameters: S.Struct({
    required_status_checks: S.Array(S.Struct({ context: S.String, integration_id: S.optionalKey(S.Int) })),
  }),
})
type StatusChecksRule = S.Schema.Type<typeof StatusChecksRule>

const OtherRule = S.Struct({
  type: S.String.pipe(S.check(S.makeFilter((type: string) => type !== 'required_status_checks'))),
})

const BranchRules = S.Array(S.Union([StatusChecksRule, OtherRule]))

export type BranchRule = S.Schema.Type<typeof BranchRules>[number]

export const decodeBranchRules = S.decodeUnknownResult(BranchRules)

const isStatusChecksRule = (rule: BranchRule): rule is StatusChecksRule => rule.type === 'required_status_checks'

export const branchRulesVerdict = (
  rules: readonly BranchRule[],
  requiredChecks: readonly string[],
): readonly string[] => {
  const enforced = new Set(
    rules.filter(isStatusChecksRule).flatMap((rule) =>
      rule.parameters.required_status_checks.map((check) => check.context)
    ),
  )
  return requiredChecks.filter((name) => !enforced.has(name))
}

if (import.meta.main) {
  const repository = Deno.env.get('GITHUB_REPOSITORY')
  const token = Deno.env.get('GITHUB_TOKEN')
  if (repository === undefined || token === undefined) {
    console.error('check-branch-rules: set GITHUB_REPOSITORY (owner/repo) and GITHUB_TOKEN')
    Deno.exit(1)
  }
  const path = `/repos/${repository}/rules/branches/main`
  const response = await fetch(`https://api.github.com${path}?per_page=100`, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'user-agent': 'check-branch-rules',
      'x-github-api-version': '2022-11-28',
    },
  })
  console.log(`check-branch-rules: GET ${path} -> HTTP ${response.status}`)
  if (!response.ok) {
    console.error(`check-branch-rules: ${await response.text()}`)
    Deno.exit(1)
  }
  const decoded = decodeBranchRules(await response.json())
  if (Result.isFailure(decoded)) {
    console.error(`check-branch-rules: the response is not GitHub's documented rule list:\n${decoded.failure.message}`)
    Deno.exit(1)
  }
  const rules = decoded.success
  console.log(`check-branch-rules: active rule types: ${rules.map((rule) => rule.type).join(', ') || '(none)'}`)
  const missing = branchRulesVerdict(rules, REQUIRED_CHECKS)
  if (missing.length > 0) {
    console.error(
      `check-branch-rules: main's active rules do not require ${missing.length} of the ${REQUIRED_CHECKS.length} checks a pull request must pass; install .github/rulesets/gates.json (README, Getting Started):\n${
        missing.map((name) => `  ${name}`).join('\n')
      }`,
    )
    Deno.exit(1)
  }
  console.log(`check-branch-rules: main's active rules require all ${REQUIRED_CHECKS.length} checks`)
}
