# Story issue-293: Regency Tab — Regent Appoints Their Own Lieutenant

Status: review

issue: 293
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/293
branch: morningstar-issue-293-regent-appoint-lieutenant

## Story

As a Regent player,
I want to appoint (or change) my Lieutenant directly from the Regency tab,
so that I can exercise my in-lore authority over my territory without needing the ST to do it for me.

## Acceptance Criteria

1. **API endpoint** — `PATCH /api/territories/:id/lieutenant` exists, accepts `{ lieutenant_id: string | null }`, and is accessible to the territory's Regent (or ST).
2. **Self-appointment blocked** — the endpoint rejects a `lieutenant_id` that matches the territory's own `regent_id` (400).
3. **Character validation** — if `lieutenant_id` is non-null, the endpoint verifies the character exists and is not retired; returns 400 on failure.
4. **Non-regent forbidden** — a player who is not the territory's Regent (and not ST) receives 403.
5. **Regency tab — editable picker** — the Lieutenant row in the Regency tab renders a charPicker instead of the current locked `dt-residency-locked` span, pre-filled with the current `lieutenant_id` if one exists.
6. **Regent excluded from picker** — the Lieutenant charPicker's `excludeIds` always includes the Regent's own character ID.
7. **Save Lieutenant button** — a distinct "Save Lieutenant" button (separate from "Save Feeding Rights") appears below the Lieutenant row and calls the new endpoint.
8. **Re-render on save** — after a successful lieutenant save the tab re-renders so the feeding-rights grid (`loopStart`) reflects the new lieutenant state.
9. **Dev-fixtures handler** — `public/js/dev-fixtures.js` includes an echo handler for `PATCH territories/:id/lieutenant` so local dev doesn't silently fail.
10. **ST admin panel unchanged** — the ST's City tab "Edit Regents & Lieutenants" panel continues to work as before; no changes to `city-views.js` or the `POST /api/territories` path.

## Tasks / Subtasks

- [x] Task 1 — Backend: add `PATCH /api/territories/:id/lieutenant` (AC: 1, 2, 3, 4)
  - [x] Add route in `server/routes/territories.js` below the `feeding-rights` route
  - [x] Validate `lieutenant_id` is a string or null (400 otherwise)
  - [x] Parse `:id` with `parseId()`; 404 if territory not found
  - [x] Auth check via `isRegentOfTerritory(req.user, territory)`; 403 on failure
  - [x] Self-appointment guard: if `lieutenant_id === String(territory.regent_id)` → 400
  - [x] If `lieutenant_id` is non-null, look up `getCollection('characters').findOne({ _id: new ObjectId(lieutenant_id) })`; 400 if missing or `char.retired === true`
  - [x] `$set: { lieutenant_id: lieutenant_id || null, updated_at: new Date().toISOString() }`
  - [x] Return updated territory document

- [x] Task 2 — Frontend: replace locked Lieutenant row with charPicker (AC: 5, 6, 7, 8)
  - [x] Add module-level `let _ltPickerValue = null;` (mirrors charPicker selection, reset on each `renderRegencyTab()` call)
  - [x] In `render()`, replace the locked-span branch for `ltId` (lines 199–204) with a charPicker mount div (same `data-cp-*` attribute pattern as feeding-right slots), plus a "Save Lieutenant" button (`id="reg-save-lt"`)
  - [x] Also render the charPicker (with no initial value) when there is no lieutenant at all — so Regent can add one from scratch
  - [x] charPicker `excludeIds` must include `String(currentChar._id)` (the Regent)
  - [x] Add `_mountLtPicker(container)` function: same structure as `_mountOneRegSlotPicker` but updates `_ltPickerValue` and does not interact with `_slotValues`
  - [x] `_ltPickerValue` set in `onChange`; cleared to `null` when picker is blanked
  - [x] Add `async function saveLieutenant(container)`:
    - Reads `_ltPickerValue` (string or null)
    - Calls `await apiPatch(\`/api/territories/${encodeURIComponent(ri.territoryId)}/lieutenant\`, { lieutenant_id: _ltPickerValue || null })`
    - On success: updates local `_territories` doc (`td.lieutenant_id = ...`), calls `render(container)` to refresh
    - On error: sets status text on `#reg-lt-save-status`
  - [x] In `wireEvents()`: wire `#reg-save-lt` → `() => saveLieutenant(container)`
  - [x] Add `<span id="reg-lt-save-status" class="qf-save-status"></span>` beside the button

