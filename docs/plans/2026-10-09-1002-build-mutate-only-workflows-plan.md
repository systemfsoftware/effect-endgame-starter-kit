---
title: Mutate Only Workflow Files - Plan
type: build
date: 2026-10-09
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
execution: code
---

# Mutate Only Workflow Files - Plan

## Goal Capsule

- **Objective:** The release gate's 100% kill score always covers each package's `*.workflow.ts` decision files, and nothing else. No package can add other files to it or quietly take files out.
- **Means:** the planner lists each package's workflow files from one glob in `stryker.shared.ts`, and the gate passes that list to Stryker as `--mutate` (KTD1, KTD2).
- **Authority:** Conductor rulings A-8 and A-8b (2026-10-09). On behavior, R-IDs win. On mechanism, KTDs win.
- **Stop conditions:** Stop if the fork's CLI `--mutate` turns out not to replace the config file's `mutate`. Never run Stryker locally: no mutation runs and no dry runs.
- **Execution profile:** one PR off `main`, containing this plan and the code. Plain push.

## Product Contract

### Summary

The planner computes the exact files to mutate, the gate passes exactly those files to Stryker, and every other way of setting the scope is refused before Stryker starts.

### Problem Frame

At present a package chooses its own mutated set: `apps/site/package.json` declares `stryker.mutate`, and `apps/site/stryker.config.ts` passes that value through. The planner refuses only a set that matches no files (`scripts/mutation-shards.ts:33-39`). As a result, a set like `src/**/*.ts` is planned and then mutated. So is a narrower set that leaves out a decision file. Workflow files in a package with no `mutation` script are never mutated, and nothing is refused as long as some other package mutates.

### Requirements

- R1. For every workspace package, the release gate's Stryker run mutates exactly that package's `*.workflow.ts` files. Test files and other source files are never mutated.
- R2. The planner refuses a package that sets `stryker.mutate` in its `package.json`, with its own named refusal. There is no flag, environment variable, comment or per-package override that gets around it.
- R3. The planner refuses a `mutation` script that is not exactly `stryker run`, with its own named refusal. That is how a package script is prevented from passing its own `--mutate`/`-m`.
- R4. The planner refuses, with its own named refusal, a package that has a `mutation` script but no workflow files.
- R5. The planner refuses, with its own named refusal, a package that has workflow files but no package name or no `mutation` script.
- R6. A workspace with no `*.workflow.ts` file is still refused as an empty set. The earlier refusal for decisions that no package mutates becomes R5's refusal, which names the package. `apps/site` is still planned.
- R7. Tests run real temporary workspaces through the real planner. Every new test fails when its enforcement is removed.
- R8. The README says in one place that only `*.workflow.ts` decision files are mutated.

### Acceptance Examples

- AE1. **Covers R1.** A package contains `src/order.workflow.ts`, `src/order.test.ts`, `src/__tests__/order.workflow.property.test.ts`, `src/page.tsx`, `node_modules/dep/x.workflow.ts` and `.stryker-tmp/…/order.workflow.ts`. Its shard mutates only `src/order.workflow.ts` and its sibling workflow files.
- AE2. **Covers R2.** A package with `stryker.mutate: ["src/**/*.ts"]`, and one with `["src/**/*.test.ts"]`, each get an own-mutate refusal.
- AE3. **Covers R3.** `"mutation": "stryker run -m src/**/*.ts"` gets a script refusal.
- AE4. **Covers R5, R6.** Workflow files in a package with no `mutation` script are refused by that package, whether or not another package mutates.

## Planning Contract

### Key Technical Decisions

