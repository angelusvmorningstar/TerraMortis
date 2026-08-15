# Session Start — TM Suite Orientation (project playbook)

> Loaded by the global `session-start` dispatcher skill when the working dir is this project.
> Orient to the project before touching anything: git/branch state, the sprint-status header,
> live GitHub issues/PRs, and test posture. Run these steps in order. Output a short summary at
> the end. No narration while reading.

*Playbook created 2026-08-12 (first version — this repo had no project playbook before).*

---

## Step 1 — Git & branch state

```bash
git status -sb
git log --oneline -8
```

- **Never push, merge to `main`, or deploy** unless Angelus's *current* message explicitly says
  so (hard rule, `CLAUDE.md`). A prior session's "commit and merge" does not carry forward.
- Branch convention: `ms/issue-<n>-<slug>` cut from up-to-date `main`, PR'd straight back to
  `main`. There is **no dev-sync protocol** any more — don't run `git merge dev`, don't raise
  "dev is ahead/behind" as an action item unless asked. `dev` flows *from* `main`, not into it
  (reversed after #1128).
- **Expect a large pile of untracked files under `server/scripts/_acad-*`, `_arrow_*`, `_ath-*`
  etc.** — these are scratch output from map-edge-building tool sessions, not gitignored, and
  not a sign of anything broken. Don't flag the count or offer to clean it up unless asked; only
  note it if it looks like it changed unexpectedly (e.g. a file mid-edit from an interrupted
  session).
- If the working tree has a **tracked** modification (not scratch clutter), identify whether it
  matches the current branch's stated purpose or looks like a stray/unrelated edit.

## Step 2 — Where we left off (`specs/stories/sprint-status.yaml`)

This file is **~100KB — under the `Read` tool's 256KB hard limit, so read it in full** (unlike
TM Wiki's 750KB+ file, no grep-only constraint applies here).

- The `last_updated` header (and `last_updated_previously` beneath it) is a dense freeform
  paragraph the previous session writes on close-out: what shipped, defect root causes, issue/PR
  numbers, test counts, MERGED/DEPLOYED status, what's still open. Read both before touching the
  story table below them.
- Cross-check `specs/deferred-work.md` (small, ~4KB, safe to read whole) for anything opened
  last session or awaiting an explicit Angelus ruling.

## Step 3 — Live GitHub state

This repo actively uses `gh` issue/PR tracking alongside `sprint-status.yaml` (TM Wiki and TM
Cockpit don't) — check both, they should agree:

```bash
gh pr view --json number,title,state,url 2>&1          # does the current branch have an open PR?
gh issue list --limit 10
gh pr list --limit 8
```

- If the current branch already has an OPEN PR, that usually means the story is done and
  awaiting review/merge, not still in progress — check its title/number against
  `sprint-status.yaml`'s `last_updated` header to see which is true.
- **Several long-open PRs are stale, not active threads**: anything under `piatra/*` predates
  Peter stepping back from TM Suite dev (2026-08-09); third-party branches (e.g.
  `vipin-kumar17:*`) are external contributions awaiting Angelus's own review call. Don't act on
  these — just note if one has moved recently.
- Commit messages use `fix(#N)` / `feat(#N)` — the issue closes automatically when that commit's
  PR merges to `main`, not before. Don't mark an issue mentally "done" off an open PR alone.

## Step 4 — Test posture (don't run by default)

- **Run the changed area's suites, not the whole thing** — full runs are slow and bury the
  signal (`CLAUDE.md`, `feedback_targeted_tests_not_full_suite` memory). Only run tests if this
  session is about to touch code, or verifying a claim from last session.
- vitest: `cd server && npx vitest run tests/<name>.test.js`. Playwright:
  `npx playwright test tests/<name>.spec.js` (never two Playwright runs concurrently — shared
  port 8080).
- **Known pre-existing failures are already catalogued in `CLAUDE.md`** (the allocator-readers
  source-window assertion, `desktop-and-css.spec.js` (12), `post-game-1.spec.js` nav-1-3 (3)) —
  cite that list rather than re-deriving it fresh.
- **Angelus cannot run the app locally.** Anything needing a human look must reach `dev` or
  `main` first — don't claim a UI change is "verified" off test suites alone.

## Step 5 — Output orientation summary

Write a short summary (5–8 lines max) covering:

1. **Branch + PR** — current branch, ahead/behind `origin/main`, and whether it already has an
   open PR (with number).
2. **Last session** — condensed from `sprint-status.yaml`'s `last_updated` header.
3. **GitHub flags** — anything from Step 3 worth surfacing (stale PR that moved, issue that
   should auto-close soon). Omit if nothing new.
4. **Working tree** — tracked changes only; mention scratch clutter exists only if it changed
   unexpectedly.
5. **Unblocked now** — the single highest-priority workable item (the open PR awaiting merge, a
   `ready-for-dev` story, or an issue with no branch yet).

Then ask: *"What would you like to work on?"* — or, if Angelus already named a task in their
opening message, skip the question and get started directly.