- [x] Task 3 — Dev fixtures: echo handler (AC: 9)
  - [x] In `public/js/dev-fixtures.js`, add before the `return _orig(url, opts)` fallback:
    ```js
    if(method==='PATCH'&&seg[0]==='territories'&&seg[2]==='lieutenant'){
      var ltb=opts.body?JSON.parse(opts.body):{};
      var td=TERRITORIES.find(function(t){return String(t._id)===seg[1];});
      if(td)td.lieutenant_id=ltb.lieutenant_id||null;
      return _mock(td||{});
    }
    ```

- [x] Task 4 — Backend test (AC: 1–4)
  - [x] Create `server/tests/api-territories-regent-lieutenant.test.js`
  - [x] Cases: ST happy path (null clear), Regent happy path (set), self-appoint 400, non-existent char 400, retired char 400, non-regent 403, unauthenticated 401

## Dev Notes

### Current state of the Lieutenant row (regency-tab.js:133–204)

```js
const ltId = ri?.lieutenantId || '';
const ltChar = ltId ? allCharNames.find(c => String(c._id) === ltId) : null;
const ltName = ltChar ? displayName(ltChar) : (ltId ? ltId : '— None —');
const loopStart = ltId ? 3 : 2;
// ...
// Slot 2 — Lieutenant (locked, implicit; hidden if none)
if (ltId) {
  h += '<div class="dt-residency-row">';
  h += '<span class="dt-residency-label">Lieutenant</span>';
  h += `<span class="dt-residency-locked">${esc(ltName)}</span>`;
  h += '</div>';
}
```

This must become: always render the Lieutenant slot (whether currently set or not), with a charPicker, and a "Save Lieutenant" button.

### loopStart and re-render

`loopStart` is computed from `ltId` and controls where the feeding-right slots begin. After saving a lieutenant change (add or remove), `render(container)` must be re-called so the feeding slots rebuild from the correct `loopStart`. This is the same pattern used by `confirmFeeding()`.

### charPicker pattern to follow

The existing `_mountOneRegSlotPicker()` (line 269) is the reference. Key points:
- `charPicker({ scope: 'all', cardinality: 'single', initial, onChange, placeholder, excludeIds })` from `character-picker.js`
- `onChange` receives the selected character ID string (or empty string to clear)
- `setCharPickerSources()` is already called in `renderRegencyTab()` — no need to call again for the lt picker

### API auth pattern (territories.js)

The `PATCH /api/territories/:id/feeding-rights` endpoint (line 80) is the direct model:
```js
router.patch('/:id/lieutenant', async (req, res) => {
  const { id } = req.params;
  const { lieutenant_id } = req.body;
  // validate, parseId, findOne, isRegentOfTerritory, self-check, char lookup, $set
});
```
Import `ObjectId` is already in scope. `getCollection` is already imported. `isRegentOfTerritory` and `isStRole` are already imported from `'../middleware/auth.js'`.

### Character lookup for validation

`lieutenant_id` on the territory is stored as a plain string (not ObjectId). To look up the character by it:
```js
import { ObjectId } from 'mongodb'; // already imported
const charOid = (() => { try { return new ObjectId(lieutenant_id); } catch { return null; } })();
if (!charOid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid character ID format' });
const char = await getCollection('characters').findOne({ _id: charOid });
if (!char || char.retired) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Character not found or retired' });
```

### Dev-fixtures — why needed

`public/js/dev-fixtures.js` monkey-patches `fetch` under the local test token. There is no handler for `PATCH territories/:id/...` at all — the `feeding-rights` PATCH already falls through to `_orig` (real server). Under `localTestLogin()`, the real server isn't authenticated as a regent, so the PATCH would return 403. The echo handler ensures local dev works without needing the server running.

