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

- This repo is a template and holds no credentials; CI proves everything locally. Gate: review of the workflow diff; a job that needs a secret carries `if: ${{ !github.event.repository.is_template }}`.
- Every job runs on GitHub-hosted `ubuntu-latest` runners. This repository is public, and the org's self-hosted fleet runner group admits only private repositories (fork safety), so a `[self-hosted, systemfsoftware-runner, *]` job here queues forever. Gate: review of the workflow diff.
- Cloudflare credentials enter a sandbox only through `bin/cloud` (deploy, destroy, state reads). Gate: review of the workflow diff — wrong: `sandbox --pass-env CLOUDFLARE_API_TOKEN -- pnpm --filter @endgame/site exec alchemy deploy`; right: `./bin/cloud pnpm --filter @endgame/site exec alchemy deploy`.
- CI is two workflows: `check.yml` (one `check` job: `turbo run format:check lint typecheck test --affected` plus commitlint over the PR range) and `deploy.yml` (a `deploy` and a `cleanup` job, dormant until the repository variable `ALCHEMY_DEPLOY` is `true`); mutation is an on-demand package script and never gates a deploy. Gate: review of the workflow diff.

## End of Session

Commit changes using conventional commits (`<type>(<scope>): <subject>`). Ensure the working tree is clean and `pnpm check:ci` passes.
