# starter

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Effect: 4.0](https://img.shields.io/badge/Effect-4.0-purple.svg)](https://effect.website)
[![CI](https://github.com/systemfsoftware/starter/actions/workflows/ci.yml/badge.svg)](https://github.com/systemfsoftware/starter/actions/workflows/ci.yml)

> 🏛️ **starter** is an opinionated monorepo template for serious TypeScript with Effect and AI coding agents.
> 🔒 One architecture, zero knobs, and mechanical gates that reject the slop agents produce when left unconstrained.
> 🚀 Built for engineers accountable for codebases where AI writes the commits.

<!-- home:start -->

# Build with agents you can still trust

An agent will happily hand you code that compiles, passes the tests it wrote itself, and quietly
breaks the architecture underneath. The build is green and the codebase is no longer yours.

This is the substrate that refuses that trade. Every boundary is decoded rather than asserted,
every decision is a pure function under a complexity ceiling, and every claim a test makes is
checked by mutation. What reaches `main` is what you would have written by hand.

Point an agent at a capability and let it grow one layer at a time.

Read this page as plain text at [llms.txt](/llms.txt).

<!-- home:end -->

---

## 💡 Why

AI coding agents produce TypeScript that compiles cleanly and passes shallow unit tests while quietly violating foundational architecture: ambient side effects inside decision logic, unchecked type assertions (`as Type`), and mock-heavy test suites that mask runtime breakage.

`starter` establishes an uncompromising substrate. Invariants are not aspirational guidelines or doc comments; they are enforced mechanically by linter rules, complexity ceilings, mutation test floors, and continuous integration gates.

| Concern                  | The Naive AI-Assisted Default                                | The Endgame Architecture (`starter`)                                 |
| ------------------------ | ------------------------------------------------------------ | -------------------------------------------------------------------- |
| **Domain Logic**         | ❌ Interleaved I/O, clocks, random generators, and mutations | ✅ Pure functions returning tagged `Decision` or `Refusal` unions    |
| **Branching**            | ❌ Sprawling nested `if`/`else` and procedural loops         | ✅ Cyclomatic complexity 1 via exhaustive pattern matching (`Match`) |
| **Boundary Data**        | ❌ Unchecked casts (`as unknown as Type`, `@ts-ignore`)      | ✅ Strict `Schema.decode` transforming raw bytes into branded types  |
| **Effect Composition**   | ❌ Ambient services and eager promise invocations            | ✅ Lazy `Cell` workflows composed linearly via `.pipe()`             |
| **Dependency Injection** | ❌ Captured instances and deep `provideService` calls        | ✅ Single `Cell.provide` at the root with `R = never` at the entry   |
| **State Storage**        | ❌ Direct mutation and unvalidated store writes              | ✅ Tenant-bound store ports carrying write guard predicates          |
| **Test Verification**    | ❌ Mock-heavy tests pinning internal implementation          | ✅ 100% mutation kill floor (`Stryker`) and property-based tests     |
| **Configuration**        | ❌ Dozens of toggles that let agents bypass strictness       | ✅ Zero knobs — one proven opinionated toolchain end to end          |
| **Package Entries**      | ❌ Star exports (`export *`) hiding dependency graphs        | ✅ Explicit named re-exports enumerated one line per symbol          |
| **Refactoring**          | ❌ Patching around rotten legacy modules                     | ✅ Delete-first rebuild with published observable pinning            |

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

Phase ordering is guaranteed at compile time: each phase returns branded markers that the succeeding phase demands as input.

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
| 📦 **tsdown**             | Fast TypeScript bundler building dual ESM and type declarations                        |
| 📝 **Changesets**         | Automated versioning and changelog generation with npm OIDC provenance                 |
| 🪝 **Husky & Commitlint** | Git hooks enforcing conventional commit standards                                      |
| 🌳 **Worktrunk Scripts**  | Deno-powered git worktree lifecycle hooks for isolated agent work                      |

---

## 📁 Workspaces

The repository is structured into two workspace roots defined in `pnpm-workspace.yaml`:

```text
.
├── packages/           # Reusable libraries, engines, and domain cores
│   └── starter/        # Seed library template (rename to your package)
├── apps/               # Declared workspace root for apps and CLI tools (added as needed)
├── repos/              # Vendored subtrees (constitution, worktrunk-scripts)
└── docs/               # Solutions, tooling decisions, and plans
```

- [`packages/starter`](packages/starter) — The starter package scaffold with pre-configured build, lint, test, and mutation configs.

---

## 🚀 Getting Started

### 1. Create a Repository from Template

Click the **Use this template** button on GitHub, or create a repository via the GitHub CLI:

```bash
gh repo create my-effect-project --template systemfsoftware/starter --public
cd my-effect-project
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Claim the Package

1. Rename `packages/starter` to your desired package name (e.g., `packages/my-lib`).
2. Update `name`, `description`, and `author` in `packages/starter/package.json`.
3. Remove `"private": true` from `package.json` when you are ready to publish.

### 4. Build and Verify

```bash
pnpm build
pnpm check:ci
```

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

# Run mutation tests
pnpm mutation

# Run full CI suite locally
pnpm check:ci
```

---

## ❓ Frequently Asked Questions

<details>
<summary><strong>Why does starter require Effect 4 instead of Effect 3?</strong></summary>

Effect 4 introduces first-class primitives for cell composition, branded type ordering, and modern schema transformations that enable the endgame architecture. `starter` targets the future of Effect rather than supporting legacy patterns.

</details>

<details>
<summary><strong>Why are there no configuration options or preset levels?</strong></summary>

Every configuration toggle provides a route for AI agents to downgrade verification standards and reintroduce slop. Zero knobs guarantees that all packages created from this template adhere to identical architectural standards.

</details>

<details>
<summary><strong>How does mutation testing work in this template?</strong></summary>

Stryker introduces deliberate syntax and logic mutations into your code and runs your test suite against each mutant. If your tests still pass when code behavior changes, the mutant survives and the gate fails. Domain decisions require a 100% kill score.

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