### File path note

The current file is `public/js/tabs/regency-tab.js` (not `public/js/player/regency-tab.js` — the old path from a previous refactor referenced in feat-19's story file).

### What must NOT change

- `saveRegency()` logic — does not touch `lieutenant_id`
- `confirmFeeding()` logic — does not touch `lieutenant_id`
- `getResidencyList()` — does not touch `lieutenant_id`
- `_computeLocked()` — unchanged
- ST City panel (`city-views.js`) — unchanged
- Territory schema (`territory.schema.js`) — `lieutenant_id: { type: ['string', 'null'] }` already present, no migration

### Button placement suggestion

```html
<!-- Lieutenant slot (slot 2) — always rendered -->
<div class="dt-residency-row" id="reg-lt-row">
  <span class="dt-residency-label">Lieutenant</span>
  <div data-cp-mount data-cp-site="reg-lt" ... ></div>
  <button id="reg-save-lt" class="qf-btn qf-btn-secondary">Save Lieutenant</button>
  <span id="reg-lt-save-status" class="qf-save-status"></span>
</div>
```

### Test file pattern

See `server/tests/api-territories-regent-write.test.js` for the vitest + supertest + `createTestApp` / `stUser` / `playerUser` pattern. The new test file mirrors that structure with `seedTerritory()` and `seedCharacter()` helpers.

### Project Conventions

- British English throughout
- No em-dashes
- HTML built as string `h +=` pattern in `render()`
- `esc()` for all user-facing strings
- `displayName(c)` for character names
- `apiPatch(path, body)` from `'../data/api.js'`

## References

- Territory routes: `server/routes/territories.js` — `PATCH /api/territories/:id/feeding-rights` (line 80) is the auth + write pattern to follow
- Auth helpers: `server/middleware/auth.js` — `isRegentOfTerritory()` (line 101), `isStRole()` (line 82)
- Territory schema: `server/schemas/territory.schema.js` — `lieutenant_id: { type: ['string', 'null'] }` (line 35)
- Regency tab: `public/js/tabs/regency-tab.js` — current lieutenant render (line 133–204), `saveRegency` (line 332), `confirmFeeding` (line 389 — re-render pattern to follow)
- charPicker: `public/js/components/character-picker.js`
- charPicker mount pattern: `_mountOneRegSlotPicker()` in `public/js/tabs/regency-tab.js` (line 269)
- Dev-fixtures: `public/js/dev-fixtures.js` — intercept switch block (line 29–57); add before `return _orig()`
- Characters names endpoint: `server/routes/characters.js` line 315 — already filters `retired: { $ne: true }`
- Existing regent-write test: `server/tests/api-territories-regent-write.test.js` — vitest pattern to follow

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Task 1: Added `PATCH /api/territories/:id/lieutenant` to `server/routes/territories.js`. Auth via `isRegentOfTerritory`, self-appointment guard, character existence + retired check, `$set` write. 10/10 tests passing.
- Task 2: Replaced locked Lieutenant display span with an always-rendered charPicker in `public/js/tabs/regency-tab.js`. Added `_ltPickerValue` module variable (reset on each render), `_mountLtPicker()`, `saveLieutenant()`. On success the tab re-renders so feeding-rights `loopStart` adjusts correctly.
- Task 3: Echo handler added to `public/js/dev-fixtures.js` for `PATCH territories/:id/lieutenant` — mutates TERRITORIES in-memory and returns updated doc.
- Task 4: `server/tests/api-territories-regent-lieutenant.test.js` — 10 cases covering ST/Regent happy paths, self-appoint 400, non-existent char 400, retired char 400, non-regent 403, unauthenticated 401. All pass. Zero regressions in 48 territory tests.

### File List

- server/routes/territories.js
- public/js/tabs/regency-tab.js
- public/js/dev-fixtures.js
- server/tests/api-territories-regent-lieutenant.test.js
