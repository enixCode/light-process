#!/bin/sh
# Install git hooks from scripts/hooks/ into .git/hooks/
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOKS_DIR="$SCRIPT_DIR/hooks"
GIT_HOOKS_DIR="$(git rev-parse --git-dir 2>/dev/null)/hooks"

if [ -z "$GIT_HOOKS_DIR" ] || [ ! -d "$GIT_HOOKS_DIR" ]; then
  exit 0
fi

for hook in "$HOOKS_DIR"/*; do
  name="$(basename "$hook")"
  cp "$hook" "$GIT_HOOKS_DIR/$name"
  chmod +x "$GIT_HOOKS_DIR/$name"
done
