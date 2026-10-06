# starter

Starter template for TypeScript / Effect libraries and tools.

## Boundaries

| Surface            | Examples                                     | Limit                                                  |
| ------------------ | -------------------------------------------- | ------------------------------------------------------ |
| **Evaluator**      | `commitlint.config.ts`, `.github/workflows/` | Read-only; never edit the instrument that grades work. |
| **Doctrine**       | `CONSTITUTION.md`, `subtrees.toml`           | Project law; edit only on deliberate direction.        |
| **Vendored**       | `repos/**`                                   | Read-only; updated via git subtree, never hand-edited. |
| **Human approval** | Releases, publishing, external credentials   | User-confirmed only.                                   |
| **Editable**       | Workspace source, tests, documentation       | Edit freely.                                           |

## Definition of Done

| ID        | Rule                                                | Gate                |
| --------- | --------------------------------------------------- | ------------------- |
| `START-1` | Formatting passes dprint with no diffs              | `pnpm format:check` |
| `START-2` | Typechecking succeeds workspace-wide with no errors | `pnpm typecheck`    |
| `START-3` | All test suites pass                                | `pnpm test`         |
| `START-4` | Full CI validation passes before completion         | `pnpm check:ci`     |
| `START-5` | The e2e journeys pass against `pnpm dev`            | `pnpm journeys`     |

Workspace roots: `packages/` holds libraries, `apps/` holds publishable
applications — both are workspace globs in `pnpm-workspace.yaml`. Turbo declares
`dist/**` as each package's build output; `pnpm gate:dist` runs that build.

## CI

- Every job runs on GitHub-hosted runners: `ubuntu-latest`, and `macos-latest` for the macOS `check:ci` leg. This repository is public, and the org's self-hosted fleet runner group admits only private repositories (fork safety), so a `[self-hosted, systemfsoftware-runner, *]` job here queues forever. Gate: review of the workflow diff.
- Heavy suites split across parallel hosted jobs instead of a larger runner: Linux `check:ci` runs as one job per part (format, lint, typecheck, test, dist), and mutation on `main` runs one job per package. Gate: review of the workflow diff.

## End of Session

Commit changes using conventional commits (`<type>(<scope>): <subject>`). Ensure the working tree is clean and `pnpm check:ci` passes.
