# Story DBO.3: XP-spend merit pickers exclude the wrong merits (the `standing` filter has never fired)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a player or ST spending XP on merits,
I want every merit picker that is supposed to hide Mystery Cult Initiation and Professional
Training (event-granted, not XP-purchasable per dot) to actually hide them, and to stop hiding
Confessor and Pledged (ordinary XP-purchasable merits gated by a real Status prerequisite the
engine already evaluates),
so that the picker matches its own documented intent instead of excluding two unrelated merits by
coincidence.

## Why this story exists

The epic's own audit (`specs/epic-dbo-database-ownership.md`, DBO-3) named ONE symptom in ONE
function: `getItemsForCategory('merit')` in `public/js/tabs/downtime-form.js` checks
`rule.sub_category === 'standing'` intending to exclude Mystery Cult Initiation (MCI) and
Professional Training (PT), but those two merits actually carry `special: 'standing'` with
`sub_category: null` — so the check has never once excluded them.

**Research done before writing these ACs found the SAME broken check duplicated at three more call
sites, and a fourth, differently-shaped defect the audit did not name.** This is not scope creep —
it is the same root cause (checking the wrong field) recurring everywhere a picker tries to hide
standing merits, exactly the kind of duplicated-logic drift this epic (`epic-dbo-database-ownership.md`)
and this session's own prior story (`oxp-7-sheet-office-merits-section.md`, AC2's shared
`resolveHeldSeat` extraction) both exist to close rather than patch once and leave the rest broken.

**Verified against live `tm_suite` (read-only query, 2026-08-14 — see Dev Notes for the exact
findings) before any code was written**, per this project's own "audit before write" convention:

- `Mystery Cult Initiation` and `Professional Training`: `special: 'standing'`, `sub_category: null`.
  These are the two real "gained via IC events, not bought per dot" merits — the ones every one of
  the four call sites below actually intends to exclude.
- `Confessor` and `Pledged`: `sub_category: 'standing'`, `special: null`. These are ordinary
  fixed-XP merits (`xp_fixed: 1` and `2`) gated by a real `prereq: {type:'status', qualifier:'Lance',
  dots:N}` tree the prereq engine already evaluates correctly — nothing about their own data marks
  them as IC-event-only. They are the two merits the buggy `sub_category === 'standing'` checks
  have actually been excluding, coincidentally, this whole time.
- `special` is a genuinely inert field everywhere else in this codebase — grepped exhaustively
  (`public/js/**/*.js`) and confirmed nothing reads `rule.special` for any purpose today (the only
  other `.special` hits in the app are an unrelated `xp_log.spent.special` XP-accounting field, a
  different concept entirely).
- `sub_category === 'standing'` also does not drive any inclusive "standing merit" picker anywhere.
  The sheet's own dedicated Standing Merits UI (`shAddStandMCI`/`shAddStandPT` in
  `public/js/editor/edit-domain.js:176-190`) is hardcoded to the two literal merit names — it does
  not query the rules collection by `sub_category` or `special` at all. `sub_category`'s only other
  real consumer, `buildSubCategoryMeritOptions`, is only ever called with `'influence'` or
  `'domain'` (`public/js/editor/sheet.js:1012,1216`) — never `'standing'`.

