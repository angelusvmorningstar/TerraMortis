# Story feat.16: ST City Status Edit

**Story ID:** feat.16
**Epic:** Feature Backlog
**Status:** ready-for-dev
**Date:** 2026-04-18

---

## User Story

As an ST using the game app status tab, I want to click a character's chip in the city status ladder to open a small popup where I can nudge their inherent city status up or down — so I can record a status change without leaving the status view.

---

## Background

### City status architecture

| Layer | Field | Editable |
|---|---|---|
| Inherent (base) | `c.status.city` | Yes — this story |
| Court title bonus | derived from `c.court_title` | No |
| Regent ambience bonus | derived from territory | No |

`calcCityStatus(c)` = `status.city + titleStatusBonus(c) + regentAmienceBonus(c)` (in `public/js/data/accessors.js`).

The bracket tier a chip appears in is determined by the **computed total**. Editing `status.city` moves the character to a different bracket on re-render.

### API

`PUT /api/characters/:id` — ST-only. Body `{ 'status.city': n }` is a valid partial update via `$set`. No new route needed.

`apiPut(path, body)` is exported from `public/js/data/api.js`.

### `/api/characters/status` projection

Already includes `'status.city': 1` (line 166, `server/routes/characters.js`), so `c.status?.city` is available on every character in the response payload.

### Overlay pattern

The app uses two overlay styles:
- **Bottom sheet** — `#panel-overlay` / `.rules-overlay` (slides up from bottom, `align-items: flex-end`)
- **Centred modal** — `#t-territory .overlay` (fixed inset 0, `align-items: center; justify-content: center; z-index: 200; padding: 16px`)

Use the **centred modal** pattern for this popup. It is small (single character card + two buttons) and centred makes sense for a focused edit action.

### Inline handler pattern

All `onclick` handlers in the suite HTML use `window.*` globals assigned at the bottom of `public/js/app.js`. The two new handlers must be assigned there.

### Status tab module

File: `public/js/suite/status.js`
Exported function: `renderSuiteStatusTab(el)` — async, re-fetches `/api/characters/status` every call, renders into `el`.
The tab is opened via `goTab('status')` in `app.js` line 218.

---

## UX Design

### Chip interaction (ST mode only)

In ST mode, city chips are **clickable**. The chip visual is identical to player view — no inline buttons, no visual cluttering. The only change is `cursor: pointer` and a subtle hover state.

### Popup

Clicking a city chip opens a small centred popup overlay. The popup contains:

```
[ × ]
 ╔══════════════════╗
 ║  [avatar 48px]   ║
 ║  Display Name    ║
 ║  ─────────────── ║
 ║     [▲]          ║
 ║      3  inherent ║
 ║     [▼]          ║
 ║  Total: 5        ║
 ╚══════════════════╝
```

- Avatar: 48px circle (same URL logic as the chip)
- Display name (may include honorific)
- Inherent value: large, centred
- ▲ / ▼ buttons above/below the value to increment/decrement (min 0, max 10)
- "Total: N" line below shows the computed total (`calcCityStatus` equivalent — base + title + ambience) so the ST sees what the bracket position will be
- × close button (top-right corner), click-outside also dismisses

### Immediate save

Each ▲/▼ press fires `suiteStatusAdjustCity(charId, delta)` immediately — no confirm step. The popup value updates optimistically; on success the main tab re-renders (the chip moves to the correct bracket if needed). On failure the popup shows a brief error note.

---

## Acceptance Criteria

- [ ] In ST view (`getRole() === 'st'`), city chips have `cursor: pointer` and respond to click
- [ ] Clicking a chip opens the centred popup with: avatar, name, inherent base value, ▲/▼ buttons, computed total
- [ ] ▲ increments `status.city` by 1 (max 10); ▼ decrements by 1 (min 0)
- [ ] Each button press saves immediately via `PUT /api/characters/:id` with `{ 'status.city': newVal }`
- [ ] After a successful save, the popup reflects the new value and `renderSuiteStatusTab` re-renders the tab behind it
- [ ] × button and click-outside close the popup
- [ ] In player view, chips are unclickable — no popup, no cursor change
- [ ] If the PUT request fails, the popup shows a small inline error message; the value reverts to the previous number

---

## Implementation

### 1. `public/js/suite/status.js`

**a) Module-level state**

```js
let _statusTabEl  = null;
let _editPopupEl  = null;
let _editCharData = null;   // { _id, baseVal, titleBonus, ambienceBonus }
```

