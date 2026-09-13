---
title: Matrixizing a gated job retires the required status-check name, so rename both or the merge gate dies green
date: 2026-09-13
category: workflow-issues
module: ci-workflow
problem_type: workflow_issue
component: tooling
severity: medium
applies_when:
  - "Turning a job that branch protection requires into a runs-on matrix"
  - "Renaming or splitting a workflow job whose status context a required check names"
  - "Adding or removing a matrix leg on a gated job"
symptoms:
  - "A pull request sits on 'Waiting for status to be reported' while every workflow run is green"
  - "The merge box expects a check context that no run has reported since the matrix landed"
tags: [github-actions, branch-protection, required-status-checks, matrix, ci-gate, silent-pass]
---

# Matrixizing a gated job retires the required status-check name, so rename both or the merge gate dies green

## Context

The CI workflow's only job, `jobs.check`, reported the status context `check`, and branch protection on the main branch requires status checks by exact context string. Adding a runner matrix to that job — `strategy.matrix.os` with `runs-on: ${{ matrix.os }}` — changes what the job reports: GitHub names a matrix leg's context `<job> (<matrix value>)`, so the workflow now reports `check (ubuntu-latest)` and `check (macos-latest)`, and nothing reports a context named exactly `check`.

A required context that is never reported is not a failure. It stays pending, the pull request is blocked with "Waiting for status to be reported", and every workflow run is green while the merge gate is gone. The failure is silent in the direction that matters: the signal that would go red no longer exists.

## Architectural Invariants

**A status context is part of the job's public name, and branch protection binds to that name by exact string.** A gated job's reported context may change only together with the matching change to the required-check list — or not at all. Matrix legs, renames, splits, and leg removals all change it.

**A guard that stops reporting is silent, not red.** Detection must key on the guard's presence, never on its verdict. A run reports success for the contexts it produces; a context that is absent fails nothing.

**The pass condition is "required contexts are reported and successful", not "the workflow is green".** The merge box's rollup is the read that distinguishes them:

```text
required = branch_protection.requiredContexts      # exact strings, stored when the rule is written
reported = statusCheckRollup.map(c => c.name)      # matrix legs appear as "<job> (<matrix value>)"

invariant: every context in required is present in reported
violated:  required contains "check"; reported contains only "check (ubuntu-latest)", "check (macos-latest)"
```

## Guidance

- **Matrixizing a gated job: rename the required checks in the same change.** The entries become the per-leg contexts. Adding a leg later means adding its entry; removing a matrix means collapsing the entries back to the single context that remains.
- **Never satisfy the old name with a decoy.** A job or step named `check` that reports success without running the gate is a fake gate, and it is worse than a pending check because it hides itself: the protection appears satisfied and nothing is verified.
- **The required-check list is an owner surface**, because it needs repository admin rights and because it is the instrument that grades merges. An agent hands the exact replacement names to that owner; it does not widen its own scope to edit it.

Wrong: matrixize `check` and rely on the merge box to sort itself out.
Right: matrixize `check`, then have the protection owner rename the required checks to the two leg contexts before anything else merges.

## Verification

The probe that confirms the invariant held, run after the first workflow run on the branch:

```bash
gh pr view <N> --json mergeStateStatus,statusCheckRollup \
  --jq '{mergeStateStatus, checks: [.statusCheckRollup[] | {name, status, conclusion}]}'
```

Held when the rollup carries both leg contexts with `success`, and `mergeStateStatus` is blocked only by whatever review the repository requires. Violated when the merge box expects a context named `check` that no run reports.

Reading the rule back directly needs admin scope: `GET /repos/{owner}/{repo}/branches/main/protection` returns 403 for a write-scoped token, so the merge box is the readable signal.

## When to Apply

- Making a gated job a matrix, or adding a leg to one.
- Renaming or splitting a job whose context appears in branch protection or a ruleset.
- Reviewing any workflow change: ask whether the job's reported context changes, and who owns the required-check list.

## Related

- `docs/solutions/tooling-decisions/pnpm-owns-the-changeset-ledger.md` — the other gate-shaped learning in this corpus: both describe a gate whose green signal stops corresponding to the thing it guards.
