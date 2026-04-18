# Story feat.12b: Feed Confirm Card v2 — Tracker Sync, Two-Column Layout, Max Values

**Story ID:** feat.12b
**Epic:** Feature Backlog / Live Session Toolkit
**Status:** ready-for-dev
**Date:** 2026-04-18
**Continues:** feat.12 (partially implemented in-session on 2026-04-18)

---

## User Story

As an ST confirming a character's feeding roll, I want the confirm card to show vitae and influence as separate side-by-side controls each displaying current/max values, so that I can see at a glance what a character will end up with after confirming — and I want those values to be immediately visible in the game app tracker without navigating away.

---

## Background & Current State

### What feat.12 implemented (session 2026-04-18, now live on main)

- `apiPut('/api/tracker_state/' + charId, { vitae: n })` — **overwrites** vitae in MongoDB (not delta). Correct.
- Influence deduction writes to `tm_tracker_local_${charId}.inf` in localStorage. Correct.
- `_stConfirmed` module-level map + `tm_st_feed_${charId}` localStorage backing for confirmed record. Correct.
- Edit button clears confirmed state. Correct.
- Influence input is a `<input type="number">` above the Confirm button. Working but layout needs redesign.

### Three remaining problems diagnosed

---

### Problem 1 — Vitae does not immediately update in game app tracker

**Symptom (image 22):** After ST confirms Vitae 6 in player.html feeding tab, the game app tracker still shows V 11/11.

**Root cause:** `trackerAdj` is not usable from player.html — `suiteState.chars` is empty there. The existing `apiPut` approach correctly writes vitae to MongoDB. The game app tracker (`public/js/game/tracker.js`) re-fetches from MongoDB on every `initTracker()` call (line 169: `_confirmed.clear()`) — so the value WILL be correct when the ST navigates to the tracker tab. But if the tracker tab was already open when confirm was pressed, the cached value (`_cache[charId].vitae = 11`) is stale and the game app never sees the update.

**Why influence updates instantly:** Influence lives in `tm_tracker_local_${charId}` localStorage. Both the feeding tab write and the game app read reference the same localStorage key. No API round-trip needed.

**Fix:** Also write vitae to `tm_tracker_local_` on feeding confirm (analogous to influence), and update `ensureLoaded` in tracker.js to prefer a `vitae_confirmed` localStorage field over the remote value when present. Clear `vitae_confirmed` when the ST manually adjusts vitae in the game app.

**Key files:**
- `public/js/player/feeding-tab.js` — confirm handler writes `vitae_confirmed` to localStorage
- `public/js/game/tracker.js` — `ensureLoaded` (line 79) reads `local.vitae_confirmed`; `trackerAdj` (line 188) clears `vitae_confirmed` when field is 'vitae'

---

### Problem 2 — Layout: influence is inline in the vitae row (image 20)

**Symptom:** "INFLUENCE SPENT LAST CYCLE: [5]" is positioned as a sub-label inside the "CONFIRM VITAE GAINED" card area — it reads as part of the vitae row rather than a separate control.

**Required design:** Two separate rows inside the confirm card, each with a label, a −/N/+ stepper, and a current/max display:

```
┌─────────────────────────────────────────┐
│ CONFIRM VITAE GAINED          6 / 11    │
│ [−]  6  [+]                             │
│                                         │
│ INFLUENCE SPENT              5 / 9 avail│
│ [−]  5  [+]                             │
│                                         │
│ [         CONFIRM FEED         ]        │
└─────────────────────────────────────────┘
```

The vitae row shows: `stDefault` (initial) / `vitaeMax` as context.
The influence row shows: deduction amount (initial: auto-loaded from `loadInfluenceSpend`) / current influence in tracker.

---

### Problem 3 — Confirmed record does not show X/max values (image 21)

**Current:** `✓ Feed confirmed — Vitae → 6 | Inf −5`
**Required:** `✓ Feed confirmed — Vitae 6/11 | Inf 4/9`

- `6/11` = confirmed vitae / vitaeMax
- `4/9` = (infCurrent − infSpent) / infMax

The confirmed record currently stores `{ vitae: n, infSpent }`. It needs to also store `{ vitaeMax, infCurrent, infMax }` so the record can render X/max format.

---

## Implementation Plan

