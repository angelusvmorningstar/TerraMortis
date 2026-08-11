# Session Wrap — TM Suite Wrap-up (project playbook)

> Loaded by the global `session-wrap` dispatcher skill when the working dir is this repo. Mirror
> image of `.claude/session-start.md`: refresh the resume state so the *next* session-start gets
> an accurate picture instead of stale/drifted headers. Run these steps in order. Output a short
> wrap summary at the end. No narration while working.

*Playbook created 2026-08-11, alongside `session-start.md` (first version for this repo).*

---

## Step 1 — Establish what actually happened this session

Don't reconstruct this from memory — check it:

```bash
git status --short | grep -v "server/scripts/_"
git log --oneline -8
```

(The `server/scripts/_*` scratch pile — 1000+ untracked map-generation files — is noise here too;
filter it the same way `session-start.md` Step 1 does.)

Build a short mental list: commits made, files still uncommitted (filtered), issues that should
auto-close via a merged PR (`gh pr list --state merged --limit 5` if any PR work happened),
skills/scripts edited, defects found and fixed. If `server/` code changed, note whether
`cd server && npm run test` (vitest) was run this session; if `public/js/**` or a user-facing flow
changed, note whether the relevant `tests/*.spec.js` Playwright specs were run. This repo has no CI
gate — a claimed "tests pass" needs to actually have been run this session, not assumed clean.

---

## Step 2 — Refresh `specs/stories/sprint-status.yaml`

**Known drift bug**: this file carries two `last_updated` markers — a `#`-commented prose header
near line 2, and a real YAML `last_updated:` field ~30 lines down. History shows only the commented
header reliably gets kept current while the YAML field silently goes stale (as of 2026-08-11 it was
six weeks behind). **Update both, with matching content, so they can't disagree:**

1. Write a one-line prose summary into the `#`-commented header — issue/story worked, outcome,
   test count if run, what's still open, commit count this session, a "Next:" pointer. Match the
   register already there: dated, specific numbers, no vague "made progress."
2. Copy the same summary into the real `last_updated:` YAML field a few lines below.
3. Only touch story-table `epic-N` / story-key statuses (`backlog` / `ready-for-dev` /
   `in-progress` / `review` / `done`) for items that genuinely moved this session — full
   epic/story bookkeeping belongs to `bmad-dev-story` / `bmad-create-story`, not a blanket
   re-audit here.

If this drift gets noticed as annoying enough to fix properly (collapsing to one field, the way TM
Wiki did on 2026-08-08), that's a real cleanup suggestion worth surfacing to Angelus — but don't do
it unprompted as part of a routine wrap.

---

## Step 3 — Close the loop on GitHub issues

If any commit this session references a `#N` issue and the work is actually done (not just
in-progress), sanity-check the issue's state rather than assuming:

```bash
gh issue list --state open --limit 15
```

An issue that should auto-close on PR merge (via a "Closes #N" in the commit/PR body) closes itself
once merged — don't manually close issues for unmerged local work, and don't manually close an
issue this session didn't actually finish.

---

## Step 4 — Deferred work (`specs/deferred-work.md`)

Small file (~4KB) — read it directly rather than grep. If any code review ran this session and
surfaced a `defer`-classified finding, confirm it's captured here under a heading naming the
story/issue, matching the existing style (`## Deferred from: <story/review> (<date>)`).

---

## Step 5 — Uncommitted work

Surface it; don't act on it. Step 1's filtered `git status --short` already has the answer.
**Never commit or push as part of wrap-up unless the current message explicitly says to** — this
mirrors the repo's own hard rule (`CLAUDE.md`); wrap doesn't get a standing exception.

---

## Step 6 — Output wrap summary

Write a short summary (6-10 lines max) covering:

1. **This session, in one line** — the summary just written into both `last_updated` markers.
2. **Shipped / fixed** — concrete outcomes, issue/story numbers, test counts if run.
3. **Still open** — anything flagged in Step 2/3/4.
4. **Git state** — uncommitted files (filtered) or unpushed commits, if any.
5. **Next** — the single next concrete action (matches what `session-start.md` Step 5 will
   surface next time).

No closing question needed — wrap-up ends the session, it doesn't open new work.
