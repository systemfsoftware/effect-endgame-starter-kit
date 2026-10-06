# Lake 1 bottom (#35-#38, #41): review findings

Reviewed as one diff: `acbc4ad..2b763c1` (`origin/lake1/site`). Nothing applied; Kiro rules each finding.

## Code review report (ce-code-review, report leaf verbatim)

**Scope:** lake1/site (origin/lake1/site, 2b763c1 on merge-base acbc4ad) — 14 files, 672 executable lines\
**Intent:** Lake 1 bottom layers of effect-endgame-starter-kit: move mutation to release gate (#35), move to Effect 4 stable (#36), shared root configs (#37), one-command local stack (#38), one Worker for home page + /llms.txt (#41)\
**Mode:** markdown report-only

**Reviewers:** correctness, testing, maintainability, security, reliability, agent-native, project-standards

- **project-standards** — new site app, governance rules bind every changed file
- **security** — new public HTTP endpoint with content-type negotiation; CI workflows hold tokens
- **testing** — e2e journeys changed; mutation settings moved to root
- **reliability** — local stack shutdown bounds and readiness; e2e timeouts
- **agent-native** — Markdown and /llms.txt served for agent discoverability
- **correctness** — Effect workflow chains, schema contracts
- **maintainability** — 672 lines, new site package, code organization

---

### P0 -- Critical

| # | File                                                 | Issue                                                      | Reviewer          | Confidence |
| - | ---------------------------------------------------- | ---------------------------------------------------------- | ----------------- | ---------- |
| 1 | `apps/site/src/front-door/llms-txt.workflow.ts:28`   | LlmsTxtCommand.origin unbranded despite S.check refinement | project-standards | 100        |
| 2 | `apps/site/src/front-door/serve-page.workflow.ts:38` | ServePageCommand.origin held as bare S.String              | project-standards | 100        |

- **#1** — The schema defines `origin: S.String.pipe(S.check(S.isPattern(...)))` which gives a runtime predicate but the TypeScript type is still plain `string`. CONST-D3 forbids bare primitives in domain-significant positions. The Origin field is the base for every Markdown link in llms.txt. Brand Origin so the type level enforces the contract: `export const Origin = S.String.pipe(S.check(...)).pipe(S.brand('Origin'))` in serve-page.schema.ts, then reference it from both LlmsTxtCommand and ServePageCommand.

- **#2** — The ServePageCommand holds `origin: S.String` at the type level, allowing any string. The URL origin is the base for every link the Worker emits. At build time a caller can construct ServePageCommand with any string and the compiler cannot reject it. Brand the field: `export const Origin = S.String.pipe(S.brand('Origin'))` and replace `origin: S.String` with `origin: Origin`. Update call sites in serve-page.cell.ts and property tests to construct via Origin.make(value).

### P1 -- High

| # | File                                                   | Issue                                                                                        | Reviewer    | Confidence |
| - | ------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ----------- | ---------- |
| 3 | `apps/site/readme-opening-plugin.ts:12-15`             | homeOpeningOf has four untested pure branches                                                | testing     | 100        |
| 4 | `apps/site/tests/front-door.integration.test.ts:11-15` | Front-door integration re-implements homeOpeningOf as expected oracle                        | testing     | 100        |
| 5 | `.github/workflows/release-gate.yml:31`                | Release gate mutation job runs without a sandbox wrapper                                     | reliability | 75         |
| 6 | `apps/site-e2e/tests/__fixtures__/site.fixture.ts:42`  | e2e fetchSite uses Effect.orDie with no AbortSignal                                          | reliability | 75         |
| 7 | `apps/site/readme-opening-plugin.ts:14`                | Cascade: home markers missing from README silently produces empty home page, e2e stays green | adversarial | 75         |
| 8 | `apps/site/src/worker.ts:7`                            | Worker fetch has no top-level error handling on render failure                               | reliability | 75         |
| 9 | `scripts/mutation-shards.ts:27`                        | Cascade: empty-mutate package vacuously passes release gate                                  | adversarial | 75         |

- **#3** — `homeOpeningOf` is the pure decision extracting the home page markdown (three empty-string guards: `start === -1`, `end === -1`, `end < start`, plus the happy-path slice-with-trim). None of these branches are exercised by any test in the diff. The stryker config restricts mutation to `src/**/*.workflow.ts`, so the plugin file is also outside the release-gate mutation scope. A future README edit that removes or reorders the markers produces empty markdown with no signal until a human notices.

  **Fix:** Add `apps/site/src/front-door/__tests__/readme-opening-plugin.test.ts` with a four-case table: (a) neither marker → ''; (b) start but no end → ''; (c) end before start → ''; (d) both markers with surrounding whitespace → trimmed slice.

- **#4** — The front-door integration test computes expected `opening` as a hand-rolled `readme.slice(readme.indexOf(README_HOME_START) + README_HOME_START.length, readme.indexOf(README_HOME_END)).trim()` instead of importing `homeOpeningOf`. The same replication appears in `apps/site-e2e/tests/__fixtures__/site.fixture.ts`. If `homeOpeningOf` regresses, both the production cell and the test's expected value are computed by the same hand-coded slice, so the assertion still passes while agents receive empty markdown.

  **Fix:** Replace the inline slices with `homeOpeningOf(readmeSource)` and import the function from `@endgame/site/readme-opening-plugin`. Pair with the unit test for #3 as the independent oracle.

- **#5** — The release-gate mutation job runs `pnpm install --frozen-lockfile` and `turbo run mutation` on ubuntu-latest with no bubblewrap sandbox or network allowlist. R123 requires every entry point that executes dependency code to run through the shared sandbox launcher. The plan defers the sandbox to U11b, so this PR ships ahead of the gate. A flaky or malicious post-install script in a workspace package can read `~/.ssh` or egress to a non-declared host, and the gate will not notice.

  **Fix:** Block this PR's merge on U11b delivery so the sandbox wraps the job from day one. (Alternatively, declare an explicit egress allowlist in the job's `network:` block until U11b lands.)

