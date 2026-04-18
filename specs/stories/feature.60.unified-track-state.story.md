# Story: Unified Track State

**Story ID:** feature.60  
**Epic:** Game App Quality of Life  
**Status:** ready-for-dev  
**Date:** 2026-04-17

---

## User Story

As an ST using the Tracker tab and a player using the character sheet in the same game app session, I want track changes (Vitae, Willpower, Influence, Health) made on the sheet to immediately reflect in the Tracker tab and vice versa, so the ST always sees accurate live state without manual re-entry.

---

## Problem

Two completely separate localStorage systems exist for the same data:

| System | File | Storage key | Schema |
|---|---|---|---|
| Sheet track boxes | `public/js/suite/sheet.js` | `tm_tracker_{name}` (one key per char name) | `{ health, vitae, wp, inf }` |
| Tracker tab | `public/js/game/tracker.js` | `tm_tracker_state` (one object, keyed by `_id`) | `{ vitae, willpower, bashing, lethal, aggravated, conditions[] }` |

A player spending Vitae on their sheet does not update the Tracker. An ST adjusting Willpower in the Tracker does not update the sheet boxes. They are entirely independent and will drift out of sync during play.

Additionally:
- The sheet uses character `name` as the storage key — brittle if a name changes
- The Tracker does not track `inf` (Influence) at all, despite it being a game resource
- `public/js/suite/tracker.js` is largely legacy (only its `toast` export is still used); its own `tm_tracker_{name}` read/write functions are dead code

---

## Acceptance Criteria

1. **Single canonical store** — all track state (Vitae, Willpower, Health damage, Influence, Conditions) lives in `game/tracker.js`'s `tm_tracker_state` localStorage key, keyed by character `_id`.
2. **Sheet reads canonical store** — when the sheet renders track boxes, it reads from the canonical store via exported helpers, not its own `tm_tracker_{name}` key.
3. **Sheet writes canonical store** — when a player taps a track box on the sheet, it writes through `trackerAdj()` (or equivalent) to the canonical store.
4. **Tracker tab shows influence** — the Influence counter row appears in expanded Tracker cards, driven by the `inf` field now present in the canonical schema.
5. **Health stays in sync** — the sheet's health track and the Tracker's damage counters (bashing/lethal/aggravated) represent the same underlying state. See Health Mapping below.
6. **No double-write** — the sheet no longer writes to `tm_tracker_{name}`. After this story, that key is dead.
7. **Migration** — on first read, if a character has no entry in `tm_tracker_state` but has an old `tm_tracker_{name}` entry, attempt a one-time migration. After migration, the old key is left in place (not deleted — safe to ignore).
8. **Tracker tab live-updates** — when the sheet track boxes change state, and the user then opens the Tracker tab, the Tracker shows the updated values (next render cycle; no real-time push required).

---

## Field Mapping

| Sheet field | Tracker field | Notes |
|---|---|---|
| `vitae` | `vitae` | Direct. No rename. |
| `wp` | `willpower` | Rename. Sheet uses `wp`; tracker uses `willpower`. |
| `inf` | `inf` | **Add to tracker schema.** Currently missing from `game/tracker.js`. |
| `health` (current boxes) | computed: `max - bashing - lethal - aggravated` | See Health Mapping. |

---

## Health Mapping

The sheet displays health as a simple track: N filled boxes = N undamaged boxes remaining. The Tracker stores damage as three separate columns.

**Reading health for the sheet:**
```
health_current = maxH - (cs.bashing + cs.lethal + cs.aggravated)
health_current = Math.max(0, health_current)
```

**Writing health from sheet tap (damage / healing):**

When a player taps a health box on the sheet, compute the delta between old and new `health_current`:

- `delta > 0` (recovering — more filled boxes): heal damage. Remove from `bashing` first, then `lethal`, then `aggravated`. Each recovered box removes 1 point in that order.
- `delta < 0` (taking damage — fewer filled boxes): add `lethal` damage (1 per box lost). The ST can reclassify as aggravated in the Tracker tab if needed.

Example:
```
old health_current = 5, new = 3 → delta = -2 → add 2 lethal
old health_current = 3, new = 5 → delta = +2 → remove bashing first (if any), then lethal
```

This is game-mechanically correct for VtR 2e (lethal is the default unaggravated damage; bashing heals fastest).

---

## Implementation Plan

### 1. `public/js/game/tracker.js`

**Add `inf` to schema:**
```js
function defaults(c) {
  return {
    vitae:      calcVitaeMax(c),
    willpower:  calcWillpowerMax(c),
    bashing:    0,
    lethal:     0,
    aggravated: 0,
    conditions: [],
    inf:        influenceTotal(c),   // ADD THIS
  };
}
```
Import `influenceTotal` from `'../data/accessors.js'` (already imported in sheet.js; add here).

