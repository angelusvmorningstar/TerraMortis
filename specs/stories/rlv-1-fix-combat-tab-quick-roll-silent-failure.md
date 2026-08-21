# Story rlv.1: fix combat-tab's Quick Roll silently no-oping under the new-roller flag

Status: ready-for-dev

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

- [ ] Confirm exactly how `app.js` determines the active roller at boot (`USE_NEW_ROLLER` /
  `localStorage.getItem('tm-use-new-dice-roller') === '1'`) and whether it's exported or needs a
  one-line export added.
- [ ] Update `combat-tab.js`'s `quickRoll()` to target `#t-roll` when the new roller is active,
  `#t-dice` otherwise (or, cleaner: call a single shared "open the roller tab" helper if one exists
  or is worth adding here).
- [ ] Update the `loadPool`/`doRoll` import if AC4 surfaces a reason to.
- [ ] Manual verification both ways (flag on/off) — this repo has no working local dev environment
  for Angelus to test personally (`CLAUDE.md`: "Angelus cannot run the app locally"), so this needs
  either a Playwright spec or deployment to `dev` for a real click-through before calling it done.
- [ ] Add or extend a test covering the flag-on path specifically, since the flag-off path presumably
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
### Debug Log References
### Completion Notes List
### File List
