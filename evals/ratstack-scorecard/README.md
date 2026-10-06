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
- **The decide step** (`decide/`, Effect 4 with Schema and `effect/http`) runs as its own launcher invocation: `aggregate` (decode the family results and `main`'s scorecard, judge, ratchet, render), `cache-check`, `latest-main-run` and `pin-check`. Only the last two may reach `api.github.com`; GitHub calls time out after 15 s, retry transient failures three times, and fail as a typed `GithubApiError`. Pass or fail is the step's exit code. `pnpm exec tsc` type-checks `decide/` and `journeys/` inside the launcher.

Journeys run in two phases, because the launcher cannot nest. `scorecard journeys` produces every journey declared in `journeys/manifest.json` through the real launcher work and records it to `journeys/__records__/<id>.json`, then runs the one vitest project inside the launcher. A test is a journey because it imports `journeys/launcher-run.ts`; a missing or stale record fails it red.

```sh
scorecard=$(nix build --no-link --print-out-paths ./evals/ratstack-scorecard#scorecard)
$scorecard/bin/scorecard check
```

The Node scripts in `src/tools/` and everything in `decide/` load npm packages, and they only ever run inside the launcher.

## In CI

`.github/workflows/scorecard.yml` runs on every PR to `main`, every push to `main`, daily, and on demand. All jobs run on GitHub-hosted runners (`ubuntu-latest`): the self-hosted fleet excludes public repositories by design.

On a pull request every grading job builds the instrument from the base commit's tree, and only the measured starter comes from the PR, so a PR that edits `evals/ratstack-scorecard/**` cannot grade itself. A definition hash covers only a row's registry entry and its family's measurement code; harness, sides, tools, lockfiles and nixpkgs move the rat-stack cache key instead.

- **plan** prints the matrix: one entry per built family, with its timeout and the rat-stack cache key (rat-stack commit, instrument tree hash, nixpkgs rev).
- **measure** runs one family per job. The rat-stack side is restored from the cache when the key matches and `scorecard cache-check` accepts it; an entry holding a rat-stack instrument error is refused and measured again. Only `main`, the schedule and manual runs save it, and only when the fresh result holds no instrument error. The starter side is measured every run. Each job uploads `family-<name>`.
- **aggregate** joins the families, compares them with the latest successful `main` run's `scorecard` artifact (`scorecard latest-main-run`; none yet means a first baseline), writes the Markdown table to the job summary, uploads `scorecard.json`, and fails when the ratchet fails. Every re-baselined row is listed under definition drift with both hashes.
- **instrument preview** (PRs that edit the instrument, never gates) builds the PR's own instrument, measures every family and lists the rows it would re-baseline against the graded scorecard.
- **pin** (not on PRs) compares `ratstack.pin.json` with rat-stack `main`, decoded as a 40-hex SHA. When rat-stack has moved it opens or updates the `scorecard/pin-rat-stack` PR through the pin-bump GitHub App (`vars.SCORECARD_APP_ID`, `secrets.SCORECARD_APP_PRIVATE_KEY`; contents and pull requests write only). The branch is bot-owned: the job refuses to replace a tip another author wrote and pushes with a lease pinned to the tip it read. The token reaches git through a credential helper that reads it from the environment. That PR changes only the pin; Kiro merges it.

`actionlint` is in the dev shell: `nix develop ./evals/ratstack-scorecard --command actionlint .github/workflows/scorecard.yml`.
