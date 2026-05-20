# Issue #433: Suite app chevron-expand no-ops (wrong toggleDisc wired)

Status: Ready for Review

issue: 433
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/433
branch: piatra/issue-433-suite-chevron-expand
dispatch: PROCEED-WITH-NOTICE — small wiring bug, unrelated to Rev 4

## Story

As a player on the suite app (`/`),
I want clicking a discipline-power / devotion / rite / ritual / pact / merit chevron to expand the rule elaboration drawer,
so that I can read the rule clarification I most need — instead of a chevron that does nothing.

## Root cause

The suite app page hosts BOTH the editor sheet (Sheets tab) and the suite sheet. `app.js` binds the EDITOR `toggleExp`/`toggleDisc` to the unprefixed `window.toggleExp`/`window.toggleDisc` (app.js:1081-1082). The suite sheet emitted inline `onclick="toggleDisc('disc-row-N')"` — same unprefixed names — so the editor functions ran against suite-convention element IDs (`disc-row-`/`disc-drawer-`, which the editor's toggleDisc doesn't use) and silently no-opped.

`app.js` already exposed `window.suiteToggleDisc`/`window.suiteToggleExp` (Object.assign at 1183-1184), and `suite/sheet-helpers.js` also self-assigned `window.toggleExp`/`window.toggleDisc` to the suite versions at module load — but that assignment was clobbered by app.js's later editor binding. The suite onclick strings just needed to call the namespaced names.

## Fix choice: (a) per-app namespacing

Picked (a) over (b) smart-router and (c) delegated-routing because both sheets coexist on the same page — namespace separation is the cleanest contract (each renderer's onclick targets its own function, no runtime renderer-detection). (c) would be the principled long-term cleanup but is a bigger diff than this focused bugfix warrants.

## Tasks / Subtasks

- [x] Task 1 — suite/sheet.js: 5 `onclick="toggleDisc(...)"` → `onclick="suiteToggleDisc(...)"` (disciplines / devotions / rites / rituals / standing-merit drawers).
- [x] Task 2 — suite/sheet-helpers.js: `expRow` emits `suiteToggleExp`; window self-exposure changed from the collision-causing `window.toggleExp`/`window.toggleDisc` to `window.suiteToggleExp`/`window.suiteToggleDisc`.
- [x] Task 3 — Source-contract vitest pinning the binding (no unprefixed onclick in suite/sheet.js; namespaced window exposure; suite-convention IDs intact).

No app.js change needed — it already exposes `window.suiteToggleDisc`/`window.suiteToggleExp`; the bug was purely the suite onclick calling the unprefixed names.

## Acceptance Criteria

1. Suite disc-power chevron expands the drawer — ✅ structural (onclick → suiteToggleDisc, exposed)
2. Click again collapses — ✅ (toggleDisc toggles the visible class)
3. Devotions / rites / rituals / pacts / merits — ✅ (the 5 suiteToggleDisc sites cover the drawer types; merit info rows via expRow now use suiteToggleExp; editor-rendered merit blocks use the editor toggleExp which shares the exp-row convention and is correctly bound)
4. Editor sheet unchanged — ✅ (window.toggleExp/toggleDisc still editor versions; admin + player.html untouched)
5. No console errors — ✅ (both globals defined)
6. ≥1 vitest binding contract — ✅ 5 cases

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Ptah / DEV)

### Completion Notes List

- **Issue's "dead import" analysis was slightly off.** It claimed app.js:101's suite-toggle imports were "never exposed to window" — but app.js DOES expose them via the Object.assign at 1183-1184. The actual bug was the suite onclick strings calling the unprefixed `toggleDisc`/`toggleExp` (which app.js binds to the EDITOR versions). Fix = correct the onclick names; app.js needs no change.
- **Removed the collision-causing lines in sheet-helpers.** `window.toggleExp = toggleExp` / `window.toggleDisc = toggleDisc` at module load were always going to be clobbered by app.js's editor binding — pointless and misleading. Changed to `window.suiteToggleExp`/`window.suiteToggleDisc` so sheet-helpers self-exposes the namespaced globals (defensive — works even if app.js's Object.assign is ever refactored).
- **Source-contract test** rather than a behavioural one because the toggle functions are browser-only (DOM + window). The test greps for the binding contract: no unprefixed onclick in suite/sheet.js, namespaced window exposure, suite-convention IDs intact. Catches any regression that reverts the namespace.
- **Worktree pattern continued.**

### File List

- `public/js/suite/sheet.js` (modified) — 5 disc-row onclick → suiteToggleDisc
- `public/js/suite/sheet-helpers.js` (modified) — expRow onclick → suiteToggleExp; window exposure namespaced
- `server/tests/suite-chevron-binding-433.test.js` (new) — 5 source-contract cases
- `specs/stories/issue-433-suite-chevron-expand-bug.story.md` — this file

### Change Log

- 2026-05-20 (Ptah): suite chevron binding fix
