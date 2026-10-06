#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "usage: instrument-ref.sh <base-sha> <head-sha>" >&2
  exit 2
fi
base=$1
head=$2

git cat-file -e "${base}^{commit}" 2>/dev/null || {
  echo "base commit ${base} is not in this clone; fetch it before choosing an instrument" >&2
  exit 1
}
git cat-file -e "${head}^{commit}" 2>/dev/null || {
  echo "head commit ${head} is not in this clone" >&2
  exit 1
}

if git cat-file -e "${base}:.github/workflows/scorecard.yml" 2>/dev/null; then
  echo "ref=${base}"
  echo "mode=base"
else
  echo "ref=${head}"
  echo "mode=bootstrap"
fi