- **#6** — `fetchSite` calls `client.execute(request)` wrapped in `Effect.orDie` with no AbortSignal or timeout. If the local Worker dev server hangs (alchemy dev, an unresponsive ready probe, a half-built bundle), the entire e2e journey hangs indefinitely with no recovery path. The parent job's 45-minute timeout is the only circuit-breaker, leaving a hung stack undetected as a test failure.

  **Fix:** Pass an `AbortSignal.timeout` to `HttpClientRequest.execute` with a 30s deadline; surface the abort as a typed failure the scenario can branch on.

- **#7** — If the README contains `<!-- home:end -->` earlier than the actual marker (e.g., in a code example or docs page quoting the markers), `homeOpeningOf` returns `''` and the home page renders empty with `200 OK`. The e2e Markdown scenario asserts `body: readmeOpening()`, where the fixture computes the same empty string, so the assertion passes while agents receive nothing.

  **Fix:** Harden the e2e scenario to explicitly assert the Markdown body is non-empty (`expect(s.response.body.length).toBeGreaterThan(0)`) and contains the expected home heading. Pair the harden with the unit test for #3.

- **#8** — The Worker's default export returns `frontDoorHandlerWith(context)(request)` without a try/catch or Effect catchAll. If TanStack Start's `startHandler.fetch` throws synchronously or the Effect chain rejects, workerd receives an uncaught rejection and sends a generic 500 with no body and no Accept negotiation, defeating R41's contract that every request gets a Markdown response by default.

  **Fix:** Wrap the Effect chain in `Effect.catchAll` that produces a Markdown 500 response with `Vary: Accept`. Pattern: `Effect.flatMap(frontDoor, e => Effect.catchAll(err => Effect.succeed(markdownBody(..., 500))))`.

