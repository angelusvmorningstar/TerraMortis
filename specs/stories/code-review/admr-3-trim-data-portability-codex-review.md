# Adversarial review - admr-3-trim-data-portability (Trim Data Portability to TM Admin's confirmed-parity domains), TM Game

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
   `specs/stories/code-review/admr-3-trim-data-portability-codex-findings.md`, before you open
   anything the next pass allows. Do not revise an earlier pass's findings in light of what a later
   pass taught you - if a later pass contradicts an earlier one, say so as a new finding and leave the
   original standing.
3. At the very end, **attest** to what you actually did: which files you opened in each pass, which
   commands you ran, and anything you could not run. Do not paper over a gap - see "Honesty" below.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Game`. The diff is at
  `specs/stories/code-review/admr-3-trim-data-portability-diff.txt` and is relative to that root,
  taken as `git diff 28d4c0ef dced1223` (both real commits on the current branch, so you can
  reproduce it yourself: `git show 28d4c0ef:public/js/admin/data-portability.js`, etc.).
- The diff is **deliberately scoped to source and tooling only**. Story-spec and tracking edits
  (`specs/stories/admr-3-trim-data-portability.md`, `specs/stories/sprint-status.yaml`) are excluded
  from it on purpose, so the earlier passes stay genuinely blind to the author's own account. Do not
  treat their absence as an omission or go hunting for them.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.** This repo is `TM Game`, one of several sibling apps in
  an umbrella workspace (`TM Story`, `TM Herald`, `TM Admin` alongside it) - do not read or touch any
  of the sibling directories even to check something; everything you need is inside this repo.
  **Also do not touch `server/scripts/migrate-allies-to-sway.js` or `ops/` at the repo root** - both
  are untracked, in-progress work from a different, concurrently-running session on an unrelated
  feature (a merit rename), not part of this diff and not yours to read, run, or modify.
- Node/vitest environment: `cd server && npm test` (unbounded) **will hang indefinitely** at
  `tests/issue-836-legacy-tracker-cache-removed.test.js` - a known, pre-existing repo issue
  (CLAUDE.md's own #1125). Use
  `npx vitest run --exclude "**/issue-836-legacy-tracker-cache-removed.test.js"` for a full run, or
  targeted single-file runs for anything you need to verify quickly. **This repo's own `CLAUDE.md`
  documents a real, pre-existing pool of unrelated failing tests, wider than the doc fully
  catalogues** - if a test file you did not expect this diff to touch fails, check CLAUDE.md's "Known
  pre-existing failures" section before treating it as caused by this diff. One specific one to know
  about: `tests/cm-4-renumber-chapter-merge.test.js` is documented there as a timeout-based
  Atlas-connection-contention flake ("Test timed out in 5000ms") - if you see it fail, that is the
  documented flake, not this diff.
- **Blast radius note**: `public/js/admin/data-portability.js` exports `writeJsonDoc` and
  `shapeLegacyChapterFk`, both consumed directly by
  `server/tests/cm-2b-importer-legacy-fk-shaping.test.js` (also in this diff). A mistake in either
  function's surviving cases breaks that test file's own remaining coverage for the
  `downtime_submissions`/`npcs` JSON-restore paths, not just this diff's own removals.

## Honesty requirements (these outrank completeness)

- If you could not run something, **say so plainly and name what you could not run**. A disclosed gap
  is far more useful than a confident static read presented as a verified one.
- If you found nothing in a pass or at a severity, **say that explicitly** rather than omitting the
  section or padding with style opinions.
- Report the **exact current gate numbers** you observe:
  `npx vitest run tests/cm-2b-importer-legacy-fk-shaping.test.js tests/cm1-cycle-phase.test.js`
  (the two files this diff most directly depends on for correctness) and
  `npx vitest run --exclude "**/issue-836-legacy-tracker-cache-removed.test.js"` (the full suite
  minus the known-hanging file). Report the real numbers even if they disagree with anything the
  story claims - especially then.

---

## PASS 1 - BLIND HUNTER (the diff, and nothing else)

You get the diff at `specs/stories/code-review/admr-3-trim-data-portability-diff.txt` and **nothing
else**. No spec, no story file, no project context. Do not explore the repository. Do not go looking
for the spec. Read other files only to resolve an import path the diff itself leaves ambiguous.

The blinding is the point. You are here to catch what a competent reviewer with zero project memory
would catch, uncontaminated by the author's framing of what the change was supposed to do.

### What this diff claims to be

An admin "Data Portability" export/import UI is trimmed from twelve domains down to six - the six
removed (`characters`, `territories`, `game_sessions`, `attendance`, `chapters`/downtime cycles,
`rules`/purchasable powers) are claimed to now be served by a separate app; the six kept
(`downtime_submissions`, `npcs`, `ordeal_rubrics`, `ordeal_submissions`, `ordeal_responses`,
`offices`) are untouched. Every function that served ONLY a removed domain is deleted; functions
shared with a kept domain are kept, trimmed only of their removed-domain cases. A large CSS block
(33 selectors) is deleted alongside the JS that used to generate the markup those selectors target.
Two test files are affected: one deleted wholesale, one has exactly one test removed plus some mock
cleanup.

**That is the shape it claims. Do not trust the shape - verify it.**

### What to hunt for

1. **`writeJsonDoc`'s switch statement** (in `data-portability.js`): six cases removed
   (`characters`/`territories`/`game_sessions`/`attendance`/`chapters`/`rules`), five kept
   (`downtime_submissions`/`npcs`/`ordeal_rubrics`/`ordeal_submissions`/`ordeal_responses`), plus a
   `default: throw`. Read every remaining case literally - did the diff accidentally alter the BEHAVIOUR
   of a kept case while editing around it (a changed variable name, a dropped line, an off-by-one on
   which brace closes which case)?
2. **`COLLECTION_API`/`COLLECTION_ROWS`** (backing `handleVerify`): the diff shows these trimmed from
   4 entries to 1 (`npcs` only). Cross-check every remaining reference inside `handleVerify` itself -
   does it still correctly index into a single-entry object, or does anything assume multiple keys
   ever existed (a loop, a `Object.keys().length` check, a fallback branch)?
3. **`collectionApiPath`'s `MAP`**: trimmed from 10 entries to 5. Read `handleExportJson`'s own use of
   it - does the `MAP[collection] || collection` fallback silently paper over a removed domain being
   requested (e.g. old cached UI state, a stale bookmark) by returning the raw collection string as an
   API path, and is that a real problem or already-existing, unrelated-to-this-diff behaviour?
4. **The dispatch chain in `initDataPortabilityView`**: the diff shows `if (collection ===
   'characters') ... else if (collection === 'rules') ... else handleImport(...)` collapsed to just
   `if (collection === 'downtime_submissions') ... else handleImport(...)`. Trace this literally - for
   every one of the five REMAINING collection ids, does it now correctly reach `handleImport`, and for
   `downtime_submissions` does it still correctly reach `handleDowntimeCSVImport`? Is there any
   collection id that could now reach NEITHER branch cleanly?
5. **`initDataPortabilityView`'s own signature change**: the diff shows it going from
   `initDataPortabilityView(charData)` to `initDataPortabilityView()`, with `charData` no longer
   accepted at all, alongside a comment claiming the caller (`admin.js`, not in this diff) needs no
   edit because it "accepts (and ignores)" the argument. Is that claim actually true of how JavaScript
   handles an extra argument to a function with fewer declared parameters - would a caller passing an
   argument to a zero-parameter function genuinely need no change?
6. **The CSS deletion** (`admin-layout.css`): 33 selectors removed across two blocks
   (`.dp-rules-*` and `.dp-excel-*`/`.dp-badge-*`/`.dp-diff-*`). Do you see ANY of these class name
   strings anywhere else in the diff's own JS hunks (not just their definition/deletion sites) -
   i.e., is there a stray `class="dp-excel-..."` or `.dp-badge-...` string literal still being
   generated by surviving JS that this CSS deletion just orphaned in the OTHER direction (markup with
   no styling, rather than styling with no markup)?
7. **`cm-2b-importer-legacy-fk-shaping.test.js`'s remaining tests**: read them literally against
   `writeJsonDoc`'s new (trimmed) switch. Do the surviving assertions actually still test what their
   own `it()` descriptions claim, given the file around them changed?
8. **`cm-4a-importer-phase-strip.test.js` is deleted in full** (visible as a pure deletion in the
   diff). Read every test it contained (recoverable from the `-` lines of the diff itself) - does
   EVERY ONE of them genuinely test only code paths removed by this same diff (`writeJsonDoc('chapters',
   ...)` or `writeJsonDoc('game_sessions', ...)`), or does any test in that file exercise something
   that survives (a shared helper, a general error-handling path, an assertion about `apiPost`/`apiPut`
   call counts that could apply more broadly)?
9. Dead code, unused imports, unreachable branches, self-contradiction within the diff itself.

**STOP. Write your Pass 1 findings to
`specs/stories/code-review/admr-3-trim-data-portability-codex-findings.md` now, before reading
further.**

---

## PASS 2 - EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Game`. Read whatever surrounding code you need
to understand what this change is actually plugging into. You still do **not** have the story spec or
any account of the author's intent - work from the code itself.

