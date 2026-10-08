---
title: Gates Bind and Inline Suppression - Plan
type: feat
date: 2026-10-08
origin: docs/brainstorms/2026-10-08-0340-feat-starter-state-of-the-art-plan.md
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
execution: code
---

# Gates Bind and Inline Suppression - Plan

## Goal Capsule

- **Objective:** In an adopter's copy and in the template itself, nothing reaches production without passing every CI check, the journeys and the mutation gate on that same commit. A merge into `main` needs every pull-request check to pass. A lint rule can't be switched off by a comment in source.
- **Scope:** Two units of work from the origin document, planned separately. C1 covers R22 and R23 and lands in this repo. C3 covers R26 and lands first in systemfsoftware's oxlint presets, reaching the starter on its next flake lock bump. A (lifecycle), B (eval) and C2 (code-owner review) are out of scope.
- **Authority:** The origin document's R-IDs win on behavior. This plan's KTDs win on mechanism within those R-IDs. The conductor reviews this plan before any implementation starts. GATE1 is granted for R22 and R23 (origin Q7). R26 goes to systemfsoftware as its own PR (origin Q9).
- **Stop conditions:** Stop and return to the conductor if U1 shows `GITHUB_TOKEN` can't read branch rules, or if U5's spike shows a directive can disable the rule that bans directives.
- **Execution profile:** One unit per PR, each a layer in a `gh stack` on `main`, plain pushes only. No local Stryker; mutation runs only at the release gate. No GitHub ruleset or settings changes happen in any unit. The one-time ruleset install on the template (U4) is a conductor action, taken after review.

## Product Contract

### Summary

C1 makes the production deploy wait for CI and for a mutation run that actually happened. It adds a CI check that fails until `main`'s rules require every pull-request check, and a README step that installs those rules. C3 adds a lint rule in the systemfsoftware presets that fails on any inline disable directive and on any `@ts-expect-error`.

### Problem Frame

See the origin document's Problem Frame, bullets "Gates do not block in a copy, or in the template" and "A rule can be switched off one line at a time".

### Requirements

The origin document owns the requirement text. This plan carries:

**C1. Gates bind in a copy**

- R22. A CI check fails while `main`'s active rules don't require every pull-request check to pass with no bypass, and require code-owner review. The README's one-time setup step makes it pass. (origin R22; the code-owner clause is sequenced by KTD4.)
- R23. The production deploy runs only for a commit whose CI checks and journeys succeeded on that exact commit, and whose mutation job ran and succeeded. A mutation plan that finds no `*.workflow.ts` refuses. (origin R23)

**C3. Inline suppressions fail lint**

- R26. Any `oxlint-disable*` or `eslint-disable*` directive, and any `@ts-expect-error`, anywhere in workspace source, test files included, fails `pnpm lint`. The rule lives in the systemfsoftware oxlint presets. (origin R26)

### Acceptance Examples

These are the success predicates (from the origin document):

- AE6. **Covers R23.** Given a commit on `main` whose `journeys` job fails while mutation passes, then no production deploy runs for that commit.
- AE9. **Covers R23.** Given a commit on `main` that deletes every `*.workflow.ts`, then the mutation plan refuses and no production deploy runs.
- AE10. **Covers R22.** Given a fresh copy whose `main` has no rules, then the rules check fails on every push and PR until the README's setup step is done, and passes afterwards.
- AE11. **Covers R26.** Given a PR that adds `// oxlint-disable-next-line <rule>` above a line in `sign-guestbook.workflow.ts`, then `pnpm lint` fails.

(AE5 belongs to R24, which is C2, and is out of scope here.)

### Outcomes that must not count

From the origin document, area C:

- A deploy gated on a different commit's CI run, or one that treats a skipped CI or mutation job as a success.
- A rules check that passes when some ruleset exists but doesn't require the named checks.
- R26 met by banning directives in decision files only, or by an allow-list of rule names.

Added by this plan:

