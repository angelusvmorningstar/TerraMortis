# Story fix.38: Player Portal — Save Feeding Rights Button Broken

## Status: done

## Story

**As a** Regent player,
**I want** the Save Feeding Rights button on my Regency tab to work,
**so that** I can actually save the feeding rights I've assigned to characters in my territory.

## Background

The Regency tab in the player portal (`public/js/player/regency-tab.js`) shows up to 10 feeding rights slots. The "Save Feeding Rights" button at the bottom is visually broken (red border visible in screenshot) and does not appear to function when clicked.

---

## Technical Details

**File:** `public/js/player/regency-tab.js`

**Save flow:**
```js
// Button (line ~113)
<button id="reg-save" class="qf-submit-btn">Save Feeding Rights</button>

// Event listener (line ~130)
container.querySelector('#reg-save')?.addEventListener('click', saveRegency);

// saveRegency() (lines ~148–167)
await apiPut('/api/territory-residency', {
  territory: _regInfo()?.territory || '',
  residents: residents.filter(Boolean),
});
```

**Server route:** `server/routes/territory-residency.js` — handles `PUT /api/territory-residency`

**Data stored in:** `territory_residency` MongoDB collection, field `residents: string[]` (character IDs)

**Possible failure causes:**

1. **`/api/territory-residency` route missing or broken** — check whether the route file exists and is registered in `server/server.js`. If the route was never wired up, the PUT returns 404.

2. **`_regInfo()` returning null territory** — if the territory lookup fails, `territory: ''` is sent, and the server may reject or silently ignore it.

3. **`container.querySelector('#reg-save')` returning null** — if the button is rendered after the listener is attached (timing issue), the listener never fires.

4. **Button style** — the red border in the screenshot is unusual for a normal button. It may indicate a CSS `:invalid` state on a parent form, or an explicit error class being applied. Check if the button is inside a `<form>` that is failing validation.

5. **`apiPut` vs `apiPost`** — if the server route only handles POST, a PUT will return 405.

**Investigation steps:**
1. Check `server/server.js` — is `territory-residency` route imported and mounted?
2. Open browser console on Regency tab — does clicking save produce a console error?
3. Check Network tab — does the PUT request fire? What does the response look like?
4. Inspect the button's surrounding HTML for form elements or error classes.

---

## Acceptance Criteria

1. Clicking "Save Feeding Rights" sends the selected character IDs to the server and returns a success response.
2. No console errors on save.
3. After save, the page reflects the saved state (either a confirmation message or the dropdowns re-render with saved values).
4. The button does not have a red border in normal state.

---

## Files to Change

- `public/js/player/regency-tab.js` — diagnose and fix save handler
- `server/server.js` — confirm territory-residency route is registered
- `server/routes/territory-residency.js` — confirm PUT handler exists and functions

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-11 | 1.0 | Story authored | Claude (SM) |
| 2026-04-11 | 1.1 | Root cause: button used undefined class `qf-submit-btn`; correct is `qf-btn qf-btn-submit`. Browser default styling caused red-border appearance. Save logic was functional. One-character fix. | Claude (SM) |
