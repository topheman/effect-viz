#!/bin/sh
# Prepares a T3 Code worktree (t3.json runs it on creation): installs the
# dependencies from the lockfile. Safe to rerun from T3's "Actions" menu.
set -eu

if [ -z "${T3CODE_PROJECT_ROOT:-}" ]; then
  echo "T3CODE_PROJECT_ROOT is not set: run this from T3 Code." >&2
  exit 1
fi

# The main checkout manages its own dependencies.
if [ "$(cd "$T3CODE_PROJECT_ROOT" && pwd -P)" = "$(pwd -P)" ]; then
  echo "This is the main checkout: nothing to set up."
  exit 0
fi

pnpm install --frozen-lockfile --prefer-offline