- **#9** — The release-gate shard enumeration only checks the `mutation` script's presence; it does not verify that each shard's `mutate` glob matches at least one source file. If a future package declares a `mutation` script whose `mutate` glob resolves to zero files (e.g., `apps/site` sources as `.tsx` with Stryker's `mutate` matching only `*.ts`), Stryker reports 0 mutants and trivially passes the `break: 100` threshold. The gate then green-lights a merge where the package's production code is entirely untested.

  **Fix:** After collecting shard names, walk each shard's `package.json` and `stryker.config.ts` to assert the resolved `mutate` glob is non-empty. Exit 1 on any shard with zero matched files before writing the matrix output.

### P2 -- Moderate

| #  | File                                               | Issue                                                                                           | Reviewer     | Confidence |
| -- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------ | ---------- |
| 11 | `apps/site/readme-opening-plugin.ts:14-16`         | Cascade: home marker pair with end-before-start silently produces empty home                    | adversarial  | 75         |
| 13 | `apps/site/src/front-door/serve-page.cell.ts:13`   | llms.txt catalog not linked from the home Markdown body                                         | agent-native | 75         |
| 14 | `apps/site/src/front-door/serve-page.schema.ts:22` | HOME_CATALOG and serve-page routes defined in two files with no compile-time link               | agent-native | 75         |
| 16 | `apps/site/src/front-door/serve-page.cell.ts:3`    | Composition failure: stack-import fidelity guard does not exercise the deferred Effect.gen body | testing      | 75         |

- **#11** — A variation on #7: `homeOpeningOf` uses `indexOf(README_HOME_END)` once. If the README holds the literal text `<!-- home:end -->` before the actual marker, the `end < start` guard fires and returns `''`. The home page renders empty and stays green in the test because the fixture reads the same README and produces the same empty string. Same root cause as #7, requiring the same hardening.

- **#13** — The `/llms.txt` endpoint is meant for agent discoverability, but an agent landing on `/` (the default Markdown response) gets the README opening with no signal that `/llms.txt` exists. The browser HTML also lacks a `<link rel="alternate" type="text/markdown" href="/index.md">` head tag in `__root.tsx`. Adding a single Markdown link line in the home opening body and a rel=alternate in the HTML head closes the gap at zero cost.

  **Fix:** Append a one-line `Read this page as llms.txt: /llms.txt` paragraph to the README opening block between `<!-- home:start -->` and `<!-- home:end -->`. Add `links: [{ rel: 'alternate', type: 'text/markdown', href: '/' }]` to the route head in `__root.tsx`.

- **#14** — The `HOME_CATALOG` (Markdown pages for `/llms.txt`) is defined in `serve-page.cell.ts:13`, and the `routeOf` router is defined in `serve-page.schema.ts:22`. The schema does not reference the catalog, so there is no compile-time assertion that every route in `routeOf` has a matching page in `HOME_CATALOG`. A future PR can add a route (`/blog`, `/docs`) and forget to add the page, and the catalog becomes stale.

  **Fix:** Define the routes as a closed enum or tagged union (`type Route = 'home' | 'llms_txt'`) and move or cross-reference the catalog so the type narrows both the router and the page list. Alternatively, export the route keys from the catalog and derive `routeOf` from them.

- **#16** — The site's composition root (serve-page.cell.ts) defines the Effect.gen effect generators but does not exercise the Effect.gen body in any test. The `stack-import-fidelity` guard (a composition test used to verify the handler signature) imports `startHandler` but only calls its `fetch` method, not the full generator composition through the Effect chain. The guard does not exercise the deferred Effect logic, leaving the real composition untested until deployed.

  **Fix:** Either (a) run the property test or integration test before a composition test to exercise the Effect.gen body, or (b) add a dedicated composition test that builds `frontDoorHandlerWith(context)` and calls it with a real or mock Request to exercise the full Effect chain.

### Coverage

**Reviewers:** 7 local (correctness, testing, maintainability, security, reliability, agent-native, project-standards) + 1 in-process adversarial (via CONST-G5 route)