Your remit is boundaries and branches: walk every path, not just the one the author had in mind.

### Orientation (not ground truth - verify against the code)

Same summary as Pass 1: a twelve-domain admin export/import screen is trimmed to six, on the theory
that a separate app (not in this repo) now serves the other six with real, working coverage.

### What to hunt for

1. **`public/js/admin.js`'s real call site** (`initDataPortabilityView(chars)`, NOT in this diff).
   Confirm directly, by reading the actual JS semantics, whether calling a zero-parameter exported
   function with one argument is safe in this codebase's module system (ES modules, strict mode by
   default) - does the extra argument simply get discarded, or is there any scenario (a Proxy, a
   `Function.length` check elsewhere, a lint rule enforced at build time) where this could actually
   break something the diff's own comment did not anticipate?
2. **`public/admin.html`'s Data Portability domain section** - is there any markup (a card, a filter
   input, a select) still referencing an id/class that ONLY the removed characters/territories/
   game_sessions/attendance/chapters/rules cards used, now orphaned the other direction (markup
   present, JS that used to wire it up gone)?
3. **Every remaining caller of `shapeLegacyChapterFk` and `withoutPhaseFields`** across the whole
   repo (not just this diff's own files) - confirm `shapeLegacyChapterFk` genuinely still has a live
   caller (the `downtime_submissions` case in `writeJsonDoc`) and `withoutPhaseFields` genuinely still
   has ITS OWN live caller elsewhere (`public/js/downtime/cycle-phase.js`'s own `buildPhaseUpdate`) -
   confirm this by reading `cycle-phase.js` directly, not by trusting a comment.
4. **`server/tests/cm1-cycle-phase.test.js`** - walk its own `buildPhaseUpdate` test(s) by hand and
   confirm they genuinely exercise the SAME strip behaviour (`phase`/`game_phase`/`status` removed
   from a caller-supplied `extra` object) that the deleted `cm-4a-importer-phase-strip.test.js` used
   to prove end-to-end via `writeJsonDoc('chapters', ...)`. Is the unit-level proof in
   `cm1-cycle-phase.test.js` genuinely equivalent in what it demonstrates, or does it only prove a
   narrower claim (e.g. it might prove the strip works on `buildPhaseUpdate`'s own `extra` parameter
   but not prove anything about the ACTUAL body `writeJsonDoc` used to send over HTTP)?
5. **Fixture/mock shape check**: `cm-2b-importer-legacy-fk-shaping.test.js`'s mocks were trimmed (3 of
   6 `vi.mock()` calls removed, claimed to mock modules `data-portability.js` no longer imports).
   Confirm this by reading `data-portability.js`'s own current import list directly - does it
   genuinely import nothing from `../editor/export.js`, `./excel-parser.js`, or `./excel-merge.js`
   any more, or did the diff miss a remaining import that would make one of those three removed mocks
   still necessary (causing a real, unmocked module load at test time)?
6. **Route/server-side check**: confirm this diff genuinely touches ZERO files under `server/routes/`
   - grep the whole diff for `server/routes` yourself and confirm the claim that no server-side
    route file changed.

**STOP. Write your Pass 2 findings to
`specs/stories/code-review/admr-3-trim-data-portability-codex-findings.md` now, before reading
further.**

---

## PASS 3 - ACCEPTANCE AUDITOR (the diff, plus the spec)

Two sub-passes, in this order. **The order is the highest-value instruction in this whole document.**

### Pass 3a - form findings BEFORE reading the author's own account

1. Read `specs/stories/admr-3-trim-data-portability.md` - the **Story**, **Acceptance Criteria**,
   **Tasks/Subtasks**, and **Dev Notes** sections ONLY.
2. **Do NOT read the Dev Agent Record or any Senior Developer Review section yet.** Skip past them
   entirely. Reading the author's own record first anchors you on their framing and turns a review
   into grading homework.
3. Against the acceptance criteria, check the diff and the real code it touches for:
   - Violations of an AC's **literal wording**. Read the words, not the surrounding narrative - an AC's
     exception is exactly as narrow as it is written.
   - Deviations from stated intent. Check the change did not quietly do an excluded thing.
   - Specified behaviour that is missing, or present only in appearance.
   - Contradictions between a stated constraint and the actual code.
4. **Write your Pass 3a findings down now, before moving on.**

Explicitly NOT in scope, and deliberate - do not flag these as gaps:
- Verifying TM Admin's own six real domains behaviourally match TM Game's old coverage byte-for-byte
  - a different repo, not touchable from here, and the story's own domain-parity table is explicitly
    scoped as route-surface confirmation, not a behavioural diff.
- Building a "stays deleted" static regression guard for Data Portability, mirroring
  `server/tests/tickets-removed.test.js` or `server/tests/devlog-removed.test.js` (a sibling story's
  own pattern) - the story's own Dev Notes explicitly considered and declined this, reasoning Data
  Portability has no prior "stays deleted" convention in this repo and the change is UI/export-import
  code, not a whole mounted route. Flag ONLY if you disagree with that reasoning as a genuine gap, not
  as an oversight.
- Any work on the Status/Allies/Sway merit rename you may notice evidence of elsewhere in this repo
  (an untracked script, a backup folder) - explicitly a DIFFERENT, concurrently-running session's
  unrelated work, not part of this diff and not yours to evaluate.
- Any work on ADMR-1 (Bloodlines) or ADMR-2 (Devlog) - separate, already-completed stories in the
  same epic.

### Pass 3b - now read the author's record and check it against reality

5. Now read the **Dev Agent Record** in full. It makes specific, checkable claims, among them:
   - That the epic's own "5 confirmed-parity domains" claim was wrong, and the real count is 6
     (missing `attendance`) - re-derive this yourself from TM Admin's actual current
     `public/js/data-portability.js` if you have read access to it; if you do not, say so plainly
     rather than accepting the claim on faith.
   - That `data-portability.js` went from 800 to 508 lines, and `data-portability-import.js` from 169
     to 93 lines.
   - Three specific "found during implementation, not anticipated by the story" corrections: a
     would-be `ReferenceError` in `COLLECTION_API`/`COLLECTION_ROWS`, 33 orphaned CSS selectors, and
     two stale cross-references in the surviving test file.
   - That `cm1-cycle-phase.test.js` was run in isolation BEFORE deleting
     `cm-4a-importer-phase-strip.test.js` and passed 62/62, and that
     `cm-2b-importer-legacy-fk-shaping.test.js` passes 8/8 after its edit (was 9/9).
   - That the full server suite shows 23/240 files failing, 22 of which exactly match a sibling
     story's own already-confirmed pre-existing baseline, and the one new item
     (`cm-4-renumber-chapter-merge.test.js`) is independently named in `CLAUDE.md`'s own known-failures
     list as an unrelated timeout flake.
   - That `git diff --stat` shows only this story's deliberate removals, no incidental churn.
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
`specs/stories/code-review/admr-3-trim-data-portability-codex-findings.md`, grouped `## High` /
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