**b) Import additions**

```js
import { apiGet, apiPut } from '../data/api.js';
import { calcCityStatus, titleStatusBonus, regentAmienceBonus } from '../data/accessors.js';
```

> Note: `titleStatusBonus` and `regentAmienceBonus` are already used internally by `calcCityStatus`. Check whether they are exported from `accessors.js`. If not, compute the bonus as `calcCityStatus(c) - (c.status?.city || 0)` rather than importing sub-functions.

**c) Store tab element**

At top of `renderSuiteStatusTab`:
```js
_statusTabEl = el;
```

**d) `renderCitySection` receives `isST`**

Change signature and call:
```js
function renderCitySection(chars, activeId, isST = false) { ... }
// called as:
let h = renderCitySection(chars, activeId, isST);
```

When `isST`, chips in city tier rows are wrapped in a clickable span:
```js
// Instead of renderChip(c, isMe), use:
renderCityChip(c, isMe, isST)
```

**e) `renderCityChip`**

```js
function renderCityChip(c, isMe, isST) {
  const base = c.status?.city || 0;
  const id   = esc(String(c._id));
  const click = isST
    ? ` style="cursor:pointer" onclick="suiteStatusOpenEdit('${id}')"` : '';
  return `<div class="status-chip${isMe ? ' status-chip-me' : ''}${isST ? ' status-chip-st' : ''}"${click}>
    <img class="status-chip-avatar" src="${esc(avatarUrl(c))}" alt="" loading="lazy">
    <span class="status-chip-name">${esc(displayName(c))}</span>
  </div>`;
}
```

Use `renderCityChip` only in `renderTierRow` calls made from `renderCitySection`. The shared `renderChip` function (used for clan/covenant chips) is **not changed**.

**f) `suiteStatusOpenEdit(charId)`**

Export this function:
```js
export function suiteStatusOpenEdit(charId) {
  // Find the character in the last fetched status data
  // Store in _editCharData and open the popup
}
```

Because the status fetch result is ephemeral, store the chars array in a module-level variable `let _lastChars = null;` and assign it after the `apiGet` call in `renderSuiteStatusTab`. Then `suiteStatusOpenEdit` can look up the char by `_id`.

The popup HTML:

```js
function buildEditPopup(c) {
  const base  = c.status?.city || 0;
  const total = calcCityStatus(c);
  const bonus = total - base;
  const id    = esc(String(c._id));
  return `<div class="cs-edit-overlay" id="cs-edit-overlay" onclick="if(event.target===this)suiteStatusCloseEdit()">
    <div class="cs-edit-panel">
      <button class="cs-edit-close" onclick="suiteStatusCloseEdit()">\u00D7</button>
      <img class="cs-edit-avatar" src="${esc(avatarUrl(c))}" alt="" loading="lazy">
      <div class="cs-edit-name">${esc(displayName(c))}</div>
      <div class="cs-edit-stepper">
        <button class="cs-step-btn" onclick="suiteStatusAdjustCity('${id}',1)" ${base >= 10 ? 'disabled' : ''}>\u25B2</button>
        <div class="cs-edit-val" id="cs-edit-val">${base}</div>
        <button class="cs-step-btn" onclick="suiteStatusAdjustCity('${id}',-1)" ${base <= 0 ? 'disabled' : ''}>\u25BC</button>
      </div>
      <div class="cs-edit-total" id="cs-edit-total">Total: ${total}${bonus ? ' (base ' + base + ' + ' + bonus + ')' : ''}</div>
      <div class="cs-edit-err" id="cs-edit-err" style="display:none"></div>
    </div>
  </div>`;
}
```

**g) `suiteStatusCloseEdit()`**

```js
export function suiteStatusCloseEdit() {
  _editPopupEl?.remove();
  _editPopupEl = null;
}
```

**h) `suiteStatusAdjustCity(charId, delta)`**

```js
export async function suiteStatusAdjustCity(charId, delta) {
  const c = _lastChars?.find(ch => String(ch._id) === charId);
  if (!c) return;
  const oldVal = c.status?.city || 0;
  const newVal = Math.max(0, Math.min(10, oldVal + delta));
  if (newVal === oldVal) return;

  // Optimistic update
  c.status = c.status || {};
  c.status.city = newVal;
  _updateEditPopup(c);

  try {
    await apiPut('/api/characters/' + charId, { 'status.city': newVal });
  } catch (err) {
    // Revert
    c.status.city = oldVal;
    _updateEditPopup(c, 'Save failed');
    return;
  }

  // Re-render the tab (chip moves to correct bracket)
  if (_statusTabEl) renderSuiteStatusTab(_statusTabEl);
}
```

