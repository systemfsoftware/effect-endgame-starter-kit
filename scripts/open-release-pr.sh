#!/usr/bin/env bash
set -euo pipefail

: "${BRANCH:?}"
: "${BASE:?}"
: "${GH_TOKEN:?}"

existing=$(gh pr list --head "$BRANCH" --state open --json number --jq '.[0].number // empty')

git fetch --quiet origin "$BASE"

close_if_open() {
  if [ -n "$existing" ]; then
    gh pr close "$existing" --delete-branch --comment "$1"
  fi
}

if [ -z "$(git status --porcelain)" ]; then
  echo "no pending change intents — nothing to release"
  close_if_open "No pending change intents remain."
  exit 0
fi

if [ -z "$(git diff --name-only "origin/$BASE" -- 'apps/**/package.json' 'packages/**/package.json')" ]; then
  echo "no package.json version bumps against origin/$BASE — not opening a release PR"
  close_if_open "No package version bumps against $BASE."
  exit 0
fi

git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git switch --force-create "$BRANCH"
git add -A -- apps packages .changeset pnpm-lock.yaml
git commit -m 'chore(release): version packages'
git push --force origin "$BRANCH"

body=$(mktemp)
trap 'rm -f "$body"' EXIT
cat > "$body" <<'BODY'
Consumes pending `.changeset/` intents via `pnpm version -r`.

Merging runs the gate, then tags the changed packages and publishes
their authored changelogs as GitHub Releases.

Review every consumed `none` intent before merging — a `none` on a
behavior-visible change is a silent non-release.
BODY

gh label create release \
  --color 0E8A16 \
  --description 'Automated version-packages release PR' \
  --force

if [ -n "$existing" ]; then
  gh pr edit "$existing" \
    --title 'chore(release): version packages' \
    --body-file "$body" \
    --add-label release
else
  gh pr create \
    --base "$BASE" \
    --head "$BRANCH" \
    --title 'chore(release): version packages' \
    --body-file "$body" \
    --label release
fi