**Add `inf` case to `trackerAdj()`:**
```js
} else if (field === 'inf') {
  const maxInf = influenceTotal(c);
  cs.inf = clamp((cs.inf ?? maxInf) + delta, 0, maxInf);
}
```

**Export read/write helpers** so sheet.js can access the canonical store without duplicating the `load()`/`save()` logic:
```js
export function trackerRead(charId) {
  const state = load();
  const c = (suiteState.chars || []).find(x => String(x._id) === charId);
  if (!c) return null;
  return ensure(state, c);   // ensure() already initialises defaults if missing
}

export function trackerReadRaw(charId) {
  // Returns the raw entry or null — used for migration check
  const state = load();
  return state[charId] || null;
}

export function trackerWriteField(charId, field, value) {
  const state = load();
  const c = (suiteState.chars || []).find(x => String(x._id) === charId);
  if (!c) return;
  const cs = ensure(state, c);
  cs[field] = value;
  save(state);
}
```

**Add Influence counter row to the Tracker card UI** in `cardHtml()`:
```js
// After the Willpower counter:
h += counter('Influence', id, 'inf', cs.inf ?? influenceTotal(c), influenceTotal(c), 'trk-row-inf');
```
Only render this row when `influenceTotal(c) > 0` (same guard as the sheet).

---

### 2. `public/js/suite/sheet.js`

**Add import:**
```js
import { trackerRead, trackerReadRaw, trackerAdj } from '../game/tracker.js';
```

**Replace the `renderSheet()` tracker block** (currently lines ~197–207):

Old code reads `tm_tracker_{c.name}`. Replace with:
```js
const charId = String(c._id);

// Migration: if canonical entry is missing but old key exists, seed from old data
if (!trackerReadRaw(charId)) {
  const oldKey = 'tm_tracker_' + c.name;
  try {
    const old = JSON.parse(localStorage.getItem(oldKey) || 'null');
    if (old) {
      // Write migrated values into canonical store
      const maxD = maxH - (old.health ?? maxH);  // infer lethal damage from old health current
      trackerWriteField(charId, 'vitae',     Math.max(0, Math.min(old.vitae  ?? maxV,  maxV)));
      trackerWriteField(charId, 'willpower', Math.max(0, Math.min(old.wp     ?? maxWP, maxWP)));
      trackerWriteField(charId, 'lethal',    Math.max(0, Math.min(maxD,                maxH)));
      trackerWriteField(charId, 'inf',       Math.max(0, Math.min(old.inf    ?? maxInf, maxInf)));
    }
  } catch (e) { /* ignore */ }
}

const cs = trackerRead(charId);
// Map to sheet field names
const tState = {
  vitae:  Math.max(0, Math.min(cs.vitae ?? maxV,   maxV)),
  wp:     Math.max(0, Math.min(cs.willpower ?? maxWP, maxWP)),
  health: Math.max(0, maxH - (cs.bashing ?? 0) - (cs.lethal ?? 0) - (cs.aggravated ?? 0)),
  inf:    Math.max(0, Math.min(cs.inf ?? maxInf, maxInf)),
};
```

Remove the old `localStorage.setItem(tKey, ...)` write-back after building tState — the canonical store is already seeded by `trackerRead()` via `ensure()`.

**Replace the click handler** (currently lines ~569–609, the `document.addEventListener('click', ...)` block at the bottom of the file):

The handler currently reads/writes `tm_tracker_{state.sheetChar.name}`. Replace with:

