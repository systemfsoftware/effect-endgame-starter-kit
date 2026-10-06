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

The instrument's own checks run with one command: `scorecard check` (also `pnpm scorecard:check` at the repo root, part of `check:ci`). It first refuses any third-party import in the host driver's graph and any import of the journey fixture from `src/`, then runs `scorecard journeys`.

The program is split in two:

- **The host driver** (`src/main.ts` and what it imports) uses only Deno APIs, `node:` builtins and its own files, so `DENO_NO_PACKAGE_JSON=1 deno check src/` type-checks it without third-party code. It starts launcher invocations, mounts their inputs read-only, collects output files and exit codes, and writes the pin file. It decodes and judges nothing. Its only network access is through the launcher.
- **The decide step** (`decide/`, Effect 4 with Schema and `effect/http`) runs as its own launcher invocation from a copy of the grading instrument: `aggregate` (decode the family results and `main`'s scorecard, judge, ratchet, render), `cache-check`, `main-scorecard` and `pin-check`. Only the last two reach the network, and only `api.github.com` and the artifact store (`*.blob.core.windows.net`); GitHub calls time out after 15 s, retry transient failures three times, and fail as a typed `GithubApiError`. Pass or fail is the step's exit code. `pnpm exec tsc` type-checks `decide/` and `journeys/` inside the launcher.

Journeys run in two phases, because the launcher cannot nest. `scorecard journeys` produces every journey declared in `journeys/manifest.json` through the real launcher work and records it to `journeys/__records__/<id>.json`, then runs the one vitest project inside the launcher. A test is a journey because it imports `journeys/launcher-run.ts`; a missing or stale record fails it red.

```sh
scorecard=$(nix build --no-link --print-out-paths ./evals/ratstack-scorecard#scorecard)
$scorecard/bin/scorecard check
```

The Node scripts in `src/tools/` and everything in `decide/` load npm packages, and they only ever run inside the launcher.

## In CI

`.github/workflows/scorecard.yml` runs on every PR to `main`, every push to `main`, daily, and on demand. All jobs run on GitHub-hosted runners (`ubuntu-latest`): the self-hosted fleet excludes public repositories by design.

The workflow is a thin caller: it chooses the grading instrument, builds it, and runs `scorecard ci`, the one stable entrypoint. Measuring every family, the rat-stack cache, finding `main`'s scorecard, judging, the ratchet and the job summary all happen inside the instrument, so a pull request that adds a step never needs its base to know that step; the step starts grading after it merges.

- **Which instrument grades.** Pushes, the schedule and manual runs use their own commit. A pull request is graded by its base commit's instrument, chosen by `ci/instrument-ref.sh` (run from the base tree whenever the base has it). Only when the base tree has no `.github/workflows/scorecard.yml` at all is the PR head's instrument used; the job summary and a PR comment then say **BOOTSTRAP: self-graded, base had no instrument**. A base commit missing from the clone fails the job instead of falling back to bootstrap. The `instrument-ref` journey proves it on real git history: with the workflow on the base, a PR that edits the instrument to flip a verdict, deletes the instrument, or deletes the workflow is still graded by the base.
- **scorecard** builds the chosen instrument and runs `scorecard ci`. The rat-stack side comes from the cache when its key (rat-stack commit, instrument content hash, nixpkgs rev) matches and `cache-check` accepts it; an entry holding a rat-stack instrument error is refused and measured again. Only pushes, the schedule and manual runs save the cache, only results without instrument errors, and stale keys are pruned. The starter side is measured every run. `scorecard ci` compares with the latest successful `main` run's `scorecard` artifact (none yet means a first baseline), writes the table to the job summary, uploads `scorecard.json`, and fails when the ratchet fails. Re-baselined rows are listed under definition drift with both hashes. A definition hash covers only a row's registry entry and its family's measurement code.
- **instrument preview** (PRs graded by their base that edit the instrument; never gates) runs the PR's own `scorecard ci` against the graded scorecard and lists what it would re-baseline.
- **pin** (not on PRs) compares `ratstack.pin.json` with rat-stack `main`, decoded as a 40-hex SHA. When rat-stack has moved it opens or updates the `scorecard/pin-rat-stack` PR through the pin-bump GitHub App (`vars.SCORECARD_APP_ID`, `secrets.SCORECARD_APP_PRIVATE_KEY`; contents and pull requests write only). The branch is bot-owned: the job refuses to replace a tip another author wrote and pushes with a lease pinned to the tip it read. The token reaches git through a credential helper that reads it from the environment. That PR changes only the pin; Kiro merges it.

`actionlint` is in the dev shell: `nix develop ./evals/ratstack-scorecard --command actionlint .github/workflows/scorecard.yml`.