- KTD1. **The gate passes the list on the command line.** The fork's `stryker run` merges the CLI record over the file config (`mergeConfig(file, cli)`, vendored stryker-js 17.0.2 `dist/main.mjs:84525`). A child array replaces the inherited one, and `--mutate` is split on commas (`:114070`). So `turbo run mutation --filter=<pkg> -- --mutate "$MUTATE"` decides the set, whatever a package's `stryker.config.ts` contains. No environment variable can set `mutate`. Governs R1, R2.
- KTD2. **One glob, owned by `stryker.shared.ts`.** `WORKFLOW_FILES = '**/*.workflow.ts'` is exported from there. The shared config uses it, and so does the planner. `defineConfig` is an identity function, so the file imports `StrykerConfig` as a type only. That lets the plan job, which has no `node_modules`, import the file through Deno. Governs R1.
- KTD3. **The plan output carries files, not just names.** The planner emits `shards=[{"package":…,"mutate":[…]}]`, with paths relative to the package directory. The mutation matrix runs over `shard`, and `MUTATE` is `join(matrix.shard.mutate, ',')`. It goes through `env`, so file names never get spliced into the shell. Governs R1.
- KTD4. **Refusals are a tagged union keyed by package directory.** The variants are `OwnMutate`, `MutationScriptNotStrykerRun`, `NoWorkflowFiles`, `WorkflowFilesNotMutated` and `NoWorkflowFilesInWorkspace`. Tests compare them against hand-written values. The CLI prints one line per refusal and exits 1. Governs R2-R6.

### Risks

- A workflow path with a comma or glob metacharacters would split or match wrongly under `--mutate`. Stryker then matches no file and exits non-zero, which fails loudly and never widens the set. No such path exists, and none is guarded.
- KTD1 and KTD2 rest on three assumptions, each probed before U2 lands:
  - The fork's `mergeConfig` replaces `mutate` from the CLI record.
  - turbo passes `--` arguments only to the task named on the command line (turborepo.dev `docs/reference/run`).
  - `deno run` loads `stryker.shared.ts` without `node_modules`.

### Test admission

Admitted: planner tests that call `planMutationShards` on temporary workspaces and compare against hand-written plans (OP12, observable contract). Refused: any test that reads `release-gate.yml`, `package.json` or the glob string back and asserts on its text.

### Judgment surfaces (CONST-W3)

This PR edits instruments that grade work: `scripts/mutation-shards.ts`, `.github/workflows/release-gate.yml`, `stryker.shared.ts`, `apps/site/stryker.config.ts`, the `stryker` field of `apps/site/package.json`, and the `//#test:scripts` inputs in `turbo.json`. The owner directed these changes in rulings A-8 and A-8b. The `turbo.json` change adds `stryker.shared.ts` to the inputs, because the planner's tests now import it.

## Implementation Units

- U1. **Planner, shared glob, tests.**
  - **Requirements:** R1-R7. **Decisions:** KTD2-KTD4.
  - **Files:** `stryker.shared.ts`, `scripts/mutation-shards.ts`, `scripts/mutation-shards.test.ts`, `turbo.json`.
  - **Test scenarios:**
    - AE1 to AE4.
    - R4's package with a `mutation` script and no workflow files.
    - The workspace with no `*.workflow.ts` file, from R6.
  - **Verification:** `pnpm test:scripts` passes. Then delete the four new refusals and widen the glob to `**/*.ts` with no exclusions. Every planner test must go red. Revert afterwards.
- U2. **Gate and site config.**
  - **Requirements:** R1, R6. **Decisions:** KTD1, KTD3.
  - **Files:** `.github/workflows/release-gate.yml`, `apps/site/stryker.config.ts`, `apps/site/package.json`.
  - **Approach:** `apps/site` drops its `stryker` field, and its config becomes `export default packageStrykerConfig`.
  - **Verification:** Run the planner on the real tree from a checkout without `node_modules`; it prints `apps/site`'s three workflow files. `pnpm check:ci` passes.
- U3. **README.**
  - **Requirements:** R8. **Files:** `README.md` (the mutation FAQ).
  - **Test expectation:** none, because this is documentation.

## Verification Contract

- `pnpm test:scripts`, the planner run in a checkout without `node_modules`, and `pnpm check:ci`. CI must be green on the PR head.
- Stryker never runs locally. The release gate runs it on `main`.

## Definition of Done

- R1-R8 hold, shown by the tests and the runs named above. The sabotage run is red and recorded in the PR.
- No sabotage edit, probe file or scratch output is left in the diff.
