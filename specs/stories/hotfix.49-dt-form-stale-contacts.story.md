# Story hotfix.49: DT Form — Stale Contacts After Character Edit

Status: review

issue: 49
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/49
branch: angelus/issue-49-dt-form-stale-contacts

## Story

As a player loading the DT submission form,
I want the Contacts section to reflect my character's current merits,
so that removed contacts do not appear as eligible action targets.

## Acceptance Criteria

1. The DT form's Contacts section always reflects the character's current merit array from the database, not an in-memory cache from page load.
2. Removed contacts no longer appear after the form re-renders (next load or tab switch).
3. The data source for the contacts list is documented.
4. No regression to other sections that derive data from `currentChar` (spheres, status, retainers, sorcery gates, etc.).

## Tasks / Subtasks

- [x] **Task 1 — Re-fetch character fresh at renderDowntimeTab start** (AC: #1, #2, #3, #4)
  - [x] In `renderDowntimeTab` (downtime-form.js line 1262), after `currentChar = char;`, add a fresh API fetch: `GET /api/characters/${char._id}`.
  - [x] On success, replace `currentChar` with the fresh document and call `applyDerivedMerits(currentChar)`.
  - [x] On failure, fall through to the existing `applyDerivedMerits(char)` call (silent degradation — stale data is better than a broken form).
  - [x] The fetch must use `apiGet` (already imported at line 12) — no new imports needed.

- [x] **Task 2 — Refactor the applyDerivedMerits call to match** (AC: #4)
  - [x] The existing `if (char) applyDerivedMerits(char);` at line 1264 must be updated to run on `currentChar` after the fresh fetch, not on the passed-in `char`. This ensures derived merit calculations (MCI grants, PT grants, etc.) use live data.
  - [x] Do NOT move the `applyDerivedMerits` call before the fetch — it must run on whichever object becomes `currentChar`.

- [x] **Task 3 — Verify no regression** (AC: #4)
  - [x] Confirm `detectMerits()` is called later (it is, at line ~1420+ during render) and will use the fresh `currentChar`. No changes to `detectMerits` needed.
  - [x] Confirm `downtime-tab.js` (game app entry point) also benefits — it calls `renderDowntimeTab(currentZone, char, territories, { singleColumn: true })` at lines 85/88, so the fix is inherited automatically.

## Dev Notes

### Root cause (confirmed by code audit)

**Data flow:**
```
player.js:170    chars = await apiGet('/api/characters?mine=1')  ← loaded ONCE at page init
player.js:269    activeChar = activeChars[idx]                   ← reference to in-memory char
player.js:273    renderDowntimeTab(el, activeChar, territories)  ← stale object passed in
downtime-form.js:1263  currentChar = char                        ← stale char assigned
downtime-form.js:1264  applyDerivedMerits(char)                  ← runs on stale char
…later…         detectMerits()                                   ← reads currentChar.merits (stale!)
```

When an ST removes a contact from Yusuf's character in the admin panel, `chars` in `player.js` is not re-fetched. On the next `renderDowntimeTab` call (tab switch, manual re-render), `activeChar.merits` still has the old contacts. `detectMerits()` at line ~199 reads `currentChar.merits` to populate `detectedMerits.contacts`, which is then rendered in the Contacts section.

**Fix location**: `downtime-form.js:1262–1264`. Replace the passive `currentChar = char` with an active re-fetch.

### Exact change

```js
// BEFORE (lines 1262–1265):
export async function renderDowntimeTab(targetEl, char, territories, options = {}) {
  currentChar = char;
  if (char) applyDerivedMerits(char);
  _territories = territories || [];

// AFTER:
export async function renderDowntimeTab(targetEl, char, territories, options = {}) {
  currentChar = char;
  try {
    const fresh = await apiGet(`/api/characters/${encodeURIComponent(String(char._id))}`);
    currentChar = fresh;
  } catch { /* silent — stale char is better than a broken form */ }
  if (currentChar) applyDerivedMerits(currentChar);
  _territories = territories || [];
```

Key points:
- `apiGet` is already imported at line 12. No new imports.
- `applyDerivedMerits` is already imported from `'../editor/mci.js'` at line 15.
- The `try/catch` wraps only the fetch, not the whole function — if the fetch fails, `currentChar` stays as the passed-in `char` and `applyDerivedMerits` still runs.
- `/api/characters/:id` already handles player-ownership auth at `server/routes/characters.js:331–333` — a player can only fetch their own character. No auth concern.

### Data source documentation (AC: #3)

After this fix, the contacts list source is:
1. `renderDowntimeTab` fetches `/api/characters/${char._id}` fresh on every call.
2. The response becomes `currentChar`.
3. `detectMerits()` reads `currentChar.merits`, filters for `category === 'influence' && name === 'Contacts'`, expands `spheres` array into individual contact entries.
4. `detectedMerits.contacts` is rendered in `renderMeritToggles` starting at line 5710.

### Files to change

- `public/js/tabs/downtime-form.js` — 4-line change at `renderDowntimeTab` start (lines 1263–1264).

### Things NOT to change

- `player.js` — caller is fine as-is; the fix belongs in the callee.
- `downtime-tab.js` — inherits the fix automatically (calls same function).
- `detectMerits()` — no changes; it correctly reads `currentChar.merits`.
- Server routes — `/api/characters/:id` already works and handles auth.

### Conventions

- No new CSS, schema, or API changes.
- British English in any strings.
- `encodeURIComponent(String(char._id))` for URL safety (matches existing patterns in the file).

### Project Structure Notes

- Single file change: `public/js/tabs/downtime-form.js`
- No imports to add or remove

### References

- `public/js/tabs/downtime-form.js:1262–1264` — `renderDowntimeTab` entry (change here)
- `public/js/tabs/downtime-form.js:15` — `applyDerivedMerits` import
- `public/js/tabs/downtime-form.js:199` — `detectMerits()` reads `currentChar.merits`
- `public/js/player.js:170` — single page-load character fetch (root cause)
- `public/js/player.js:269–273` — `selectCharacter` passes stale `activeChar`
- `public/js/tabs/downtime-tab.js:85,88` — game app callers (inherit fix)
- `server/routes/characters.js:326–342` — `GET /api/characters/:id` (player-owned, no auth concern)
- `specs/architecture/adr-003-dt-form-cross-cutting.md` — DT form architecture context
- Issue #49: https://github.com/angelusvmorningstar/TerraMortis/issues/49

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Added try/catch re-fetch at `renderDowntimeTab` entry (lines 1264–1267). On success, `currentChar` is replaced with the fresh API response; on failure, it stays as the passed-in `char`. `applyDerivedMerits` now runs on whichever becomes `currentChar`.
- No new imports. No changes to `detectMerits`, `player.js`, `downtime-tab.js`, or server routes.
- Verified: old `applyDerivedMerits(char)` call removed; new `applyDerivedMerits(currentChar)` confirmed in file.

### File List

- `public/js/tabs/downtime-form.js`