### Task 1 — Add vitae_confirmed localStorage write on feeding confirm

**File:** `public/js/player/feeding-tab.js`

After the successful `apiPut` in the `#feed-confirm-btn` click handler, also write vitae to localStorage:

```js
// Write vitae to localStorage so game app tracker picks it up immediately
// without needing to navigate away (analogous to how influence is handled)
try {
  const key = 'tm_tracker_local_' + charId;
  const local = JSON.parse(localStorage.getItem(key) || '{}');
  local.vitae_confirmed = n;
  localStorage.setItem(key, JSON.stringify(local));
} catch { /* ignore */ }
```

Add `vitaeMax` and influence state to the `_stConfirmed` record so the confirmed display can show X/max:

```js
// Compute post-confirm influence state for the confirmed record
let infMax = 0;
try {
  const key = 'tm_tracker_local_' + charId;
  const local = JSON.parse(localStorage.getItem(key) || '{}');
  infMax = calcTotalInfluence(currentChar);
  const infCurrent = local.inf ?? infMax;
  const infAfter = Math.max(0, infCurrent - infSpent);
  _stConfirmed[charId] = {
    vitae: n,
    vitaeMax: calcVitaeMax(currentChar),
    infSpent,
    infAfter,
    infMax,
  };
} catch {
  _stConfirmed[charId] = { vitae: n, vitaeMax: null, infSpent, infAfter: null, infMax: null };
}
try { localStorage.setItem('tm_st_feed_' + charId, JSON.stringify(_stConfirmed[charId])); } catch {}
render();
```

Add imports at the top of `feeding-tab.js` (both source modules already imported — just add the functions):

```js
// Add calcVitaeMax to the existing accessors.js import line:
import { getAttrEffective as getAttrVal, skDots, skSpecStr, skNineAgain, calcVitaeMax } from '../data/accessors.js';

// Add calcTotalInfluence to the existing domain.js import line:
import { domMeritContrib, effectiveInvictusStatus, calcTotalInfluence } from '../editor/domain.js';
```

Verify these functions are exported from their respective modules. `calcVitaeMax` is confirmed exported from `public/js/data/accessors.js` (used by tracker.js line 6). `calcTotalInfluence` is confirmed exported from `public/js/editor/domain.js` (used by tracker.js line 7).

---

### Task 2 — Redesign confirm card: two-row layout with steppers and max display

**File:** `public/js/player/feeding-tab.js` — ST confirm panel HTML block (currently around lines 707–728)

Replace the current HTML build with a two-row layout:

```js
// Get current influence for display
let infMax = calcTotalInfluence(currentChar);
let infCurrent = infMax;
try {
  const local = JSON.parse(localStorage.getItem('tm_tracker_local_' + charId) || '{}');
  if (local.inf != null) infCurrent = local.inf;
} catch {}
const vitaeMax = calcVitaeMax(currentChar);

h += `<div class="feed-st-confirm">`;
// Vitae row
h += `<div class="feed-st-row">`;
h += `<div class="feed-st-row-lbl">Vitae Gained</div>`;
h += `<div class="feed-st-row-ctrl">`;
h += `<button class="feed-adj" id="feed-confirm-adj-down">\u2212</button>`;
h += `<span class="feed-confirm-val" id="feed-confirm-n">${stDefault}</span>`;
h += `<button class="feed-adj" id="feed-confirm-adj-up">+</button>`;
h += `</div>`;
h += `<div class="feed-st-row-max">/ ${vitaeMax}</div>`;
h += `</div>`;
// Influence row
h += `<div class="feed-st-row">`;
h += `<div class="feed-st-row-lbl">Influence Spent</div>`;
h += `<div class="feed-st-row-ctrl">`;
h += `<button class="feed-adj" id="feed-inf-adj-down">\u2212</button>`;
h += `<span class="feed-inf-val" id="feed-inf-spent">0</span>`;
h += `<button class="feed-adj" id="feed-inf-adj-up">+</button>`;
h += `</div>`;
h += `<div class="feed-st-row-max">/ ${infCurrent} avail</div>`;
h += `</div>`;
h += `<button class="feed-confirm-btn" id="feed-confirm-btn">Confirm Feed</button>`;
h += `</div>`;
```

Remove the now-unused `.feed-inf-input` input element and the `feed-st-confirm-lbl feed-inf-row` div.