```js
document.addEventListener('click', function(e) {
  const box = e.target.closest('[data-tracker]');
  if (!box) return;
  const block = box.closest('#tracker-block');
  if (!block) return;
  if (!state.sheetChar) return;

  const type      = box.dataset.tracker;   // 'health' | 'vitae' | 'wp' | 'inf'
  const idx       = parseInt(box.dataset.idx);
  const max       = parseInt(box.dataset.max);
  const filledCls = box.dataset.filled;
  const charId    = String(state.sheetChar._id);
  const cs        = trackerRead(charId);
  if (!cs) return;

  // Compute current value in sheet terms
  const c = state.sheetChar;
  const maxH  = calcHealth(c);
  let currentSheet;
  if (type === 'health') {
    currentSheet = Math.max(0, maxH - (cs.bashing ?? 0) - (cs.lethal ?? 0) - (cs.aggravated ?? 0));
  } else if (type === 'vitae') {
    currentSheet = cs.vitae ?? 0;
  } else if (type === 'wp') {
    currentSheet = cs.willpower ?? 0;
  } else if (type === 'inf') {
    currentSheet = cs.inf ?? 0;
  } else { return; }

  // Compute new value (same tap logic as before)
  const newVal = idx < currentSheet ? idx : idx + 1;
  const delta  = newVal - currentSheet;

  if (type === 'health') {
    if (delta < 0) {
      // Taking damage — add lethal
      trackerAdj(charId, 'lethal', -delta);
    } else if (delta > 0) {
      // Healing — remove bashing first, then lethal, then aggravated
      let remaining = delta;
      const bashing    = cs.bashing    ?? 0;
      const lethal     = cs.lethal     ?? 0;
      const aggravated = cs.aggravated ?? 0;
      const removeBash = Math.min(remaining, bashing);
      remaining -= removeBash;
      const removeLet  = Math.min(remaining, lethal);
      remaining -= removeLet;
      const removeAgg  = Math.min(remaining, aggravated);
      if (removeBash) trackerAdj(charId, 'bashing',    -removeBash);
      if (removeLet)  trackerAdj(charId, 'lethal',     -removeLet);
      if (removeAgg)  trackerAdj(charId, 'aggravated', -removeAgg);
    }
  } else if (type === 'vitae') {
    trackerAdj(charId, 'vitae', delta);
  } else if (type === 'wp') {
    trackerAdj(charId, 'willpower', delta);
  } else if (type === 'inf') {
    trackerAdj(charId, 'inf', delta);
  }

  // Re-read updated state and repaint boxes + number
  const updated = trackerRead(charId);
  let updatedSheet;
  if (type === 'health') {
    updatedSheet = Math.max(0, maxH - (updated.bashing ?? 0) - (updated.lethal ?? 0) - (updated.aggravated ?? 0));
  } else if (type === 'vitae')  { updatedSheet = updated.vitae      ?? 0; }
  else if (type === 'wp')       { updatedSheet = updated.willpower  ?? 0; }
  else if (type === 'inf')      { updatedSheet = updated.inf        ?? 0; }

  const boxesEl = document.getElementById('tb-' + type);
  const numEl   = document.getElementById('tn-' + type);
  if (boxesEl) {
    boxesEl.innerHTML = Array.from({ length: max }, (_, i) => {
      const filled = i < updatedSheet;
      return `<div class="tbox${filled ? ' ' + filledCls : ''}" data-tracker="${type}" data-idx="${i}" data-max="${max}" data-filled="${filledCls}"></div>`;
    }).join('');
  }
  if (numEl) {
    const trueMax = type === 'health' ? maxH
      : type === 'vitae'  ? calcVitaeMax(c)
      : type === 'wp'     ? calcWillpowerMax(c)
      : influenceTotal(c);
    numEl.textContent = updatedSheet + '/' + trueMax;
  }
});
```

**Import `trackerWriteField`** alongside `trackerRead`, `trackerReadRaw`, `trackerAdj`.

---

### 3. `public/js/suite/tracker.js` — no changes required

The only still-used export from this file is `toast`. Do not modify, do not delete. The `stGetTracker`/`stSetTracker`/`renderStOverview` etc. functions are dead code but harmless.

---

## Files to Change

| File | Change |
|---|---|
| `public/js/game/tracker.js` | Add `inf` to schema + `trackerAdj`; add `trackerRead`, `trackerReadRaw`, `trackerWriteField` exports; add Influence row to card UI |
| `public/js/suite/sheet.js` | Import tracker helpers; replace `tm_tracker_{name}` reads/writes with canonical store access; rewrite click handler |

---

## Critical Constraints

- **Do not delete `tm_tracker_{name}` keys** — the migration reads them. They may persist in localStorage indefinitely; this is safe and harmless.
- **`ensure()` in `game/tracker.js` initialises defaults** — calling `trackerRead(charId)` on a character with no entry will seed the canonical store with fresh defaults (max vitae, max willpower, 0 damage, max inf). This is the desired behaviour.
- **`trackerAdj` already clamps values** — do not add additional clamping in the sheet click handler beyond what is already there.
- **`calcVitaeMax`, `calcWillpowerMax`, `calcHealth`, `influenceTotal`** are already imported in `sheet.js`; `influenceTotal` needs to be added to `game/tracker.js` imports.
- **`suiteState` is already imported** in `game/tracker.js` — `trackerRead` can use it to look up the character for `ensure()`.
- **No real-time push** — the Tracker tab re-renders on `goTab('tracker')`. Changes made on the sheet will be visible the next time the Tracker tab opens or `initTracker()` is called. This is acceptable for the current architecture.
- **Health displayed on sheet is total undamaged boxes**, not damage taken. The conversion formula is `maxH - bashing - lethal - aggravated`. This means the sheet boxes and the Tracker numbers represent the same state from different angles.
- **British English**: "Willpower", "Influence", "Bashing", "Lethal", "Aggravated" — match existing casing in the Tracker card UI.