**Validation:** 8 findings selected (all P0/P1 except #5 which is P1 reliability): all 8 confirmed by independent validator. Validator findings #1–#9 all returned status `confirmed` with substantiated reasons. Finding #10 was not in the validation batch (no explicit selection); findings #11–#16 (P2) were not selected for validation.

**QA evidence:** Lake 1 real-product QA run on PR #38 and #41 (head 2b763c1, site-e2e journey):

- **Q1** — `pnpm dev` exits 1 without a TTY; the one-command stack requires a terminal with `TERM` set. Not a gate blocker for Lake 1 (QA runs with pty), but noted for U11b/U12 when CI jobs run without TTY.
- **Q2** — Stack comes up: 4/4 processes running (Tempo, Grafana, collector, site) within 6 s; shutdown clean in 22.8 s.
- **Q3** — Grafana downloads unpinned plugins from the internet at startup (grafana-pyroscope-app, grafana-exploretraces-app). Nix does not pin the plugin installer; runs outside the sandbox. Acknowledged limitation for Lake 1.
- **Q4** — Content-type negotiation working: browser gets HTML, agent with Accept: text/markdown gets Markdown; Vary: Accept header present.
- **Q5** — No traces reach Tempo at this head (no OTel producer code in #38/#41). Expected; tracing is Lake 1 observability infra, the producer lands in lake1/traces.

**Suppressions:** fast-pass found 2 low-confidence advisory candidates (both P3, both about action version pins being out of sync); neither was promoted by reviewers. Both advisory-only, no gate impact.

---

> **Verdict:** Not ready
>
> Two critical type-system defects must be fixed (CONST-D3 violations on unbranded domain values #1–#2). These are P0 under the typing convention.
>
> Six P1 defects span testing gaps (untested pure branches and shared test oracles #3–#4), safety bounds (no sandbox, no timeouts, no error handling #5–#6, #8), and cascading failures (home markers silent-empty bugs in the test contract #7, #9). These prevent production readiness.
>
> Fix order: (1) P0 type system defects #1–#2 (unblock the command schema), (2) P1 test oracles and untested branches #3–#4 (shore up the test contract before the mutations gate), (3) P1 safety bounds #5–#6, #8 (timeouts, error handling, sandbox contract), (4) P1 cascading failures #7, #9 (harden test assertions and release-gate invariants).

---

### Actionable findings

| #  | File                                                   | Issue                                      | Severity | Route                             | Suggested Fix Present |
| -- | ------------------------------------------------------ | ------------------------------------------ | -------- | --------------------------------- | --------------------- |
| 1  | `apps/site/src/front-door/llms-txt.workflow.ts:28`     | Origin unbranded despite refinement        | P0       | gated_auto -> downstream-resolver | Yes                   |
| 2  | `apps/site/src/front-door/serve-page.workflow.ts:38`   | Origin bare S.String at type level         | P0       | gated_auto -> downstream-resolver | Yes                   |
| 3  | `apps/site/readme-opening-plugin.ts:12-15`             | homeOpeningOf untested (4 branches)        | P1       | gated_auto -> downstream-resolver | Yes                   |
| 4  | `apps/site/tests/front-door.integration.test.ts:11-15` | Front-door test as shared oracle           | P1       | gated_auto -> downstream-resolver | Yes                   |
| 5  | `.github/workflows/release-gate.yml:31`                | Mutation job no sandbox                    | P1       | manual -> human                   | Yes                   |
| 6  | `apps/site-e2e/tests/__fixtures__/site.fixture.ts:42`  | e2e no AbortSignal timeout                 | P1       | gated_auto -> downstream-resolver | Yes                   |
| 7  | `apps/site/readme-opening-plugin.ts:14`                | Missing markers silent empty (e2e cascade) | P1       | gated_auto -> downstream-resolver | Yes                   |
| 8  | `apps/site/src/worker.ts:7`                            | Worker no error handling                   | P1       | gated_auto -> downstream-resolver | Yes                   |
| 9  | `scripts/mutation-shards.ts:27`                        | Empty-mutate shard passes gate (cascade)   | P1       | gated_auto -> downstream-resolver | Yes                   |
| 11 | `apps/site/readme-opening-plugin.ts:14-16`             | End-before-start silent empty              | P2       | manual -> downstream-resolver     | Yes                   |
| 13 | `apps/site/src/front-door/serve-page.cell.ts:13`       | llms.txt not linked from Markdown body     | P2       | gated_auto -> downstream-resolver | Yes                   |
| 14 | `apps/site/src/front-door/serve-page.schema.ts:22`     | Routes and catalog no compile link         | P2       | manual -> downstream-resolver     | No                    |
| 16 | `apps/site/src/front-door/serve-page.cell.ts:3`        | Composition Effect.gen body not exercised  | P2       | gated_auto -> downstream-resolver | Yes                   |

## Verifier probes (starter-verify, after the validator)

The validator confirmed all 9 selected findings in 85 s. Per VER1 I re-checked the claims I could test without builds or test runs, against the reviewed tree `lake1-review` at `2b763c1`. The probe replays the server's `homeOpeningOf` and the e2e fixture's `readmeOpening`/`readmeH1` verbatim (Bun, on the real `README.md`).

| #       | Claim                                                                                                                  | Probe                                                                                | Result                                                                                                                                                                                                                                                                                                  |
| ------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1, 2    | `origin` is an unbranded string in both commands (CONST-D3)                                                            | Read `llms-txt.workflow.ts:28`, `serve-page.workflow.ts:38`                          | **Holds.** `S.String.pipe(S.check(S.isPattern(…)))` and `S.String`, no brand                                                                                                                                                                                                                            |
| 4       | "If `homeOpeningOf` regresses, the test's expected value is computed by the same slice, so the assertion still passes" | Drop `.trim()` from `homeOpeningOf`, compare with the fixture's slice                | **Refuted.** Server and fixture differ, so the scenario goes red. The fixture's hand-written slice is an independent oracle. The suggested fix (import `homeOpeningOf` into the test) makes the oracle the SUT, which CONST-T10 forbids. The duplication itself is real; whether to keep it is a ruling |
| 7       | "Home markers missing from README: empty home page, e2e stays green"                                                   | Remove both markers from the real README                                             | **Refuted.** Server returns 0 bytes, fixture expects 9,410, so the Markdown scenario goes red                                                                                                                                                                                                           |
| 11 (P2) | End marker quoted before the real start: empty home page, tests green                                                  | Prepend a line quoting `<!-- home:end -->`                                           | **Holds.** Server 0 bytes, fixture 0 bytes: the Markdown scenario passes and the HTML scenario's `stringContaining(readmeH1())` is `stringContaining('')`. This is the reachable form of the cascade #7 describes                                                                                       |
| 9       | Empty `mutate` set passes `break: 100`                                                                                 | Searched the installed `@systemfsoftware/stryker-js` 15.0.1 for an empty-set refusal | **Unmeasured.** No refusal found by text search; whether Stryker exits 0 on zero mutants was not run (no local mutation runs)                                                                                                                                                                           |
| 8       | A throw in `startHandler.fetch` escapes as a generic 500 with no Accept negotiation                                    | Read `worker.ts:7-12`, `mod.ts:13`                                                   | **Code holds** (no catch). workerd's response to the rejection was not observed                                                                                                                                                                                                                         |
| 5       | Release-gate mutation job runs dependency code outside the sandbox                                                     | Read `release-gate.yml`                                                              | **Code holds.** The plan puts the sandbox in U11b, a later layer of this stack, so the ruling is whether these layers may land before U11b                                                                                                                                                              |

Errata in the report leaf's Coverage block: the validation batch was 9 findings (#1-#9), all `confirmed`, not 8. The adversarial lens ran in-process because the operator contract says "Claude only", not "via CONST-G5". The leaf's QA summary added judgments ("not a gate blocker", "acknowledged limitation", "expected") that are not in the evidence; the evidence follows verbatim.

Run directory: `starter.worktrees/verify-scratch/ce-code-review/20261006-063925-f5f4664b` (reviewer artifacts, `synthesized-findings.json`, `validator-verdicts.json`, `report.md`).

## Real-product QA evidence (#38 local stack, #41 site), head 2b763c1

Checkout `starter.worktrees/lake1-review` (detached at `origin/lake1/site`), `nix develop`, `pnpm install --frozen-lockfile` (28.7 s).

### Q1. `pnpm dev` fails without a terminal (#38)

`pnpm dev`, stdout piped, no TTY:

```
$ ./bin/local-stack up
26-10-06 06:36:36.824 FTL TUI startup error error="terminal entry not found: term not set"
[ELIFECYCLE] Command failed with exit code 1.
```

The one-command stack exits 1 in any non-interactive shell (an agent, CI, `ssh host cmd`). `pnpm dev -- --tui=false` doesn't work around it: pnpm forwards the literal `--` and process-compose reads it as a process name (`FTL … error="no such process: --tui=false"`). The rest of QA ran under a PTY with `TERM=xterm-256color`.

### Q2. Stack comes up in a PTY (#38)

process-compose 1.120.0, 4/4 processes running. Tempo, the OTel collector and Grafana reported Ready within 6 s; the site went Ready once `/llms.txt` answered on 1337. `local-stack down` stopped everything in 22.8 s, and ports 1337, 3000, 3200 and 13133 were free afterwards.

### Q3. Grafana downloads plugins from the internet at startup (#38)

```
logger=plugin.installer … msg="Installing plugin" pluginId=grafana-pyroscope-app
logger=installer.fs … msg="Downloaded and extracted grafana-pyroscope-app v2.3.1 zip successfully to …/local-stack/data/grafana/plugins/…"
logger=plugin.installer … msg="Installing plugin" pluginId=grafana-exploretraces-app
logger=installer.fs … msg="Downloaded and extracted grafana-exploretraces-app v2.2.1 zip …"
```

Grafana's background plugin installer fetches unpinned plugins over the network on every fresh data dir. Nix pins none of that code, and it runs outside the sandbox.

### Q4. Site content negotiation (#41), real Chromium with its own cookie jar

| Accept                                                      | Status | Content-Type                 | Vary   |
| ----------------------------------------------------------- | ------ | ---------------------------- | ------ |
| browser default (`text/html,application/xhtml+xml,…;q=0.8`) | 200    | text/html; charset=utf-8     | Accept |
| `text/html`                                                 | 200    | text/html; charset=utf-8     | Accept |
| `text/markdown`                                             | 200    | text/markdown; charset=utf-8 | Accept |
| `text/markdown, text/html;q=0.5`                            | 200    | text/markdown; charset=utf-8 | Accept |
| `*/*`                                                       | 200    | text/markdown; charset=utf-8 | Accept |
| none                                                        | 200    | text/markdown; charset=utf-8 | Accept |

- `/llms.txt`: 200 Markdown, one link, `http://127.0.0.1:1337/` (the origin of the request).
- `/no-such-page` and `/index.md` with `Accept: text/markdown`: 404 Markdown, "Try `/`".
- In the browser: title "Endgame Starter", the README opening rendered as four blocks, no console errors and no page errors (only the Vite and React DevTools notices). The page has no stylesheet of its own (browser default serif) and no links or landmarks; `observe()` finds zero interactive elements. Screenshot taken.

### Q5. No traces reach Tempo (#38 with #41)

Three requests to `/`, then a Tempo search over the last 30 minutes returned 0 traces, and `apps/site` has no OTel or OTLP code at this head. The collector, Tempo and Grafana run with no producer. Tracing the front door is the later `lake1/traces` layer, so at #38/#41 the observability half of the stack is idle.