Wire up the new influence stepper in `wireEvents()`:

```js
container.querySelector('#feed-inf-adj-down')?.addEventListener('click', () => {
  const el = container.querySelector('#feed-inf-spent');
  if (el) el.textContent = String(Math.max(0, (parseInt(el.textContent) || 0) - 1));
});
container.querySelector('#feed-inf-adj-up')?.addEventListener('click', () => {
  const el = container.querySelector('#feed-inf-spent');
  if (el) el.textContent = String((parseInt(el.textContent) || 0) + 1);
});
```

Update the confirm click handler to read influence from `#feed-inf-spent` textContent (the span, not `.value`):

```js
const infEl = container.querySelector('#feed-inf-spent');
const infSpent = infEl ? (parseInt(infEl.textContent) || 0) : 0;
```

Keep the `loadInfluenceSpend` call after render to auto-populate the influence stepper. Update `loadInfluenceSpend` to write to `#feed-inf-spent` textContent (currently sets `.textContent` already — confirm this is still correct after the HTML change). The function sets `el.textContent = String(total)` which is correct for the `<span>` element.

---

### Task 3 — Update confirmed record to show X/max format

**File:** `public/js/player/feeding-tab.js` — confirmed display block (inside `if (confirmed)`)

Replace:
```js
let rec = `Vitae \u2192 ${confirmed.vitae}`;
if (confirmed.infSpent > 0) rec += `\u2002|\u2002Inf \u2212${confirmed.infSpent}`;
```

With:
```js
const vitaeStr = confirmed.vitaeMax != null
  ? `Vitae ${confirmed.vitae}/${confirmed.vitaeMax}`
  : `Vitae \u2192 ${confirmed.vitae}`;
const infStr = confirmed.infAfter != null && confirmed.infMax != null
  ? `Inf ${confirmed.infAfter}/${confirmed.infMax}`
  : confirmed.infSpent > 0 ? `Inf \u2212${confirmed.infSpent}` : null;
let rec = vitaeStr;
if (infStr) rec += ` \u2002|\u2002 ${infStr}`;
```

This gracefully falls back to the old format if max values are unavailable (e.g., records saved before this story shipped).

---

### Task 4 — Update tracker.js to use vitae_confirmed from localStorage

**File:** `public/js/game/tracker.js`

In `ensureLoaded` (line ~80), update the cache initialisation to prefer `local.vitae_confirmed` over remote:

```js
_cache[id] = {
  vitae:      local.vitae_confirmed ?? remote.vitae ?? defaults(c).vitae,
  willpower:  remote.willpower  ?? defaults(c).willpower,
  bashing:    remote.bashing    ?? 0,
  lethal:     remote.lethal     ?? 0,
  aggravated: remote.aggravated ?? 0,
  inf:        local.inf         ?? calcTotalInfluence(c),
  conditions: local.conditions  ?? [],
};
```

In `trackerAdj` (line ~188), clear `vitae_confirmed` when vitae is manually adjusted (ST override in game app):

```js
if (field === 'vitae') {
  cs.vitae = clamp(cs.vitae + delta, 0, calcVitaeMax(c));
  // Clear feed-confirmed vitae once ST makes a manual adjustment
  try {
    const key = LOCAL_PREFIX + charId;
    const local = JSON.parse(localStorage.getItem(key) || '{}');
    delete local.vitae_confirmed;
    localStorage.setItem(key, JSON.stringify(local));
  } catch {}
```

This ensures `vitae_confirmed` acts as a one-time override: it takes effect when the game app next loads the character, and is discarded once the ST makes any manual vitae change.

---

### Task 5 — CSS: add two-row layout classes

**File:** `public/css/player-layout.css` — after the existing `.feed-st-confirm` rules

Add:
```css
.feed-st-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.feed-st-row-lbl { font-family: var(--fl); font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--txt2); min-width: 120px; }
.feed-st-row-ctrl { display: flex; align-items: center; gap: 6px; }
.feed-st-row-max { font-family: var(--fl); font-size: 12px; color: var(--txt3); }
```

