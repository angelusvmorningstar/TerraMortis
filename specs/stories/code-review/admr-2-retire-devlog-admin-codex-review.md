# Adversarial review - admr-2-retire-devlog-admin (Retire Devlog admin authoring from TM Game), TM Game

You are reviewing a completed change in a repo you have full access to. You have NONE of the
conversation in which it was written, which is the point: you are here to catch what the author
could not catch about their own work.

## How to run this - read this section before anything else

This is **three passes in one session, in a fixed order**, and the order is load-bearing. Each pass
is allowed to see strictly more than the one before it. You cannot un-read a spec, so the pass that
must judge the code cold goes first.

1. Work the passes **in the order written**. Do not read ahead. Do not open a file a later pass
   grants you until you reach that pass. In particular: **the story spec is deliberately NOT in the
   diff.** Do not go looking for it during the earlier passes. The final pass will hand you the path.
2. **Freeze each pass before advancing.** Write that pass's findings out in full, to
   `specs/stories/code-review/admr-2-retire-devlog-admin-codex-findings.md`, before you open anything
   the next pass allows. Do not revise an earlier pass's findings in light of what a later pass taught
   you - if a later pass contradicts an earlier one, say so as a new finding and leave the original
   standing.
3. At the very end, **attest** to what you actually did: which files you opened in each pass, which
   commands you ran, and anything you could not run. Do not paper over a gap - see "Honesty" below.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Game`. The diff is at
  `specs/stories/code-review/admr-2-retire-devlog-admin-diff.txt` and is relative to that root, taken
  as `git diff 65987a68 HEAD` (both real commits on the current branch, so you can reproduce it
  yourself: `git show 65987a68:server/index.js`, etc.). The diff spans two commits on this branch
  (`9cb37051`, the main removal, and `15a59519`, a self-caught follow-up that deleted orphaned CSS the
  first commit missed) - treat it as one unit of work, not two.
- The diff is **deliberately scoped to source and tooling only**. Story-spec and tracking edits
  (`specs/stories/admr-2-retire-devlog-admin.md`, `specs/stories/sprint-status.yaml`) are excluded
  from it on purpose, so the earlier passes stay genuinely blind to the author's own account. Do not
  treat their absence as an omission or go hunting for them.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.** This repo is `TM Game`, one of several sibling apps in
  an umbrella workspace (`TM Story`, `TM Herald`, `TM Admin` alongside it) - do not read or touch any
  of the sibling directories even to check something; everything you need is inside this repo. (The
  one exception: if you want to independently sanity-check the claim that TM Admin owns a separate,
  working devlog route against the same shared collection, a read-only look at
  `TM Admin/server/routes/devlog.js`'s file header is fine - do not edit anything there either way.)
- Node/vitest environment: `cd server && npm test` runs the full suite against a real MongoDB Atlas
  test database (`tm_game_test`), reachable from this machine - no local mongod needed, but it is a
  live network dependency. **`npm test` (unbounded) will hang indefinitely at
  `tests/issue-836-legacy-tracker-cache-removed.test.js`** - this is a known, pre-existing repo issue
  (CLAUDE.md's own #1125, "issue-836 test fails at collection: it reads the file whose deletion it was
  written to verify"), confirmed unrelated to this diff. Use
  `npx vitest run --exclude "**/issue-836-legacy-tracker-cache-removed.test.js"` for a full run, or
  targeted single-file runs for anything you need to verify quickly. **This repo's own `CLAUDE.md`
  documents a real, pre-existing pool of unrelated failing tests, wider than the doc fully catalogues**
  - if a test file you did not expect this diff to touch fails, check CLAUDE.md's "Known pre-existing
  failures" section and/or a `git stash` A/B against `65987a68` before treating it as caused by this
  diff.
- **Blast radius note**: `server/index.js` and `server/tests/helpers/test-app.js` both mount many
  other routers in the same file this diff edits (removing one `import`/`app.use` line each). A
  mistake in either edit - a misplaced brace, a deleted line that wasn't the one intended - risks
  breaking route registration for routers that have nothing to do with Devlog. Confirm both files
  still parse and every OTHER router in them is unaffected, not just that the devlog lines are gone.

## Honesty requirements (these outrank completeness)

- If you could not run something, **say so plainly and name what you could not run**. A disclosed gap
  is far more useful than a confident static read presented as a verified one.
- If you found nothing in a pass or at a severity, **say that explicitly** rather than omitting the
  section or padding with style opinions.
- Report the **exact current gate numbers** you observe:
  `npx playwright test tests/issue-1135-deleted-tabs.spec.js` (the one e2e spec this diff directly
  edits - expect 12/12) and
  `cd server && npx vitest run --exclude "**/issue-836-legacy-tracker-cache-removed.test.js"` (the
  full suite minus the known-hanging file). Report the real numbers even if they disagree with
  anything the story claims - especially then.

---

## PASS 1 - BLIND HUNTER (the diff, and nothing else)

You get the diff at `specs/stories/code-review/admr-2-retire-devlog-admin-diff.txt` and **nothing
else**. No spec, no story file, no project context. Do not explore the repository. Do not go looking
for the spec. Read other files only to resolve an import path the diff itself leaves ambiguous.

The blinding is the point. You are here to catch what a competent reviewer with zero project memory
would catch, uncontaminated by the author's framing of what the change was supposed to do.

### What this diff claims to be

An ST-facing "Devlog" admin authoring screen (create/edit/delete free-text changelog entries, with a
status/type taxonomy and a "highlight as new" flag) is deleted from this repo in full, on the theory
that a separate app now owns that authoring surface entirely - unlike a sibling retirement in this
same codebase's recent history, there is no surviving read route kept for a live dependent. The server
route file that used to serve all four CRUD operations is deleted outright, along with its schema. Two
test files are deleted wholesale, one shared test-harness file has an import/mount pair removed, and
one existing e2e spec has one test inverted (asserting the screen is now ABSENT rather than present). A
50-line CSS block is also deleted.

**That is the shape it claims. Do not trust the shape - verify it.**

### What to hunt for

1. `server/routes/devlog.js` is deleted in full (all four handlers: `GET /`, `POST /`, `PATCH /:id`,
   `DELETE /:id`). Unlike a route trim, there is no "kept" handler here at all. Does anything in the
   diff's own remaining lines still reference a devlog route, handler, or response shape anywhere -
   check every touched file, not just the obviously-related ones.
2. `public/js/admin.js`'s two edits: the import line for `devlog-admin.js` is replaced with a comment,
   and the `if (domain === 'devlog') initDevlogAdmin(...)` dispatch line is removed outright (no
   comment left in its place, unlike the import line). Is that asymmetry - one edit gets an
   explanatory comment, the other doesn't - meaningful, or is something about the dispatch-line
   removal actually incomplete (check the surrounding lines in the diff for a stray reference)?
3. `public/admin.html`'s removed sidebar button and domain section (`#d-devlog`,
   `#devlog-admin-content`): is there any other markup, inline script, or attribute in this same diff
   hunk still referencing either id?
