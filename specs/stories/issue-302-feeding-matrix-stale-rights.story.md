---
id: issue-302
issue: 302
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/302
branch: morningstar-issue-302-feeding-matrix-stale-rights
epic: feat
status: done
priority: high
type: bug
depends_on: []
---

# Story Issue-302: Feeding Matrix + Action Panel — Stale Rights After Regent Grants Access

As a Storyteller processing Downtime 3,
I want the feeding matrix and action-panel mismatch check to reflect the current territory feeding rights,
So that a character granted rights by a regent is correctly shown as feeding (O), not poaching (X).

---

## Background

When a regent updates a territory's feeding rights via the City tab and the player resubmits their downtime, both the admin feeding matrix and the action-panel mismatch warning still show the character as poaching. Root cause: `saveFeedingRights()` in `city-views.js` does not call `invalidateCachedTerritories()` after persisting, so `cachedTerritories` remains stale. The ambience save and lieutenant save both call `invalidateCachedTerritories()` — this save path missed it.

Observed in Downtime 3: Ivana Horvat, North Shore territory.

---

## Acceptance Criteria

### AC1 — Matrix shows O after rights granted

**Given** a regent saves updated feeding rights (adds a character to a territory via the City tab)
**When** DT Processing mode next renders the feeding matrix
**Then** that character's cell shows **O** (fed with rights), not X (poaching), for that territory.

### AC2 — Mismatch warning suppressed

**Given** a player's submission has `feeding_rights` for a territory
**And** that character is listed in the territory's `feeding_rights` array
**When** the admin opens the feeding action panel for that submission
**Then** the warning "Claims feeding rights in … — not on Regent's list" does **not** appear.

### AC3 — No regression on other territory saves

**Given** the ambience save and lieutenant/regent save already correctly call `invalidateCachedTerritories()`
**Then** those paths are untouched and continue to work.

---

## Tasks

- [x] **Task 1** — Add `invalidateCachedTerritories()` to `saveFeedingRights()` success path
  - In `public/js/admin/city-views.js`, after line 609 (`terrDocs[idx] = { ...terrDocs[idx], feeding_rights: rights };`), add `invalidateCachedTerritories();`
  - Pattern to follow: `saveTerrAmbience()` at line 678, `saveTerritory()` at line 705.

---

## Dev Notes

### The fix — one line

```js
// public/js/admin/city-views.js — saveFeedingRights(), after terrDocs cache update

async function saveFeedingRights(terrId) {
  const status = document.getElementById('terr-feed-status-' + terrId);
  const rights = _feedingEdits[terrId] || [];
  try {
    const doc = terrDocs.find(d => d.slug === terrId);
    if (!doc?._id) throw new Error('Territory not loaded yet');
    const terrNameF = TERRITORIES.find(t => t.id === terrId)?.name || terrId;
    await apiPost('/api/territories', { _id: String(doc._id), name: terrNameF, feeding_rights: rights });
    // Update local cache
    const idx = terrDocs.findIndex(d => d.slug === terrId);
    if (idx >= 0) terrDocs[idx] = { ...terrDocs[idx], feeding_rights: rights };
    invalidateCachedTerritories();                    // ← ADD THIS LINE
    if (status) { status.textContent = 'Saved'; setTimeout(() => { if (status) status.textContent = ''; }, 2000); }
  } catch (err) {
    if (status) status.textContent = 'Failed: ' + err.message;
  }
}
```

### Why this works

`invalidateCachedTerritories()` (defined at `downtime-views.js:3545`) sets `cachedTerritories = null`. The next call to `loadCachedTerritories()` (`downtime-views.js:3549`) re-fetches from `/api/territories`, so the new `feeding_rights` array is live.

Both the matrix (`_buildMatrixTableHtml`, `downtime-views.js:9968`) and the mismatch check (`downtime-views.js:7976`) read from `cachedTerritories`. Once the cache is invalidated, the next render of either surface picks up the updated rights.

### What NOT to change

- `saveTerrAmbience()` (line 660) — already calls `invalidateCachedTerritories()`. Do not touch.
- `saveTerritory()` (line 687) — already calls `invalidateCachedTerritories()`. Do not touch.
- `downtime-views.js` — no changes needed. The cache invalidation mechanism already handles the matrix and mismatch check.
- `downtime-form.js` — no changes needed. The #297 fix (player-side stale poaching upgrade) is a separate surface.

### Import check

`invalidateCachedTerritories` is already imported at `city-views.js:13`:
```js
import { invalidateCachedTerritories } from './downtime-views.js';
```
No import change needed.

### No test framework

This project has no automated test suite. Verify manually:
1. Open admin app, go to City tab.
2. Expand a territory, add a character to Feeding Rights, click Save.
3. Switch to DT Processing mode for the active cycle.
4. Confirm the feeding matrix shows O (not X) for that character on that territory.
5. Open the character's feeding action panel — confirm no mismatch warning fires.

---

## Files Expected to Change

- `public/js/admin/city-views.js` — added `invalidateCachedTerritories()` at line 610.

**No other files changed.**

---

## Dev Agent Record

### Completion Notes

Added `invalidateCachedTerritories()` at `city-views.js:610`, inside `saveFeedingRights()` success path, immediately after the local `terrDocs` cache update. Import already present at line 13. The two parallel save functions (`saveTerrAmbience` and `saveTerritory`) were left untouched — they already called the invalidation correctly.

No automated tests exist in this project; verification is manual (see Dev Notes).

### Change Log

- 2026-05-14: Added `invalidateCachedTerritories()` to `saveFeedingRights()` success path in `public/js/admin/city-views.js` (line 610). Closes #302.

---

## Definition of Done

- `invalidateCachedTerritories()` is called inside `saveFeedingRights()` after the `terrDocs` local cache update.
- Manual verification: matrix shows O after rights saved; mismatch warning absent.
- No regressions in ambience save or regent/lieutenant save paths.
- `specs/stories/sprint-status.yaml` updated to `done`.
