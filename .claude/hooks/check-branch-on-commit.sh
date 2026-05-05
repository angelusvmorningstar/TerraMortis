#!/usr/bin/env bash
# PreToolUse hook: enforce branch policy on git commit.
#
# - Blocks commits on `main` (project hard rule: nothing reaches main without
#   explicit per-message instruction).
# - Warns (but allows) commits on any other branch so the user has a moment
#   to sanity-check the branch before the commit lands.
#
# Wired up via .claude/settings.json under hooks.PreToolUse, matcher "Bash".
# Receives the tool input as JSON on stdin.
#
# Exit codes:
#   0 → allow (with optional stderr warning visible to Claude)
#   2 → block (stderr visible to Claude as a tool error)

set -u

input=$(cat)

# Extract the bash command. Use python3 for safe JSON parsing.
cmd=$(printf '%s' "$input" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
    print(d.get("tool_input", {}).get("command", ""))
except Exception:
    print("")
' 2>/dev/null)

# Only act on git commit invocations. Allow `git commit --help`, `gh ...`, etc.
case "$cmd" in
  *"git commit"*) ;;
  *) exit 0 ;;
esac

# Skip if --amend is being used on a non-main branch — amending is a
# different ergonomic concern (covered by the no-amend convention separately).
# But we still block --amend on main below.

branch=$(git symbolic-ref --short HEAD 2>/dev/null) || {
  # Detached HEAD — rare; warn but allow.
  echo "warn(check-branch-on-commit): detached HEAD; commit will be orphaned unless a branch is created." >&2
  exit 0
}

if [ "$branch" = "main" ]; then
  cat >&2 <<'EOF'
BLOCKED by check-branch-on-commit hook.

Refusing to commit on `main`. Project hard rule: nothing reaches main without
explicit per-message instruction.

Switch to a working branch first:
  git checkout Morningstar     # Angelus's branch
  git checkout piatra          # Peter's branch
  git checkout -b <feature>    # new side branch

Then re-stage and re-commit.
EOF
  exit 2
fi

# Otherwise, surface a one-line note so the user (and Claude) can confirm the
# intended branch before the commit lands.
echo "note(check-branch-on-commit): committing on \`$branch\` — proceed if intended." >&2
exit 0