4. `public/css/admin-layout.css`: a `.dl-*` block (`.dl-admin-toolbar`, `.dl-admin-list`, `.dl-form`,
   `.dl-form-actions`, `.dl-form-error`, `.dl-card`, `.dl-card-meta`, `.dl-type-chip`,
   `.dl-status-chip`, five `.dl-status--*` variants, `.dl-target`, `.dl-card-title`, `.dl-card-body`,
   `.dl-card-actions`, `.dl-new-chip`, `.dl-check-label`) is deleted wholesale. Cross-check this list
   against every class name `devlog-admin.js` (also in this diff, fully deleted) actually used - is
   the CSS deletion complete, or does a class name appear in the deleted JS that this CSS deletion
   somehow missed (the inverse of the gap this diff's own second commit was written to fix)?
5. `server/schemas/devlog_entry.schema.js` is deleted. The diff shows `server/routes/devlog.js`
   importing it before its own deletion - confirm no OTHER file in this diff still imports
   `devlogEntrySchema` from anywhere.
6. `server/index.js` and `server/tests/helpers/test-app.js` each lose exactly one `import` line and
   one `app.use(...)` line, in two different files with near-identical surrounding router-registration
   code. Read both hunks side by side - did either edit accidentally remove or alter a line that
   belonged to a DIFFERENT router (an off-by-one on which line got deleted), given how visually similar
   consecutive `app.use('/api/...', ...)` lines are in both files?
7. `tests/issue-1135-deleted-tabs.spec.js`'s one changed test: read its new assertions literally. It
   checks `[data-domain="devlog"]`, `#d-devlog`, and `#devlog-admin-content` all `toHaveCount(0)`, then
   filters `failed`/`notFound` request URLs for a case-insensitive `devlog` match and expects that
   filtered list to have length 0. Could any of these assertions pass **vacuously** - e.g. if the whole
   admin app failed to boot for an unrelated reason, would `toHaveCount(0)` still report a pass even
   though the test never actually got to the point of proving Devlog is *specifically* absent (as
   opposed to nothing having rendered at all)? Is there a sanity check elsewhere in the same test (or
   its neighbours) proving the page genuinely booted?
8. `server/tests/api-devlog.test.js` and `tests/issue-502-devlog-tab.spec.js` are both deleted
   wholesale (243 and 171 lines respectively). Skim what each one tested (visible in the diff's `-`
   lines) - does either contain an assertion that was actually exercising something OTHER than the
   devlog route/screen itself (a shared helper, a shared fixture, a piece of test-harness plumbing)
   that this deletion might have silently dropped coverage for?
9. Dead code, unused imports, unreachable branches, or self-contradiction within the diff itself (a
   comment claiming something is fully removed while a line nearby still reaches it, or vice versa).

**STOP. Write your Pass 1 findings to
`specs/stories/code-review/admr-2-retire-devlog-admin-codex-findings.md` now, before reading
further.**

---

## PASS 2 - EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Game`. Read whatever surrounding code you need
to understand what this change is actually plugging into. You still do **not** have the story spec or
any account of the author's intent - work from the code itself.

Your remit is boundaries and branches: walk every path, not just the one the author had in mind.

### Orientation (not ground truth - verify against the code)

Same summary as Pass 1: a Devlog admin authoring screen and all four of its server routes are removed
from this repo entirely - no read route is kept, unlike a similar retirement this codebase did
recently for a different feature (`bloodlines`) where a public GET route survived for a live
dependent. The claim (not yet verified by you) is that nothing else in this repo still depends on
`/api/devlog`.

### What to hunt for

1. **Grep the WHOLE repo** (not just `server/` or `public/`) for `devlog` in any form -
   `/api/devlog`, `devlogRouter`, `devlogEntrySchema`, `devlog_entries`, `initDevlogAdmin`,
   `.dl-admin-`, any `.dl-` class prefix. Confirm every remaining hit is either (a) inside this
   diff's own touched files as an intentional survivor (e.g. a comment naming the retirement), (b) a
   coincidental false-positive match (plain English text unrelated to the feature), or (c) something
   this diff missed. Name each hit and classify it.
2. **`server/scripts/` migration/seed scripts.** Confirm none references `devlog_entries` as a
   collection name or `devlogEntrySchema` in any script that could run against live data. If one
   exists, is it safe to leave alone (the collection itself is explicitly meant to survive, only the
   TM Game code path to it is being removed)?
3. **Route registration order in `server/index.js` and `server/tests/helpers/test-app.js`.** With the
   `/api/devlog` mount gone from both, confirm a request to `/api/devlog` or `/api/devlog/anything`
   now genuinely falls through to each app's own 404 handling, rather than being unintentionally
   caught by some OTHER route registered nearby that happens to also match (check for any
   wildcard/catch-all/static-file-serving middleware in either file).
4. **`admin.js`'s domain-dispatch chain.** Read the full `if (domain === '...') init...(...)` block
   this diff edits, in context. With the `devlog` branch removed, confirm clicking a *different*,
   still-live sidebar button was not accidentally affected by the removal (e.g. an off-by-one in
   which `if` line got deleted, or a fallthrough that used to rely on ordering).
5. **The five test files this diff touches or removes** - walk each one's real fixture/mock shape
   against what a REAL request to the now-deleted routes would have returned, to confirm none of them
   was silently testing something broader than "the devlog route/screen" that survives elsewhere in
   the suite uncovered now. Specifically: did `server/tests/api-devlog.test.js` (now deleted) contain
   any assertion about auth-middleware behaviour, error-handling shape, or a shared helper
   (`requireRole`, `validate`, ObjectId handling) that isn't independently covered by any OTHER
   surviving test file in this repo?
6. **`tests/issue-1135-deleted-tabs.spec.js`'s `loginAsAdmin` helper and stub setup**, used by the
   inverted Devlog test. Trace it in full - does it stub enough of the admin API surface that the
   admin app genuinely boots to a state where Devlog's absence is a meaningful assertion, not a
   trivial one (per Pass 1, item 7)? Compare directly against the adjacent, unmodified "no Tickets
   domain" test in the same file, which this new test is deliberately modelled on - do the two tests
   actually have parallel structure, or does the new one diverge in a way that weakens it?
7. **Cross-repo consistency (read-only, TM Admin only, per Ground rules above)**: does TM Admin's own
   `server/routes/devlog.js` genuinely target the same `devlog_entries` collection name this deleted
   route used to? If you can determine this from TM Admin's file header/imports alone, say so; if not,
   say plainly that you could not verify it and why.

**STOP. Write your Pass 2 findings to
`specs/stories/code-review/admr-2-retire-devlog-admin-codex-findings.md` now, before reading
further.**

---

## PASS 3 - ACCEPTANCE AUDITOR (the diff, plus the spec)

Two sub-passes, in this order. **The order is the highest-value instruction in this whole document.**

### Pass 3a - form findings BEFORE reading the author's own account

1. Read `specs/stories/admr-2-retire-devlog-admin.md` - the **Story**, **Acceptance Criteria**,
   **Tasks/Subtasks**, and **Dev Notes** sections ONLY.
2. **Do NOT read the Dev Agent Record or any Senior Developer Review section yet.** Skip past them
   entirely. Reading the author's own record first anchors you on their framing and turns a review
   into grading homework.
3. Against the acceptance criteria, check the diff and the real code it touches for:
   - Violations of an AC's **literal wording**. Read the words, not the surrounding narrative - an AC's
     exception is exactly as narrow as it is written.
   - Deviations from stated intent. **The "What this story is NOT" / Context framing is equally
     load-bearing** - check the change did not quietly do an excluded thing (e.g. touching the shared
     `devlog_entries` collection's data, or editing anything in `TM Herald/`).
   - Specified behaviour that is missing, or present only in appearance.
   - Contradictions between a stated constraint and the actual code.
4. **Write your Pass 3a findings down now, before moving on.**

Explicitly NOT in scope, and deliberate - do not flag these as gaps:
- Building a fix for TM Herald's now-dead `GET /api/devlog` poll target, or editing anything inside
  `TM Herald/` - the story's own AC #4 requires this to be NAMED, not fixed, and is explicitly a
  cross-repo follow-up for a different session.
- Verifying TM Admin's own devlog implementation behaviourally (byte-for-byte response parity) - out
  of reach from this repo, and not what this story claims to have done.
- Any work on Data Portability - a separate story in the same epic
  (`specs/epic-admin-retirement.md`), not this one.
- Deciding whether keeping `devlog_entries` as a MongoDB collection with zero TM Game reader is itself
  a data-hygiene concern - explicitly TM Admin's collection to own now, not this story's to fix.

### Pass 3b - now read the author's record and check it against reality

5. Now read the **Dev Agent Record** in full. It makes specific, checkable claims, among them:
   - That this is a deliberate FULL retirement (no route kept), confirmed directly by the project
     owner after a scoping pass found and disclosed a real-but-currently-non-functional TM Herald
     cross-repo consumer.
   - That the shared `tm_game.devlog_entries` collection is untouched and TM Admin remains its sole
     live owner.
   - That the unbounded `npm test` hangs at `tests/issue-836-legacy-tracker-cache-removed.test.js`
     (a pre-existing, already-documented issue, #1125) and that a full run excluding that one file
     completed with 22 files / 16 tests failed out of 240 files / 4305 tests (124 skipped,
     mongod-dependent).
   - That 3 of the 22 failing files match CLAUDE.md's already-documented pre-existing list, and 5 more
     (not previously documented) were each individually confirmed pre-existing via `git stash -u` A/B
     against commit `65987a68`, with identical failure counts both times.
   - That `tests/issue-1135-deleted-tabs.spec.js` passes 12/12, including the new inverted Devlog test.
   - That a 50-line dead CSS block was found and deleted in a SECOND, later commit (`15a59519`), as a
     self-caught correction to the first commit's own gap - and that a repo-wide grep afterward found
     zero remaining `.dl-*` reference outside two unrelated stale worktree copies.
   - That `git diff --stat` shows only this story's deliberate removals plus the CSS-cleanup
     correction, no incidental churn.
6. **Verify each claim by running it, not by reading it.** Run the suites yourself, right now. Grep
   the files yourself. If a first run is inconsistent, run it twice and say so.
7. Flag anything **FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED**. This is the single highest-value
   thing this pass can find. A record's own "confirmed", "verified" or "resolved" label can itself be
   wrong - re-examine each one rather than inheriting it.
8. State plainly whether you believe this change is ready to ship as-is, needs patches, or has a
   blocking problem.

---

## Output

Write everything to
`specs/stories/code-review/admr-2-retire-devlog-admin-codex-findings.md`, grouped `## High` /
`## Medium` / `## Low`, each finding tagged with the pass that produced it (`[Pass 1]`, `[Pass 2]`,
`[Pass 3a]`, `[Pass 3b]`). Write `- None found.` under any empty heading rather than dropping it.

For each finding:

- **One-line title**
- **Severity**: High / Medium / Low
- **File:line**
- **The triggering input or sequence** - be concrete about what reaches it
- **The observable consequence** - what actually goes wrong, for whom
- **Confidence**: how sure you are this is real and not a misread

Close with a **Validation notes** section stating:

- Which files you opened in each pass, and confirmation you did not read ahead.
- Every command you ran, with its real result, including the two gate commands named in Ground rules
  above.
- **Anything you could not run, and why.** Name it specifically.
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
