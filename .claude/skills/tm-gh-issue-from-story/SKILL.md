---
name: TM GH Issue From Story (DEPRECATED)
description: DEPRECATED — wrong workflow direction. Use tm-gh-issue-create instead (chat → issue), and tm-gh-issue-pickup to start work on an existing issue (which spins up the story file via BMAD SM). This skill is kept as a stub so existing references don't break; do not invoke for new work.
---

# DEPRECATED — do not use

This skill assumed BMAD stories were the source of truth and issues were a mirror. The actual workflow is the opposite: GitHub issues are the source, BMAD stories are derived from issues at pickup time.

## Use these instead

- **`tm-gh-issue-create`** — turn a chat description into a properly formatted GitHub issue.
- **`tm-gh-issue-pickup`** — pick up an existing issue: creates the side branch, hands the issue body to BMAD SM (`bmad-create-story` / `bmad-agent-sm`) to spin up the story file, sets you up for the dev cycle.
- **`tm-gh-pr-for-branch`** — when the work is done, package as a PR that closes the originating issue.

## If you genuinely need the old direction

(e.g. backfilling issues for stories that were authored before this workflow): run `gh issue create` directly with hand-written body. The use case is rare enough not to warrant a skill.
