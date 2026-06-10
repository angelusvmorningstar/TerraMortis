# Story fix.667: Feeding Confirm Should Write Influence to tracker_state, Not localStorage

## Status: review

---
issue: 667
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/667
branch: ms/issue-667-feeding-confirm-influence-tracker
---

## Story

**As an** ST confirming a player's feeding result,
**I want** the post-feeding influence value to be persisted to MongoDB,
**so that** the game tracker displays the correct influence on all devices without manual correction.

## Background

When an ST confirms a feeding roll in the feeding tab, the handler writes vitae to `tracker_state` via `PUT /api/tracker_state/:id` but writes influence only to `localStorage`. The canonical game tracker (`game/tracker.js`) reads influence exclusively from the API (`remote.influence` at `ensureLoaded():100`) — so the localStorage write is silently ignored. At every tracker reload, influence reverts to the character's full max.

The fix is a one-line change to the PUT body plus removal of the now-redundant `loc.inf` localStorage write. The WS broadcast (`broadcastTrackerUpdate`) already fires on every PUT and patches all connected clients automatically — no additional plumbing is needed for AC-2.

## Acceptance Criteria

- [ ] Given ST confirms a feeding result with a non-max influence value, the `PUT /api/tracker_state/:id` request body includes `influence: infAfter`
- [ ] The game tracker display reflects the updated influence value without a page reload (via existing WS broadcast)
- [ ] The `loc.inf` localStorage write is removed; `loc.vitae_confirmed` is preserved (still used by `trackerAdj` for manual-override logic)

## Tasks / Subtasks

- [ ] Task 1: Fix the PUT body in `public/js/tabs/feeding-tab.js`
  - [ ] Change line 933 from `{ vitae: n }` to `{ vitae: n, influence: infAfter }`
  - [ ] Remove `loc.inf = infAfter;` (line 939) from the localStorage write block
  - [ ] Leave `loc.vitae_confirmed = n;` intact — it is read by `trackerAdj` (line 214 of tracker.js) to clear confirmed vitae when the ST manually adjusts

- [ ] Task 2: Update existing Playwright test in `tests/feat-16-17-fix44-tracker-feeding.spec.js`
  - [ ] In the `'confirm button sends vitae PUT to tracker_state API'` test (~line 753): add assertion `expect(trackerPutBody).toHaveProperty('influence')` alongside the existing `vitae` check
  - [ ] Update or replace the localStorage `inf` test (~line 841-862): after the fix `parsed.inf` will no longer be present; the test should instead verify the API body contained `influence` (merge with the PUT test, or assert `!parsed.inf`)

---

## Dev Notes

### Exact change — feeding-tab.js

**Before (line 933):**
```js
await apiPut('/api/tracker_state/' + charId, { vitae: n });
// Also write to localStorage so game app tracker picks it up without tab navigation
try {
  const key = 'tm_tracker_local_' + charId;
  const loc = JSON.parse(localStorage.getItem(key) || '{}');
  loc.vitae_confirmed = n;
  loc.inf = infAfter;           // ← THIS goes to API instead
  localStorage.setItem(key, JSON.stringify(loc));
} catch { /* ignore */ }
```

**After:**
```js
await apiPut('/api/tracker_state/' + charId, { vitae: n, influence: infAfter });
try {
  const key = 'tm_tracker_local_' + charId;
  const loc = JSON.parse(localStorage.getItem(key) || '{}');
  loc.vitae_confirmed = n;      // ← KEEP — used by trackerAdj line 214
  // loc.inf removed — now persisted to API
  localStorage.setItem(key, JSON.stringify(loc));
} catch { /* ignore */ }
```

The `infAfter` variable is computed just above this block at line 928:
```js
const infAfter = infEl ? Math.max(0, parseInt(infEl.textContent) || 0) : infMax;
```
It is already in scope — no additional variable needed.

### Why AC-2 (no page reload) is already satisfied

The server's `broadcastTrackerUpdate(raw, updates)` fires inside the PUT handler (`server/routes/tracker.js:44`) for every successful write. The WS client (`public/js/data/ws.js:117-147`) receives the frame, patches `current.inf` in the tracker cache via `FIELD_MAP = { influence: 'inf' }` (line 133), then calls `refreshTrackerCard(charId)` via the `onTrackerUpdate` callback registered in `app.js:1342-1346`. The tracker card re-renders with the new influence value. No additional code is needed.

### Why loc.vitae_confirmed must be kept

`trackerAdj` in `public/js/game/tracker.js:212-218` reads `loc.vitae_confirmed` when the `vitae` field is adjusted:
```js
const loc = JSON.parse(localStorage.getItem(LOCAL_PREFIX + charId) || '{}');
if (loc.vitae_confirmed != null) {
  delete loc.vitae_confirmed;
  localStorage.setItem(LOCAL_PREFIX + charId, JSON.stringify(loc));
}
```
This clears the confirmed marker when an ST manually overrides vitae. Removing `vitae_confirmed` from the localStorage write would break this clearing logic.

### The localStorage inf write is now dead code

`ensureLoaded()` at `tracker.js:93-104` reads `remote.influence` from the API — `local.inf` is never read from localStorage when a remote record exists. After this fix, `influence` will be in the API record, so `loc.inf` is unreachable dead code and should be removed cleanly.

### API field name: influence, not inf

The `tracker_state` MongoDB document stores the field as `influence` (see `persistedFields()` in tracker.js:53: `influence: cs.inf`). The in-memory cache uses `inf` (shorter key). The PUT body must use `influence` to match the API/DB schema. The WS FIELD_MAP at ws.js:133 handles the rename transparently.

### Existing test that must change

`tests/feat-16-17-fix44-tracker-feeding.spec.js` around line 853-862 asserts:
```js
const parsed = JSON.parse(stored);
expect(parsed).toHaveProperty('inf');
```
After this fix, `parsed.inf` will NOT exist (the write is removed). The test must be updated to instead verify the API PUT body included `influence`. The cleanest approach is to merge this check into the existing `'confirm button sends vitae PUT'` test at ~line 753, which already captures `trackerPutBody`.

---

## File List

- `public/js/tabs/feeding-tab.js` — MODIFY (add `influence: infAfter` to PUT body; remove `loc.inf = infAfter`)
- `tests/feat-16-17-fix44-tracker-feeding.spec.js` — MODIFY (update PUT assertion + remove/replace localStorage inf check)

## Change Log

- 2026-06-10: Story created from issue #667 diagnostic
