# Story issue-153: Downtime form shows stale regent territory after ST reassigns

Status: review

issue: 153
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/153
branch: morningstar-issue-153-dt-stale-regent-territory

---

## Story

As a player viewing the downtime form,
I want the regent territory badge to always show my current territory,
so that I see accurate regency information even if the ST updated the assignment since I last loaded the portal.

---

## Background and Root Cause

`renderDowntimeTab` refreshes `currentChar` from the API on every render (`downtime-form.js:1184`) but trusts the stale `territories` parameter passed by the caller. The caller (`player.js:273` or `app.js:429`) passes the array loaded once at portal init.

If an ST changes a territory regent via the admin City editor while the player portal is open, the next downtime tab render uses the pre-change array. `findRegentTerritory(_territories, currentChar)` then returns the old territory — the bug Symon observed (Alice showing Second City instead of North Shore).

The admin City tab does its own fresh territory load on each render, so it showed the corrected assignment immediately, creating the apparent contradiction.

**Confirmed via MongoDB query (2026-05-07):**
- The North Shore: `regent_id = "69d73ea49162ece35897a47c"` (Alice Vunder) ✓
- The Second City: `regent_id = "69d73ea49162ece35897a495"` (René Meyer) ✓
- Alice's Downtime 2 submission: `regent_territory = "The North Shore"` ✓

Data is correct. Bug is a stale-array problem, not a data problem.

### Correct fix strategy

Inside `renderDowntimeTab`, add a fresh `/api/territories` fetch — exactly mirroring the existing `currentChar` refresh at line 1184. Assign the result to `_territories` so all downstream calls to `findRegentTerritory` use current data. Fall back to the passed `territories` parameter on error (same pattern as the character refresh — stale is better than broken).

The passed `territories` parameter is still used as the initial value and fallback; the fresh fetch is a best-effort refresh.

---

## Acceptance Criteria

- [ ] After the ST reassigns a territory's regent in the admin and the player re-opens the downtime tab, the regent badge shows the updated territory name
- [ ] If the territories API call fails, the form still renders (falls back to the `territories` parameter passed by the caller)
- [ ] Other regent-dependent UI (regent confirmation button, `gateValues.is_regent`, feeding cap) also reflects the fresh data

---

## Tasks / Subtasks

- [x] Task 1: Refresh territories in `renderDowntimeTab`
  - [x] 1a: After the `currentChar` refresh block (`downtime-form.js:~1186`), add an async fetch of `/api/territories` and assign to `_territories` on success
  - [x] 1b: Keep `_territories = territories || []` as the fallback (move it before the try/catch so the fetch can overwrite it, or set fallback inside the catch)

---

## Dev Notes

### Exact code change

**`public/js/tabs/downtime-form.js` — around line 1186–1188:**

Current:
```js
  if (currentChar) applyDerivedMerits(currentChar);
  _territories = territories || [];
  responseDoc = null;
```

After:
```js
  if (currentChar) applyDerivedMerits(currentChar);
  _territories = territories || [];
  try {
    const freshTerrs = await apiGet('/api/territories');
    if (freshTerrs?.length) _territories = freshTerrs;
  } catch { /* silent — stale territories better than broken form */ }
  responseDoc = null;
```

That's the entire change. `apiGet` is already imported at line 12. The fallback `_territories = territories || []` is set first, then overwritten if the fetch succeeds.

### What must not break

- `findRegentTerritory(_territories, currentChar)` — reads `_territories`; now gets fresh data
- `gateValues.is_regent` computed at line 1333 — reads `_territories`; now fresh
- Regency badge at line 1868 — reads `_territories`; now fresh
- `renderRegencySection` confirm button at line 2093 — reads `_territories`; now fresh
- Feeding cap at line 4137 — reads `_territories`; now fresh
- The `regency-tab.js` has its own `_territories` (module-level in `player.js`) — separate; not touched
- `app.js:suiteState.territories` — not touched; still used as the passed parameter / fallback

### Why not refresh in `initDowntimeTab` instead?

`initDowntimeTab` is in `downtime-tab.js` which also renders the history accordion. It could refresh territories there, but `renderDowntimeTab` is also called directly from `player.js:273` without going through `initDowntimeTab`. Putting the refresh inside `renderDowntimeTab` covers both call sites.

---

## Dev Agent Record

### File List

- `public/js/tabs/downtime-form.js`

### Completion Notes

Three-line change. `_territories` is now set to the passed fallback first (`territories || []`), then overwritten by a fresh `/api/territories` fetch. On API failure the form still renders with the caller's array. All downstream `findRegentTerritory` calls (regent badge, `gateValues.is_regent`, confirm button, feeding cap) automatically see current territory data. Parse-check clean.

### Change Log

- 2026-05-07: Refresh territories on every renderDowntimeTab call — fixes stale regent badge when ST reassigns mid-session (downtime-form.js:1188–1192, closes #153)