**The fourth, previously-unnamed defect**: `buildMeritOptions` (`public/js/editor/merits.js:314`,
the SHEET'S OWN primary "Add Merit" picker in edit mode) has no `special` check at all, and its
existing `sub_category` check (`if (rule.sub_category && rule.sub_category !== 'general') continue;`)
does not skip a `null` `sub_category` — so, on current live data, Mystery Cult Initiation and
Professional Training are not excluded from this picker either. This is the most visible surface of
the four: it is the sheet's main merit-add control, not a downtime-form or admin-only path.

## What this story is NOT

- **NOT a data correction.** Confessor's and Pledged's live `sub_category: 'standing'` value is left
  exactly as it is. The fix reads `special` instead of `sub_category` for this specific exclusion, so
  the stored value that caused the bug becomes irrelevant to it — no write to `tm_suite` is needed or
  made by this story. This also keeps the story inside the pre-game freeze (`BRIEF-2026-08-14-tm-suite.md`,
  `epic-dbo-database-ownership.md` Hard constraints): no migration, backfill or production write of
  any kind.
- **NOT a fix to `admin/rules-view.js`'s `sub_category` dropdown or its "controls which picker the
  merit appears in" tooltip.** That tooltip's claim was already not fully accurate before this story
  (the dropdown offers `'standing'` as a choice, but nothing routes an INCLUSIVE picker off it) and
  stays exactly as inaccurate after — correcting ST-facing admin copy is a separate, smaller piece of
  work with no code-behaviour risk, out of scope here.
- **NOT DBO-1.** This story does not touch `server/schemas/purchasable_power.schema.js` or attempt to
  declare `special` there. It reads `rule.special` off the same already-fetched, already-cached rules
  documents every one of these four functions already has in hand — no new fetch, no new validation
  surface. (See Dev Notes for why this story quietly makes DBO-1 more urgent without needing to
  resolve it.)
- **NOT a deploy.** Per the epic's hard constraint, nothing from this repo deploys before the
  2026-08-15 game. This story reaches `done` (dev complete, reviewed) and stays uncommitted-to-main
  exactly like the epic-oxp stories currently do, pending Angelus's own merge call.
- **NOT touching `getRulesByCategory`, the rule-engine cache, or any other category
  (`attribute`/`skill`/`discipline`/`devotion`/`rite`) in `getItemsForCategory`.** Only the `'merit'`
  branch, and only its standing-merit exclusion.

## Acceptance Criteria

1. **A single shared, exported predicate replaces all three broken inline checks.** New function
   `isMeritEventGranted(rule)` in `public/js/editor/merits.js` (the established shared home both
   `downtime-form.js` and `merits.js` itself already import merit-rule predicates from — see
   `meetsPrereq`/`isMeritExcluded`, already imported by `downtime-form.js:27`):
   ```js
   export function isMeritEventGranted(rule) {
     return !!rule && rule.special === 'standing';
   }
   ```
   Returns `false` for a missing/malformed `rule` rather than throwing (mirrors this session's own
   `resolveHeldSeat` null-safety convention).

2. **The three existing broken exclusions are replaced, not duplicated.** Each of these three exact
   lines changes from checking `rule.sub_category === 'standing'` to calling the shared predicate:
   - `public/js/tabs/downtime-form.js:4210` (inside `getItemsForCategory('merit')`, the DT XP-spend
     picker named in the epic).
   - `public/js/editor/merits.js:410` (inside `buildMCIGrantOptions` — an MCI-dot-purchase grant
     dropdown that must not offer MCI/PT themselves as a grantable child merit).
   - `public/js/editor/merits.js:463` (inside `buildFThiefOptions` — the "Fucking Thief" steal-list
     picker).
   `downtime-form.js` gains `isMeritEventGranted` to its existing
   `import { meetsPrereq, isMeritExcluded } from '../editor/merits.js';` line.

3. **The fourth, previously-unnamed defect is closed.** `buildMeritOptions`
   (`public/js/editor/merits.js:314`, the sheet's own primary "Add Merit" picker) gains the same
   exclusion — MCI and PT are excluded from the `qualified` list this picker builds, confirmed and
   held only via `shAddStandMCI`/`shAddStandPT`'s own dedicated UI. Add immediately alongside the
   existing `sub_category` check (do not replace it — `sub_category !== 'general'` still correctly
   excludes influence/domain/carthian-law/oath merits from this general-only picker; it is
   independently correct and stays):
   ```js
   if (isMeritEventGranted(rule)) continue;
   if (rule.sub_category && rule.sub_category !== 'general') continue;
   ```

   **Codex review — literal-wording correction (not a behaviour change):** an earlier draft of this
   AC said MCI/PT "must not appear in this picker's output for ANY character," which overclaimed.
   `buildMeritOptions` (and `buildMCIGrantOptions`/`buildFThiefOptions`, same shape) all carry a
   generic "show the current value even if it no longer qualifies" escape hatch
   (`if (currentName && !qualified.some(...)) { ...append currentName as a raw selected option... }`,
   `merits.js:369/462/512`) that exists for every category-based exclusion already in these
   functions (domain, influence, oath, carthian-law) — it is not new to this story, and this story's
   own new `isMeritEventGranted` check is excluded from `qualified` in exactly the same way those
   always have been, so it inherits the SAME pre-existing passthrough behaviour, not a new gap this
   story introduced. **Confirmed unreachable via any real write path**: `buildMeritOptions`'s only
   real caller is `sheet.js:2086`, whose `currentName` comes from `oM` at `sheet.js:2005` — `(c.merits
   || []).filter(m => m.category === 'general')` — and MCI/PT are only ever written with
   `category: 'standing'` (`shAddStandMCI`/`shAddStandPT`, the only write path either merit has). A
   hand-constructed character object that puts "Mystery Cult Initiation" directly into a
   `category: 'general'` merit row (bypassing the app's own write paths entirely) can still trigger
   the passthrough, which is how this was found — but no real user-facing flow can produce that
   shape. Accepted as-is, matching this codebase's own established precedent for a defensive branch
   confirmed unreachable via any real write path (see `deferred-work.md`'s equivalent entry for
   `office-merit-dots.js`'s own fallback branch) rather than building speculative code for an input
   nothing can produce.

4. **Confessor and Pledged become selectable wherever their real prerequisite is met — at the sites
   where nothing else already excludes them.** With the `sub_category === 'standing'` check removed
   from all three of AC2's sites, both merits now flow through the SAME `meetsPrereq`/`isMeritExcluded`
   gate every other ordinary merit already goes through, at `downtime-form.js`'s `getItemsForCategory`
   and `buildMCIGrantOptions` — no bespoke allow-list, no name-based carve-out. A character who does
   not hold the required Lance Status still correctly never sees them; a character who does now
   correctly can.

   **Codex review — corrected for `buildFThiefOptions` specifically:** this AC originally claimed both
   merits "flow through the SAME gate... at each of those three call sites," which does not hold for
   `buildFThiefOptions` — that function takes no character parameter at all (it has neither a
   `meetsPrereq` nor an `isMeritExcluded` gate to flow through) and structurally accepts only 1-dot
   merits (`rr[0] === rr[1] && rr[0] !== 1` is excluded). Confessor (`rating_range: [1,1]`) passes
   that filter and becomes selectable there once this story's fix lands, unconditionally (this picker
   is not prereq-gated by design). Pledged (`rating_range: [2,2]`) is excluded from `buildFThiefOptions`
   by its own rating shape, unconditionally, regardless of this story's fix — it never has and never
   will appear there, and that is correct, unrelated behaviour this story does not change.

5. **No behaviour change to any other merit.** Every merit whose `special` field is `null` or absent
   (which is every merit except MCI and PT, confirmed against live data — see Dev Notes) is
   unaffected by `isMeritEventGranted` at all four call sites; only the two true standing merits are
   newly excluded, and only Confessor/Pledged's previous wrongful exclusion is lifted.

6. **Tests use real-shape fixtures, not invented ones.** Test fixtures for MCI/PT and
   Confessor/Pledged mirror the exact field shapes confirmed live on 2026-08-14 (`special`/
   `sub_category` values, `xp_fixed`, `prereq` shape) rather than a simplified stand-in — the whole
   point of this story is a field-shape mismatch, so the tests must exercise the real shape or they
   cannot prove the fix.

## Tasks / Subtasks

- [x] Task 1 — Shared predicate (AC: 1)
  - [x] Add exported `isMeritEventGranted(rule)` to `public/js/editor/merits.js`.
  - [x] Unit tests: `special: 'standing'` → true; `special: null` → false; `special` absent → false;
        `sub_category: 'standing'` with `special` absent/null → false (the core regression case);
        `null`/`undefined` rule → false, no throw.
- [x] Task 2 — Replace the three broken exclusions (AC: 2, 4)
  - [x] `downtime-form.js:4210` — import and call `isMeritEventGranted`.
  - [x] `merits.js:410` (`buildMCIGrantOptions`) — same.
  - [x] `merits.js:463` (`buildFThiefOptions`) — same.
  - [x] Direct-unit tests, using the real MCI/PT/Confessor/Pledged fixture shapes (AC6), for the TWO
        sites reachable outside a full-DOM harness (`buildMCIGrantOptions`, `buildFThiefOptions`):
        MCI and PT never appear; Confessor/Pledged appear when `meetsPrereq` passes and stay absent
        when it does not (prove the prereq gate, not just the removed exclusion, still holds — except
        `buildFThiefOptions`, which has no prereq gate at all and never shows Pledged regardless, per
        its own unrelated 1-dot-only rating filter — see AC4's own Codex-review correction). The
        THIRD site, `downtime-form.js`'s `getItemsForCategory`, is source-contract tested only — its
        `currentChar` state is module-private with no exported setter (Codex review, Pass 3a: an
        earlier draft of this checkbox overclaimed "per site" for all three; corrected here).
- [x] Task 3 — Close the fourth defect (AC: 3)
  - [x] Add the `isMeritEventGranted` check to `buildMeritOptions` (`merits.js:314`), alongside (not
        replacing) the existing `sub_category` check.
  - [x] Direct-unit test: MCI and PT absent from `buildMeritOptions`'s output. **Discovered while
        writing this test, not assumed**: `buildMeritOptions` ALSO already excludes Confessor/Pledged
        (via its own pre-existing, unrelated `sub_category !== 'general'` check, unchanged by this
        story) — so unlike the three sites in Task 2, Confessor/Pledged do NOT become selectable
        here even once their prereq is met. AC4's "becomes selectable" was already scoped to AC2's
        three sites only; the test now asserts the correct (narrower) behaviour instead of the
        broader claim an earlier draft of this test wrongly assumed.
- [x] Task 4 — Regression gate and prove-discrimination (AC: 5)
  - [x] Full targeted gate run: this story's own new test file plus
        `server/tests/n7-n9-allocator-readers.test.js` (confirmed pre-story to pin `buildMeritOptions`
        via a source-contract regex) plus `server/tests/issue-896-availability-filter.test.js`
        (touches `downtime-form.js`'s `currentChar`). **A real self-inflicted bug was found and fixed
        during this task, not assumed away**: `isMeritEventGranted`'s own doc comment initially named
        `buildMeritOptions` and quoted `meritPrereqOK(c, rule)` in its prose, which happened to sit
        close enough together to satisfy n7-n9's regex against the COMMENT TEXT itself rather than
        the real function — a false pass. Caught by measuring the actual character offsets in the
        file (not trusting the green result), confirmed by comparing the real gap on `main` (1003
        chars, already >600, already failing before this story touched anything) against the current
        file (1022 chars, same pre-existing failure, `git stash` used to isolate this story's changes
        from the baseline). Comment reworded to describe the constraint without repeating the literal
        strings the regex hunts for. **n7-n9-allocator-readers.test.js's own known #1115 failure
        (documented in this repo's CLAUDE.md) is present both before and after this story — confirmed
        via stash comparison, not caused or worsened by DBO-3.** Full targeted gate: 68/69 (the 1 is
        #1115, pre-existing).
  - [x] Prove-discrimination: reverted `isMeritEventGranted`'s body to `return false;` (single
        change) — failed exactly the 4 MCI/PT-still-appearing tests across the three directly-testable
        sites (`buildMeritOptions`, `buildMCIGrantOptions`, `buildFThiefOptions`); restored, re-confirmed
        green. Separately reverted ONLY the new `buildMeritOptions` check (Task 3) — failed exactly that
        one site's MCI/PT test and no other; restored, re-confirmed green.

## Dev Notes

### Live-data verification (2026-08-14, read-only query against `tm_suite`, before any code written)

Ran a read-only query (`find`/`distinct`, no write) against `tm_suite.purchasable_powers` to confirm
the epic's claim and check for anything it did not name. Exact results:

```
Mystery Cult Initiation: { special: "standing", sub_category: null }
Professional Training:   { special: "standing", sub_category: null }
Confessor:                { special: null, sub_category: "standing", xp_fixed: 1,
                             prereq: {type:"status", qualifier:"Lance", dots:3} }
Pledged:                  { special: null, sub_category: "standing", xp_fixed: 2,
                             prereq: {type:"status", qualifier:"Lance", dots:1} }

distinct sub_category values (category=merit): [null, 'carthian-law', 'domain', 'general',
  'influence', 'oath', 'standing']
distinct special values (category=merit): [null, 'standing']
merit docs with special === 'standing': exactly 2 (MCI, PT)
merit docs with sub_category === 'standing': exactly 2 (Confessor, Pledged)
characters currently owning Confessor or Pledged: 0
```

No character owns Confessor or Pledged today, so lifting their wrongful exclusion has zero
migration/backfill implication — this is purely "a picker starts offering something it should
already have been offering," not a change to any existing character's data.

### Why `special` and not `sub_category` is the correct signal to fix on, not the other way around

Considered and rejected: fixing this by instead making `getRulesByCategory`/the seed data set
`sub_category: 'standing'` on MCI/PT and clearing it from Confessor/Pledged. Rejected because (a) it
is a live-data write, which the pre-game freeze forbids outright; (b) `special` is a real,
already-present, already-correct signal on the only two documents that need it — fixing the CODE to
read the field that is already right is smaller and safer than fixing the DATA to match code that
was checking the wrong thing; (c) DBO-1 already flags `special` as an undeclared-but-present field
needing schema attention — this story is consistent with that direction (making the field real and
load-bearing) rather than working against it (abandoning it in favour of overloading
`sub_category` further, which already carries 7 distinct real values for what its own admin tooltip
claims is a 4-value enum).

### DBO-1 cross-reference — this story raises DBO-1's stakes, does not resolve it

Before this story, `special` was read by nothing in the app — an admin editing Mystery Cult
Initiation or Professional Training via `admin/rules-view.js`'s Rule Data table and saving would hit
`POST /api/rules`'s `purchasablePowerSchema` validation (`additionalProperties: false`, `special`
undeclared) and the request would very likely be rejected outright, but nothing depended on
`special` surviving that round-trip either way. **After this story ships, `special` is load-bearing**
— if a future edit to either document silently strips `special` (or the DBO-1 investigation's
"something re-seeds `selected`" mechanism turns out to also touch `special` in a way this story
did not test for), the standing-merit exclusion this story fixes would silently regress. Not this
story's problem to solve (DBO-1 owns the schema), but worth stating plainly in DBO-1's own next pass:
once DBO-3 ships, declaring `special` in the schema stops being purely a "the schema lags the data"
problem and starts being "an already-shipped exclusion depends on this field surviving a save."

### Architecture compliance

- **No new reference-data collection or duplicated table.** This story reads an existing field on
  already-cached rule documents; `MERIT_DOT_CAPS`/`OFFICE_DATA`-style reference-data rules do not
  apply here (this is not new reference data, it's a corrected read of existing data).
- **British English, no em-dashes** in any string this story writes.
- **CSS**: none. This is a pure filter-logic fix; no markup or styling changes at any of the four
  call sites.

### Project Structure Notes

- Files touched: `public/js/editor/merits.js` (new export + two of the three replaced checks + the
  new fourth check), `public/js/tabs/downtime-form.js` (one replaced check + one new import).
- New test file: `dbo-3-standing-merit-filter.test.js` (new — decide during dev whether direct-unit
  or the browser-shim + dynamic-import technique is needed per call site; `downtime-form.js`'s own
  `getItemsForCategory` may need the shim, `merits.js`'s exported functions may not).
  `server/tests/n7-n9-allocator-readers.test.js` is NOT touched by this story's own new coverage —
  it stays as regression-gate confirmation only (Task 4), since its regex already passes once the
  new check is placed early in each function body (see Task 4).
- Deliberately unchanged: `server/schemas/purchasable_power.schema.js` (DBO-1's own scope),
  `admin/rules-view.js`, `public/js/editor/edit-domain.js`'s `shAddStandMCI`/`shAddStandPT` (the
  sheet's own dedicated Standing Merits add UI — unaffected either way, since it never queried
  `sub_category`/`special` to begin with).

### References

- [Source: `specs/epic-dbo-database-ownership.md`, DBO-3] — the epic's own naming of this defect
  (single call site, `downtime-form.js`); this story's own research found three more.
- [Source: `public/js/tabs/downtime-form.js:4176-4293`] — `getItemsForCategory('merit')`, the
  originally-named picker, its own comment (`:4182-4193`) stating the intended exclusion in prose.
- [Source: `public/js/editor/merits.js:298-479`] — `meritPrereqOK`, `buildMeritOptions`,
  `buildSubCategoryMeritOptions`, `buildMCIGrantOptions`, `buildFThiefOptions` — the full existing
  shared-predicate pattern this story extends rather than reinvents.
- [Source: `public/js/editor/edit-domain.js:172-190`] — `shAddStandMCI`/`shAddStandPT`, confirming
  the sheet's real Standing Merits UI is name-hardcoded and independent of this story's fix.
- [Source: `server/schemas/purchasable_power.schema.js:219-245`] — DBO-1's own comment on the
  `special`/`selected` field-versus-schema gap, cross-referenced above.
- [Source: `specs/deferred-work.md`, "Deferred from: cross-app data audit (2026-08-14...)"] — the
  five Suite-side defects the same audit surfaced, DBO-3 among them.
- [Source: `specs/stories/oxp-7-sheet-office-merits-section.md`, AC2] — the precedent this story's
  own shared-predicate extraction (AC1/AC2 here) mirrors: replace duplicated inline logic with one
  exported, tested function rather than patch one call site and leave the others drifting.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5), via `bmad-dev-story`.

### Debug Log References

- **Test-file bug (mine), fixed during Task 2**: my first draft's `afterAll` teardown in the first
  describe block deleted `globalThis.location`/`globalThis.localStorage` before the second describe
  block's `beforeEach` needed them (each block had its own teardown, but they share one module-level
  shim). Fixed by removing the redundant per-block teardown and keeping only the last block's.
- **Test-file bug (mine), fixed during Task 4**: the `downtime-form.js` source-contract test's
  `meritBranch` slice anchored on the FIRST literal `case 'merit': {` in the file, which is a
  different switch statement (a cost-calculation branch, not `getItemsForCategory`) — there are two
  such literal occurrences. Fixed by anchoring on `function getItemsForCategory(category)` first,
  then slicing within that function's own body only.
- **False-pass caught during Task 4** (see Task 4's own checkbox note for the full account):
  `isMeritEventGranted`'s doc comment initially named `buildMeritOptions` and quoted
  `meritPrereqOK(c, rule)` close together in its own prose, which satisfied
  `n7-n9-allocator-readers.test.js`'s 600-char source-contract regex against the comment text
  instead of the real function — a green result for the wrong reason. Found by measuring actual
  character offsets rather than trusting the pass, not by inspection alone.
- **`buildMeritOptions` does not make Confessor/Pledged selectable** even though AC2's three sites
  do — its own pre-existing `sub_category !== 'general'` check independently excludes anything
  tagged `sub_category: 'standing'`, which Confessor/Pledged genuinely carry. This is unrelated to
  this story's bug and unchanged by it; AC4's own wording already scoped "becomes selectable" to
  AC2's three sites, not this one — my first draft of the corresponding test wrongly assumed
  otherwise and was corrected after actually running it.
- **Codex review — `buildFThiefOptions` does not make Pledged selectable either**, unlike the other
  two AC2 sites. My first draft of AC4 claimed all three AC2 sites treat both merits identically
  ("flow through the SAME gate... at each of those three call sites"), which does not hold for this
  one: `buildFThiefOptions` takes no character parameter (no `meetsPrereq`/`isMeritExcluded` gate to
  flow through at all) and structurally accepts only 1-dot merits. Confessor (`rating_range: [1,1]`)
  passes and becomes selectable unconditionally once this fix lands; Pledged (`rating_range: [2,2]`)
  is excluded by its own rating shape, unconditionally, regardless of this story. AC4 and its own
  test were both corrected to state this precisely rather than the uniform claim.
- **Codex review — the current-value passthrough escape hatch** (`merits.js:369/462/512`, a
  pre-existing pattern in all three builders showing any `currentName` not found in `qualified` as a
  raw selected option) still shows MCI/PT if `currentName` is hand-set to one of them directly —
  contrary to an early draft of AC3's "for ANY character" wording. Confirmed unreachable via any real
  write path: `buildMeritOptions`'s only real caller (`sheet.js:2086`) sources `currentName` from
  merits already filtered to `category: 'general'` (`sheet.js:2005`), and MCI/PT are only ever
  written with `category: 'standing'`. AC3 reworded to state the guarantee accurately (excluded from
  `qualified`, not an absolute "never appears" claim the pre-existing architecture doesn't make for
  any other excluded category either); a new test documents and proves the exact boundary rather
  than leaving it undiscovered.

### Codex review outcome (2026-08-14)

External Codex review (`codex-review` skill, `codex exec`, high reasoning effort, 3-pass adversarial
protocol). No High findings. 4 Medium, all triaged and closed:

1. Current-value passthrough bypassing AC3's literal wording — confirmed real but unreachable via
   any real write path (see Debug Log); AC3 reworded to state the actual guarantee, new test added
   proving both the passthrough behaviour and its unreachability boundary.
2. AC4 claiming Pledged becomes selectable at all three AC2 sites, when `buildFThiefOptions`
   structurally excludes it regardless (its own 1-dot-only rating filter, unrelated to this story) —
   AC4 and its own test corrected to state this precisely.
3/4. Two restatements of the same two findings from the Dev Agent Record's own perspective (Pass 3b
   independently re-derived both after reading the record, confirming the code itself was consistent
   with what Pass 1/2/3a found rather than the record papering over anything).

4 Low, all real and corrected:
- Test count overclaimed as 20 (`rg`/`vitest` both independently counted 16 at review time; now 17
  after the passthrough test was added to close finding 1). Corrected here.
- Task 2's own checkbox claimed "direct-unit tests per site" for all three AC2 sites when the
  downtime-form.js site is source-contract only — corrected to name the exception explicitly.
- The prove-discrimination checkbox's "4 tests... across the three sites" wording was ambiguous about
  which 4 (1 predicate test + 1 per builder, not 4 site-level tests) — left as originally worded,
  since re-reading it does not actually misstate the count, only under-specifies which test is which;
  no change needed.
- `isMeritEventGranted`'s own doc comment claimed "every one of this predicate's four call sites"
  used to check `sub_category`, when only three did (the fourth, `buildMeritOptions`, had no check at
  all before this story) — corrected, carefully avoiding reintroducing the literal function-name
  string that caused the earlier false-pass (caught by re-running `n7-n9-allocator-readers.test.js`
  immediately after the edit, not assumed safe a second time).

Full targeted gate after all patches: 69/70 (up from 68/69 pre-review — +1 for the new passthrough
test). Full raw findings at
`specs/stories/code-review/dbo-3-xp-spend-standing-filter-bug-codex-findings.md`.

### Completion Notes List

- AC1: `isMeritEventGranted(rule)` added to `public/js/editor/merits.js`, checking `rule?.special
  === 'standing'`. Placed before every other literal mention of the dropdown-builder function names
  in the file (including in comments) so it cannot land inside any of `n7-n9-allocator-readers.test.js`'s
  own fixed-character-window source-contract regexes — this placement constraint was discovered
  empirically during Task 1, not planned in advance.
- AC2: the three broken `rule.sub_category === 'standing'` checks (`downtime-form.js:4210`,
  `merits.js:410` in `buildMCIGrantOptions`, `merits.js:463` in `buildFThiefOptions`) replaced with
  `isMeritEventGranted(rule)`. `downtime-form.js` gained the import.
  `getItemsForCategory`/`currentChar` are module-private with no exported setter and no lighter
  entry point than the full-DOM `renderDowntimeTab`, so this site's own correctness is proved by a
  source-contract test (matching the SAME established pattern `issue-896-availability-filter.test.js`
  already uses for a different internal in this exact file), not direct invocation.
- AC3: the previously-unnamed fourth defect closed — `buildMeritOptions` (`merits.js:314`) gained
  the same `isMeritEventGranted` check, added alongside (not replacing) its existing `sub_category`
  check, which stays correct and unchanged for domain/influence/carthian-law/oath exclusion.
- AC4: Confessor now flows through the ordinary `meetsPrereq`/`isMeritExcluded` gate at
  `getItemsForCategory` and `buildMCIGrantOptions`, and appears unconditionally in `buildFThiefOptions`
  (which has no character-based gate at all) once its own 1-dot rating passes that picker's
  unrelated filter. Pledged flows through the same gate at the first two sites but never appears in
  `buildFThiefOptions`, correctly, by its own 2-dot rating — corrected from an earlier draft
  claiming uniform behaviour across all three (Codex review). Does NOT apply to `buildMeritOptions`
  (AC3's site) — see Debug Log.
- AC5: an ordinary control merit (no `special`, no `sub_category`) proved unaffected at the one site
  that needed a positive-presence check; the pre-existing sub_category-based exclusions elsewhere
  (domain/influence/carthian-law/oath) proved still intact and unchanged.
- AC6: all fixtures (MCI, PT, Confessor, Pledged) mirror the exact live field shapes confirmed
  2026-08-14 (`special`, `sub_category`, `xp_fixed`, `prereq` tree) — no simplified stand-ins.
- 17 tests in `dbo-3-standing-merit-filter.test.js` (4 pure `isMeritEventGranted`, 11 direct-unit
  across the three exported builder functions including the Codex-review passthrough-boundary test,
  2 source-contract for the fourth site), all green for genuine reasons after fixing the two
  test-harness bugs and the one false-pass described above (an earlier draft of this note claimed 20
  tests — corrected after Codex review's own independent count of 16 at review time, +1 for the new
  passthrough test).
  Full targeted gate: this file + `n7-n9-allocator-readers.test.js` +
  `issue-896-availability-filter.test.js` = 69/70, the 1 being the pre-existing, CLAUDE.md-documented
  #1115 failure, confirmed present on `main` before this story via `git stash` before being ruled
  out as this story's problem, and independently re-confirmed by Codex's own review against `main`.
  Two prove-discrimination passes, each a single-change revert, restored and re-verified green
  afterward. Live `tm_suite` never connected to or written to during dev (the earlier live-data
  verification in story creation was read-only). No deploy, no migration, no commit to `main` —
  stays inside the pre-game freeze.

### File List

- `public/js/editor/merits.js` (modified — new `isMeritEventGranted` export; three replaced checks;
  one new check in `buildMeritOptions`)
- `public/js/tabs/downtime-form.js` (modified — one replaced check, one new import)
- `server/tests/dbo-3-standing-merit-filter.test.js` (new)
