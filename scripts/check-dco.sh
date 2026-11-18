#!/usr/bin/env bash
# Verifies that every commit in BASE..HEAD carries a Signed-off-by line.
# Usage: scripts/check-dco.sh [BASE] [HEAD]   (defaults: origin/main, HEAD)
set -euo pipefail
base="${1:-origin/main}"
head="${2:-HEAD}"
missing=0
for c in $(git rev-list --no-merges "${base}..${head}"); do
  if ! git show -s --format=%B "$c" | grep -qE '^Signed-off-by: .+ <.+>$'; then
    echo "missing Signed-off-by: $(git show -s --format='%h %s' "$c")"
    missing=1
  fi
done
if [ "$missing" -ne 0 ]; then
  echo "Sign off commits with: git commit -s --amend  (or git rebase --signoff)"
  exit 1
fi
echo "DCO: all commits are signed off"
