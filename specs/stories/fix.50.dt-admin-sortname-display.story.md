# Story fix.50: DT Admin — use sortName not displayName for character name display

**Story ID:** fix.50
**Epic:** Fixes
**Issue:** 270
**Issue URL:** https://github.com/angelusvmorningstar/TerraMortis/issues/270
**Branch:** morningstar-issue-270-admin-sortname-display
**Status:** done
**Date:** 2026-05-12

---

## User Story

As an ST using the Downtime admin panel, I want character names shown in lists, tables, and labels to display without the honorific prefix, so that I can identify characters quickly without visual noise from titles like "Lord" or "Lady".

---

## Background

`displayName(c)` returns `[honorific, moniker || name].filter(Boolean).join(' ')` — it prepends the honorific (Lord, Lady, Doctor, Sister, etc.). `sortName(c)` returns `c.moniker || c.name` — name or moniker only.

Both functions are defined in `public/js/data/helpers.js` and are already used in both target files for sorting. The fix is a mechanical substitution at the listed call sites only.

**Critical import note:** `downtime-views.js` already imports both `displayName` and `sortName`. `downtime-story.js` imports only `displayName` and `esc` — `sortName` must be added to its import line.

---

## Acceptance Criteria

- [x] All call sites listed in the Implementation section replaced with `sortName(c)` (or `c ? sortName(c) : fallback` where the pattern uses a ternary)
- [x] `downtime-story.js` import line updated to include `sortName`
- [x] Out-of-scope lines (listed below) are untouched
- [x] No change to sort order, checkbox state, save behaviour, or data structure — only the rendered label string changes

---

## Implementation

### File 1: `public/js/admin/downtime-story.js`

**Step 0 — Update import (line 14):**

Current:
```js
import { displayName, esc } from '../data/helpers.js';
```
Change to:
```js
import { displayName, sortName, esc } from '../data/helpers.js';
```

**Display call sites to change** (all `displayName` → `sortName`, preserving surrounding pattern):

| Line | Current | Change to |
|------|---------|-----------|
| `:400` | `return c ? displayName(c) : id` | `return c ? sortName(c) : id` |
| `:703` | `fChar ? displayName(fChar) : (s.character_name \|\| 'Unknown')` | `fChar ? sortName(fChar) : (s.character_name \|\| 'Unknown')` |
| `:1083` | `${char ? displayName(char) : 'Unknown'}` | `${char ? sortName(char) : 'Unknown'}` |
| `:1982` | `const charName = char ? displayName(char) : ''` | `const charName = char ? sortName(char) : ''` |
| `:2465` | `c ? displayName(c) : (s.character_name \|\| 'Unknown')` | `c ? sortName(c) : (s.character_name \|\| 'Unknown')` |
| `:2648` | `char ? displayName(char) : (s.character_name \|\| 'Unknown')` | `char ? sortName(char) : (s.character_name \|\| 'Unknown')` |
| `:2672` | `const charName = displayName(char)` | `const charName = sortName(char)` |
| `:4049` | `char ? displayName(char) : (sub?.character_name \|\| 'Unknown')` | `char ? sortName(char) : (sub?.character_name \|\| 'Unknown')` |

**Out of scope — do NOT change in `downtime-story.js`:**

| Line | Reason |
|------|--------|
| `:439` (`_compactCharHeader`) | Manually prepends `char.honorific` then calls `displayName` — likely a double-honorific bug, tracked separately |
| `:2388` | `displayName(c) === s.character_name` — name-lookup string comparison; stored value was set using `displayName`, changing would break lookups |
| `:2435` | `regentName` used in narrative territory output |
| `:2929` | AI prompt line: `Character: ${char ? displayName(char) : 'Unknown'}` — honorific provides narrative context for the LLM |
| `:2939` | AI prompt line: `what ${char ? displayName(char) : 'the character'} heard` — same reason |
| `:3152` | `leadName` used in narrative story context |

---

### File 2: `public/js/admin/downtime-views.js`

No import change needed — `sortName` is already imported at line 12.

**Display call sites to change:**

| Line | Current | Change to |
|------|---------|-----------|
| `:802` | `return c ? displayName(c) : id` | `return c ? sortName(c) : id` |
| `:993` | `name: displayName(c)` | `name: sortName(c)` |
| `:1052` | `errors.push({ name: displayName(c), ... })` | `name: sortName(c)` |
| `:1968` | `${esc(displayName(c))}` in Maintenance Audit `<td>` | `${esc(sortName(c))}` |
| `:2014` | `(char ? displayName(char) : null) \|\| sub.character_name \|\| 'Unknown'` | `(char ? sortName(char) : null) \|\| sub.character_name \|\| 'Unknown'` |
| `:2128` | `charName: (char ? displayName(char) : null) \|\| sub.character_name \|\| 'Unknown'` | `charName: (char ? sortName(char) : null) \|\| sub.character_name \|\| 'Unknown'` |
| `:2348` | `(char ? displayName(char) : null) \|\| sub.character_name \|\| 'Unknown'` | `(char ? sortName(char) : null) \|\| sub.character_name \|\| 'Unknown'` |
| `:2510` | `${esc(displayName(c))}` in Early Access toggle label | `${esc(sortName(c))}` |
| `:2657` | `c ? displayName(c) : \`${id} (unresolved)\`` | `c ? sortName(c) : \`${id} (unresolved)\`` |
| `:2854` | `return c ? displayName(c) : id` | `return c ? sortName(c) : id` |
| `:3129` | `return c ? displayName(c) : \`${id} (unresolved)\`` | `return c ? sortName(c) : \`${id} (unresolved)\`` |
| `:3209` | `return c ? displayName(c) : ''` | `return c ? sortName(c) : ''` |
| `:8836` | `char ? displayName(char) : (sub.character_name \|\| 'Unknown')` | `char ? sortName(char) : (sub.character_name \|\| 'Unknown')` |
| `:9783` | `${esc(displayName(char))}` in Scene table `<td>` | `${esc(sortName(char))}` |
| `:9959` | `${esc(displayName(char))}` in Action Matrix `<td>` | `${esc(sortName(char))}` |
| `:10160` | `name: displayName(c)` in sphere data object | `name: sortName(c)` |
| `:10231` | `feeding[displayName(char)] = entries` (object key) | `feeding[sortName(char)] = entries` |
| `:10294` | `regent: regentChar ? displayName(regentChar) : null` | `regent: regentChar ? sortName(regentChar) : null` |
| `:10317` | `const cn = displayName(c)` | `const cn = sortName(c)` |

**All other `displayName` calls in `downtime-views.js` are out of scope** — this file is large; do not touch any call site not listed above.

---

## Verification

After making changes, search for remaining `displayName` in both files to confirm only the expected out-of-scope lines remain:

```
grep -n "displayName" public/js/admin/downtime-story.js
grep -n "displayName" public/js/admin/downtime-views.js
```

Expected remaining lines in `downtime-story.js`: 439, 2388, 2435, 2929, 2939, 3152 (and the import line itself if `displayName` is still needed elsewhere — verify before removing it from the import).

Expected remaining lines in `downtime-views.js`: line 12 (import), line 627 (comment only — leave as-is).

---

## Scope Notes

- **In scope**: `public/js/admin/downtime-views.js`, `public/js/admin/downtime-story.js` — listed display call sites only
- **Out of scope**: `public/js/tabs/downtime-form.js`, any other file not listed above
- **No schema, API, or data-structure changes** — purely a render-label substitution
