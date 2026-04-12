# Story Fix.1: Theban/Cruac Always Out-of-Clan — Dead Code Cleanup

## Status: done

## Story

**As an** ST using the admin character editor and audit tool,
**I want** Cruac and Theban to be consistently treated as out-of-clan disciplines everywhere in the codebase,
**so that** CP budgets, XP costs, and audit results are correct for all characters regardless of covenant membership.

## Background

Commit `90d41a7` introduced the house rule that Cruac and Theban always cost 4 XP/dot regardless of covenant (Circle of the Crone and Lancea et Sanctum previously got them at 3 XP/dot as "in-clan"). The same commit removed sorcery theme rows (Creation, Destruction, Divination, Protection, Transmutation) from the Blood Sorcery display.

However, that commit only fixed the XP cost in `edit.js`'s dot-recalculation and the Blood Sorcery display in `sheet.js`. Three problems remain:

1. **`isInClanDisc()` in `accessors.js` still returns `true` for Cruac+CotC and Theban+LeS.** This function is used by the audit tool CP budget, the creation CP panel in `sheet.js`, and the CP enforcement logic in `edit.js`. As a result, a CotC character with Cruac CP is incorrectly shown as "in-clan" in the budget display and the audit's discipline CP check, producing wrong counts.

2. **Dead SORCERY_THEMES code throughout the codebase.** The `SORCERY_THEMES` constant is now `[]` in both `constants.js` and `suite/data.js`, but multiple files still import it and branch on `SORCERY_THEMES.includes(...)` -- all of which are permanently false. This is misleading noise.

3. **Stale comments and inline SORCERY_THEMES sets.** `edit.js` declares a local `new Set([5 theme names])` and `sheet.js` declares local `THEMES`/`THEMES_SET` arrays inline. These carry the theme names that no longer exist in any character's data.

No characters have theme discipline data (Creation, Destruction, Divination, Protection, Transmutation dots/CP/XP are zero across all 31 characters), so no data migration is required.

## Acceptance Criteria

1. `isInClanDisc(c, 'Cruac')` and `isInClanDisc(c, 'Theban')` return `false` for all characters regardless of covenant
2. The creation CP budget panel in the editor correctly counts Cruac/Theban CP under "Out-of-clan" (never "In-clan") for CotC/LeS characters
3. The CP enforcement logic in `edit.js` correctly caps Cruac/Theban CP at the out-of-clan limit (max 1) for CotC/LeS characters
4. The audit tool's discipline CP check counts Cruac/Theban CP as out-of-clan
5. All dead `SORCERY_THEMES`-related branches and local sets are removed from: `edit.js`, `sheet.js`, `audit.js`, `app.js`, `suite/sheet.js`, `suite/sheet-helpers.js`, `editor/merits.js`, `shared/pools.js`, `suite/import.js`, `editor/csv-format.js`
6. `SORCERY_THEMES` export removed from `constants.js` and `suite/data.js` once all import references are cleared
7. Stale comments about "Cruac/Theban as in-clan for CotC/LeS" updated to reflect the always-out-of-clan rule
8. No regressions: existing characters render correctly in sheet view, editor, and audit panel

## Tasks / Subtasks

- [ ] Task 1: Fix `isInClanDisc()` root rule in `accessors.js` (AC: 1, 2, 3, 4)
  - [ ] Remove lines 24-26 from `isInClanDisc()` that return `true` for `Cruac`+`crone` and `Theban`+`lancea`
  - [ ] Update JSDoc comment (remove "Per VtR 2e ritual sorceries treated as in-clan" paragraph; replace with "Cruac and Theban are always out-of-clan regardless of covenant per house rule")
  - [ ] Verify: `isInClanDisc(cotcChar, 'Cruac')` now returns `false`

