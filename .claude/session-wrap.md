# Session Wrap — TM Suite (project playbook)

> Loaded by the global `session-wrap` dispatcher skill when the working dir is this repo.
> Playbook created 2026-08-12, in a session that ran the generic fallback once (no
> playbook existed yet) then was asked to scaffold this one. No `session-start.md`
> exists yet either — this file doesn't assume one; if `session-start.md` is added
> later, treat this as its mirror image, same as TM Wiki's and TM Cockpit's pairs.

Keep it factual: report what actually happened this session, don't narrate intent or
pad with running commentary. Don't invent state — check it.

---

## 1. Git state

```bash
git status --short --branch
git log --oneline -10
git rev-list --count origin/main..main 2>/dev/null
git rev-list --count origin/dev..origin/main 2>/dev/null
```

- If the working tree is **not clean**, say so explicitly. Distinguish stray/unexpected
  files (flag for Angelus) from the pre-existing untracked pile that predates every
  session (map-editing scratch under `server/scripts/_*`, `.netlify/`, `"Position power
  notes.rtf"`, `_bmad/custom/`, `data/exports/`, `debug.log`, and
  `specs/stories/code-review/*` review-prompt files — all pre-existing and deliberately
  untracked, not this session's and not stray).
- **Never push, merge, or sync `dev` from wrap-up itself** — only when Angelus's
  *current* message explicitly says so (hard rule, `CLAUDE.md`). A wrap is never itself
  grounds to act. Report the `origin/dev..origin/main` count as information only; per
  `CLAUDE.md`'s "What changed, so stale advice is recognisable" section, `dev` syncing
  is explicit-ask-only now, not automatic — don't raise it as an action item unless
  asked, and definitely don't run the merge yourself.
- Confirm the branch actually being wrapped isn't `main` mid-work (should be a side
  branch, or `main` after a clean merge-back) — flag if commits landed directly on
  `main` without a PR, that's the hard rule being bypassed somewhere.

## 2. Sprint status freshness (`specs/stories/sprint-status.yaml`)

This file (currently ~120KB, safely under the `Read` tool's 256KB hard error — check
size before assuming, it grows) carries the project's running status in **two places
that must be kept in sync**:

1. A comment-block header at the very top: `# last_updated: "..."` (current) and
   `# last_updated_previously: "..."` (one back) — dense prose, root causes named,
   exact counts, dated, ends noting what's committed/pushed/merged.
2. A real YAML field a few lines below the comment block: `last_updated: "..."` — a
   **short pointer**, not a duplicate narrative (e.g. `"...Full detail in the comment
   header above."`). Keep this short-form in sync with the comment header's headline,
   don't let it drift into its own competing narrative.

**Rotate, don't stack**, matching the existing convention: move the current
`last_updated` comment down into `last_updated_previously` verbatim, write a fresh one
for this session, then update the plain YAML field to match. Match the register already
in the file — CAPS-free but precise (epic names, story ids, exact test counts, commit
SHAs, explicit "committed locally, not pushed" / "pushed, merged to main" framing).

- Grep, don't scroll, for the story-table check:
  ```bash
  grep -n "^  [a-zA-Z0-9-]*: \(backlog\|in-progress\|review\|ready-for-dev\|done\)\b" specs/stories/sprint-status.yaml
  ```
  Does every `epic-N:` flag match the actual status of its child stories this session
  touched? Fix inline if a flag went stale, matching the existing terse comment style —
  don't rewrite unrelated rows.
- Only touch rows for stories that genuinely moved this session. Full epic/story
  bookkeeping belongs to the BMAD tooling that owns it, not a wrap-up pass.

## 3. Deferred work (`specs/stories/deferred-work.md`)

If this session ran any code review (internal 3-layer or external Codex), confirm every
deferred/dismissed-with-rationale finding actually made it into this file under a
heading that names the story and date — cross-check against the story file's own
review section. Headings vary (`## Deferred from: code review of <story-id>
(<date>)`, `## Deferred from: <context> (<date>)`) — grep for the story id or date
rather than expecting exact phrasing. If a story's review lists a defer that isn't
here, add it now rather than losing it.

If this session **resolved** a previously-deferred item (as happened this session with
the primer-admin panel — see `deferred-work.md`'s tickets-collection entry for the
established "strike the old heading, mark RESOLVED <date>, keep the original text
below for the record" pattern), confirm that convention was followed rather than
silently deleting the old entry.

## 4. Test baseline check (only if code changed this session)

Two suites, two commands — run only the changed area's suites, not the whole thing
(`CLAUDE.md`'s own standing instruction):

```bash
cd server && npx vitest run tests/<changed-area>.test.js
npx playwright test tests/<changed-area>.spec.js   # never run two Playwright invocations concurrently — shared port 8080
```

Compare against the **known pre-existing baseline** (unrelated to any given change,
confirm the delta is zero unless this session's own work explains it):
- `n7-n9-allocator-readers.test.js` — 1 known failure (#1115).
- `tests/desktop-and-css.spec.js` — 12 known failures (`#btn-desktop-toggle` never
  visible under the stubbed API).
- `tests/post-game-1.spec.js` nav-1-3 — 3 known failures (`#n-more` never existed).

Report the count as "N passed / M failed, byte-identical to baseline" or name exactly
what's new. A skipped vitest suite (several need a local `mongod`, see `CLAUDE.md`) is
**not** a passing suite — read the summary line, not just the exit code.

## 5. What changed this session

Summarise in 3–6 lines: PRs opened/merged (numbers), branches created/landed, files
changed and why, any bugs found in passing (like this session's covenant-picker
findings from the TM Wiki cross-project audit — those get flagged here even though
they weren't fixed this session), and the test result from Step 4 if code moved.

## 6. Anything awaiting Angelus

Call out explicitly:
- Unresolved review findings above Low severity.
- Anything committed but not pushed, or pushed but not merged — state which, and that
  it's staying that way until told otherwise.
- Cross-repo handovers left this session (e.g. a doc dropped in `TM Cockpit/specs/cockpit/`
  or `TM Wiki/specs/`) — name the file and repo so it isn't lost track of; TM Suite
  sessions routinely touch sibling repos (Cockpit, Wiki) per the umbrella `CLAUDE.md`,
  and those are easy to forget belong to a different repo's own git history.
- Any known bug surfaced but not actioned (file path + one-line description is enough
  here; full detail lives wherever it was first written up).

## Notes for whoever runs this

- Test commands: `cd server && npm test` (vitest, 171 suites) and `npx playwright test`
  (root, ~150 specs). `git config core.hooksPath .githooks` is the recommended local
  hook setup, not this playbook's concern to verify each time.
- Branching: side branch off `main` (`ms/issue-<n>-<slug>` or a plain descriptive slug
  for non-issue work), PR straight back to `main`, never through `dev`. `dev` is a
  deploy target now, not an integration stream — sync it from `main` only when asked.
- Commit messages in this repo DO end with a `Co-Authored-By` line (spot-checked this
  session, 13/13 recent commits). Don't assume either way without checking `git log`.
- CRLF noise warning applies here too if `core.autocrlf` differs across machines this
  repo is worked from (confirmed a real false-positive in the sibling TM Wiki repo this
  session) — if `git status` shows an implausibly large number of modified files, check
  for line-ending noise (`git diff <file>` showing only a warning, no real hunk) before
  treating it as real uncommitted work.
