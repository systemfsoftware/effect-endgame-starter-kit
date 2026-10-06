# Changesets

This directory holds change-intent files consumed by pnpm-native workspace
versioning (`pnpm version -r`). One file per change, authored with:

```
pnpm change --bump <none|patch|minor|major> --summary "<changelog entry>" [<pkg>...]
```

- A PR that changes anything under an application or package path MUST ship with
  an intent here. Root tooling is outside the verdict.
- `--bump none` records a change that needs no release. A `none` on a
  behavior-visible change is the same silent non-release the gate exists to
  catch.
- Intents are consumed by `pnpm version -r` when the Release PR
  lands: consumption is recorded in `ledger.yaml` and the intent files
  are retained, so a present intent alone never implies a pending release.
- This README is NOT a changeset: the gate requires a file whose frontmatter
  parses as `"<pkg>": <none|patch|minor|major>`.

Releasing is handled by the shared release tooling in
`systemfsoftware/pnpm-release-management`, which this repository calls as a
reusable workflow (`.github/workflows/release.yml`) rather than carrying its own
copy; `release.jsonc` configures it. There is no registry publish: when the
Release PR lands, each released version is tagged `<pkg>@vX.Y.Z` and its GitHub
Release is cut from the authored changelog. Consumers depend on packages as Nix
flake outputs pinned from git refs, so the tag is the release record.
