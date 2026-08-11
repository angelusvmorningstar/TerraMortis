# Session Start — TM Suite Orientation (project playbook)

> Loaded by the global `session-start` dispatcher skill when the working dir is this repo.
> Orient to the project at the start of the session: git state, real open work (GitHub issues,
> not the lagging yaml), and the current branch's story context, before touching anything.
> Keep output to ~10-15 lines. No narration while reading.

*Playbook created 2026-08-11 (first version — the umbrella dispatcher at
`../.claude/session-start.md` already assumed this file existed and said to hand off to it fully;
it didn't. CLAUDE.md's "Branch Sync Protocol" section is stale for Angelus's flow since
2026-07-10 — this file is the up-to-date replacement.)*

---

## Step 1 — Git state

```bash
git status -sb
git log --oneline -8
```

- **This repo has a huge local scratch pile of untracked files under `server/scripts/_*`**
  (map-generation exploratory scripts/JSON/PNG previews — `_acad-*`, `_arrow_*`, `_ath-*` etc.,
  1000+ files as of 2026-08-11). It inflates `git status`'s untracked count to noise. Filter it out
  for signal:
  ```bash
  git status --short | grep -v "server/scripts/_"
  ```
  Only the filtered output is worth reporting; don't dump the raw list or treat the raw count as a
  red flag.
- **Branch model (confirmed 2026-08-10, supersedes CLAUDE.md's "Branch Sync Protocol" section)**:
  Angelus works on a side branch per issue/feature (`ms/issue-N-*`, `bl/*`, `cm/*`, `cm5/*` etc.)
  and PRs **direct to `main`** — never through `dev`. `dev` is now a stalled branch behind blocker
  #1128, not an integration target to sync from or into. **Never suggest `git merge dev`.** Being
  ahead of `origin/main` on the current branch is normal — commits sit local until the branch is
  ready to PR.
- Push, merge, and PR-open/merge are **never** automatic — only on the user's *current* message
  explicitly saying so (hard rule, `CLAUDE.md`). A prior "commit and merge" earlier in the session
  does not carry forward.

---

## Step 2 — Where we left off (real source of truth first)

**`gh issue list` is the real tracker here, not `specs/stories/sprint-status.yaml`** — the yaml
lags. Check issues first:

```bash
gh issue list --limit 10
```

Anything labelled `bug` with no matching in-progress branch is unclaimed open work. Cross-check
against the branch list (`git branch --list`) — an issue number matching an existing
`ms/issue-N-*` / `bl/*` branch is probably already mid-flight, not unclaimed.

### Step 2b — sprint-status.yaml (secondary; has a two-header drift bug)

The file has **two `last_updated` markers that can disagree** — a `#`-commented prose header at
line ~2, and the real YAML `last_updated:` field ~30 lines below it. As of 2026-08-11 the commented
header was the one actually being kept current (2026-08-10) while the real field was six weeks
stale (2026-06-27). Read both, trust whichever has the later date:

```bash
grep -n "last_updated" specs/stories/sprint-status.yaml
```

This is a latent bug in the file, not a one-off fixed by the time you read this — check both lines
every session. (TM Wiki hit the identical pattern and retired its duplicate on 2026-08-08; this
repo hasn't had that cleanup pass — worth flagging to Angelus if it comes up, not worth fixing
unprompted.)

The file is ~80KB — small enough to `Read` directly if more than the header is needed, but grep for
a specific epic/story key (`^  bl-\|^  epic-`) rather than reading the whole table by eye.

---

## Step 3 — Current branch's story context

The current branch name usually names the epic/story directly (e.g. `bl/bl-1-bloodline-collection`
→ Epic BL). Cross-reference:

```bash
git log --oneline -5
grep -n "^  <branch-slug>" -A 3 specs/stories/sprint-status.yaml
```

If the branch has unpushed commits ahead of `origin/main` (Step 1), that's in-progress work
continuing this session, not something to re-scope from scratch.

---

## Step 4 — Load the right workflow

| Situation | Skill / action |
|---|---|
| Picking up a new GitHub issue | `tm-gh-issue-pickup` |
| Filing a new issue from chat | `tm-gh-issue-create` |
| Opening a PR for the current branch | `tm-gh-pr-for-branch` |
| Implementing a story already created | `bmad-dev-story` |
| Story needs review before commit | `bmad-code-review` |
| No story file yet for a code change | `bmad-create-story` (or `bmad-quick-dev` for something too small to warrant the full story ritual — Angelus's call) |
| Hooks not yet enabled this clone | check `git config core.hooksPath` — if unset, run `git config core.hooksPath .githooks` (parse-checks staged `public/js/**/*.js`, see `.githooks/README.md`) |

---

## Step 5 — Output orientation summary

Write a short summary (8-12 lines max) covering:

1. **Branch + git state** — current branch, ahead/behind `origin/main`, filtered dirty-file count
   (Step 1).
2. **Real open work** — top 2-3 unclaimed `gh issue list` items, or "current branch already
   targets issue #N" if Step 3 found a match.
3. **In-flight** — what the sprint-status header(s) say is next (Step 2b), reconciled with what
   the branch/commits actually show (Step 3) — flag if they disagree.
4. **Hook state** — note if `core.hooksPath` isn't configured (Step 4).

Then ask: *"What would you like to work on?"* — or, if Angelus already named a task in their
opening message, skip the question and load the relevant skill directly.
