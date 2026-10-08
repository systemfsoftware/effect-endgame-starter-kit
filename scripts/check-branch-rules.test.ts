import { assert, assertEquals } from '@std/assert'
import { Result } from 'effect'

import { branchRulesVerdict, decodeBranchRules, REQUIRED_CHECKS } from './check-branch-rules.ts'

const R22_CHECKS = [
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
]

const RULESET_SOURCE = {
  ruleset_source_type: 'Repository',
  ruleset_source: 'systemfsoftware/effect-endgame-starter-kit',
  ruleset_id: 22783333,
}

const DELETION = { type: 'deletion', ...RULESET_SOURCE }
const NON_FAST_FORWARD = { type: 'non_fast_forward', ...RULESET_SOURCE }
const PULL_REQUEST = {
  type: 'pull_request',
  ...RULESET_SOURCE,
  parameters: {
    required_approving_review_count: 1,
    dismiss_stale_reviews_on_push: true,
    required_reviewers: [],
    require_code_owner_review: false,
    dismissal_restriction: { enabled: false, allowed_actors: [] },
    require_last_push_approval: false,
    required_review_thread_resolution: false,
    require_extra_approval_for_unattributed_changes: false,
    allowed_merge_methods: ['merge', 'squash'],
  },
}

const statusChecks = (contexts: readonly string[]) => ({
  type: 'required_status_checks',
  ruleset_source_type: 'Repository',
  ruleset_source: 'owner/copy',
  ruleset_id: 1,
  parameters: {
    strict_required_status_checks_policy: false,
    required_status_checks: contexts.map((context) => ({ context, integration_id: 15368 })),
  },
})

const verdictOn = (body: unknown, requiredChecks: readonly string[]): readonly string[] => {
  const decoded = decodeBranchRules(body)
  assert(Result.isSuccess(decoded), `GitHub's documented rule list failed to decode: ${JSON.stringify(body)}`)
  return branchRulesVerdict(decoded.success, requiredChecks)
}

Deno.test('the verdict names exactly the required checks the status-check rules omit, whatever else main enforces', () => {
  for (let mask = 0; mask < 2 ** R22_CHECKS.length; mask++) {
    const omitted = R22_CHECKS.filter((_, index) => (mask & (1 << index)) !== 0)
    const enforced = R22_CHECKS.filter((_, index) => (mask & (1 << index)) === 0)
    const half = Math.ceil(enforced.length / 2)
    const layouts = [
      [statusChecks(enforced)],
      [statusChecks(enforced.slice(0, half)), statusChecks(enforced.slice(half))],
      [DELETION, statusChecks(enforced), NON_FAST_FORWARD, PULL_REQUEST, statusChecks(['preview · deploy'])],
    ]
    for (const rules of layouts) assertEquals(verdictOn(rules, R22_CHECKS), omitted, JSON.stringify(rules))
  }
})

Deno.test('a main with no active rules is refused, naming every required check', () => {
  assertEquals(verdictOn([], REQUIRED_CHECKS), R22_CHECKS)
})

Deno.test("the template's rules today, deletion + non_fast_forward + pull_request, are refused, naming every required check", () => {
  assertEquals(verdictOn([DELETION, NON_FAST_FORWARD, PULL_REQUEST], REQUIRED_CHECKS), R22_CHECKS)
})
