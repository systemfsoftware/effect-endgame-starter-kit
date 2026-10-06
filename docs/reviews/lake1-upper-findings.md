# Lake 1 upper (#43, #45, #49, #50, #51): review findings

Reviewed as one diff: `15d131d..7a11f81` (`origin/lake1/stack-ci..origin/lake1/previews`). `lake1/previews` moved to `bf7d5c2` during the review (one 2-line test commit). Nothing applied; Kiro rules each finding.

# Code Review: Lake 1 Upper Stack

## Scope

**Stack:** effect-endgame-starter-kit, Lake 1 upper, PRs #43, #45, #49, #50, #51
**Base:** `15d131d` (lake1/stack-ci, #42)
**Head:** `7a11f81` (lake1/previews)
**Mode:** Standalone review, report-only (no local apply)

## Intent

This is the final review of the upper Lake 1 stack after the bottom layers (#35–#42) shipped. Five PRs compose the remainder:

- **#43:** Delete the hello seed package (packages/starter) and its release-script references
- **#45:** Trace the front door locally (Effect OTLP to local collector/Tempo) and in Cloudflare (alchemy CloudflareTracer, Workers Observability)
- **#49:** Enforce a strict nonce CSP with Trusted Types and record CSP violation reports
- **#50:** Deploy the site from one command (alchemy deploy, verification, rollback in the release gate, deployed journeys)
- **#51:** Preview every PR as its own Worker stage; keep Workers Issues observability setting on without drift (patched alchemy 2.0.0-beta.80); demonstrate the no-drift proof on state/credential storage

The review is a single diff on top of the bottom layers. Eight reviewers (correctness, security, adversarial, testing, maintainability, reliability, agent-native, project-standards) audited the code. The adversarial lens ran in-process (in-scope for single-model reviews). Real-product QA ran in a Chromium browser against local stack and live pr-51 preview before the review began (evidence: /home/ryan/Documents/projects/systemfsoftware/starter.worktrees/verify-scratch/lake1-upper-qa.md).

## P0 -- Critical

### #1: Sandbox launcher not used for install / build / deploy CLIs in the new previews + release-gate workflows

**File:** .github/workflows/previews.yml, .github/workflows/release-gate.yml\
**Severity:** P0 | **Confidence:** 100 | **Owner:** human | **Requires verification:** No

The binding standard (ruling-nix-distribution-sandbox.md §2) mandates: "Every consumer entry point that executes dependency code goes through it: install (ignore-scripts=true; allowed build scripts run in the sandbox), build, test, lint, dev, process-compose processes, deploy CLIs."

The diff adds five CI jobs that execute dependency code directly without the sandbox launcher:

- `previews.yml` step 38: `pnpm install --frozen-lockfile`
- `previews.yml` steps 67, 71, 152: `pnpm cloud:deploy`, `pnpm cloud:redeploy`, `pnpm cloud:destroy`
- `previews.yml` step 101: `nix develop --command pnpm --filter @endgame/site-e2e test:deployed`
- `release-gate.yml` step 29: `pnpm install --frozen-lockfile`
- `release-gate.yml` steps 89, 93: `pnpm cloud:deploy`, `pnpm cloud:redeploy`
- `release-gate.yml` step ~107: `node apps/site/deploy/verify-deployment.ts`

**Validation:** Unresolved. The validator could not locate the ruling document in the reviewed tree; the rule's existence and exact scope cannot be verified without it.

**Finding:** This is a binding architectural gate. Until the sandbox launcher is available to these jobs and the ruling document is visible in the review tree, findings #1–3 remain verification gates.

---

### #2: Workspace still consumes @systemfsoftware/* from the npm registry; binding ruling requires flake input + file: tarballs

**File:** pnpm-workspace.yaml (line 28)\
**Severity:** P0 | **Confidence:** 100 | **Owner:** human | **Requires verification:** No

The binding standard (ruling-nix-distribution-sandbox.md §1) directs:

> Consumer: a flake input pinned by flake.lock (rev + narHash). PR snapshot = the PR head rev; stable = the release tag. nix build .#sfs-deps yields the tarballs; package.json uses file: paths into a gitignored link the devshell recreates; pnpm-lock records each tarball's integrity. No publish step, no dist-tags, no trusted publishers, no cleanup on PR close.

The diff keeps all @systemfsoftware/* entries in the workspace catalog (@systemfsoftware/trace-spec, @systemfsoftware/stryker-js, @systemfsoftware/vitest, etc.) and adds @systemfsoftware/trace-spec@1.0.1 to pnpm-workspace.yaml:31. However:

- No `systemfsoftware` flake input is added to flake.nix
- No sfs-deps package built in the flake
- No file: paths in package.json
- Packages still resolve from npm

**Validation:** Unresolved. The ruling document was not found; the specific distribution model it requires cannot be verified.

---

### #3: All @systemfsoftware/* entries still listed in minimumReleaseAgeExclude; binding ruling requires them removed

**File:** pnpm-workspace.yaml (line 69)\
**Severity:** P0 | **Confidence:** 100 | **Owner:** human | **Requires verification:** No

The binding standard (ruling-nix-distribution-sandbox.md §1, final bullet) directs:

> Remove npm minimumReleaseAgeExclude work for our own packages (they no longer come from npm).

The diff does not remove any of the 23 @systemfsoftware/* entries still listed (e.g., @systemfsoftware/effect-cell-types@12.0.0, @systemfsoftware/trace-taxonomy@1.0.0, @systemfsoftware/stryker-js@15.0.1, @systemfsoftware/vitest@2.0.0). These exclusions are stale work once the packages transition away from npm per the ruling.

**Validation:** Unresolved. The ruling document is not present in the tree; the directive cannot be verified.

---

### #4: Cascade: CSP report with non-standard opaque scheme bypasses keyword regex and pollutes `app.csp.blocked` trace attribute

**File:** apps/site/src/front-door/record-csp-violation.schema.ts\
**Severity:** P0 | **Confidence:** 75 | **Owner:** human | **Requires verification:** Yes (injection subject)

**What & Where:**

The CSP report handler routes opaque-scheme blocked-URIs (e.g., `web+evil:foo`, `data:...`, `about:...`) through a URL parse; if `url.origin === 'null'`, it creates a `BlockedOpaqueScheme` with `scheme: url.protocol.slice(0,-1)`. The decision then converts this to `RecordBlockedKeyword({ keyword: scheme })` **without applying the keyword regex guard** that filters other keyword arms.

The WHATWG URL parser accepts schemes matching `[A-Za-z][A-Za-z0-9+.-]*`. An attacker who triggers a CSP violation (e.g., via a script tag blocked by `script-src 'nonce-...'`) controls the browser's `blocked-uri` value up to the scheme's format limits. A scheme like `web+evil` includes a `+` character, which the keyword regex `/^[a-z][a-z0-9-]*$/` rejects, but the opaque-scheme path bypasses it entirely.

**Consequence:** Attacker-controlled bytes (e.g., `web+evil`) reach the `app.csp.blocked` trace attribute. The `app.csp.directive` attribute has its own `/^[a-z]+(-...)?$/` anchor (no injection there), but trace attributes are not HTML escaping; an attacker's scheme name is recorded verbatim. Downstream telemetry queries or monitoring rules that assume `app.csp.blocked` contains only lowercase-and-hyphens values will misfire.

**Sabotage test:** POST `/csp-report` with `content-type: application/csp-report` and body `{"csp-report":{"effective-directive":"script-src","blocked-uri":"web+evil:foo"}}`. The trace records `app.csp.blocked = 'web+evil'`.

**Test coverage gap:** `apps/site/tests/front-door.trace.test.ts` covers one opaque-scheme case (`data:`), which happens to match the regex. No property or sabotage test checks the reject set. The deployed journey (`deployed-trace.integration.test.ts`) does not post any CSP report, so a regression here ships undetected.

**Validation:** Confirmed by validator.

---

## P1 -- High

### #5: `cloudflare-deploy.fixture.ts` re-declares `ApiLogLine` / `ApiLogLineJson` already published by `deploy-verification.schema.ts`

**File:** apps/site/deploy/deploy-verification.schema.ts\
**Severity:** P1 | **Confidence:** 100 | **Owner:** human | **Requires verification:** No

**What & Where:**

`apps/site/deploy/deploy-verification.schema.ts` (lines 3–10) defines and exports `ApiLogLine` and `ApiLogLineJson` as the canonical Cloudflare request log-line shape. These same types are re-declared identically in `apps/site/tests/__fixtures__/cloudflare-deploy.fixture.ts` (lines 3–9), and the test file `deploy-drift-loop.integration.test.ts` imports the local fixture copy instead of the published schema.

**Why it matters:** The fixture exists only to give the test a convenient relative import path; the schema it re-declares is already public and owned by the package next door. Two definitions of the same Cloudflare request log line are exactly where a future field rename will pass the test (testing against the stale fixture copy) while failing production verification (which consumes the live schema). This breaks the contract for drift proofs.

**Suggested fix:** Delete `ApiLogLine` and `ApiLogLineJson` from `apps/site/tests/__fixtures__/cloudflare-deploy.fixture.ts` and import them from `../deploy/deploy-verification.schema.ts`. The fixture can keep `PatchObservability` (it is the recording fake's local concern).

**Validation:** Confirmed by validator.

---

### #6: Silent-pass: deployed-trace gate asserts only the home-page span, never the csp-report path

**File:** apps/site-e2e/tests/deployed-trace.integration.test.ts\
**Severity:** P1 | **Confidence:** 75 | **Owner:** human | **Requires verification:** Yes

**What & Where:**

`apps/site-e2e/tests/deployed-trace.integration.test.ts` is the only deployed Worker journey in the preview and release-gate workflows. It calls `fetchSite({ path: '/' })` and asserts `front_door.serve_page` spans with `app.front_door.route = 'home'` and `app.front_door.serve_page.decision = 'ServeMarkdownPage'`.

The csp-report endpoint (POST /csp-report) was added in #49. It writes the `RecordCspViolation` span (apps/site/src/front-door/record-csp-violation.cell.ts); both the span and its `app.csp.*` attributes are documented. But the deployed journey never posts a violation report.

**Consequence:** A regression that breaks `RecordCspViolation` (lost directive attribute, wrong taxonomy tag, schema decode rejection silently dropping the batch) would pass the deployed gate. The in-process trace test (front-door.trace.test.ts) exercises the decision, but it runs in the test environment, not the deployed Worker. Workers freeze timers during CPU work, and the local trace test reports spans on demand via `ObservationWindow`; the deployed telemetry pipeline only sees what reaches the collector. A regression that makes `RecordCspViolation` panic silently (e.g., a schema failure caught by `Effect.orElseSucceed`) still answers 204, and the browser continues to retry.

**Sabotage test:** Sabotage `RecordBlockedOrigin` with `Effect.void` for its write branch. The trace test passes because span emission is upstream of write. The deployed journey passes because it never posts a report. Production silently drops violation reports.

**Validation:** Confirmed by validator.

---

### #7: `recordCspReport` runs `Effect.forEach` over every violation in a single request with no per-batch cap and no body-size limit

**File:** apps/site/src/mod.ts (line 23)\
**Severity:** P1 | **Confidence:** 75 | **Owner:** human | **Requires verification:** Yes

**What & Where:**

`recordCspReport` does:

```javascript
Effect.forEach(violationsOf(body), (violation) => recordCspViolationCell.run(violation))
```

There is no `Concurrency` cap, no batch limit, no `bodyLimit`, no `Content-Length` check. The `CspReportBody` is a union: either a single `LegacyCspReport` object or an array of `ReportingApiCspReport[]`. `HttpServerRequest.schemaBodyJson(CspReportBody)` accepts an arbitrarily large JSON array. The Reporting API spec caps a batch at 100 violations per request, but the worker code places no such limit.

**Consequence:** A malicious or buggy browser client can send a 5 MB body with thousands of decoded violations. Each violation emits a span via the trace layer. The entire batch is parsed, validated, and has its cell invoked N times before the response is returned. Workers charge by wall-clock CPU and request size; a large batch drives up both costs and holds the request open for longer than necessary.

**Sabotage test:** POST `/csp-report` with `content-type: application/reports+json` and a JSON array of 50,000 valid Reporting API CSP violations. The worker decodes, emits 50,000 spans, and holds the response until all complete.

**Validation:** Confirmed by validator.

---

### #8: CSP report handler swallows every decode failure into `400`; `recordCspViolationCell.run` failures return `204` and the violation reports are silently dropped

**File:** apps/site/src/mod.ts (line 23)\
**Severity:** P1 | **Confidence:** 75 | **Owner:** human | **Requires verification:** Yes

**What & Where:**

The entire `recordCspReport` effect (body decode, the `forEach`, the cell run) is wrapped in `Effect.orElseSucceed(() => HttpServerResponse.empty({ status: 400 }))`. Every error path (decode failure, forEach failure, any error from `recordCspViolationCell.run`) collapses into 400.

Meanwhile, the cell's write block (where the span is emitted to the telemetry system) returns `Effect.void` for every decision variant (`RecordBlockedOrigin`, `RecordBlockedKeyword`, `RecordBlockedUnrecognized`, `CommandRejected`). A 204 response only confirms the body parse worked, not that any violation was actually emitted.

**Consequence:** A regression where `recordCspViolationCell.run` is a no-op (e.g., the workflow is wrongly typed `S.Never` and the cell short-circuits) still returns 204. The browser sees a successful receipt and stops retrying. Production silently drops violation reports with no observability.

The PR #49 deviations acknowledge `400 on malformed`, and the code matches that. The silent mismatch is the absence of any signal when a violation's events are dropped on the success path.

**Sabotage test:** Make `recordCspViolationCell.run` return `Effect.succeed(undefined)` (no-op, no span emission). Post a valid CSP report. The 204 still returns; the trace-spec test is unchanged; the deployed journey is unchanged. Production silently drops violation reports; no deploy gate turns red.

**Validation:** Confirmed by validator.

---

## P2 -- Moderate

### #9: Cloudflare telemetry query in `workers-observability.fixture.ts` retries on `RayIdNotObserved` for 3 minutes, but a 5xx or `ConfigError` escapes immediately and fails the scenario

**File:** apps/site-e2e/tests/**fixtures**/workers-observability.fixture.ts (line 184)\
**Severity:** P2 | **Confidence:** 75 | **Owner:** human | **Requires verification:** No

**What & Where:**

The fixture's telemetry poll uses:

```javascript
Effect.retry({
  schedule: Schedule.spaced(POLL_INTERVAL_MS).pipe(
    Schedule.upTo({ duration: POLL_BUDGET_MS, times: POLL_ATTEMPTS }),
  ),
  while: (error) => S.is(RayIdNotObserved)(error),
})
```

The `while` predicate matches only `RayIdNotObserved`. A `TelemetryQueryRejected` (Cloudflare API 5xx, rate-limit, or 502 from a flaky ingest) or a `TelemetryResponseUndecodable` (Cloudflare returned an envelope with an unknown field) escapes immediately without retry.

**Consequence:** A single transient Cloudflare failure (`internal_error code 1000`, the same class PR #51 saw on state-store credential refresh) fails the deployed journey with no retry, even though the 3-minute schedule could absorb it.

**Sabotage test:** Make the telemetry endpoint return `502` once, then a valid response. The current code fails; it should succeed with one extra poll.

**Suggested fix:** Include retryable `TelemetryQueryRejected` causes in the `while` predicate. Rate-limit and 5xx errors should carry a retryable flag or tagged variant.

---

### #10: `isCloudStage` duplicates the prod/pr-N shape already encoded by `Alchemy.Stage` and the `cloud:deploy` script

**File:** apps/site/alchemy.run.ts (line 1)\
**Severity:** P2 | **Confidence:** 75 | **Owner:** human | **Requires verification:** No

**What & Where:**

`apps/site/alchemy.run.ts` defines:

```javascript
isCloudStage = (stage: string) => stage === 'prod' || /^pr-\d+$/.test(stage)
```

It also branches on `stage === 'prod'` separately (lines 25–26) to attach a domain. The workflows and `cloud:deploy` scripts already constrain `ALCHEMY_STAGE` to `prod` or `pr-<N>`.

**Why it matters:** The set of "cloud" stages is now encoded three times:

1. The ALCHEMY_STAGE environment-variable check in package.json's cloud:deploy script
2. The GitHub workflow hard-coded env values (e.g., `ALCHEMY_STAGE: pr-${{ github.event.pull_request.number }}` in previews.yml)
3. The `isCloudStage` regex in alchemy.run.ts

The regex in `isCloudStage` is a third encoding of what the workflows already enforce. A future stage (e.g., `staging-1`) will silently land in `localState()` and the worker will think it is local, producing real local-dev behavior in a stage the operator expected to deploy.

**Suggested fix:** Either delete `isCloudStage` and inline the `stage === 'prod'` checks (the diff already only uses it twice and the `prod` case is open-coded elsewhere), or replace the regex with a small branded type:

```javascript
const CloudStage = S.Union([S.Literal('prod'), S.TemplateLiteral(S.Literal('pr-'), S.Number)])
```

Do not extend it to future-proof a "list of cloud stages."

---

### #11: Module-scope OTLP layer cache ignores the `baseUrl` argument after first invocation

**File:** apps/site/src/otlp-layer.ts\
**Severity:** P2 | **Confidence:** 75 | **Owner:** human | **Requires verification:** No

The OTLP layer is defined at module scope and cached. When the same module is imported with different `baseUrl` arguments (e.g., local dev vs. deployed Worker), the cached layer ignores subsequent `baseUrl` values and reuses the first one. This breaks the ability to switch telemetry endpoints without a process restart.

**Suggested fix:** Move the layer initialization inside a function, or accept a cache key that includes `baseUrl`.

---

### #12: The patch's `versionId !== undefined` branch (version-only deploys) is never exercised by any test

**File:** patches/alchemy@2.0.0-beta.80.patch\
**Severity:** P2 | **Confidence:** 75 | **Owner:** human | **Requires verification:** No

The alchemy deploy patch adds a code path for version-only deploys (when `versionId` is set but not `scriptId`). No test in the deployed journeys or the drift loop exercises this path.

**Suggested fix:** Add a test case or document why this path is unreachable in the starter's workflow.

---

### #13: `logCloudflareApiRequests` (alchemy patch) calls `appendFileSync` inside the HTTP handler on every request

**File:** patches/alchemy@2.0.0-beta.80.patch\
**Severity:** P2 | **Confidence:** 75 | **Owner:** human | **Requires verification:** No

The patched alchemy logger uses `appendFileSync` on every HTTP API request in production. This is a synchronous filesystem operation that blocks the request handler.

**Consequence:** Deployments and API verifications may see tail latency spikes due to filesystem I/O blocking the thread.

**Suggested fix:** Batch log writes or use async writes with a buffer flush strategy.

---

## P3 -- Low

### #14: `isCspReport` reads the URL twice — once to decide the route, once inside the handler

**File:** apps/site/src/mod.ts\
**Severity:** P3 | **Confidence:** 75 | **Owner:** human | **Requires verification:** No

Minor inefficiency: `isCspReport` is called both in the router decision and again inside the `recordCspReport` handler. The URL parsing could be done once and the result cached or passed through.

**Suggested fix:** Extract the URL parsing into a middleware or route parameter.

---

## Coverage

**Validation batch:** 8 selected findings (#1–8)

**Validator verdict summary:**

- Findings #1–3 (P0 ruling-based): **Unresolved** — The ruling document (ruling-nix-distribution-sandbox.md) was not found in the reviewed tree. The validator could not verify the rule text or whether these findings correctly cite it. These remain verification gates: the underlying claims about sandbox usage and distribution are observable in the diff, but their consequence (breach of a binding standard) cannot be confirmed without the document.
- Findings #4–8 (security, maintainability, reliability): **Confirmed** — All five findings were independently verified by the validator. The injection cascade in CSP reporting, the silent-pass deployed gate, the resource bounds issues, and the error swallowing behaviors are all confirmed defects.

**Suppressed findings:** 0 at all anchors

**Mode-aware demotion:** 0

**Pre-existing findings:** 0 (all findings are new to this stack)

**Residual risks:** 32 additional items were marked as informational, including deployment topology assumptions, alchemy patch dependencies, and worker-specific gotchas. These do not block the verdict but should inform operations.

**Testing gaps:** 26 additional items identified where deployed journeys and integration tests could be hardened, particularly around CSP reporting, error resilience, and telemetry.

**Reviewers:** correctness, security, adversarial (in-process), testing, maintainability, reliability, agent-native, project-standards. All ran on the session model. The adversarial lens ran in-process (operator contract specifies "Claude only"; no cross-model peer was launched).

**QA evidence:** Real-product QA ran before review in a local Chromium environment (local stack with Tempo, Grafana, collector) and against the live pr-51 preview. Results are documented in /home/ryan/Documents/projects/systemfsoftware/starter.worktrees/verify-scratch/lake1-upper-qa.md. Key observations:

- U1: Local CSP enforcement works; Trusted Types blocks every injection probe.
- U2: Request traces reach Tempo and are queryable by trace ID, but the request span (http.method, http.status) is created and never exported — exporter layer closes before the parent span ends.
- U3: Live preview serves both HTML and Markdown with correct content-type negotiation and distinct nonces per response; no console or page errors.
- U4: macOS CI leg fails on `deploy-drift-loop.integration.test.ts` due to EMFILE (too many open files) when copying alchemy; Linux legs are green. Fast-forward commit bf7d5c2 (pushed during review) addresses this by giving the temp project the repo's ignore rules.

---

## Verdict

**Not ready.** Four blocking P0 findings prevent merge:

1. **#1–3 (verification gates):** Until the binding ruling document (ruling-nix-distribution-sandbox.md) is available in the tree and the sandbox launcher is integrated into the preview and release-gate CI jobs, these findings remain unresolved architectural gates. The diff demonstrates non-compliance with a documented binding standard; Kiro has already ruled on this (per session notes: "Kiro ruling: U11b moves starter to Nix + sandbox launcher; #50/#51 do not merge until then"). These three findings encode that gate.

2. **#4 (injection cascade):** The CSP report handler routes non-standard opaque schemes through a bypass path that skips the keyword-validation regex. Attacker-controlled scheme bytes (e.g., `web+evil`) reach the trace attribute unconstrained. This is a protected subject (injection). The validator confirmed the defect. No test catches regressions here because the deployed journey never posts a CSP report.

Additionally, four P1 findings block the verdict at "Ready with fixes":

- **#5:** Duplicate canonical type declarations will cause future maintenance breaks (schema evolution).
- **#6, #7, #8:** Silent-pass and error-swallowing patterns in CSP reporting mean a regression can ship undetected. The deployed gate is insufficient; #6 leaves no trace of missing coverage; #7 and #8 together create a path where violation reports are silently dropped.

**Required before merge:**

1. Land U11b (sandbox launcher and Nix distribution model) beneath this stack and update findings #1–3 with the document evidence.
2. Add keyword-validation to the opaque-scheme CSP path (fix #4 or document why the path is safe).
3. Fix or validate each of #5–8 before deploy (duplicated schemas, test coverage gaps, error handling).

**Outstanding risks:** 32 residual observations and 26 testing gaps are documented for ops and follow-up hardening. None block this verdict but should inform deployment gates and monitoring setup.

---

## Actionable Findings

| #  | Severity | File                                | Title                                                                        | Autofix  | Confidence |
| -- | -------- | ----------------------------------- | ---------------------------------------------------------------------------- | -------- | ---------- |
| 1  | P0       | .github/workflows                   | Sandbox launcher not used for install / build / deploy CLIs                  | advisory | 100        |
| 2  | P0       | pnpm-workspace.yaml                 | Workspace still consumes @systemfsoftware/* from npm                         | advisory | 100        |
| 3  | P0       | pnpm-workspace.yaml                 | @systemfsoftware/* entries in minimumReleaseAgeExclude not removed           | advisory | 100        |
| 4  | P0       | apps/site/src/front-door            | CSP opaque scheme bypasses keyword regex; attacker-controlled bytes in trace | advisory | 75         |
| 5  | P1       | apps/site/tests/**fixtures**        | Re-declared ApiLogLine / ApiLogLineJson                                      | advisory | 100        |
| 6  | P1       | apps/site-e2e/tests                 | Deployed-trace gate never posts CSP report                                   | advisory | 75         |
| 7  | P1       | apps/site/src/mod.ts                | forEach on unbounded CSP violation array with no body cap                    | advisory | 75         |
| 8  | P1       | apps/site/src/mod.ts                | CSP handler swallows errors; cell failures return 204                        | advisory | 75         |
| 9  | P2       | apps/site-e2e/tests/**fixtures**    | Telemetry poll retries only RayIdNotObserved; 5xx escapes                    | advisory | 75         |
| 10 | P2       | apps/site/alchemy.run.ts            | isCloudStage duplicates prod/pr-N encoding                                   | advisory | 75         |
| 11 | P2       | apps/site/src/otlp-layer.ts         | Module-scope layer cache ignores baseUrl argument                            | advisory | 75         |
| 12 | P2       | patches/alchemy@2.0.0-beta.80.patch | Version-only deploy path never exercised                                     | advisory | 75         |
| 13 | P2       | patches/alchemy@2.0.0-beta.80.patch | appendFileSync blocks HTTP handler on every request                          | advisory | 75         |
| 14 | P3       | apps/site/src/mod.ts                | isCspReport reads URL twice                                                  | advisory | 75         |

## Verifier probes (starter-verify): every P0/P1, mine included

Kiro's rule was to verify every P0/P1 myself. The merge leaf kept 14 primary findings. It dropped 12 reviewer P0/P1s from both its primary and suppressed sets, mostly artifacts that used `files`/evidence arrays instead of `file`/`first_evidence`. It also demoted my two fast-pass P1s to confidence 50 because no independent reviewer raised them. Every one of them is below, with the probe I ran at `7a11f81`. Labels: _holds_, _refuted_, _severity disputed_.

| Ref                            | Claim                                                                                                                                                   | Probe                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Verdict                                                                                                                                                                                                                                                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **V1** (fast pass)             | The request span never reaches Tempo, so every trace lacks its root                                                                                     | 49 `endgame-site` traces in local Tempo: `{ nestedSetParent = -1 }` → 0, any `http.request.method` → 0; each `front_door.serve_page` names a parent absent from the trace (QA U2). Code: Effect 4.0.1 `HttpMiddleware.tracer` ends the `http.server` span in a task scheduled after the fiber exits (`dist/http/HttpMiddleware.js:145-210`), while `toWebHandlerWith` resolves the web Promise as soon as the response exists (`dist/http/HttpEffect.js:217`). `worker.ts:30-36` closes `Effect.scoped`, and with it the exporter layer it built, when that Promise resolves, before the root span ends | **Holds, P1.** A request is queryable by trace id and route, but method, path, status and duration are lost locally, and by the same code path in Cloudflare (the `CloudflareTracer` layer is built in the same scope). This is the Q5 condition Kiro made a fix-now                                                                |
| **V2** (fast pass) = #1 / PS-3 | Previews and release-gate run `pnpm install`, `alchemy deploy/destroy`, verify and rollback outside the sandbox, with `CLOUDFLARE_API_TOKEN` in the env | `previews.yml:32,38,42,55,95,121,123`; `release-gate.yml` deploy/qa/rollback jobs; no launcher anywhere. Ruling lines 35-37 name install and deploy CLIs                                                                                                                                                                                                                                                                                                                                                                                                                                                | **Holds, P0** under the ruling and the bottom's ruling #5, which said no commit on main runs dependency code unsandboxed. This time the code also holds production deploy credentials                                                                                                                                               |
| #2 / PS-1, #3 / PS-2           | `@systemfsoftware/*` still come from npm; `minimumReleaseAgeExclude` entries remain                                                                     | Ruling lines 54-56 assign both to the starter's U11b. No `systemfsoftware` flake input and no `sfs-deps`; the 23 exclusions are still there                                                                                                                                                                                                                                                                                                                                                                                                                                                             | **Holds** (the validator left these unresolved only because the ruling file is outside the reviewed tree). These are U11b's work, and **U11b is not in the stack**: no branch, no PR. The plan orders it before U12/U13 (plan line 441), yet #50/#51 put U12/U13 on top without it. One root cause behind V2, #2, #3, PS-4 and PS-5 |
| PS-4                           | Only comment-checker has a sandbox launcher                                                                                                             | `flake.nix:35-41`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Holds; same root (U11b)                                                                                                                                                                                                                                                                                                             |
| PS-5                           | Playwright enters via npm without the fixed-output proof                                                                                                | `pnpm-workspace.yaml:46` (npm 1.63.0), browsers from nixpkgs (`flake.nix:61`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Holds; same root (U11b)                                                                                                                                                                                                                                                                                                             |
| #4 / ADV-1 (P0)                | An opaque scheme skips the keyword regex and reaches `app.csp.blocked` (validator: injection)                                                           | Bun on WHATWG URL: `web+evil:foo` → scheme `web+evil` (regex fails, attribute written); schemes are limited to lowercase `[a-z0-9+.-]`, but a 100,002-character scheme parses                                                                                                                                                                                                                                                                                                                                                                                                                           | **Asymmetry holds; P0 disputed → P2.** No header, markup or query context is reached; the bytes are one span attribute. The real exposure is unbounded attribute length, which is the same class as #7                                                                                                                              |
| #5 / M-3                       | The fixture redeclares `ApiLogLine`                                                                                                                     | Read both files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Holds as duplication. Importing the production schema into the test that grades it is a judgment call (the bottom's #4 precedent)                                                                                                                                                                                                   |
| #6 / ADV-2                     | No deployed gate posts a CSP report                                                                                                                     | `deployed-trace.integration.test.ts` posts nothing; in-process, `front-door.trace.test.ts:43-95` posts through `frontDoorHandlerWith` and asserts the `RecordCspViolation` span and its attributes                                                                                                                                                                                                                                                                                                                                                                                                      | **Holds only for the deployed gate.** The handler path is covered in-process; P2                                                                                                                                                                                                                                                    |
| #7 / REL-6, ADV-4              | No cap on report batch or body                                                                                                                          | Our own `pr-51` preview: 1 / 100 / 2,000 violations (680 KB) → 204 in 297 / 81 / 465 ms                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | **Holds.** One request fans out 2,000 cell runs and spans                                                                                                                                                                                                                                                                           |
| #8 / REL-2                     | `orElseSucceed` folds every failure into 400; a no-op cell still returns 204                                                                            | `mod.ts:22-27`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | The fold holds. **The "no test runs this handler" part is refuted:** the trace test drives the handler and asserts the span                                                                                                                                                                                                         |
| T-2                            | The posted-report test checks only status                                                                                                               | As #8                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | **Refuted**, same evidence                                                                                                                                                                                                                                                                                                          |
| ADV-3                          | `Effect.scoped` never releases the layer, so no spans flush                                                                                             | Child spans do arrive in Tempo (QA U2)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | **Refuted as stated.** Its real form is V1                                                                                                                                                                                                                                                                                          |
| T-1, ADV-5                     | The drift proof covers only OFF→ON                                                                                                                      | `deploy-drift-loop.integration.test.ts`: one scenario, starting from no `issues` state; expects `firstPatchCount: 1, secondPatchCount: 0`                                                                                                                                                                                                                                                                                                                                                                                                                                                               | **Holds.** Already-equal and ON→OFF are untested, and so is an external flip between deploys                                                                                                                                                                                                                                        |
| T-3                            | `SettingsReadRejected` and `DeployLogUnreadable` are untested                                                                                           | `deploy-verification.integration.test.ts`: three scenarios (drift, Issues off, clean)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | **Holds**                                                                                                                                                                                                                                                                                                                           |
| T-4                            | The browser journey proves Trusted Types, not CSP `script-src`                                                                                          | `browser.integration.test.ts:17-33` asserts the TrustedHTML error, the nonce shape, no violations and no console errors; in QA, Trusted Types blocks injected scripts before CSP is consulted                                                                                                                                                                                                                                                                                                                                                                                                           | **Holds.** Nothing shows a script without the nonce being refused by `script-src`                                                                                                                                                                                                                                                   |
| M-1                            | Three definitions of the `/script-settings` rule; fix by importing `isSettingsPatch` into the drift test                                                | `deploy-drift-loop.integration.test.ts:212-213`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | **Fix refuted.** The test's own predicate is its independent oracle; importing the production predicate makes the code grade itself (CONST-T10), the same pattern as the bottom's #4                                                                                                                                                |
| M-2                            | Cloudflare HTTP boilerplate repeated across three deploy scripts                                                                                        | `API_BASE_URL` ×3, `bearerToken` ×3; `CloudflareMessage` defined twice with `code: S.Finite` (`verify-deployment.ts:47`) vs `S.Number` (`worker-deployment.schema.ts:21`)                                                                                                                                                                                                                                                                                                                                                                                                                               | **Holds**, including the drift between the two copies                                                                                                                                                                                                                                                                               |
| REL-3                          | The deploy scripts have no retry or timeout                                                                                                             | `client.execute` in all three (`current-worker-version.ts:67`, `roll-back-worker.ts:45`, `verify-deployment.ts:98`), none with `retryTransient` or `timeout`                                                                                                                                                                                                                                                                                                                                                                                                                                            | **Holds.** A single transient 5xx fails the rollback and leaves the bad version live; a hung call blocks until the job timeout                                                                                                                                                                                                      |

Also seen, not P0/P1:

- **U4** (#51 macOS `EMFILE`) is fixed by `bf7d5c2`, pushed during this review; that head's CI (macOS included) and Preview are green.
- No response sets `Cache-Control` (QA U3).
- Correctness and agent-native returned no findings. Security returned none and calls the diff net-defensive. Its residual-risk note that `alchemy.run.ts sets OTLP only on non-cloud stages` was not probed.

Errata in the report leaf's text: it says the bottom layers "shipped". They have not: #35-#42 are open, and the bottom's fix-nows are still to land. Its validator line counts #1-#3 as unresolved only because the ruling file sits outside the reviewed tree; the table above confirms them from the ruling text.

Run directory: `starter.worktrees/verify-scratch/ce-code-review/20261006-074436-e05e5e96`.

## Real-product QA evidence (#43, #45, #49, #50, #51), head 7a11f81

Checkout `starter.worktrees/lake1-review`, detached at `origin/lake1/previews` (`7a11f81`); the diff base is `origin/lake1/stack-ci` (`15d131d`, #42). `nix develop`, `pnpm install --frozen-lockfile` (4.4 s). Stack started with `pnpm dev` in a PTY (`TERM=xterm-256color`); 4/4 processes Running, Tempo, the collector and Grafana Ready within 7 s, the site Ready when `/llms.txt` answered.

### U1. Local site in real Chromium (#49 CSP and Trusted Types)

- `Content-Security-Policy` on the HTML response: `default-src 'self'; script-src 'nonce-…' 'strict-dynamic'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; require-trusted-types-for 'script'; trusted-types 'none'; report-to csp; report-uri /csp-report`, plus a `reporting-endpoints` header. The Markdown responses carry no CSP (they are not documents a browser runs).
- The one script on the page (`virtual:tanstack-start-dev-client-entry`) has its nonce set. No console errors or page errors.
- Injection probes in the page, each blocked by Trusted Types before CSP is even consulted:
  - `script.textContent = …` → `This document requires 'TrustedScript' assignment`
  - `script.src = 'data:…'` → `requires 'TrustedScriptURL' assignment`
  - `insertAdjacentHTML('<b>x</b>')` → `requires 'TrustedHTML' assignment`
- `/csp-report`: a legacy `application/csp-report` body → 204; a Reporting API `application/reports+json` body → 204; `not json` → 400.

### U2. A request's trace in local Tempo (#45)

Requests to `/` (Markdown and HTML) with `traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01`, then `GET :3200/api/traces/4bf92f3577b34da6a3ce929d0e0e4736` → 200. The trace has 6 spans, all `service.name = endgame-site`: per request `front_door.serve_page` (with `cell.*`, `app.front_door.route`, `app.front_door.serve_page.decision` attributes) and its children `front_door.serve_page.read` and `front_door.serve_page.write`. The incoming trace id is honoured.

But no trace has a root. Every `front_door.serve_page` names a parent span that never reaches Tempo:

| Trace                  | Spans | Parent of `front_door.serve_page`                                            | In Tempo |
| ---------------------- | ----- | ---------------------------------------------------------------------------- | -------- |
| `4bf92f35…` (injected) | 6     | `6321325016d672db`, `ce3fd6b67758512c` (not the injected `00f067aa0ba902b7`) | no       |
| `fa93c0d8…`            | 3     | `2d06657f111cb6ca`                                                           | no       |
| `db5ce58f…`            | 3     | `89d1a68a3f3870ea`                                                           | no       |
| `f8d972de…`            | 3     | `d3ac43404f7507ef`                                                           | no       |
| `f42fcaf7…`            | 3     | `18df880cc79c9344`                                                           | no       |

TraceQL over the last 15 minutes (49 `endgame-site` traces): `{ nestedSetParent = -1 }` (traces with a root) → 0; `{ span.http.request.method != nil || span.http.method != nil }` → 0. Tempo's search lists every one as `<root span not yet received>`. So a request is queryable by trace id and by route, but the request span (method, path, status, duration) is created, propagated as a parent and never exported. In `apps/site/src/worker.ts` the exporter layer (`Otlp.layerJson` or `CloudflareTracer`) is built per request and handed to `HttpEffect.toWebHandler` as context; the parent's id is visible to the cell's spans, the parent itself is not.

### U3. Deploy and preview CLI (#50, #51)

This container holds no Cloudflare credentials (`~/.alchemy` holds only `id`; no `CLOUDFLARE_*` / `ALCHEMY_*` variables), so `pnpm cloud:deploy` was not run locally. The real CLI ran in #51's Preview job ([run 37430637977](https://github.com/systemfsoftware/effect-endgame-starter-kit/actions/runs/37430637977), success) and deployed `https://endgame-site-pr-51-wz4fag7e6blrocm4.drdgvhbh.workers.dev`. GitHub lists no deployments for the repo.

The live preview, in real Chromium with its own cookie jar and with fetch:

| Request                         | Status | Content-Type                 | Vary   | Time   |
| ------------------------------- | ------ | ---------------------------- | ------ | ------ |
| `/` `Accept: text/html`         | 200    | text/html; charset=utf-8     | Accept | 425 ms |
| `/` `Accept: text/markdown`     | 200    | text/markdown; charset=utf-8 | Accept | 26 ms  |
| `/` no Accept                   | 200    | text/markdown; charset=utf-8 | Accept | 37 ms  |
| `/llms.txt`                     | 200    | text/markdown; charset=utf-8 | (none) | 32 ms  |
| `/nope` `Accept: text/markdown` | 404    | text/markdown; charset=utf-8 | Accept | 31 ms  |
| `/nope` `Accept: text/html`     | 404    | text/html; charset=utf-8     | Accept | 27 ms  |

- The browser page: title "Endgame Starter", the README opening, one script (`/assets/index-DN66ZAdn.js`) with its nonce set, no console or page errors, the Trusted Types HTML sink blocked.
- Three HTML requests carry three distinct nonces.
- No response sets `Cache-Control`.

### U4. #51 CI is red on macOS

`CI` has failed on every `lake1/previews` head since `c62be46` (`7a11f81`: run 37430637950, `check (macos)`). The failing test is `tests/deploy-drift-loop.integration.test.ts` › "A settings patch is sent once, on the first deploy, and never again on a forced redeploy": `alchemy deploy exited 1: … EMFILE: too many open files, open '/private/tmp/alchemy-drift-…/project/node_modules/alchemy/lib/AWS/DocDB/DBSubnetGroup.js.map'`. The Linux legs are green.

### Stack shutdown

`local-stack down` exit 0; ports 1337, 3000, 3200 and 13133 free afterwards.
