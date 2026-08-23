# Story rlv.1: fix combat-tab's Quick Roll silently no-oping under the new-roller flag

Status: review

## Story

As a player or ST with the new dice roller enabled,
I want the Combat tab's "Quick Roll" button to actually open the roller with my pool loaded,
so that it doesn't silently do nothing when I tap it.

## Why this story exists

Confirmed live bug, found during the Phase 0 audit for Epic RLV (`specs/epic-rlv-roller-harmonisation.md`;
full evidence in `specs/dice-roller-harmonisation-audit.md` §4c). `public/js/game/combat-tab.js`
imports `loadPool, doRoll` from `public/js/suite/roll.js` specifically — never `roll-v2.js`, never
flag-aware. `doRoll` is imported but never called anywhere (dead import — out of this story's scope
to clean up, noted for whoever eventually deletes `roll.js` in rlv.6). `loadPool()` **is** called, by
`quickRoll()`, which then calls `window.goTab('dice')`. `goTab()` does
`document.getElementById('t-dice')` — but when a player has `tm-use-new-dice-roller` set, `#t-dice`
was removed from the DOM entirely at boot (`app.js`'s boot-time subtree removal; only `#t-roll`
exists). `goTab('dice')` finds nothing, silently no-ops (guarded, doesn't throw), and the pool
`loadPool()` just wrote into `roll.js`'s now-orphaned module state/DOM is invisible to the player.
**Anyone on the new roller who taps Quick Roll from the Combat tab today gets no visible response at
all** — same silent-failure shape as the Game 7 incident this whole epic exists to prevent a repeat
of.

## What this story is NOT

- NOT the roller consolidation (Epic RLV's rlv.2 onward). This is a narrow, independent fix that
  should land regardless of when/whether the rest of the epic proceeds.
- NOT a fix for the dead `doRoll` import — leave it as dead code for now; it gets cleaned up
  naturally when `roll.js` is deleted in rlv.6. Removing it here is a needless extra diff for a
  one-line unused import.
- NOT a change to `combat-tab.js`'s own inline `d10()` initiative roll — unrelated code in the same
  file, out of scope (see rlv.4/#1039 for the eventual "initiative special pool" discussion, which
  this file's `d10()` is a working precedent for, not a bug to fix here).

## Acceptance Criteria

1. Tapping Quick Roll on the Combat tab, with `tm-use-new-dice-roller` **on**, actually navigates to
   and opens the active roller tab (`#t-roll`) with the pool loaded and visible — matching what
   already happens correctly when the flag is off.
2. Tapping Quick Roll with the flag **off** continues to work exactly as it does today (no
   regression on the existing, correct path).
3. The fix reads which roller is actually active (the same `tm-use-new-dice-roller` check `app.js`
   already performs at boot) rather than hardcoding a second flag check — reuse, don't duplicate,
   the existing flag-read logic if it's already exported/accessible; if it isn't, exporting it from
   `app.js` for this one call site is acceptable and preferable to a second inline
   `localStorage.getItem('tm-use-new-dice-roller')` check.
4. `combat-tab.js`'s `loadPool()` import continues to come from `roll.js` OR switches to whichever
   roller is active, matching AC1 — if `loadPool()`'s signature/behaviour differs at all between
   `roll.js` and `roll-v2.js` (confirmed byte-identical per the Phase 0 audit, so it shouldn't), flag
   any surprise found during implementation rather than silently picking one.
5. No change to `roll.js`/`roll-v2.js` themselves — this is a `combat-tab.js`-side fix, since the
   roller files are correct; the caller is not.

## Tasks / Subtasks

- [x] Confirm exactly how `app.js` determines the active roller at boot (`USE_NEW_ROLLER` /
  `localStorage.getItem('tm-use-new-dice-roller') === '1'`) and whether it's exported or needs a
  one-line export added.
- [x] Update `combat-tab.js`'s `quickRoll()` to target `#t-roll` when the new roller is active,
  `#t-dice` otherwise (or, cleaner: call a single shared "open the roller tab" helper if one exists
  or is worth adding here).
- [x] Update the `loadPool`/`doRoll` import if AC4 surfaces a reason to.
- [x] Manual verification both ways (flag on/off) — this repo has no working local dev environment
  for Angelus to test personally (`CLAUDE.md`: "Angelus cannot run the app locally"), so this needs
  either a Playwright spec or deployment to `dev` for a real click-through before calling it done.
- [x] Add or extend a test covering the flag-on path specifically, since the flag-off path presumably
  already has coverage (confirm before assuming).

## Dev Notes

- Source: `public/js/game/combat-tab.js` (the bug), `public/js/app.js` (boot-time flag read + subtree
  removal — the mechanism this bug interacts with), `public/index.html` (confirms `#t-dice`/`#t-roll`
  are the two tab-root IDs).
- Full original finding: `specs/dice-roller-harmonisation-audit.md` §4c, under "game/combat-tab.js".

### References
- [Source: specs/dice-roller-harmonisation-audit.md §4c]
- [Source: public/js/game/combat-tab.js]
- [Source: public/js/app.js]

## Dev Agent Record
### Agent Model Used
Claude Sonnet 5 (bmad-dev-story)

### Debug Log References
None — no failing regression encountered during implementation.

### Completion Notes List
- Confirmed `app.js`'s active-roller determination (`USE_NEW_ROLLER = localStorage.getItem('tm-use-new-dice-roller') === '1'`,
  line 128) was not exported. Added `export` to the existing declaration — no other change to that line, AC3's preferred option
  since a second inline `localStorage.getItem` check would duplicate the source of truth.
- `combat-tab.js`'s `quickRoll()` rewritten to pick both the `loadPool` call AND the `goTab` target off the same
  `USE_NEW_ROLLER` read: `loadPoolV1`/`goTab('dice')` when off (unchanged existing path), `loadPoolV2`/`goTab('roll')` when on.
  AC4's anticipated signature/behaviour check confirmed `loadPool` is byte-identical between `roll.js` and `roll-v2.js` (matches
  the Phase 0 audit's own claim) — no surprise to flag. The dead `doRoll` import stays, per the story's own explicit scope
  exclusion.
- **Surprise found during implementation, not anticipated by the story text**: importing `USE_NEW_ROLLER` from `app.js` into
  `combat-tab.js` creates this codebase's first circular module reference (`app.js` already imports `initCombatTab` from
  `combat-tab.js`, at a line well before `USE_NEW_ROLLER`'s own declaration). This is safe under ES module semantics because
  `USE_NEW_ROLLER` is only read inside `quickRoll()`'s function body — at call time, long after `app.js`'s module body has
  finished executing — never at `combat-tab.js`'s own module-evaluation time. Verified empirically rather than trusted on
  theory alone: added two live-browser Playwright boot-smokes (flag on and off) that watch for `pageerror`/console errors
  matching a TDZ/circular-import shape; both pass clean in a real browser.
- Task 4 (manual verification) resolved as a Playwright spec, matching the story's own offered alternative — a full
  interactive click-through isn't reachable without Discord OAuth (combat tab is behind the auth gate; same constraint
  issue-1018's own spec for this exact area already documents), so verification is: (a) three source-fetch assertions proving
  the real shipped `combat-tab.js`/`app.js` carry the exact wiring described above, and (b) the two live boot-smokes proving
  the circular import doesn't throw in either flag state. `tests/rlv-1-quick-roll-tab-fix.spec.js`, 5/5 passing.
- Task 5: no pre-existing test file covered `combat-tab.js` at all (confirmed by search, not assumed) — new suite
  `server/tests/rlv-1-combat-tab-quick-roll.test.js`, 6 tests, covering both the flag-on (new) and flag-off (regression) paths,
  plus the pre-existing unknown-character-id no-op guard. `app.js`, `roll.js`, `roll-v2.js`, and `combat-tab.js`'s other
  (unrelated-to-this-fix) imports are mocked outright, matching this project's established pattern for driving browser-only
  client modules in Node without jsdom (see `gdx-7-apply-costs-on-roll.test.js`, `crd-3b-resolution-screen.test.js`) — isolates
  the test to the one function under test, and avoids ever evaluating `app.js`'s full admin/editor import graph through the new
  circular reference.
- Regression: re-ran every existing vitest suite that references `app.js` or `combat-tab.js` as source text or imports the
  roll/roll-v2/tracker modules (11 files, 346 tests) — all green, no source-text assertion was disturbed by the two changed
  lines. Re-ran `tests/issue-1018-parallel-roll-tab-flag.spec.js` (the existing Playwright coverage for the roller-flag
  mechanism this fix touches): 7/8 passing, one pre-existing failure (`roll-v2.js`'s `doRoll` is `async function`, so an
  `export\s+function\s+doRoll\b` regex doesn't match it) confirmed via `git stash` A/B identical at base — unrelated to this
  story, not fixed here.

### File List
- `public/js/app.js` — modified (one line: `export` added to `USE_NEW_ROLLER`'s existing declaration, plus a one-line comment)
- `public/js/game/combat-tab.js` — modified (`quickRoll()` and its three imports)
- `server/tests/rlv-1-combat-tab-quick-roll.test.js` — new
- `tests/rlv-1-quick-roll-tab-fix.spec.js` — new

## Change Log

| Date | Change |
|------|--------|
| 2026-08-23 | `bmad-dev-story`: all 5 tasks implemented, `ready-for-dev` -> `review`. `quickRoll()` in `combat-tab.js` now reads `app.js`'s exported `USE_NEW_ROLLER` flag to pick both the `loadPool` call (`roll.js` vs `roll-v2.js`) and the `goTab` target (`dice` vs `roll`) together, instead of always writing into `roll.js` and always navigating to the (sometimes-removed) `#t-dice`. Surfaced and verified rather than assumed: this creates the codebase's first circular module reference (`combat-tab.js` <-> `app.js`), safe because the flag is only read at call time inside `quickRoll()`, confirmed with two live-browser Playwright boot-smokes (flag on/off) watching for a TDZ-shaped console/page error — both clean. New unit suite (`rlv-1-combat-tab-quick-roll.test.js`, 6 tests, no prior coverage of `combat-tab.js` existed at all) and new Playwright spec (`rlv-1-quick-roll-tab-fix.spec.js`, 5 tests) since the Combat tab's own OAuth gate rules out a full interactive click-through, matching `issue-1018`'s own precedent for this exact area. Regression: 11 vitest files / 346 tests green; re-ran `issue-1018-parallel-roll-tab-flag.spec.js`, 7/8 passing with one pre-existing failure (`roll-v2.js`'s `doRoll` is `async`, a regex written for `roll.js`'s non-async form doesn't match it) confirmed via `git stash` A/B identical at base, not caused by or fixed in this story. NOT committed, NOT pushed, NOT merged. |
| 2026-08-23 | Story created (Sally/audit-driven, Epic RLV Phase 0), `backlog` -> `ready-for-dev`. |
