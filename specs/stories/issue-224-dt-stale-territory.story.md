# Story issue-224: DT form uses stale territory data — regent display not updated after city-view save

Status: review

issue: 224
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/224
branch: morningstar-issue-224-dt-stale-territory

---

## Story

As a player (or ST checking a character),
When I open a character's advanced downtime form,
I should see the current regent territory assignment from MongoDB,
so that a change saved via the Admin City view is immediately visible in the DT form without needing a page refresh.

---

## Acceptance Criteria

**AC-1 — Fresh territory on DT form render (no page refresh required)**
Given an ST assigns Alice as regent of The North Shore via the Admin City view and saves,
When Alice's DT form is opened or re-opened in the suite app without a page refresh,
Then it shows "I am acting as Regent of The North Shore for this cycle."

**AC-2 — `renderDowntimeTab` fetches territories fresh**
Given `renderDowntimeTab` is called,
When it initialises `_territories`,
Then it fetches fresh data from `/api/territories` rather than using the stale `suiteState.territories` snapshot passed as a parameter.

**AC-3 — No other characters affected**
Given all regent characters open their DT forms,
When the regency section renders,
Then all display the same territory they would display with a fresh page load.

**AC-4 — `saveTerritory` invalidates the ST processing cache**
Given an ST saves a regent/lieutenant change via the Admin City view,
When the save completes successfully,
Then `invalidateCachedTerritories()` is called so the ST processing mode (downtime-views.js) refetches on next render.

---

## Tasks

- [x] **Task 1 — Freshen territories inside `renderDowntimeTab`**
  - [x] In `public/js/tabs/downtime-form.js`, replace the stale assignment at line 1200 with a fresh `/api/territories` fetch, mirroring the character-refresh pattern at lines 1195-1198
  - [x] On fetch failure, fall back to the `territories` parameter (same silent-fallback pattern as the character refresh)
  - [x] Verify `_territories` is set before `applyDerivedMerits` runs or any downstream code that reads it

- [x] **Task 2 — Call `invalidateCachedTerritories()` in `saveTerritory`**
  - [x] In `public/js/admin/city-views.js:saveTerritory`, add `invalidateCachedTerritories()` after the successful `Object.assign` local-cache update, matching the existing pattern in `saveTerrAmbience` (line 678)

- [x] **Task 3 — Unit test for AC-2**
  - [x] Add a test to `server/tests/` (or extend `find-regent-territory.test.js`) that verifies `renderDowntimeTab` calls `apiGet('/api/territories')` — mock `apiGet` and assert the territories endpoint is hit on render

---

## Dev Notes

### Root cause

`suiteState.territories` in `app.js` is fetched **once** at page startup (`app.js:553`) and never refreshed. When the downtime tab is opened, `app.js:429` passes this stale snapshot:

```js
// app.js:429
if (el && char) initDowntimeTab(el, char, suiteState.territories || []);
```

`initDowntimeTab` (downtime-tab.js:9) passes the parameter straight through to `renderDowntimeTab`:

```js
// downtime-tab.js:85
renderDowntimeTab(currentZone, char, territories, { singleColumn: true });
```

`renderDowntimeTab` freshens the character but assigns the parameter as-is for territories:

```js
// downtime-form.js:1193-1200 — CURRENT STATE
export async function renderDowntimeTab(targetEl, char, territories, options = {}) {
  currentChar = char;
  try {
    const fresh = await apiGet(`/api/characters/${encodeURIComponent(String(char._id))}`);
    currentChar = fresh;                          // ← character IS freshened
  } catch { /* silent */ }
  if (currentChar) applyDerivedMerits(currentChar);
  _territories = territories || [];               // ← territories are NOT freshened
  ...
```

Any territory change in the Admin City view (admin.html — a **separate page**) is written to MongoDB and reflected in `terrDocs` (city-views.js local state), but `suiteState.territories` in the suite app (index.html) is never updated. The DT form therefore reflects the territory state from when the suite app was last loaded.

### Fix for Task 1 — `renderDowntimeTab` (downtime-form.js:1200)

Replace the stale assignment with a fresh fetch. Follow the exact same pattern used for the character:

```js
// REPLACE lines 1199-1200 with:
if (currentChar) applyDerivedMerits(currentChar);
try {
  _territories = await apiGet('/api/territories');
} catch {
  _territories = territories || [];  // silent fallback — stale is better than empty
}
```

**What NOT to change:**
- The `territories` parameter signature must stay — callers still pass it; it becomes the fallback only
- `player.js:273` calls `renderDowntimeTab` with its own freshly-fetched `_territories` — this still works correctly because the fresh fetch inside `renderDowntimeTab` supersedes it; the parameter is just the fallback
- `downtime-tab.js` does not need to change
- `app.js` does not need to change (suiteState.territories can remain stale for other uses: map tab, regency tab, status tab — all less time-sensitive)