- [ ] Task 2: Clean up `public/js/editor/edit.js` (AC: 3, 5, 7)
  - [ ] Remove inline `const SORCERY_THEMES = new Set([...5 theme names...])` declaration (line ~380)
  - [ ] Remove `SORCERY_THEMES.has(d)` filter conditions in the CP budget enforcement block (lines ~381, ~386, ~391) -- these filtered themes from CP rebalancing, which is now moot since themes don't exist
  - [ ] Update comment at line ~383 to remove reference to "covenant rituals"; Cruac/Theban are now always out-of-clan so no special case needed in CP logic
  - [ ] The `discCostMult` override at line ~402 (`disc === 'Cruac' || disc === 'Theban' ? 4 : isInClanDisc(...)`) can be simplified now that `isInClanDisc` returns false for both -- simplify to just `isInClanDisc(c, disc) ? 3 : 4`

- [ ] Task 3: Clean up `public/js/editor/sheet.js` (AC: 2, 5, 7)
  - [ ] Inside `renderDiscEditRow()`: remove `THEME_SET` declaration and the `freeMark` condition that skips free-dot highlights for themes (line ~333-334) -- simplify `freeMark` to just `cr.free > 0 ? ' has-free-dots' : ''`
  - [ ] In the edit-mode discipline section: remove `THEMES`/`THEMES_SET` declarations (lines ~342-343)
  - [ ] Remove `THEMES_SET.has(d)` filters from the `iCP`/`oCP` budget accumulators (lines ~348, ~351) -- now that isInClanDisc returns false for Cruac/Theban, they naturally fall into oCP without any explicit exclusion
  - [ ] Update stale comment at lines ~344-346 (remove "Cruac/Theban count as in-clan for CotC/LeS members per VtR 2e Blood & Smoke")
  - [ ] Remove `SORCERY_THEMES` from the `import` statement at line 6 of `sheet.js`

- [ ] Task 4: Clean up `public/js/data/audit.js` (AC: 4, 5)
  - [ ] Remove local `SORCERY_THEMES` declaration and `EXCLUDE_FROM_BUDGET` set (lines ~103-104)
  - [ ] Remove `if (EXCLUDE_FROM_BUDGET.has(d)) continue;` in the CP budget loop (line ~107)
  - [ ] Remove `SORCERY_THEME_SET` alias and `if (SORCERY_THEME_SET.has(d)) continue;` in the free-dots audit section (lines ~249, ~262)
  - [ ] Update surrounding comments (remove "Sorcery themes excluded..." notes)

- [ ] Task 5: Clean up `public/js/app.js` (AC: 5)
  - [ ] Remove `const SORCERY_THEMES = [];` declaration (line ~366)
  - [ ] Remove the `if (SORCERY_THEMES.includes(disc)) disc = disc + ' (Sorcery)';` branch (lines ~370-372)

- [ ] Task 6: Clean up `public/js/suite/sheet.js` (AC: 5)
  - [ ] Remove `themeDiscs` filter (line ~307): `const themeDiscs = discEntries.filter(([d]) => SORCERY_THEMES.includes(d));`
  - [ ] Remove `themeDiscs` render block in Blood Sorcery section (lines ~338-344): the `if (themeDiscs.length)` block and `themeDiscs.forEach(...)` call
  - [ ] Update comment at line ~338 to remove "(Cruac, Theban, then themes)"
  - [ ] Remove `SORCERY_THEMES` from the `import` statement

- [ ] Task 7: Clean up `public/js/suite/sheet-helpers.js` (AC: 5)
  - [ ] Remove `SORCERY_THEMES` from import (line 7)
  - [ ] Remove `if (SORCERY_THEMES.includes(discName))` branch (lines ~90-95) and the code inside it

- [ ] Task 8: Clean up `public/js/editor/merits.js` (AC: 5)
  - [ ] Remove `SORCERY_THEMES` from import (line 8)
  - [ ] Remove `if (SORCERY_THEMES.includes(discName))` branch (line ~395) and the `allSorcery` and `SORCERY_THEMES.includes(key...)` checks (lines ~410, ~415)

- [ ] Task 9: Clean up `public/js/shared/pools.js` (AC: 5)
  - [ ] Remove `SORCERY_THEMES` from import (line 3)
  - [ ] Remove `isSorceryTheme()` function (lines ~14-20) -- themes no longer exist, regex never matches
  - [ ] Remove the `isSorceryTheme()` call and its `if (theme)` block in pool resolution (lines ~40-49)

