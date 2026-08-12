# Session Wrap — TM Suite Wrap-up (project playbook)

> Loaded by the global `session-wrap` dispatcher skill when the working dir is this project.
> Mirror image of `.claude/session-start.md`: refresh the resume state so the *next*
> session-start gets an accurate `last_updated` header instead of a stale one. Run these steps
> in order. Output a short summary at the end. No narration while working.

*Playbook created 2026-08-12, alongside `session-start.md` (first version — neither existed
before).*

---

## Step 1 — Establish what actually happened this session

Don't reconstruct from memory — check it:

```bash
git status --short
git log --oneline -8
gh pr view --json number,title,state,url 2>&1
```

Build a short mental list: commits made, files still uncommitted (tracked changes, not the
`server/scripts/_acad-*`/`_arrow_*`/`_ath-*` scratch clutter — that's expected background noise,
not this session's work unless this session specifically touched it), issues/PRs opened or
closed, decisions made, defects found and fixed.

## Step 2 — Refresh `specs/stories/sprint-status.yaml`

This file is ~100KB, **under the `Read`/`Edit` tool's 256KB limit** — read and edit it directly,
no grep-only constraint.

1. **Rotate, don't stack.** Move the existing `last_updated` block down into
   `last_updated_previously` verbatim (replacing whatever was there), then write a fresh
   `last_updated` for this session.
2. Match the existing dense-paragraph register — recent real headers name: what shipped, defect
   root causes, issue/PR numbers (`issue-1141-office-data-sync`, `PR #1139 -> main ad8d7c21`),
   external-review findings if any (Codex review counts by severity), test counts (`242/1 across
   22 suites, the 1 pre-existing (#1115)`), MERGED/DEPLOYED status with date, and what's still
   unchecked or deferred. Terse, factual, no padding.
3. Only touch story-table statuses for items that genuinely moved this session — don't re-audit
   the whole table.

## Step 3 — Test status, if code changed

- Report which vitest/Playwright suites actually ran and their pass/fail counts, in the same
  "N passed / M failed, the M pre-existing (#issue)" convention already used in the header —
  cite the known pre-existing failures by their `CLAUDE.md` issue number rather than
  re-describing them.
- **Never claim a UI change is verified without either Playwright evidence or Angelus having
  looked at it on a deployed environment** — he cannot run the app locally, so "looks right" from
  reading code alone is not a verification claim this file should carry.

## Step 4 — GitHub state

- If the branch has an open PR, does its title/description still match what actually shipped
  this session, or did commits get added after it opened that aren't reflected? Flag if stale,
  don't edit the PR without being asked.
- Note any issue that a merged `fix(#N)`/`feat(#N)` commit should auto-close — but only report it
  as closing once the PR that carries it has actually merged to `main`, not on commit alone.

## Step 5 — Uncommitted / unpushed work

Surface it; don't act on it. `git status --short` from Step 1 already has the answer.
**Never commit, push, or merge as part of wrap-up unless the current message explicitly says
so** — this mirrors the repo's own hard rule (`CLAUDE.md`); wrap-up is not a standing exception.

## Step 6 — Output wrap summary

Write a short summary (5–8 lines max) covering:

1. **This session, in one line** — the headline you just wrote into `last_updated`.
2. **Shipped / fixed** — concrete outcomes, numbers included (tests, issues, PRs).
3. **Still open** — anything deferred or blocked, if any.
4. **Tests run** — suite + pass/fail counts, if code changed. Omit if no code touched.
5. **Git / GitHub state** — branch, uncommitted files, PR status.
6. **Next** — the single next concrete action for whoever resumes.

No closing question needed — wrap-up ends the session, it doesn't open new work.
