# pnpm-release-management

Release tooling for our pnpm monorepos — the lifecycle apps, the reusable GitHub
workflows that call them, and the containerised end-to-end test that proves the
whole pipeline. It replaces the four near-identical private copies of these
tools that had drifted apart in `systemfsoftware`, `omp-claude-compat` and
`comment-checker`.

A consuming repository keeps its `release.jsonc`, its `.changeset/` intents and
its manifests, and deletes its own copies of the tools.

## Layout

One app per capability of the release lifecycle. Each app is a single
`effect/unstable/cli` program (Effect 4's CLI module) whose subcommands are the
steps of that capability.

```
apps/
  changeset-management/       changeset new | check
  version-management/         version bump | sync | sync-root
  github-release-management/  release plan | pr | tag | release
  git-hooks/                  hooks pre-commit | commit-msg
packages/*/                   the libraries every app imports by name
apps/*/dist/main.js           the tsdown bundles the workflows and the e2e image run
e2e/                          the containerised pipeline test (vitest)
```

Apps are Node programs built with tsdown into self-contained ESM bundles, so a
workflow builds the tools once and runs one directly:

```bash
pnpm --dir .release-tools install --frozen-lockfile
pnpm --dir .release-tools build
node .release-tools/apps/github-release-management/dist/main.js plan --output "$GITHUB_OUTPUT"
```

Each app is a composition root: `main.ts` declares the `Flag`/`Argument`
surface and holds the one `NodeRuntime.runMain` edge, `boundary.ts` decodes the
invocation into the cell's request, and `render.ts` turns the decision or the
refusal into the lines that go out. A refusal surfaces as a `::error::`
workflow annotation and exit 1.

## What it does

The pipeline has one job: turn authored change intents into versioned, tagged
packages and GitHub Releases without a human deciding _when_ anything runs. Every
phase is derived from durable repository state, never from a pull-request ref,
so a half-finished release resumes on the next push.

```mermaid
flowchart LR
  A[".changeset/*.md<br/>intents"] --> B["changeset check<br/>gate"]
  B --> C["release plan<br/>phase"]
  C -->|version| D["version bump<br/>bump surfaces"]
  D --> E["release pr<br/>release PR"]
  E -->|merge| C
  C -->|release| G["release tag"]
  G --> H["release release<br/>GitHub Releases"]
  H --> I["release plan<br/>phase=none"]
```

`version bump` also writes the per-package changelog that later becomes the
GitHub Release body, which is why the order matters: the release notes are
authored with the version bump, not reconstructed at release time.

Nothing is published to a registry. Consumers take a package from the
repository's own Nix flake at a tag or revision.

## Quick start

Add a caller to the consuming repository. The trigger and the permissions stay
with you; the phase decision stays in the reusable workflow.

`.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    branches: [main]

permissions:
  contents: write
  pull-requests: write

jobs:
  release:
    uses: systemfsoftware/pnpm-release-management/.github/workflows/release.yml@main
```

`.github/workflows/changeset-check.yml`:

```yaml
name: Changeset Check

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]

permissions:
  contents: read
  pull-requests: read

jobs:
  check:
    uses: systemfsoftware/pnpm-release-management/.github/workflows/changeset-check.yml@main
```

Then add a `release.jsonc`:

```jsonc
{
  "base": "main",
  "branch": "changeset-release/main",
  "versioning": {
    "strategy": "surfaces",
    "manifest": "package.json",
    "changelog": "CHANGELOG.md",
    "surfaces": [
      { "kind": "toml", "header": "[workspace.package]", "glob": "crates/*/Cargo.toml" },
      { "kind": "nix", "path": "nix/version.nix" }
    ]
  },
  "gate": { "strategy": "turbo", "task": "build" },
  "pr": { "title": "chore(release): version packages" }
}
```

## Configuration

`release.jsonc` at the repository root. Every path is relative to the root.

| Key                             | Default                     | Meaning                                                          |
| ------------------------------- | --------------------------- | ---------------------------------------------------------------- |
| `base`                          | required                    | branch the release PR targets                                    |
| `branch`                        | required                    | branch the release PR is opened from                             |
| `changesetDir`                  | `.changeset`                | where pending intents live                                       |
| `changelogDir`                  | `<changesetDir>/changelogs` | where generated per-package changelogs are written               |
| `versioning.strategy`           | required                    | `surfaces` or `pnpm`                                             |
| `versioning.manifest`           | —                           | `surfaces`: the JSON manifest that owns the version              |
| `versioning.changelog`          | —                           | `surfaces`: the root changelog that receives the release summary |
| `versioning.surfaces[]`         | —                           | `surfaces`: additional files rewritten on every bump             |
| `gate.strategy`                 | required                    | `turbo` (a task graph decides what a change touches) or `paths`  |
| `gate.task`                     | `build`                     | `turbo`: the task whose inputs decide the changed packages       |
| `distribution.launcherManifest` | —                           | required only for repositories that ship platform packages       |
| `distribution.targets[]`        | —                           | `{ target, suffix, os, cpu, libc?, runner, bin }`                |
| `pr.title` / `pr.body`          | built-in copy               | release PR copy                                                  |

A surface is one of:

| `kind` | Fields                                                          | Example           |
| ------ | --------------------------------------------------------------- | ----------------- |
| `json` | `path`                                                          | `package.json`    |
| `toml` | `path` or `glob`, `header` (`[package]`, `[workspace.package]`) | `Cargo.toml`      |
| `nix`  | `path`                                                          | `nix/version.nix` |

`surfaces` versioning bumps the manifest, rewrites the version in every declared
surface, and appends the release summary to the root changelog. `pnpm`
versioning delegates to `pnpm version -r`.

## Change intents

An intent is a Markdown file in `.changeset/` whose frontmatter names the
packages it changes and with which bump, and whose body is the release note.

```markdown
---
"@scope/alpha": minor
"@scope/beta": none
---

Alpha grows a public export.
```

Author one with `changeset new` rather than by hand:

```bash
node apps/changeset-management/dist/main.js new @scope/alpha --bump minor \
  --summary "Alpha grows a public export"
```

`none` consumes an intent without moving a version — use it for work that must
be recorded but does not ship. `version bump` deletes every intent it consumes,
so the release PR diff _is_ the set of notes that shipped.

## Capabilities

| App subcommand      | What it does                                                             |
| ------------------- | ------------------------------------------------------------------------ |
| `changeset check`   | Fails when a publishable package changed without an intent naming it     |
| `changeset new`     | Writes an intent file                                                    |
| `version bump`      | Consumes intents, bumps every surface, writes per-package changelogs     |
| `version sync`      | `check` or `bump <version>` across every declared surface                |
| `version sync-root` | Stamps the launcher manifest with the released version                   |
| `release pr`        | Commits the release branch, opens, refreshes, or closes the release PR   |
| `release plan`      | Derives the release phase from repository state                          |
| `release tag`       | Captures the cycle, then pushes one tag per released package             |
| `release release`   | Creates GitHub Releases from the generated changelogs                    |
| `hooks pre-commit`  | Formats and checks the staged set before a commit lands                  |
| `hooks commit-msg`  | Enforces the conventional-commit header and strips AI co-author trailers |

Every subcommand takes `--config <path>` and otherwise loads `release.jsonc` from
the directory it is run in. The flag may name either the workspace root or a file
inside it: a directory is taken as the root, a file path means its directory is.

Flags worth knowing:

| App subcommand      | Flags                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------- |
| `changeset check`   | `<base-sha-or-ref>`, `--base`, `--skip-liveness`                                              |
| `release plan`      | `--output <file>`, `--deferred <file>`, `--remote <name>`                                     |
| `release tag`       | `--captured <file>`, `--output <file>`, `--exclude`, `--json`, `--dry-run`, `--remote <name>` |
| `release release`   | `--captured <file>`, `--assert`, `--dry-run`                                                  |
| `version sync`      | `check \| bump <version>`                                                                     |
| `version sync-root` | `--manifest <path>`, `--version <version>`, `--dry-run`                                       |

`--output` on `release tag` captures the cycle _and_ skips pushing: the workflow
captures once, then hands the same file to tagging and the release step so both
agree on what this cycle owns.

## CI

| Workflow              | Inputs                                       | Caller must grant                         |
| --------------------- | -------------------------------------------- | ----------------------------------------- |
| `release.yml`         | `tools-ref`, `artifacts-dir`, `node-version` | `contents: write`, `pull-requests: write` |
| `changeset-check.yml` | `tools-ref`, `base-sha`, `node-version`      | `contents: read`, `pull-requests: read`   |

`tools-ref` pins the revision of this repository that a release runs from;
`@main` tracks the tip. Both workflows check this repository out into
`.release-tools`, build it with pnpm, and run its `dist/main.js` bundles
against the caller's workspace.

## Distribution through Nix

A repository ships its public workspace packages as flake outputs. Nothing goes
to a registry. One call in `flake.nix`:

```nix
packages = forEachSystem (pkgs:
  pnpm-release-management.lib.mkPnpmWorkspacePackages {
    inherit pkgs;
    src = self;
    hash = "sha256-…"; # third-party dependencies, keyed by pnpm-lock.yaml
  });
```

For every member of `pnpm-workspace.yaml` that is not `private`, this gives
`packages.<system>.<name>`: the member's `pnpm pack` tarball, with the scope
dropped from the name. It also gives `packages.<system>.workspace-tarballs`:
every tarball plus an `index.json` of `{ name, file }`.

- Third-party dependencies enter only through nixpkgs' `fetchPnpmDeps`
  (`fetcherVersion = 4`): a fixed-output derivation pinned by `hash`. A changed
  lockfile changes the hash, and the build fails until it is updated. The build
  itself never reaches a registry.
- Install runs with `--ignore-scripts` in the Nix sandbox. The members build
  with their `build` script (`buildScript` overrides it), then `pnpm pack`
  writes each tarball and turns every `workspace:` range into the exact version.
- The tarballs rebuild bit-for-bit. CI proves it with
  `nix build --rebuild .#workspace-tarballs`. A declaration file that prints an
  inferred union breaks this, because TypeScript 7 orders union members
  differently from run to run (microsoft/TypeScript#64589). Annotate such an
  export with a named type.
- `pnpm` defaults to `pkgs.pnpm_12`. The root `packageManager` must pin exactly
  that version, or evaluation fails: one pnpm resolves everywhere.
- `packages.<system>.pnpm-store` is the same fixed-output dependency set,
  unpacked into a store directory pnpm can install from offline.

A consumer takes the flake as an input pinned by `flake.lock`. A pull
request's head revision is a snapshot, and a release tag is a stable version.
It builds the tarballs it needs and depends on them with `file:` paths, so each
tarball's integrity lands in the consumer's `pnpm-lock.yaml`.

## Sandbox

`packages.<system>.sandbox` runs dependency code with nothing it was not given:

```bash
sandbox -- pnpm install
sandbox -- pnpm build
sandbox -- pnpm test
sandbox --allow-host api.cloudflare.com --pass-env CLOUDFLARE_API_TOKEN -- pnpm deploy
```

pnpm never reaches a registry from the sandbox. `--pnpm-store` (the dev shell
sets `SANDBOX_PNPM_STORE` to `packages.<system>.pnpm-store`) points pnpm at the
Nix-built store. The sandbox then runs pnpm with `offline`, `frozen-lockfile`,
`ignore-scripts` and `trust-lockfile`; the fixed-output fetch already checked
the lockfile. Each invocation gets a private copy of the store's index database
that is discarded at exit, so the Nix store stays read-only. `$HOME` is a fresh
tmpfs every time, so nothing a dependency plants survives. Tool caches that
should persist (turbo, vite, `tsbuildinfo`) belong in the project's gitignored
`.cache/`; the sandbox sets `XDG_CACHE_HOME` to it.

| Boundary    | Inside the sandbox                                                                                                      |
| ----------- | ----------------------------------------------------------------------------------------------------------------------- |
| filesystem  | the project directory read-write, `/nix/store` read-only, an empty `$HOME`, a private `/tmp`; no other home directories |
| environment | cleared, then `PATH`, `TERM`, locale, `TZ`, `CI` and colour settings, plus each `--pass-env`                            |
| network     | loopback only; each `--allow-host` opens HTTPS to that host through an allow-list proxy                                 |
| processes   | own PID, IPC and UTS namespaces, no capabilities, killed with its parent, no controlling terminal                       |

On Linux it is bubblewrap (`--unshare-all`, `--cap-drop ALL`, `--die-with-parent`,
`--new-session`). On macOS it is `sandbox-exec` with a deny-by-default
profile. Egress goes through a CONNECT proxy outside the sandbox that tunnels
only to declared `host[:port]` (default 443; `*.example.com` matches
subdomains). Inside, `HTTPS_PROXY` points at it and `NODE_USE_ENV_PROXY=1` makes
Node's `fetch` use it. There is no unsandboxed mode.

`packages.<system>.sandbox-proofs` is the gate. Each refusal proof first prints
from inside the same sandbox, so a sandbox that fails to start fails the proof
instead of passing it. The proofs: reading `~/.ssh` and `~/.config` fails,
writing outside the project fails, agent sockets and secrets do not cross the
cleared environment, an undeclared connection fails, a declared host is
reachable while every other host is refused, and a loopback dev server still
answers. CI runs them on Linux and macOS. It then installs, builds and tests
this repository as three separate sandbox invocations with no network at all.

bubblewrap needs unprivileged user namespaces and a mountable `/proc`. Ubuntu
24.04 needs `sysctl kernel.apparmor_restrict_unprivileged_userns=0`. A
container needs `/proc` unmasked (`--security-opt unmask=/proc/*` under
podman). Without them the sandbox refuses to start.

## Install, build, test, package

Enter the dev shell (`direnv allow`, or `nix develop`) for node, pnpm and
deno, then:

| Command             | What it runs                                             |
| ------------------- | -------------------------------------------------------- |
| `pnpm install`      | install the workspace (`--frozen-lockfile` in CI)        |
| `pnpm build`        | turbo: tsdown bundles every package and app              |
| `pnpm typecheck`    | turbo: `tsc --noEmit` over every package and app         |
| `pnpm lint`         | turbo: oxlint with the strict preset over the whole tree |
| `pnpm format:check` | `dprint check`                                           |
| `pnpm test`         | turbo: the vitest suites                                 |
| `pnpm check:ci`     | all of the above, the same gate CI runs                  |

Each app builds to a self-contained ESM bundle at
`apps/<app>/dist/main.js` (npm dependencies inlined, so nothing resolves at
ship time). Packaging wraps that bundle with `deno compile`:

```bash
deno compile --allow-read --allow-write --allow-run --allow-env --allow-net --allow-sys \
  --output dist/<app> dist/main.js
```

`nix build` produces the same binaries; Deno is the packager here, never the
runtime. Run an app from its bundle or its binary:

```bash
node apps/changeset-management/dist/main.js --help
./apps/changeset-management/dist/changeset-management --help
```

## End-to-end test

`pnpm --filter @systemfsoftware/e2e test` builds one container and drives the
entire pipeline in it: a two-package pnpm workspace, a bare git origin and a
GitHub API mock. The phases run in order under vitest and each one's failure
names itself.

The image builds the workspace with pnpm (`pnpm install --frozen-lockfile`,
`pnpm build`, then the `package` task that runs `deno compile` over each
bundle) and ships the four app binaries at `/opt/prm/<app>`. The phases drive
those binaries, never app source, so the test proves what actually ships.

What the container proves is broader than the apps. `git`, `pnpm` and `node`
are the real binaries; the workspace is a real pnpm workspace with a real
lockfile; the release PR, tags and Releases go through real git and a real
HTTP API surface.

The container is hermetic without weakening the apps. `api.github.com` is
redirected to `127.0.0.1` inside the container by
`withExtraHosts`, and a TLS front door on port 443 (plain Node, no runtime
grants to widen) terminates a certificate signed by a CA the image installs
into the system trust store. The apps therefore talk to their production URLs
with no `localhost` behaviour anywhere: no app carries a test-only host, and
no test-only base URL exists to forget to remove.

Green and red runs alike leave a transcript under `e2e/.artifacts/<timestamp>/`:

| Artifact         | Contents                                    |
| ---------------- | ------------------------------------------- |
| `transcript.log` | every command, exit code, output and timing |
| `commands.jsonl` | the same records, machine readable          |
| `summary.json`   | phase names, statuses and timings           |

```bash
E2E_FILTER='tagging pushes' pnpm --filter @systemfsoftware/e2e test   # run only matching phases
E2E_KEEP=1 pnpm --filter @systemfsoftware/e2e test                  # leave the container up and print its id
```

## Contributing

Development setup, hooks and the release workflow for this repository itself:
[CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache-2.0. See [LICENSE](LICENSE).
