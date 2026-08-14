# Story DBO.9: Consolidate `NON_COMBAT_STYLES` to one source

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer maintaining the sheet editor and downtime form's style-picker logic,
I want the `NON_COMBAT_STYLES` list declared once, in `public/js/data/constants.js`, instead of as
two separately-typed-out local constants in `sheet.js` and `downtime-form.js`,
so that the two pickers can never silently drift apart if the list of non-combat "styles" (Fast-
Talking, Cacophony Savvy, Etiquette, Three Heads of Kerberos) ever changes.

## Why this story exists

`server/schemas`... no — this is a client-only, JS-module duplication. Confirmed by direct grep
(2026-08-14):

- `public/js/editor/sheet.js:2143` — `const NON_COMBAT_STYLES = new Set([...])`, used at three call
  sites (`:2315`, `:2347`, `:2437`) to exclude these four names from the sheet's own manoeuvre-style
  picker and style-Merit dropdown.
- `public/js/tabs/downtime-form.js:4277` — `const NON_COMBAT_STYLES_DT = new Set([...])`, byte-for-
  byte the same four names, used once (`:4280`) to exclude them from the downtime form's own style-
  purchase picker. The surrounding comment already says *"mirror of sheet.js NON_COMBAT_STYLES"* —
  the duplication is already self-documented as deliberate mirroring, not an oversight, which is
  exactly why it should be a real shared import instead.

Both files already import other fixed rule-system enums from `public/js/data/constants.js` (`CLANS`,
`COVENANTS`, `INFLUENCE_SPHERES`, `STYLE_TAGS`, etc. — `sheet.js:6`, `downtime-form.js:19`), so this
is additive to an existing import line in both files, not a new import pattern.

This is DBO-9's own half of a cross-repo duplication the epic names: TM Wiki carries its own third
copy, which is TM Wiki's own DBO-31-8 to fix on its side — out of scope here.

## What this story is NOT

- **NOT touching TM Wiki's own copy.** Cross-repo, a different repo's own story (31-8).
- **NOT changing the four style names, their meaning, or any behaviour.** Pure consolidation — the
  set of excluded names before and after this story must be identical, and every existing call site's
  observable output must be unchanged.
- **NOT resolving any other DBO story.** Independent.

## Acceptance Criteria

1. **`NON_COMBAT_STYLES` is declared exactly once**, as a new export in
   `public/js/data/constants.js`, near the existing `STYLE_TAGS` export (`:129`) since both concern
   fighting-style classification. Matches the file's own established convention: a plain array (every
   other export in this file is an array or object literal, never a `Set`), so
   `export const NON_COMBAT_STYLES = ['Fast-Talking', 'Cacophony Savvy', 'Etiquette', 'Three Heads of Kerberos'];`.
2. **`sheet.js`'s local `const NON_COMBAT_STYLES` (`:2143`) is deleted**, `NON_COMBAT_STYLES` is added
   to the existing `constants.js` import on `sheet.js:6`, and every one of its three call sites
   (`:2315`, `:2347`, `:2437`) is updated to call `.includes(...)` on the array (or wraps it in
   `new Set(NON_COMBAT_STYLES).has(...)` if that reads more naturally at each call site — developer's
   call, but be consistent across the three sites within this file) instead of the deleted local
   `Set`'s own `.has(...)`.
3. **`downtime-form.js`'s local `const NON_COMBAT_STYLES_DT` (`:4277`) is deleted**,
   `NON_COMBAT_STYLES` is added to the existing `constants.js` import on `downtime-form.js:19`, and
   its one call site (`:4280`) is updated the same way.
4. **No behavioural change.** A test (new or extended in an existing suite covering either file's
   style-picker logic) proves the excluded-name set is identical before and after — the same four
   names, in the same functional effect, at every one of the four call sites this story touches.
5. **Nothing else in either file changes.** This is a pure extract-to-shared-constant refactor —
   no adjacent cleanup, no renaming of anything else nearby, no touching `STYLE_TAGS` or any other
   export in `constants.js`.

## Tasks / Subtasks

