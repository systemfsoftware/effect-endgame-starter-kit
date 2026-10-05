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

Everything that loads third-party code runs inside the sandbox launcher from `systemfsoftware/pnpm-release-management` (`packages.<system>.sandbox`).

The instrument has its own flake (`flake.nix`, pinned nixpkgs and launcher). Its `scorecard` package bundles Deno, the launcher, the rat-stack source at `ratstack.pin.json`, and the offline pnpm store for the tools (`tools-store`). The family runners install the tools from that store inside the sandbox, so nothing reaches the registry at measurement time.

```sh
scorecard=$(nix build --no-link --print-out-paths ./evals/ratstack-scorecard#scorecard)
$scorecard/bin/scorecard measure --family static --out static.json
```

The instrument's own tests run inside the launcher against the same offline store:

```sh
cd evals/ratstack-scorecard
nix develop --command sh -c 'SANDBOX_PROJECT=$PWD sandbox --pnpm-store "$SANDBOX_PNPM_STORE" -- pnpm install --frozen-lockfile'
nix develop --command sh -c 'SANDBOX_PROJECT=$PWD sandbox -- pnpm vitest run'
```

`src/main.ts` and everything it imports use only Deno APIs, `node:` builtins and each other, so `DENO_NO_PACKAGE_JSON=1 deno check src/` type-checks the orchestrator and the decision core without third-party code. The Node scripts in `src/tools/` are the only code that loads npm packages, and they only ever run inside the launcher.
