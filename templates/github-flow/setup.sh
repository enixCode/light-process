#!/usr/bin/env bash
# setup.sh - apply github-flow configuration to a GitHub repository
#
# Usage:
#   bash setup.sh <owner/repo>
#
# What it does:
#   1. Enforces squash-only merge policy (disables merge commits + rebase merges)
#   2. Seeds the `alpha` mobile tag on the current origin/main HEAD
#   3. Prints next steps
#
# Requirements:
#   - `gh` CLI authenticated (gh auth status)
#   - The target repo cloned locally, run from inside that clone
#   - Push access to the repo

set -euo pipefail

REPO="${1:-}"
if [[ -z "$REPO" ]]; then
  echo "Usage: $0 <owner/repo>" >&2
  echo "Example: $0 enixCode/light-process" >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "error: gh CLI not found. Install from https://cli.github.com" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "error: gh CLI not authenticated. Run: gh auth login" >&2
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "error: not inside a git working tree. cd into the cloned repo first." >&2
  exit 1
fi

echo "==> 1. Enforce squash-only merge policy on $REPO"
gh api -X PATCH "repos/$REPO" \
  -F allow_merge_commit=false \
  -F allow_rebase_merge=false \
  -F allow_squash_merge=true \
  --jq '{allow_squash_merge, allow_merge_commit, allow_rebase_merge}'

echo ""
echo "==> 2. Seed 'alpha' mobile git tag on origin/main HEAD"
git fetch origin main --quiet
MAIN_SHA=$(git rev-parse origin/main)
echo "    origin/main = $MAIN_SHA"

if git ls-remote --tags origin | grep -q 'refs/tags/alpha$'; then
  echo "    alpha tag already exists on remote - skipping (use 'git tag -f alpha && git push -f origin alpha' to move)"
else
  git tag alpha "$MAIN_SHA"
  git push origin alpha
  echo "    alpha -> $MAIN_SHA"
fi

echo ""
echo "==> 3. Check existing latest tag"
if git ls-remote --tags origin | grep -q 'refs/tags/latest$'; then
  echo "    latest tag already exists - skipping"
else
  LAST_V=$(git tag -l 'v*' --sort=-v:refname | head -1 || true)
  if [[ -n "$LAST_V" ]]; then
    echo "    seeding latest -> $LAST_V"
    git tag latest "$LAST_V"
    git push origin latest
  else
    echo "    no v* tag found - latest will be created on first stable release"
  fi
fi

echo ""
echo "Done. Next steps:"
echo "  - Verify release.yml is present in .github/workflows/ and references the correct package name"
echo "  - Configure npm Trusted Publisher on npmjs.com if you publish to npm"
echo "  - Open a PR - only the 'Squash and merge' button should be enabled"
