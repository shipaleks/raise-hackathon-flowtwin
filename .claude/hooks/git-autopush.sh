#!/usr/bin/env bash
# Auto-commit and push after each Claude Code turn that changed files.
# Wired as a Stop hook in .claude/settings.json. Safe to run when nothing changed.
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" 2>/dev/null || exit 0

# Only operate inside a git work tree.
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

# Nothing to do? Exit quietly so the turn ends normally.
if git diff --quiet && git diff --cached --quiet \
   && [ -z "$(git ls-files --others --exclude-standard)" ]; then
  exit 0
fi

git add -A

files=$(git diff --cached --name-only | head -n 5 | paste -sd', ' -)
count=$(git diff --cached --name-only | wc -l | tr -d ' ')

git commit -q \
  -m "chore: auto-sync ${count} file(s) — ${files}" \
  -m "Automated commit via Claude Code Stop hook." \
  -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" \
  || exit 0

# Push to the tracked upstream. Never fail the turn on a network hiccup —
# surface a soft warning instead; the next change will retry.
if ! git push -q 2>/dev/null; then
  printf '{"systemMessage":"⚠️ Auto-commit done, but git push failed (offline?). It will retry on the next change."}\n'
fi

exit 0
