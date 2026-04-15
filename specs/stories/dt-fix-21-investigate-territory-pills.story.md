# Story DT-Fix-21: Investigate Action — Territory Pills for Project-Based Actions

## Status: done

## Story

**As an** ST processing a project-based Investigate action,
**I want** to be able to target both individual characters and specific territories,
**so that** I can record whether the investigation was directed at a person or a location without using workarounds.

## Background

The Investigate action type appears in both project-based and merit-based contexts. The two currently differ:

- **Merit-based Investigate** (e.g. Allies): already renders TERR. pills (—, Academy, Harbour, Dockyards, N.Shore, 2nd City) via the `isAlliesAction` pill block at line ~5920
- **Project-based Investigate**: only renders a TARGET character selector — no territory pills at all

Project-based investigations can target individuals (characters) or locations (territories). The territory target is missing from the project-based flow. The character target is being converted from a dropdown to a radio list in DT-Fix-19.

Territory pills default to empty/neutral (the `—` pill is selected, meaning no territory targeted). This is different from feeding, where `—` means Barrens. For investigate, `—` simply means the investigation is not territory-specific.

---

## Acceptance Criteria

1. Project-based Investigate action rows show TERR. pills (—, Academy, Harbour, Dockyards, N.Shore, 2nd City) after the character Target selector.
2. Pills default to `—` (empty/neutral — no territory) on first render.
3. Selecting a territory pill saves to `sub.st_review.territory_overrides[String(entry.actionIdx)]` (same field pattern as other project actions).
4. The pill selection persists on re-render.
5. The territory pills are visually consistent with those on merit-based investigate actions and other action types.
6. Merit-based investigate territory pills are unaffected.

---

## Tasks / Subtasks

- [x] Task 1: Add territory pills to project-based Investigate block (`downtime-views.js`)
  - [x] 1.1: In `_renderActionTypeRow` (line ~5818), inside the `if (actionType === 'investigate')` block (lines 5840–5849), after the closing tag of the Target selector (after `h += '</select>';`), add:
    ```js
    // Add territory pills for project-based investigate (not merit)
    if (!isMerit) {
      const _invSub = submissions.find(s => s._id === entry.subId);
      const _invCtx = String(entry.actionIdx);
      const _invTid = _invSub?.st_review?.territory_overrides?.[_invCtx] || '';
      h += _renderInlineTerrPills(entry.subId, _invCtx, _invTid);
    }
    ```
  - [x] 1.2: No change needed to the existing `else if (!isMerit)` fallback block at line ~5886 — the `if (actionType === 'investigate')` block exits before reaching it.

---

## Dev Notes

### Key file

`public/js/admin/downtime-views.js` — single insertion of ~5 lines.

### `_renderInlineTerrPills` signature (line 4896)

```js
function _renderInlineTerrPills(subId, terrContext, currentTerrId, feedingSet = null)
```

- `subId`: `entry.subId`
- `terrContext`: `String(entry.actionIdx)` — same context string used for all other project actions
- `currentTerrId`: the currently saved territory ID, read from `st_review.territory_overrides[ctx]`, defaults to `''`
- `feedingSet`: omit (defaults to `null`) — single-select mode

### Territory storage pattern (consistent with existing project actions)

The selected territory is stored as:
```
sub.st_review.territory_overrides[String(entry.actionIdx)]
```

The existing territory pill click handler (line ~3398) already handles this save for all `terrContext` strings — no new handler needed.

### `isMerit` variable

`isMerit` is already in scope within `_renderActionTypeRow`. It's used in the surrounding conditionals (e.g. `hide_protect` block). Use it directly.

### DT-Fix-19 interaction

DT-Fix-19 replaces the Investigate TARGET dropdown with a radio list in this same block. These two changes both modify the `if (actionType === 'investigate')` block. Apply both changes in the same edit to avoid conflicts: first the radio list replacement, then the territory pills appended after it.

### Default `—` pill

Passing `currentTerrId = ''` (empty string) to `_renderInlineTerrPills` automatically activates the `—` pill (its `id` is `''`). No special handling needed.

### No CSS changes

All required CSS classes exist. The pills render identically to merit-based investigate and feeding territory rows.

### No test framework

Manual verification: open a project-based Investigate action — TERR. pills should appear after the Target selector. Click Academy — pill activates. Reload — pill persists. Open a merit Allies investigation — territory pills unaffected.

---

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Completion Notes List
- Inserted 6-line `if (!isMerit)` block after the closing `</div>` of the radio list container at line 5862 in `_renderActionTypeRow`, inside the `if (actionType === 'investigate')` branch.
- Uses `_renderInlineTerrPills(entry.subId, _invCtx, _invTid)` with `currentTerrId` defaulting to `''` so the `—` pill is active on first render.
- Territory storage follows the same `st_review.territory_overrides[String(entry.actionIdx)]` pattern as all other project actions — no new click handler needed.
- DT-Fix-19 radio list (already in place) is unaffected; this change appends pills after that list.

### File List
- `public/js/admin/downtime-views.js`

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-15 | 1.0 | Initial draft | Bob (SM) + Angelus |