**i) `_updateEditPopup(c, errMsg)`** — private helper to refresh popup DOM after a change:

```js
function _updateEditPopup(c, errMsg) {
  if (!_editPopupEl) return;
  const base  = c.status?.city || 0;
  const total = calcCityStatus(c);
  const bonus = total - base;
  const valEl  = _editPopupEl.querySelector('#cs-edit-val');
  const totEl  = _editPopupEl.querySelector('#cs-edit-total');
  const errEl  = _editPopupEl.querySelector('#cs-edit-err');
  const btns   = _editPopupEl.querySelectorAll('.cs-step-btn');
  if (valEl) valEl.textContent = base;
  if (totEl) totEl.textContent = 'Total: ' + total + (bonus ? ' (base ' + base + ' + ' + bonus + ')' : '');
  if (errEl) { errEl.textContent = errMsg || ''; errEl.style.display = errMsg ? '' : 'none'; }
  if (btns[0]) btns[0].disabled = base >= 10;
  if (btns[1]) btns[1].disabled = base <= 0;
}
```

### 2. `public/js/app.js`

**a) Import changes**

```js
import { renderSuiteStatusTab, suiteStatusOpenEdit, suiteStatusCloseEdit, suiteStatusAdjustCity } from './suite/status.js';
```

**b) Window assignments** (near line 945):

```js
window.suiteStatusOpenEdit    = suiteStatusOpenEdit;
window.suiteStatusCloseEdit   = suiteStatusCloseEdit;
window.suiteStatusAdjustCity  = suiteStatusAdjustCity;
```

### 3. `public/css/suite.css`

Add at the end of the file:

```css
/* ── City Status edit popup ─────────────────────────────────── */
.cs-edit-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay2);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 220;
  padding: 16px;
}

.cs-edit-panel {
  position: relative;
  background: var(--surf);
  border: 1px solid var(--bdr);
  border-radius: 12px;
  padding: 24px 32px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  min-width: 180px;
}

.cs-edit-close {
  position: absolute;
  top: 10px;
  right: 12px;
  background: none;
  border: none;
  color: var(--txt3);
  font-size: 16px;
  cursor: pointer;
  line-height: 1;
}

.cs-edit-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
}

.cs-edit-name {
  font-family: var(--fl);
  font-size: 14px;
  color: var(--txt);
  text-align: center;
}

.cs-edit-stepper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  margin: 4px 0;
}

.cs-step-btn {
  background: var(--surf2);
  border: 1px solid var(--gold2);
  color: var(--gold2);
  font-size: 16px;
  width: 36px;
  height: 28px;
  border-radius: 4px;
  cursor: pointer;
  line-height: 1;
}

.cs-step-btn:hover:not(:disabled) {
  background: var(--gold2);
  color: var(--bg);
}

.cs-step-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

.cs-edit-val {
  font-size: 32px;
  font-family: var(--fhd);
  color: var(--gold2);
  line-height: 1.1;
  min-width: 2ch;
  text-align: center;
}

.cs-edit-total {
  font-size: 11px;
  color: var(--txt3);
  font-family: var(--fl);
}

.cs-edit-err {
  font-size: 11px;
  color: var(--crim);
  font-family: var(--fl);
}

/* Clickable chip in ST mode */
.status-chip-st {
  transition: border-color 0.15s;
}
.status-chip-st:hover {
  border-color: var(--gold2);
}
```

---

## Key Constraints

- Do not touch `public/js/player/status-tab.js`
- Do not change the shared `renderChip` function — only city chips in ST mode use the new variant
- `renderSuiteStatusTab` is a full re-fetch and re-render on every call — no partial DOM update needed after save
- The popup is appended to `document.body`, not scoped inside `#t-status`, so it layers above everything correctly

---

## Files to Change

| File | Change |
|---|---|
| `public/js/suite/status.js` | Add `_statusTabEl`, `_lastChars`, `_editPopupEl`; import `apiPut`; add `renderCityChip`, `buildEditPopup`, `_updateEditPopup`; export `suiteStatusOpenEdit`, `suiteStatusCloseEdit`, `suiteStatusAdjustCity` |
| `public/js/app.js` | Import and expose 3 new `window.*` handlers |
| `public/css/suite.css` | Add `.cs-edit-*` and `.status-chip-st` rules |
