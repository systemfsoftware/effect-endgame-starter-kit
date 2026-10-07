# starter

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Effect: 4.0](https://img.shields.io/badge/Effect-4.0-purple.svg)](https://effect.website)
[![CI](https://github.com/systemfsoftware/starter/actions/workflows/ci.yml/badge.svg)](https://github.com/systemfsoftware/starter/actions/workflows/ci.yml)

> 🏛️ **starter** is an opinionated monorepo template for serious TypeScript with Effect and AI coding agents.
> 🔒 One architecture, zero knobs, and mechanical gates that reject the slop agents produce when left unconstrained.
> 🚀 Built for engineers accountable for codebases where AI writes the commits.

---

## 💡 Why

AI coding agents produce TypeScript that compiles cleanly and passes shallow unit tests while quietly violating foundational architecture: ambient side effects inside decision logic, unchecked type assertions (`as Type`), and mock-heavy test suites that mask runtime breakage.

`starter` establishes an uncompromising substrate. Invariants are not aspirational guidelines or doc comments; they are enforced mechanically by linter rules, complexity ceilings, mutation test floors, and continuous integration gates.

| Concern               | The Naive AI-Assisted Default                                | The Endgame Architecture (`starter`)                                 |
| --------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------- |
| **Domain Logic**      | ❌ Interleaved I/O, clocks, random generators, and mutations | ✅ Pure functions returning tagged `Decision` or `Refusal` unions    |
| **Branching**         | ❌ Sprawling nested `if`/`else` and procedural loops         | ✅ Cyclomatic complexity 1 via exhaustive pattern matching (`Match`) |
| **Boundary Data**     | ❌ Unchecked casts (`as unknown as Type`, `@ts-ignore`)      | ✅ Strict `Schema.decode` transforming raw bytes into branded types  |
| **Test Verification** | ❌ Mock-heavy tests pinning internal implementation          | ✅ 100% mutation kill floor (`Stryker`) and property-based tests     |
| **Configuration**     | ❌ Dozens of toggles that let agents bypass strictness       | ✅ Zero knobs — one proven opinionated toolchain end to end          |
| **Package Entries**   | ❌ Star exports (`export *`) hiding dependency graphs        | ✅ Explicit named re-exports enumerated one line per symbol          |
| **Refactoring**       | ❌ Patching around rotten legacy modules                     | ✅ Delete-first rebuild with published observable pinning            |

---

## 📐 Architecture

Every external interaction in a `starter` project follows the **I/O Sandwich**:

```
read (impure) ──► decode (pure) ──► decide (pure) ──► shape (pure) ──► write (impure)
```

1. 📥 **`read`** — Gathers raw input from ports and external systems.
2. 🔍 **`decode`** — Validates unvalidated input into branded domain types using Schema.
3. 🧠 **`decide`** — Executes domain logic with cyclomatic complexity 1 (zero I/O, zero ambient state).
4. 📦 **`shape`** — Builds pure output documents and domain events from the decision.
5. 📤 **`write`** — Persists changes, emits domain events, or returns responses.

---

## 🧰 Toolchain

`starter` wires a modern, fast, and type-safe toolchain across the workspace:

| Tool                      | Role & Configuration                                                                   |
| ------------------------- | -------------------------------------------------------------------------------------- |
| ⚡ **pnpm Workspaces**    | Strict workspace dependency management with catalog versioning (`pnpm-workspace.yaml`) |
| 🏎️ **Turbo**               | High-performance task pipeline with cached builds, tests, and lint runs                |
| 🛡️ **Effect 4**            | The standard functional effect system                                                  |
| 🔍 **oxlint**             | Rust-based linter enforcing strict TypeScript rules and the house presets              |
| 🎨 **dprint**             | Fast, deterministic code and markdown formatting (`dprint.json`)                       |
| 🧪 **Vitest**             | Fast unit and integration test runner with TypeScript support                          |
| 🔬 **Stryker**            | Mutation testing ensuring tests fail when bugs are introduced                          |
| 📝 **Changesets**         | Automated versioning and changelogs, released as git tags via shared tooling           |
| 🪝 **Husky & Commitlint** | Git hooks enforcing conventional commit standards                                      |
| 🌳 **Worktrunk Scripts**  | Deno-powered git worktree lifecycle hooks for isolated agent work                      |

---

## 📁 Workspaces

The repository is structured into two workspace roots defined in `pnpm-workspace.yaml`:

```text
.
├── packages/           # Reusable libraries, engines, and domain cores
├── apps/               # The Worker and its end-to-end journeys
├── repos/              # Vendored subtrees (constitution, worktrunk-scripts)
└── docs/               # Solutions, tooling decisions, and plans
```

- [`apps/site`](apps/site) — The one Cloudflare Worker: a TanStack Start site that calls its Worker through effect/rpc (one RpcGroup served at `/api/rpc`, a typed RpcClient in the page) over one D1 database, defined and deployed with Alchemy. `pnpm dev` emulates the database locally; the `health` procedure answers `ok` only when the database answers.
- [`apps/site-e2e`](apps/site-e2e) — The end-to-end journeys that run against `pnpm dev` (`pnpm journeys`).

---

## 🚀 Getting Started

### 1. Create a Repository from Template

Click the **Use this template** button on GitHub, or create a repository via the GitHub CLI:

```bash
gh repo create my-effect-project --template systemfsoftware/starter --public
cd my-effect-project
```

### 2. Enter the Dev Shell and Install

Installs, builds, tests and git hooks run their dependency code inside a deny-by-default sandbox, never directly on your machine. The [Nix](https://nixos.org/download/) dev shell pins the toolchain and carries the sandbox ([prerequisites](CONTRIBUTING.md#prerequisites)):

```bash
nix develop # or: direnv allow
pnpm bootstrap
```

### 3. Build and Verify

```bash
pnpm build
pnpm check:ci
```

### 4. Run It Locally

```bash
pnpm dev       # the whole app at http://localhost:1337, Alchemy's local emulation, no cloud
pnpm journeys  # the end-to-end journeys in a real browser against pnpm dev
```

The site ships one example feature, a guestbook at `/guestbook`: a pure decision (`sign-guestbook.workflow.ts`, built with `Workflow.make`) trims a name and a message and refuses them with typed errors; the RPC procedures `sign` and `list` write and read entries in D1, with the decision's tagged refusals as `sign`'s error schema; and the page shows the entries or the refusal. Everything it owns lives in [`apps/site/src/features/guestbook`](apps/site/src/features/guestbook) and [`apps/site-e2e/tests/features/guestbook`](apps/site-e2e/tests/features/guestbook).

To remove it, delete those two folders and undo its four registration points in `apps/site`:

1. `src/api/site-rpcs.ts`: drop the `GuestbookRpcs` import and make `SiteRpcs` just `HealthRpcs`.
2. `src/api/site-rpc-server.ts`: drop the `GuestbookHandlers` import and its `Layer.provide(GuestbookHandlers)` line.
3. `src/routes/guestbook.tsx`: delete the route file.
4. `alchemy.run.ts`: drop the `migrations` option from `Cloudflare.D1.Database('Database', …)`.

### 5. Deploy

Your copy deploys to your own Cloudflare account; the template holds no credentials. Set `CLOUDFLARE_API_TOKEN` (a token that can edit Workers and D1) and `CLOUDFLARE_ACCOUNT_ID`, and optionally `SITE_DOMAIN` (a hostname in a zone on that account) to serve production there instead of on `workers.dev`:

```bash
pnpm run deploy                         # stage prod
ALCHEMY_STAGE=pr-12 pnpm run deploy     # a preview stage
ALCHEMY_STAGE=pr-12 pnpm run destroy
```

`pnpm run deploy`, not `pnpm deploy`: the bare form is pnpm's own built-in command.

In your copy, with the two secrets set as repository secrets (and `SITE_DOMAIN` as a repository variable), every same-repo pull request gets a preview with its URL in a comment, and `main` deploys production once the release gate passes. The template itself never deploys.

---

## 🚦 Verification Gates

All changes must satisfy local and continuous integration verification gates:

```bash
# Format code and markdown
pnpm format:check

# Typecheck workspace packages
pnpm typecheck

# Run linter across packages
pnpm lint

# Run unit and integration tests
pnpm test
# Run full CI suite locally
pnpm check:ci
```

---

## ❓ Frequently Asked Questions

<details>
<summary><strong>Why does starter require Effect 4 instead of Effect 3?</strong></summary>

Effect 4 brings the schema transformations and typed services the template's decisions and boundaries are written with. `starter` targets the future of Effect rather than supporting legacy patterns.

</details>

<details>
<summary><strong>Why are there no configuration options or preset levels?</strong></summary>

Every configuration toggle provides a route for AI agents to downgrade verification standards and reintroduce slop. Zero knobs guarantees that all packages created from this template adhere to identical architectural standards.

</details>

<details>
<summary><strong>How does mutation testing work in this template?</strong></summary>

Stryker introduces deliberate syntax and logic mutations into your code and runs your test suite against each mutant. If your tests still pass when code behavior changes, the mutant survives and the gate fails. Domain decisions require a 100% kill score. Mutation runs only in the release gate on pushes to `main`, never locally or on pull requests.

</details>

<details>
<summary><strong>How do I migrate an existing codebase to this architecture?</strong></summary>

Follow the strangler pattern: pin the published observable behavior of a module, delete the legacy file completely, and rebuild it from a blank page using pure I/O sandwiches. Never patch around a flawed core.

</details>

---

## 🤝 Contributing

Development setup, workflows, and PR guidelines are documented in [CONTRIBUTING.md](CONTRIBUTING.md).

---

## 📄 License

Licensed under the [Apache-2.0 License](LICENSE).
