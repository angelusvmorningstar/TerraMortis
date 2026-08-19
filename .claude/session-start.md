# Session Start — TM Suite (project playbook)

> Loaded by the global `session-start` dispatcher skill when the working dir is this repo.
> Mirror image of this repo's own `.claude/session-wrap.md` — orient here, wrap there. Run these
> steps in order; keep output to ~8-12 lines, no narration while reading.

*Playbook created 2026-08-18 (this repo had a `session-wrap.md` since 2026-08-12 but no matching
`session-start.md` until now — see that file's own note flagging the gap).*

---

## 1. Branch & git state

```bash
git status --short --branch
git log --oneline -8
```

- **Never push, merge, or sync `dev` from a session-start check itself** — only when Angelus's
  *current* message explicitly says so (hard rule, `CLAUDE.md`). Report state, don't act on it.
- Confirm the branch isn't `main` mid-work (should be a side branch, or `main` right after a clean
  merge-back) — flag immediately if commits landed directly on `main` without a PR.
- Branching convention: `ms/issue-<n>-<slug>` cut from up-to-date `main`, PR straight back to
  `main`. `dev` is a Netlify staging deploy target only now, not an integration stream — don't
  suggest syncing it unless asked.

## 2. Local hooks check (cheap, worth it every session)

```bash
git config --get core.hooksPath
```

If empty (a fresh clone/checkout forgets this), flag it and recommend
`git config core.hooksPath .githooks` — it's the parse-check that catches smart-quote-as-syntax
and similar errors on staged `public/js/**/*.js` before they reach `main` (`.githooks/README.md`).

## 3. Sprint status — grep only, never Read whole

`specs/stories/sprint-status.yaml` runs ~420KB as of 2026-08-18 and **will hard-error the `Read`
tool's 256KB limit** — always grep, never attempt to load it whole.

```bash
grep -n "^last_updated:" specs/stories/sprint-status.yaml | head -1
```

Take the header's **opening clause only** for orientation — the rest is session-to-session
archaeology chained with "Prior entry follows.)", not something to re-read in full or re-summarise
upward. If one epic needs more context, grep that epic's own line specifically:

```bash
grep -n "^  epic-[a-z0-9-]*:" specs/stories/sprint-status.yaml
```

Then the anchored status scan for live work (anchor on `^  key: value` — an unanchored pattern
also matches status words inside the narrative prose and returns noise):

```bash
grep -n "^  [a-zA-Z0-9-]*: \(review\|in-progress\|ready-for-dev\)\b" specs/stories/sprint-status.yaml
```

## 4. GitHub issues cross-check (a TM Game-specific convention)

This repo, unlike its siblings, tracks real GitHub issues alongside `sprint-status.yaml` (e.g.
Epic GDX's `gdx-N` rows each cite a `#98x` issue). Sanity-check the two agree:

```bash
gh issue list --limit 15
```

Flag anything open on GitHub that `sprint-status.yaml` already calls `done`, or vice versa — that
mismatch is exactly the kind of tracker drift this project's own reconciliation sweeps (2026-08-16)
found repeatedly. Don't do a full reconciliation every session — just note if something looks off.

## 5. Deferred work (`specs/deferred-work.md`, ~60KB — safe to read in full)

Check for anything opened in the last session or two that's still awaiting an explicit Angelus
ruling (grep `ANGELUS` or tail the last ~3000 characters rather than reading start-to-end if
pressed for time):

```bash
grep -n "ANGELUS" specs/deferred-work.md | tail -5
```

## 6. Stranded-branch check

```bash
git branch -a
git for-each-ref --sort=-committerdate refs/heads/ --format='%(committerdate:short) %(refname:short)' | head -15
```

This repo accumulates side branches faster than it merges them (a recurring, previously-real risk
— a live security hotfix once sat stranded for 3 days; see memory `project-stranded-branches.md`).
Cross-reference any branch with real, recent commits against `sprint-status.yaml`'s own
"committed locally, not pushed/merged" notes — if a branch has commits `sprint-status.yaml` doesn't
account for, flag it by name rather than assuming it's already tracked.

## 7. Test-suite orientation (don't re-diagnose known failures as new)

Commands: `cd server && npm test` (vitest, 171 suites) and `npx playwright test` (root, ~150
specs — **never run two Playwright invocations concurrently**, they share port 8080). Don't run
either proactively at session start; this is orientation only, so a later test run isn't misread.

Known pre-existing failures at base (full list + reasons: this repo's own `CLAUDE.md`):
`n7-n9-allocator-readers.test.js`, `epic.708.3-cycle-phase-controls.test.js`,
`oath-a-pledge-helpers.test.js`, `issue-836-legacy-tracker-cache-removed.test.js`,
`issue-1013-indomitable-rules-text.test.js`, `tests/desktop-and-css.spec.js` (12),
`tests/post-game-1.spec.js` nav-1-3 (3), `tests/cycle-phase-controls.spec.js` (11). Several vitest
suites need a local `mongod` and **skip rather than fail** without one — a skipped suite is not a
passing suite.

## 8. Output orientation summary, then ask

Write a short summary (8-12 lines) covering: last session's commit(s); the sprint-status header's
opening clause; anything Step 4/5/6 flagged (omit any that came back clean); the single
highest-priority workable item if one is obvious. Then ask: *"What would you like to work on?"* —
unless Angelus already named a task in their opening message, in which case skip the question and
proceed directly.