**Import already present** — `apiGet` is already imported in `downtime-form.js` at line 1 (look for `import { apiGet ...} from '../data/api.js'`). No new import needed.

### Fix for Task 2 — `saveTerritory` (city-views.js:687)

`invalidateCachedTerritories` is already imported at `city-views.js:13`. Add the call after the local-cache update succeeds:

```js
// city-views.js:saveTerritory — after Object.assign call at line 703:
const idx = terrDocs.findIndex(d => d.slug === terrId);
const patch = { regent_id: regentId, lieutenant_id: lieutenantId };
if (idx >= 0) Object.assign(terrDocs[idx], patch);

invalidateCachedTerritories();  // ← ADD THIS (matches saveTerrAmbience pattern)

if (status) { status.textContent = 'Saved'; ...
```

**Reference pattern in `saveTerrAmbience` (city-views.js:678):**
```js
// Already exists for ambience saves:
invalidateCachedTerritories();
if (status) { status.textContent = 'Saved'; ...
patchTerritories(document.getElementById('city-content'));
```

### `invalidateCachedTerritories` — what it does

Defined in `downtime-views.js:3014`:
```js
export function invalidateCachedTerritories() {
  cachedTerritories = null;
}
```

Sets `cachedTerritories = null` in downtime-views.js. This forces `ensureTerritories()` (line 3019) to refetch from the API on the next call from the ST processing view. It does NOT affect `suiteState.territories` in app.js — that is a separate module-level variable and is intentionally not refreshed here (per scope notes: the fix lives in `renderDowntimeTab`).

### Testing guidance (Task 3)

The existing `server/tests/find-regent-territory.test.js` uses `vi.mock` to stub browser-only imports before importing the frontend module. The same pattern applies here if writing a unit test for `renderDowntimeTab`.

However, `renderDowntimeTab` is much more complex to unit-test than `findRegentTerritory` (it renders DOM, uses many globals). A focused integration test via Vitest that mocks `apiGet` and asserts the `/api/territories` call was made is the right scope. Keep the test minimal — just confirm the fresh fetch happens, not that the full form renders correctly.

If the test proves too complex to isolate cleanly within the existing test infrastructure, document why and skip it — the two code changes themselves are the critical deliverable for this story.

### Key code locations summary

| Location | What | Action |
|----------|------|--------|
| `downtime-form.js:1200` | `_territories = territories \|\| []` | REPLACE with fresh fetch |
| `city-views.js:703` | After `Object.assign(terrDocs[idx], patch)` | ADD `invalidateCachedTerritories()` |
| `city-views.js:13` | Import of `invalidateCachedTerritories` | Already present — no change |
| `app.js:553` | `suiteState.territories = await apiGet(...)` | No change |
| `app.js:429` | `initDowntimeTab(el, char, suiteState.territories)` | No change |
| `downtime-tab.js:85,88` | Passes `territories` to `renderDowntimeTab` | No change |

---

## Dev Agent Record

### Debug Log

- Root cause confirmed: `suiteState.territories` fetched once at app.js:553 startup, stale snapshot passed to renderDowntimeTab at app.js:429 via initDowntimeTab.
- `invalidateCachedTerritories` already imported in city-views.js at line 13; no new imports needed for either file.
- `apiGet` already imported in downtime-form.js at line 12; no new imports needed.
- Test requires mocking 18 browser-only modules before dynamic import; vi.mock hoisting handles this correctly.
- All 3 new tests pass; 34 existing territory API tests still pass.

### Completion Notes

- **Task 1**: `renderDowntimeTab` (downtime-form.js) now fetches `/api/territories` fresh on every call, using the `territories` parameter only as a silent fallback on network failure. Mirrors the existing character-refresh pattern at lines 1195-1198.
- **Task 2**: `saveTerritory` (city-views.js) now calls `invalidateCachedTerritories()` after updating the local `terrDocs` cache, matching the pattern already used in `saveTerrAmbience`. This ensures the ST processing view (downtime-views.js) refetches on next render.
- **Task 3**: 3 Vitest tests added in `server/tests/dt-form-territory-fresh-fetch.test.js` verifying apiGet('/api/territories') is called during renderDowntimeTab, regardless of the parameter passed in.

### File List

- `public/js/tabs/downtime-form.js` — modified (Task 1: territory fresh-fetch)
- `public/js/admin/city-views.js` — modified (Task 2: invalidateCachedTerritories call)
- `server/tests/dt-form-territory-fresh-fetch.test.js` — new (Task 3: unit test for AC-2)
- `specs/stories/issue-224-dt-stale-territory.story.md` — this file

### Change Log

- 2026-05-08: Task 1 — renderDowntimeTab fetches /api/territories fresh on render (downtime-form.js)
- 2026-05-08: Task 2 — saveTerritory calls invalidateCachedTerritories() after local cache update (city-views.js)
- 2026-05-08: Task 3 — Added 3 unit tests verifying territory fresh-fetch behaviour (dt-form-territory-fresh-fetch.test.js)
