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

Workspace roots: `packages/` holds libraries, `apps/` holds publishable
applications — both are workspace globs in `pnpm-workspace.yaml`. Turbo declares
`dist/**` as each package's build output; `pnpm gate:dist` runs that build.

## CI

- Every Linux job runs on `[self-hosted, systemfsoftware-runner, <size>]`; each job's size is its `runs-on` in `.github/workflows/`. Gate: review of the workflow diff.
- Exception: the macOS `check:ci` leg runs on GitHub-hosted `macos-latest`, because the fleet has no macOS and adopters develop on it. Move it to the fleet when the fleet gains macOS.
- Fork PRs run on the fleet only after a maintainer approves the run (the repository's Actions setting).

## End of Session

Commit changes using conventional commits (`<type>(<scope>): <subject>`). Ensure the working tree is clean and `pnpm check:ci` passes.