- [ ] Task 10: Clean up `public/js/suite/import.js` (AC: 5)
  - [ ] Remove theme names from `DISC_NAMES` array (line ~160): remove `'Creation', 'Destruction', 'Divination', 'Protection', 'Transmutation'`

- [ ] Task 11: Clean up `public/js/editor/csv-format.js` (AC: 5)
  - [ ] Remove `SORCERY_THEMES` from import (line 14)
  - [ ] Remove theme column name literals from the CSV column array (line ~106): `'Creation', 'Destruction', 'Divination', 'Protection', 'Transmutation'`
  - [ ] Remove the `for (const d of SORCERY_THEMES)` loop (line ~288) -- it's an empty loop

- [ ] Task 12: Remove `SORCERY_THEMES` export from constants (AC: 6)
  - [ ] Remove `export const SORCERY_THEMES = [];` from `public/js/data/constants.js` (line ~121)
  - [ ] Remove `export const SORCERY_THEMES = [];` from `public/js/suite/data.js` (line ~17)

## Dev Notes

### Architecture
- No test framework. Verify in-browser manually after each task group.
- All file paths relative to repo root.
- British English in any user-facing strings.
- No em-dashes in output text.

### Change impact by task

**Task 1 is the root fix.** All downstream tasks are dead-code cleanup -- they are independent of each other and can be done in any order, but Task 1 must come first since it changes the behaviour that the other files rely on.

After Task 1, the editor CP panel (`sheet.js`) and audit tool will automatically produce correct results because `isInClanDisc` now returns false for Cruac/Theban -- the existing `iCP`/`oCP` accumulator logic in both files will correctly bin them as out-of-clan without any further change needed. Tasks 2 and 3 are then purely cosmetic/cleanup.

### Key file locations

| File | Lines of interest |
|------|-------------------|
| `public/js/data/accessors.js` | `isInClanDisc()` lines 21-28 |
| `public/js/editor/edit.js` | `shEditDiscPt()` lines ~375-405 |
| `public/js/editor/sheet.js` | `renderDiscEditRow()` lines ~330-339; edit-mode disc section lines ~340-362 |
| `public/js/data/audit.js` | CP budget lines ~97-124; free-dots audit lines ~238-278 |
| `public/js/app.js` | lines ~364-373 |
| `public/js/suite/sheet.js` | disc section lines ~305-345 |
| `public/js/suite/sheet-helpers.js` | disc name helper lines ~87-95 |
| `public/js/editor/merits.js` | disc prerequisite check lines ~393-416 |
| `public/js/shared/pools.js` | `isSorceryTheme()` lines ~14-49 |
| `public/js/suite/import.js` | `DISC_NAMES` line ~160 |
| `public/js/editor/csv-format.js` | column list line ~106; SORCERY_THEMES loop line ~288 |
| `public/js/data/constants.js` | `SORCERY_THEMES` export line ~121 |
| `public/js/suite/data.js` | `SORCERY_THEMES` export line ~17 |

### Characters with Cruac/Theban
No characters have theme (Creation/Destruction/etc) data. Several CotC characters have Cruac dots and some LeS characters have Theban dots -- these render correctly since the Blood Sorcery display was already fixed in commit 90d41a7. The only change they will see is that the creation CP panel now correctly bins their Cruac/Theban CP under "Out-of-clan" instead of "In-clan".

### Manual verification checklist
After implementation, open admin.html and check these characters:
- A Circle of the Crone character with Cruac (e.g. any CotC character): verify creation CP panel shows Cruac CP under "Out-of-clan", Blood Sorcery still renders correctly
- A Lancea et Sanctum character with Theban: same check
- Open the audit panel for those characters: verify no false errors from the CP budget check
- Verify suite sheet (index.html) renders Cruac/Theban characters correctly with no theme rows

---

## Dev Agent Record

### Implementation Plan
_To be filled by dev agent_

### Debug Log
_To be filled by dev agent_

### Completion Notes
_To be filled by dev agent_

## File List
_To be filled by dev agent_

## Change Log
_To be filled by dev agent_
