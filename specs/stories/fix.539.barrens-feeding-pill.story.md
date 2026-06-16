# Story fix.539: Barrens feeding pill unclickable — _terrGridVal ignores legacy-key fallback

## Status: review

## Issue
[#539](https://github.com/angelusvmorningstar/TerraMortis/issues/539) — fix: Barrens feeding pill unclickable — _terrGridVal ignores legacy-key fallback

## Branch
`ms/issue-539-barrens-pill-legacy-key`

---

## Story

**As a** player filling in the Feeding section of the downtime form,
**I want** to be able to select "The Barrens" as my feeding territory,
**so that** my submission accurately reflects where my character hunted.

---

## Background

### Root cause (confirmed by code trace)

`_terrGridVal` (`downtime-form.js:136`) accepts three parameters — `grid`, `displayName`, and `legacyKey` — but `legacyKey` is never used:

```js
function _terrGridVal(grid, displayName, legacyKey) {
  if (!grid) return undefined;
  const oid = _terrOidForName(displayName);
  if (oid && grid[oid] !== undefined) return grid[oid];
  return undefined;  // legacyKey is ignored — bug
}
```

All six territory pills are rendered by `renderFeedingTerritoryPills()`. For each pill, `_terrGridVal` is called to restore a saved selection. For the five real territories (Academy, Harbour, Dockyards, Second City, North Shore), `_terrOidForName` resolves a MongoDB `_id` string, the OID branch succeeds, and the saved value is returned correctly.

**The Barrens is not a real MongoDB territory document** — it has no `_id` in `_territories`. So `_terrOidForName('The Barrens')` returns `null`, the OID branch is skipped, and `_terrGridVal` returns `undefined` regardless of what is stored in the grid.

### What happens when a player clicks The Barrens

1. Click handler fires, updates hidden input `feed-val-the_barrens` to `'barrens'`.
2. `collectResponses()` writes `gridVals['the_barrens'] = 'barrens'` (because `_terrOidMap.get('The Barrens')` is also `null`, the save correctly falls back to the legacy slug key).
3. `renderForm(container)` re-renders the feeding section.
4. On re-render, `_terrGridVal(gridVals, 'The Barrens', 'the_barrens')` is called. OID path fails (no `_id`), legacy-key path is never reached → returns `undefined`.
5. `savedVal` falls to `'none'`, `isActive = false`. The pill re-renders as unselected.

The result is a selection that visually snaps back immediately — the pill is effectively unclickable.

The same function is called for rote territory pills (`renderFeedingTerritoryPills(..., true, ...)`), so Barrens is also broken in the rote-feed path.

---

## Acceptance Criteria

- [x] Clicking The Barrens pill selects it and it stays visually selected after re-render
- [x] Clicking a selected Barrens pill deselects it
- [x] Selecting The Barrens clears any other active feeding territory pill (existing single-select logic is unchanged)
- [x] Saving a submission with The Barrens selected persists `{ "the_barrens": "barrens" }` in `feeding_territories`
- [x] No regression on the five OID-keyed territory pills (OID path still hit first, legacy path is a fallback only)
- [x] Rote-feed Barrens pill works the same way (same function, same fix)

---

## Scope

**In scope**: One-line fix to `_terrGridVal` in `downtime-form.js`. Both the main-feed and rote-feed paths use this function so both are fixed by the same change.

**Out of scope**:
- Backfilling existing submissions that already lost a Barrens selection
- Adding The Barrens as a real territory document in MongoDB
- Any other OID-migration work (tracked separately under issue #496)

---

## Dev Notes

### File to change

**`public/js/tabs/downtime-form.js`** — `_terrGridVal()`, lines 136–141.

### Exact change

```js
// BEFORE (lines 136–141):
function _terrGridVal(grid, displayName, legacyKey) {
  if (!grid) return undefined;
  const oid = _terrOidForName(displayName);
  if (oid && grid[oid] !== undefined) return grid[oid];
  return undefined;
}

// AFTER — add the legacy-key fallback before the final return:
function _terrGridVal(grid, displayName, legacyKey) {
  if (!grid) return undefined;
  const oid = _terrOidForName(displayName);
  if (oid && grid[oid] !== undefined) return grid[oid];
  if (legacyKey && grid[legacyKey] !== undefined) return grid[legacyKey];
  return undefined;
}
```

That is the complete change. One line added.

### Why this is safe for all territories

- For Academy, Harbour, Dockyards, Second City, North Shore: `_terrOidForName` returns a non-null OID, the OID branch returns on the first `if`, and the new line is never reached.
- For The Barrens: OID branch misses → new line checks `grid['the_barrens']` → returns `'barrens'` (or `'none'`) as saved.
- The function's contract is unchanged: still returns the saved value or `undefined`.

### What NOT to change

- The click handler (lines 3112–3141) — correct
- `collectResponses()` Barrens save path (lines 503–510) — already writes to `the_barrens` slug correctly
- `_terrOidForName` — correct
- `renderFeedingTerritoryPills` render logic — correct
- No server changes needed

### Test manually

1. Open the player Downtime form for any character (use `localTestLogin()` locally or test on dev).
2. Expand the Feeding section.
3. Click **The Barrens** pill → it should become selected (highlighted) and stay selected.
4. Click it again → it should deselect.
5. Select The Barrens, then click another territory → The Barrens should deselect and the new pill should become active.
6. Select The Barrens and save/draft the form → check the submission document in MongoDB or the admin processing view; `feeding_territories` should contain `{ ..., "the_barrens": "barrens" }`.
7. Confirm The Academy, Harbour, Dockyards, Second City, and North Shore pills still work normally (select/deselect/persist).

---

## Dev Agent Record

### File List
- `public/js/tabs/downtime-form.js` — modified (`_terrGridVal`, line 139: added legacy-key fallback)

### Change Log
- 2026-06-02: Added `if (legacyKey && grid[legacyKey] !== undefined) return grid[legacyKey];` to `_terrGridVal` before the final `return undefined`. Fixes The Barrens feeding pill losing its selection on every re-render.

### Completion Notes
One line added to `_terrGridVal` at `downtime-form.js:139`. The OID path is unchanged and takes priority; the new line only fires when OID lookup returns null (i.e., The Barrens). Both the main-feed and rote-feed paths call this function, so both are fixed by the same change. No server changes, no schema changes.