- [x] Task 1: Add the shared export (AC: #1)
  - [x] Add `NON_COMBAT_STYLES` to `public/js/data/constants.js`, near `STYLE_TAGS`
- [x] Task 2: Consolidate `sheet.js` (AC: #2, #4)
  - [x] Delete the local `const NON_COMBAT_STYLES` at `:2143`
  - [x] Add `NON_COMBAT_STYLES` to the existing constants.js import line
  - [x] Update all three call sites (`:2315`, `:2347`, `:2437`) to use the shared export — converted
        `.has(...)` to `.includes(...)` at each, since the shared export is a plain array
  - [x] Confirm (by reading, and by test) each call site's observable behaviour is unchanged
- [x] Task 3: Consolidate `downtime-form.js` (AC: #3, #4)
  - [x] Delete the local `const NON_COMBAT_STYLES_DT` at `:4277`
  - [x] Add `NON_COMBAT_STYLES` to the existing constants.js import line
  - [x] Update the one call site (`:4280`) to use the shared export
  - [x] Confirm the excluded-style-name set in the rendered picker is unchanged
- [x] Task 4: Regression proof (AC: #4, #5)
  - [x] `sheet.js`/`downtime-form.js` are not directly importable under vitest (heavy
        document/window usage — 10 and 183 hits respectively), matching this repo's own established
        pattern for these two files. Wrote a new source-contract test
        (`dbo-9-non-combat-styles-consolidation.test.js`) instead: a real import + value assertion
        against `constants.js` (no browser dependency there), plus source-contract checks that both
        files import the shared constant, no local redeclaration survives, and every call site (3 in
        sheet.js, 1 in downtime-form.js) uses `.includes(`. Plus two behavioural-equivalence tests
        running the actual filter expressions from both files against synthetic style lists, proving
        the same four names are excluded either way. Prove-discrimination: reverting one call site
        back to `.has(` (Set syntax, which doesn't exist on arrays and would throw at runtime) failed
        exactly the "three call sites" test (6 passed, 1 failed); restored, 7/7 green.
  - [x] Confirmed via `git diff --stat` — 3 files, 13 insertions/13 deletions total, no other export
        or logic touched.

## Dev Notes

### What's already confirmed (2026-08-14, this session, read-only)

- Exact duplicate content, byte-for-byte: `['Fast-Talking', 'Cacophony Savvy', 'Etiquette', 'Three Heads of Kerberos']`
  in both files.
- `sheet.js` uses `.has()` (its local is a `Set`) at three call sites; `downtime-form.js` uses `.has()`
  (its local is also a `Set`) at one call site. Since `constants.js`'s own convention is plain arrays,
  every call site converts from `Set.has(...)` to either `Array.includes(...)` or a locally-constructed
  `new Set(...)`.
- `downtime-form.js`'s own comment at `:4275-4276` already states this is "mirror of sheet.js
  NON_COMBAT_STYLES" — confirms the duplication was a deliberate, acknowledged mirror, not an
  accidental drift, which is exactly the shape DBO-9 exists to close.

### Architecture compliance

- **No CSS, no UI.** Pure JS refactor.
- British English, no em-dashes in any comment this story writes.
- Match `constants.js`'s own convention (plain array, not a `Set`) — see AC1.
- `specs/reference-data-ssot.md`'s "Reference / Rules Data" section already lists
  `public/js/data/constants.js` as the baked-in-JS home for "Clan/covenant/mask/dirge constants" —
  `NON_COMBAT_STYLES` is the same *kind* of fact (a fixed rule-system classification, not player data),
  so it belongs in the same file. No new SSOT entry needed; it falls under the existing constants.js
  row.

### Project Structure Notes

- Files touched: `public/js/data/constants.js` (new export), `public/js/editor/sheet.js` (delete
  local const, update import, update 3 call sites), `public/js/tabs/downtime-form.js` (delete local
  const, update import, update 1 call site).
- No new files expected unless a dedicated regression test is added rather than extending an existing
  suite — developer's call, matching whichever existing test file already covers the relevant picker
  logic most directly.

### References

- Epic: `specs/epic-dbo-database-ownership.md`, DBO-9 section.
- `public/js/data/constants.js` — existing convention for baked-in rule-system enums.
- Cross-repo companion (not this story's scope): TM Wiki's own DBO-31-8.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5).

### Debug Log References

- Confirmed neither `sheet.js` nor `downtime-form.js` is directly importable under vitest before
  writing tests (10 and 183 `document.`/`window.` hits respectively) — matches this repo's own
  established source-contract testing pattern for these two files (e.g.
  `n7-n9-allocator-readers.test.js` against `merits.js`).
- Ran the full set of test files that reference `sheet.js`/`downtime-form.js` by name (28
  pre-existing, plus the new suite itself — 29 files total) to check for any regression from the two
  shared-file edits: 513/514
  passed. The 1 failure is the pre-existing, `CLAUDE.md`-documented #1115 (`n7-n9-allocator-
  readers.test.js` against `merits.js`, untouched by this story). 2 files failed to even load
  (`issue-836-legacy-tracker-cache-removed.test.js` — `ENOENT` on a since-deleted
  `public/js/suite/tracker.js`; `n8-mandragora-prereq.test.js` — a `SyntaxError` unrelated to this
  story's files). Confirmed both are pre-existing and unrelated by stashing only this story's 3
  changed files (`git stash push --` on exactly those paths) and re-running both — identical failures
  against the unmodified base. Restored via `git stash pop` immediately after; `git diff --stat`
  confirmed the restore was exact (13 insertions/13 deletions across the 3 files, matching before the
  stash).
- Neither of the 2 newly-surfaced pre-existing failures was previously documented in `CLAUDE.md`'s
  "Known pre-existing failures" list — worth a follow-up entry there alongside #1115 and the
  oath-a-pledge-helpers CRLF failure DBO-1's own review found, so a future story's gate count isn't
  thrown off by unexplained extra failures. Not fixed here (out of this story's scope — neither file
  is touched by DBO-9).

### Completion Notes List

- AC1: `NON_COMBAT_STYLES` added to `public/js/data/constants.js` as a plain array (matching the
  file's own convention — every other export there is an array or object literal, never a `Set`),
  placed immediately before `STYLE_TAGS`.
- AC2: `sheet.js`'s local `const NON_COMBAT_STYLES` (a `Set`) deleted; the shared array added to the
  existing `constants.js` import line; all three call sites converted from `.has(...)` to
  `.includes(...)`.
- AC3: `downtime-form.js`'s local `const NON_COMBAT_STYLES_DT` deleted; the shared array added to the
  existing `constants.js` import line; the one call site converted the same way. The surrounding
  comment (which used to say "mirror of sheet.js NON_COMBAT_STYLES") was updated to describe the real
  shared import rather than a mirrored local.
- AC4: proved via `dbo-9-non-combat-styles-consolidation.test.js` — see Task 4 above for full detail.
  7/7 new tests pass; prove-discrimination confirmed the test suite actually catches a reverted call
  site (and that revert would also throw at runtime, since arrays have no `.has` method).
- AC5: confirmed via `git diff --stat` — 3 files touched, 13 insertions/13 deletions, nothing beyond
  the scoped change.
- No behavioural change: the four excluded names (`Fast-Talking`, `Cacophony Savvy`, `Etiquette`,
  `Three Heads of Kerberos`) are identical before and after at every one of the four call sites.
- No deploy, no migration — pure client-side JS refactor, no server/schema/data involvement.

### File List

- `public/js/data/constants.js` (modified — new `NON_COMBAT_STYLES` export)
- `public/js/editor/sheet.js` (modified — local const deleted, import updated, 3 call sites updated)
- `public/js/tabs/downtime-form.js` (modified — local const deleted, import updated, 1 call site
  updated, comment corrected)
- `server/tests/dbo-9-non-combat-styles-consolidation.test.js` (new — 7 tests, then hardened by the
  Senior Developer Review)

## Senior Developer Review

**Reviewer**: external, Codex CLI (`codex exec`, `model_reasoning_effort=high`), three-pass
adversarial protocol, scaled to this story's small size (a lean hunt list, "nothing found" treated as
a legitimate expected outcome rather than something to pad). Full raw findings:
`specs/stories/code-review/dbo-9-suite-duplicated-constants-codex-findings.md`. Reviewed against
commit `a12ea72d`.

No High or Medium findings. 3 Low findings, all real, all independently re-verified, all patched.

### Patched (3, all Low)

1. **The new test's import-detection regex would false-pass on a commented-out or string-embedded
   "import" line**, not just a real import statement. Confirmed independently: the exact regex
   returned `true` against both `// import { NON_COMBAT_STYLES } from '../data/constants.js'` and a
   string literal containing the same text. Low real-world risk (the accompanying negative
   assertions — no local redeclaration, exact call-site counts — make an actual accidental false pass
   unlikely) but cheap to close. Fixed by anchoring both import checks to line-start with the `m`
   flag (`/^import\s*\{.../m`), which closes the realistic vector (a commented-out import) without
   over-engineering against a string-literal decoy no real refactor would produce by accident.
   Re-verified: the hardened regex still matches the real import lines in both files, rejects the
   comment decoy, and the full suite remains 7/7.
2. **Four newly-written comments contained em-dashes**, violating this story's own stated "no
   em-dashes in any comment this story writes" Dev Note — one in `constants.js`'s new doc comment,
   three in the new test file (its header comment and a section divider). Fixed; the pre-existing
   `STYLE_TAGS` comment's own em-dash (predates this story) was correctly left alone, and the test
   description string at `:67` was correctly left alone too (a string literal, not a comment — the
   rule's own scope).
3. **The Dev Agent Record's own count claim read ambiguously** — "29 [existing] files alongside the
   new suite" reads as 29 existing + 1 new = 30 total, when the real, verified number is 28
   pre-existing + this story's own new suite = 29 total. The underlying result (513/514, one
   pre-existing failure, two pre-existing load failures) was exactly correct; only the file-count
   framing was imprecise. Reworded.

### Verification

- `npx vitest run tests/dbo-9-non-combat-styles-consolidation.test.js` — **7/7 passed**, with the
  hardened regexes in place.
- Manually confirmed the hardened regex rejects the exact decoy string the review constructed, and
  still matches the real `import { ..., NON_COMBAT_STYLES } from '../data/constants.js'` lines in
  both `sheet.js` and `downtime-form.js`.
- No further prove-discrimination needed beyond what Task 4 already ran (the review's own Pass 3b
  independently re-ran that same discrimination — reverting one call site to `.has(...)` — and
  reproduced the identical 6-passed/1-failed result before restoring).
- No writes to live data at any point — this story never touched a database; the review's own
  Validation notes confirm it modified nothing beyond the one temporary, restored, byte-verified edit
  it made to reproduce the prove-discrimination check.