Remove or leave unused: `.feed-inf-row`, `.feed-inf-input` (these came from Peter's branch and are now superseded). They can stay in CSS without harm but the HTML no longer generates them.

---

## Acceptance Criteria

- [ ] After ST confirms feed in player.html, the game app tracker reflects the new vitae value immediately when any character is loaded in the tracker (without needing to navigate away and back to the tracker tab)
- [ ] The confirm card shows vitae and influence as two separate rows, each with a label, `−/N/+` stepper, and context display (e.g. `/ 11` max for vitae, `/ 9 avail` for influence)
- [ ] The influence stepper auto-populates with the value from `loadInfluenceSpend` (from `responses.influence_spend` on the latest DT submission)
- [ ] The confirmed record shows `Vitae 6/11 | Inf 4/9` format (current/max for both)
- [ ] If `vitaeMax` or influence values are unavailable (old record), confirmed record falls back to `Vitae → N | Inf −N` format without throwing
- [ ] Once the ST makes a manual vitae adjustment in the game app tracker, `vitae_confirmed` is cleared from localStorage and the manual value takes precedence
- [ ] No regression to player-facing feeding flow (player sees nothing different)
- [ ] No regression to game app tracker `+/−` buttons

---

## Files to Change

| File | Task | Change |
|---|---|---|
| `public/js/player/feeding-tab.js` | 1, 2, 3 | Add `calcVitaeMax` + `calcTotalInfluence` imports; rewrite confirm card HTML; update confirm handler; update confirmed record display |
| `public/js/game/tracker.js` | 4 | `ensureLoaded`: prefer `local.vitae_confirmed`; `trackerAdj`: clear `vitae_confirmed` on vitae write |
| `public/css/player-layout.css` | 5 | Add `.feed-st-row*` classes |

**Do not touch:**
- Player-facing vessel allocation (`#fvc-confirm`, `doConfirmAllocation`, `updateVesselUI`)
- `loadInfluenceSpend` reads `responses.influence_spend` — this was fixed in feat.12; do not revert

---

## Critical Constraints

- **`trackerAdj` is NOT usable from player.html** — `suiteState.chars` is empty there. The `apiPut('/api/tracker_state/' + charId, { vitae: n })` approach is correct and must not be replaced.
- **`tm_tracker_local_` key format** — the game app writes `{ inf, conditions }` under `LOCAL_PREFIX + charId`. Adding `vitae_confirmed` to this same object is safe (the existing `saveLocal` helper merges via spread). Do not overwrite the whole object.
- **`calcVitaeMax`** — exported from `public/js/data/accessors.js`. Already imported in tracker.js at line 6.
- **`calcTotalInfluence`** — exported from `public/js/editor/domain.js`. Already imported in tracker.js at line 7. Also already imported in feeding-tab.js as part of `domain.js` imports — just add to the destructure.
- **`loadInfluenceSpend` still targets `#feed-inf-spent`** — after this story, `#feed-inf-spent` becomes a `<span>` inside `.feed-st-row-ctrl` (not an `<input>`). The function sets `.textContent` which is correct for a span. Confirm the function does NOT set `.value`.
- **localStorage `tm_st_feed_${charId}`** — confirmed record persistence. Schema is extended in this story to `{ vitae, vitaeMax, infSpent, infAfter, infMax }`. Old records (missing vitaeMax/infAfter/infMax) fall back gracefully per Task 3.

---

## Reference

| Item | Location |
|---|---|
| ST confirm panel HTML | `public/js/player/feeding-tab.js` ~line 707 |
| Confirm click handler | `public/js/player/feeding-tab.js` ~line 840 |
| `_stConfirmed` record | `public/js/player/feeding-tab.js` line 53 |
| `loadInfluenceSpend` | `public/js/player/feeding-tab.js` ~line 930 |
| `ensureLoaded` | `public/js/game/tracker.js` line 72 |
| `trackerAdj` | `public/js/game/tracker.js` line 188 |
| `LOCAL_PREFIX` | `public/js/game/tracker.js` line 10 |
| `calcVitaeMax` export | `public/js/data/accessors.js` |
| `calcTotalInfluence` export | `public/js/editor/domain.js` |
| `responses.influence_spend` written by | `public/js/player/downtime-form.js` lines 290–297 |
| Parchment CSS token rules | `public/css/player-layout.css` — use `var(--fl)` for labels, `var(--txt2)` for secondary text, `var(--accent)` for values |

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
