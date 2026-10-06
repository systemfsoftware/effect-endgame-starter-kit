# rat-stack scorecard

The scorecard measures the starter against [rat-stack](https://github.com/joelhooks/rat-stack) on one or more metrics per rat-stack bin and surface, and publishes which bins the starter beats. Both sides are run; no number comes from reading a README.

## Ownership

`evals/ratstack-scorecard/**` and `.github/workflows/scorecard.yml` are an Evaluator surface owned by the verifier session (`starter-verify`). Builders never edit them: a builder who changes the instrument that grades their work reports the score they chose (CONST-E9). A metric that looks wrong goes to Kiro as a finding.

## What it measures

`src/metrics/registry.ts` lists every row: its id (`M1`-`M29`, with sub-rows such as `M3.lcp`), the rat-stack bin it grades, its unit, which direction is better, whether it is a `count` (three runs that must agree exactly) or a `measurement` (N runs), and the family that measures it. The plan's Metric Catalog (`docs/plans/2026-10-05-2151-feat-ratstack-scorecard-plan.md`) explains each row.

## How a verdict is reached

- A row is **beaten** only when the starter's worst run is strictly better than rat-stack's best run. Overlapping ranges are **not beaten**; identical ranges are a **tie**.
- A count that does not reproduce exactly, or a side that produced the wrong number of runs, is an **instrument error**.
- An invariant rat-stack lacks is **unsupported** with a `file:line` citation. The citation is re-checked at the pin; if the cited lines no longer say it, the row is an instrument error.
- The ratchet compares a PR with the latest `main` artifact. It fails on any instrument error, on a row beaten on `main` that the PR no longer beats, and on a starter value worse than `main`'s worst run. A missing secret or a fork PR without a preview is neutral. A changed metric definition is re-baselined.

## Running it

Everything that loads third-party code runs inside the sandbox launcher from `systemfsoftware/pnpm-release-management` (`packages.<system>.sandbox`), with this directory as the sandbox project. The instrument's own flake (`flake.nix`) pins nixpkgs (pnpm 12.9.0, Node 24) and the launcher, and builds the tools' pnpm store from `pnpm-lock.yaml` as a fixed-output derivation (`tools-store`). The install is offline from that store; the sandbox gets no network at all.

```sh
cd evals/ratstack-scorecard
nix develop --command sh -c 'SANDBOX_PROJECT=$PWD sandbox --pnpm-store "$SANDBOX_PNPM_STORE" -- pnpm install --frozen-lockfile'
nix develop --command sh -c 'SANDBOX_PROJECT=$PWD sandbox -- pnpm vitest run'
```

The decision modules (`src/model/*.workflow.ts`) and the orchestrator import only Deno APIs, `node:` builtins and each other, so `deno check src/` type-checks them without any third-party code.