- A rules check that is not itself one of the required checks, so removing the ruleset would go unnoticed at merge time.
- An R26 rule that a directive naming that rule can switch off (U5's spike).
- `--no-verify`, a skipped job, or a weakened threshold used to land any unit.

### Scope Boundaries

- C2 (R24: `CODEOWNERS`, the two-ruleset split and the `kiro-systemf` bypass) is a separate plan, after its own spike.
- Installing the rulesets on the template repo is a GitHub settings change. No unit makes it. U4 ships the files and the README step, and the conductor applies them after review.

### Open Questions

- **Blocking U3's bypass clause, for the conductor:** R22 requires the checks "with no bypass". GitHub returns a ruleset's `bypass_actors` only to a caller with write access to that ruleset (`docs.github.com/en/rest/repos/rules`, "Get a repository ruleset"). A workflow's read-only `GITHUB_TOKEN` therefore can't see them, so no CI check can verify the clause. U1 confirms this. Two options:
  - (a) The rules check verifies required checks only, and "no bypass" is carried by `.github/rulesets/gates.json` plus review of that file. This narrows R22's mechanical check and needs your approval.
  - (b) The check reads the ruleset with a token that has admin rights. That puts a credential in the copy, which the brief forbids.
  - The plan proceeds on neither until you rule.

## Planning Contract

### Key Technical Decisions

- KTD1. **The release gate runs CI itself as a reusable workflow, and deploy needs it.** `ci.yml` gains `on: workflow_call`, and `release-gate.yml` adds `ci: uses: ./.github/workflows/ci.yml`. Deploy becomes `needs: [ci, plan, mutation]` with every result `== 'success'`. A called workflow's `github` context is the caller's (GitHub docs, "Reusing workflow configurations"), so it checks out the same commit and "CI on that exact commit" holds by construction. `ci.yml` keeps its `push` and `workflow_dispatch` triggers, because `release.yml` dispatches `ci.yml` (pnpm-release-management `ci-workflow: ci.yml`). The cost is a duplicate CI run on each push to `main`. A `workflow_run` trigger was rejected: it runs in the default branch's context, and its head-SHA matching is easier to get wrong. Governs R23.
  - **Concurrency invariant.** A called workflow's `github.workflow` is its caller's name. So `ci.yml`'s group, `${{ github.workflow }}-${{ github.ref }}` with `cancel-in-progress: true`, becomes `Release gate-<ref>` when the gate calls it. That group must never equal the gate's own group (`release-gate-<ref>`) or the standalone CI's group (`CI-<ref>`); if it did, one run would cancel the other and deploy would see a cancelled `ci`. Today all three differ. U2 keeps them distinct.
- KTD2. **An empty decision set is a refusal in the planner, not a skip in the workflow.** `planMutationShards` returns a refusal when `decisions === 0`. The existing early return at `scripts/mutation-shards.ts:45` goes. Deploy drops `needs.mutation.result == 'skipped'` from `release-gate.yml:72`. The planner's `::notice` for zero decisions goes with it. Governs R23.
- KTD3. **The rules check is a Deno script with a pure verdict, run as its own CI job.** `scripts/check-branch-rules.ts` reads `GET /repos/{owner}/{repo}/rules/branches/main` with `GITHUB_TOKEN` (shell). It decodes the response with a schema and passes it to a pure `branchRulesVerdict(rules, requiredChecks)`, which returns the missing check names as data. The script exits non-zero when any are missing. It follows the existing `check-sfs-sources.ts` pattern: a shebang carries the minimum flags (`--allow-net=api.github.com --allow-env=GITHUB_TOKEN,GITHUB_REPOSITORY`). The required set names every pull-request check and the rules check's own job name. The endpoint returns only active rules, so a ruleset in `evaluate` or `disabled` mode counts as absent. Whether the verdict also covers bypass actors is the Open Question above. Governs R22.
- KTD4. **C1's rules check requires the named checks now, and C2 adds the code-owner clause.** R22(a) also asks for code-owner review, which only C2's ruleset provides. Requiring it in C1 would keep `main` red until C2 lands. So U3 checks the required status checks, and C2's first unit after its spike adds the code-owner clause to `branchRulesVerdict`. This sequences R22 across two plans and doesn't narrow it. **For conductor review:** if you want R22 whole in C1, C1 waits for C2's spike instead.
- KTD5. **The README step installs the ruleset from a file in the repo.** `.github/rulesets/gates.json` holds the "gates" ruleset. It has the required status checks with KTD3's names, `pull_request`, and no bypass actors, matching origin R24's "gates". The README step is one `gh api -X POST repos/{owner}/{repo}/rulesets --input .github/rulesets/gates.json`, run by the adopter with their own credentials. The template holds none. Governs R22.
- KTD6. **R26 uses a native rule where one exists and a plugin rule only where none does.** In `packages/oxlint-presets/oxlint-config-dmmf/src/index.ts`, `typescript/ban-ts-comment` sets `'ts-expect-error': true`, replacing `allow-with-description`. Named `oxlint-disable*` and `eslint-disable*` directives have no native ban (oxc #15173). A new rule in an existing systemfsoftware oxlint plugin reports every directive comment. The plugin and rule name follow that repo's `packages/oxlint-plugin/AGENTS.md` conventions and are chosen in U5. Governs R26.

### Sequencing

U1 → U2 and U3 in parallel → U4 after U3. Separately, U5 (systemfsoftware) → U6 (starter, on the next flake lock bump). U2 is one PR. U3 and U4 are one PR. U5 is one systemfsoftware PR. Each PR declares the judgment surfaces it changes (origin Q7).

### Risks & Dependencies

- **`GITHUB_TOKEN` and the rules endpoint.** The endpoint answered a personal token on 2026-10-08. U1 settles whether `GITHUB_TOKEN` can read it, and confirms that `bypass_actors` is withheld from that token.
- **Merging U3 turns the template's `main` red** until the "gates" ruleset is installed there. Today `main` has `deletion`, `non_fast_forward` and `pull_request` rules and no required checks. The conductor installs U4's ruleset before or with that merge.
- **A self-disabling directive.** A file-level `/* oxlint-disable <the-ban-rule> */` might suppress the ban rule itself. U5 tests this first.
- **Duplicate CI on `main`** (KTD1) costs hosted-runner minutes, not correctness.
- **Concurrency collision** (KTD1). If a later rename of either workflow made the groups equal, the gate's CI would be cancelled, and deploy would refuse rather than ship. So the failure is safe but silent. U2's PR records the three resolved group strings.

## Implementation Units

- U1. **Spike: can `GITHUB_TOKEN` read branch rules?**
  - **Goal:** Prove a workflow's `GITHUB_TOKEN` (`contents: read`) gets a 200 from `rules/branches/main` with the active rules, and record whether `GET rulesets/{id}` returns `bypass_actors` to it.
  - **Requirements:** R22.
  - **Files:** None committed. A throwaway `workflow_dispatch` run on a scratch branch, deleted afterwards.
  - **Approach:** Call the endpoint once from a job with `permissions: contents: read`, and print the rule types.
  - **Verification:** The run log shows `deletion`, `non_fast_forward` and `pull_request`, matching the 2026-10-08 read, and shows whether `bypass_actors` is present. A 403 or 404 on the rules endpoint means stop and return to the conductor.

- U2. **The deploy waits for CI and for a real mutation run.**
  - **Goal:** R23 holds on `main`.
  - **Requirements:** R23. **Decisions:** KTD1, KTD2.
  - **Files:** `.github/workflows/ci.yml` (add `workflow_call`), `.github/workflows/release-gate.yml` (add the `ci` job, change deploy's `needs` and `if`), `scripts/mutation-shards.ts`, `scripts/mutation-shards.test.ts`.
  - **Approach:** In the planner, replace the early return at `:45` with a refusal naming the empty set. The CLI already exits 1 on refusals (`:57-60`). Rewrite the test at `scripts/mutation-shards.test.ts:71` to expect that refusal. The expected value comes from R23 and CONST-T3, not from the code's output.
  - **Test scenarios:** A workspace with zero `*.workflow.ts` gets a refusal and `packages: []`. The existing cases are unchanged.
  - **Verification:** `pnpm test:scripts` passes. In the PR, the deploy job's `needs` and `if` show `ci`, `plan` and `mutation` each `== 'success'`, and no `skipped` arm. The PR description records the three concurrency group strings from KTD1.

- U3. **The rules check.**
  - **Goal:** CI fails while `main`'s active rules don't require every pull-request check.
  - **Requirements:** R22(a). **Decisions:** KTD3, KTD4.
  - **Files:** `scripts/check-branch-rules.ts`, `scripts/check-branch-rules.test.ts`, `.github/workflows/ci.yml` (one `rules` job), `package.json` (`check:branch-rules` script).
  - **Approach:** Shell reads the rules, then decode, then the pure `branchRulesVerdict`, then the exit code. The required names are the six `check (…)` legs, `journeys`, `lint PR commits`, the changeset check and `rules` itself.
  - **Test scenarios:** `branchRulesVerdict` is a pure decision, so it gets one property file plus hand-written refusals (CONST-T14, CONST-T10). The shell and its HTTP call get no test of their own; U3's PR run is their proof.
    - Property: for any subset of the required names that a generated `required_status_checks` rule omits, the verdict names exactly that subset, and an empty subset passes. Non-status-check rules that are mixed in change nothing.
    - Hand-written refusals, expected values taken from R22 and GitHub's documented "Get rules for a branch" response:
      - No rules at all: fails, naming every required check.
      - Today's template rules (`deletion`, `non_fast_forward`, `pull_request`): fails, naming every required check.
  - **Verification:** `pnpm test:scripts` passes. On the PR, the `rules` job fails against the template's current rules (AE10's "before").

- U4. **The README setup step and the "gates" ruleset file.**
  - **Goal:** The adopter has one documented command that makes U3 pass.
  - **Requirements:** R22(b). **Decision:** KTD5.
  - **Files:** `.github/rulesets/gates.json`, `README.md` (a new step in Getting Started, between "Run It Locally" and "Deploy").
  - **Approach:** The ruleset JSON lists KTD3's names. The README step names the command and says the check stays red until it runs.
  - **Verification:** After review, the conductor installs the ruleset on the template, and U3's job then passes (AE10's "after"). No unit applies it.

- U5. **The R26 rule in systemfsoftware** (its own PR there).
  - **Goal:** Lint under the recommended preset fails on any `oxlint-disable*`, `eslint-disable*` or `@ts-expect-error`.
  - **Requirements:** R26. **Decision:** KTD6.
  - **Files** (systemfsoftware): `packages/oxlint-presets/oxlint-config-dmmf/src/index.ts`, a rule plus its RuleTester tests in an existing `packages/oxlint-plugin/*` package, and a changeset.
  - **Approach:** First run the self-disable spike: a file-level directive naming the new rule must still produce a report. If oxlint lets that directive silence the rule, stop and return to the conductor. Then wire the rule into the dmmf preset at `error`.
  - **Test scenarios:**
    - Each refused form (`oxlint-disable`, `-next-line`, `-line`, the `eslint-` equivalents, `@ts-expect-error` with and without a description) reports, including in test files.
    - A comment that only mentions the word, such as a string literal or ordinary prose, doesn't report.
  - **Verification:** That repo's own lint, typecheck and tests pass. No Stryker locally.

- U6. **The starter picks up R26.**
  - **Goal:** AE11 holds in the starter.
  - **Requirements:** R26.
  - **Files:** `flake.lock` (the next systemfsoftware input bump; a judgment surface, declared in that PR).
  - **Approach:** No starter code changes. The workspace has no directives today.
  - **Verification:** `pnpm lint` passes on the bumped tree. A throwaway directive added to `sign-guestbook.workflow.ts` makes `pnpm lint` fail, and the throwaway is then removed.

## Verification Contract

- Starter: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (includes `test:scripts`), and `pnpm check:ci` before each PR. Workflow changes are proved by their PR's CI run, not locally.
- systemfsoftware: that repo's own `check:ci` equivalent for U5.
- Never: local Stryker, `--no-verify`, or any edit to a threshold, preset rule or required-check list beyond what a unit names.

## Definition of Done

- **C1:**
  - AE6, AE9 and AE10 hold, shown by the unit tests and the PR CI runs named in U2 to U4.
  - None of the "must not count" outcomes is present.
  - Each PR declares its judgment surfaces.
- **C3:**
  - AE11 holds after U6.
  - The U5 self-disable spike is recorded in the systemfsoftware PR.
- **Every unit:** no throwaway workflow, fixture directive or spike branch is left behind.
