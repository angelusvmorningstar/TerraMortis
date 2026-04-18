# Story feat.12: Feed Confirm Card Improvements

**Story ID:** feat.12
**Epic:** Feature Backlog
**Status:** ready-for-dev
**Date:** 2026-04-18

---

## User Story

As an ST confirming a character's feeding roll in the player portal, I want the confirm card to default to the correct calculated vitae total, display how much influence the character spent last downtime, write the confirmed vitae as an overwrite (not an addition), deduct the influence spend on confirm, and render using consistent button styling.

---

## Background & Current State

The ST confirm panel lives in `public/js/player/feeding-tab.js` lines 687–701 and is rendered inside the player portal's feeding tab (`player.html`). CSS lives in `public/css/player-layout.css`.

The panel currently has four problems:

### Problem 1 — Default stepper value uses `safeVitae` not `grandTotal`

Line 692:
```js
h += `<span class="feed-confirm-val" id="feed-confirm-n">${safeVitae}</span>`;
```
`safeVitae = successes × 2` — the raw dice result with no bonus. The allocated total (`vesselTotal + vitateTally.total_bonus`) is already computed and displayed above the panel. For the example in the image: `safeVitae = 6`, but the correct value is `7 + 5 = 12`.

Both `vitaeAllocation` (module-level array of per-vessel allocations) and `vitateTally` (module-level tally object with `total_bonus`) are accessible at the ST panel render point.

### Problem 2 — `loadInfluenceSpend` always returns 0

Lines 910–928: the function reads `merit_actions_resolved[].inf_spent`, which is never populated by the DT processing pipeline (acknowledged in the comment on line 911).

**The real data source** is `responses.influence_spend` on the downtime submission — a JSON string storing per-territory allocations:
```json
"influence_spend": "{\"the_academy\": 3, \"the_dockyards\": -2}"
```
Total spent = sum of absolute values across all territory entries. This field is written by `downtime-form.js` lines 290–297 and is present on every Cycle 2+ player submission.

### Problem 3 — Confirm button adds to vitae rather than overwriting

Line 813:
```js
await trackerAdj(String(currentChar._id), 'vitae', n);
```
`trackerAdj` adds `delta` to current value. So if current vitae is 3 and the ST confirms 12, the character ends up at 15 (or max). The correct behaviour is to **set** vitae to `n`, capped at max.

`trackerAdj` already clamps to `[0, max]`, so the overwrite is achievable by computing `delta = target - current` before calling it. `trackerRead(charId).vitae` gives the current value.

There is also no influence deduction on confirm — it must also call `trackerAdj(charId, 'inf', -infSpent)`.

### Problem 4 — Button CSS mismatch

`.feed-confirm-btn` in `player-layout.css` line 2571:
```css
background: var(--gold2); ... color: #1a1207;
```
`var(--gold2)` renders as a muted olive in the player portal theme, and `#1a1207` is hardcoded dark text. The correct standard for submit-action buttons in this codebase is `.qf-btn-submit` (`background: var(--gold); color: var(--bg)`). The `#fvc-confirm` button on the same page already uses `qf-btn qf-btn-submit` correctly (line 680).

---

## Implementation Plan

### Task 1 — Fix default stepper value and add vitae breakdown to ST panel

**File:** `public/js/player/feeding-tab.js`

At the ST panel render block (around line 687), compute the default value before building the HTML:

```js
// Derive ST default: allocated total when known, else safeVitae
const stVesselTotal = vitaeAllocation
  ? vitaeAllocation.reduce((a, b) => a + b, 0)
  : safeVitae;
const stBonus = vitateTally?.total_bonus ?? 0;
const stDefault = stVesselTotal + stBonus;
```

Then render the breakdown line inside the ST panel (between the label and the stepper), and use `stDefault` as the stepper initial value:

```js
h += `<div class="feed-st-confirm">`;
h += `<div class="feed-st-confirm-lbl">Confirm vitae gained:</div>`;
if (stBonus) {
  h += `<div class="feed-st-vitae-total">Vessel vitae: <strong>${stVesselTotal}</strong> + Bonus: <strong>+${stBonus}</strong> = <strong>${stDefault}</strong> total</div>`;
} else {
  h += `<div class="feed-st-vitae-total">Vessel vitae: <strong>${stVesselTotal}</strong></div>`;
}
h += `<div class="feed-confirm-controls">`;
h += `<button class="feed-adj" id="feed-confirm-adj-down">\u2212</button>`;
h += `<span class="feed-confirm-val" id="feed-confirm-n">${stDefault}</span>`;
h += `<button class="feed-adj" id="feed-confirm-adj-up">+</button>`;
h += `</div>`;
h += `<button class="feed-confirm-btn" id="feed-confirm-btn">Confirm Feed</button>`;
// … rest of panel unchanged
```

### Task 2 — Fix `loadInfluenceSpend` to read from `responses.influence_spend`

**File:** `public/js/player/feeding-tab.js`, replace `loadInfluenceSpend` (lines 910–928):

```js
async function loadInfluenceSpend(charId) {
  const el = container?.querySelector('#feed-inf-spent');
  if (!el) return;
  try {
    const subs = await apiGet('/api/downtime_submissions');
    const latest = subs
      .filter(s => String(s.character_id) === charId && s.responses?.influence_spend)
      .sort((a, b) => (String(b._id) > String(a._id) ? 1 : -1))[0];
    if (!latest) { el.textContent = '0'; return; }
    const spendObj = JSON.parse(latest.responses.influence_spend || '{}');
    const total = Object.values(spendObj).reduce((sum, v) => sum + Math.abs(v || 0), 0);
    el.textContent = String(total);
  } catch {
    el.textContent = 'N/A';
  }
}
```

The function already fires at line 723 when the ST panel renders — no call-site change needed.

### Task 3 — Fix confirm button: overwrite vitae, deduct influence

**File:** `public/js/player/feeding-tab.js`, replace the `#feed-confirm-btn` click handler (lines 809–816):

```js
container.querySelector('#feed-confirm-btn')?.addEventListener('click', async () => {
  if (!currentChar) return;
  const charId = String(currentChar._id);
  const n = parseInt(container.querySelector('#feed-confirm-n')?.textContent) || 0;

  // Overwrite vitae: compute delta from current so trackerAdj sets the target value
  const current = trackerRead(charId).vitae ?? 0;
  const delta = n - current;
  if (delta !== 0) await trackerAdj(charId, 'vitae', delta);

  // Deduct influence spent last cycle
  const infEl = container.querySelector('#feed-inf-spent');
  const infSpent = infEl ? (parseInt(infEl.textContent) || 0) : 0;
  if (infSpent > 0) await trackerAdj(charId, 'inf', -infSpent);

  const btn = container.querySelector('#feed-confirm-btn');
  if (btn) { btn.textContent = 'Confirmed \u2713'; btn.disabled = true; }
});
```

`trackerAdj` clamps to `[0, vitaeMax]` automatically — no manual cap needed.
`trackerRead` is already imported in `feeding-tab.js` (confirm this import exists; add if missing).

### Task 4 — CSS: fix `.feed-confirm-btn`

**File:** `public/css/player-layout.css`, line 2571

Replace:
```css
.feed-confirm-btn { width: 100%; padding: 12px; background: var(--gold2); border: none; border-radius: 6px; color: #1a1207; font-family: var(--fl); font-size: 13px; letter-spacing: .1em; text-transform: uppercase; cursor: pointer; }
```
With:
```css
.feed-confirm-btn { width: 100%; padding: 12px; background: var(--gold); border: none; border-radius: 6px; color: var(--bg); font-family: var(--fl); font-size: 13px; letter-spacing: .1em; text-transform: uppercase; cursor: pointer; }
```
Two changes: `var(--gold2)` → `var(--gold)`, `#1a1207` → `var(--bg)`. Matches `.qf-btn-submit` pattern used elsewhere on the same page.

Also add the vitae breakdown line CSS (add after `.feed-confirm-val`):
```css
.feed-st-vitae-total { font-family: var(--fl); font-size: 13px; color: var(--accent); margin-bottom: 10px; }
```

---

## Acceptance Criteria

- [ ] ST confirm stepper defaults to `grandTotal` (vessel vitae + bonus), not `safeVitae`
- [ ] When bonus vitae exists, the ST panel shows "Vessel vitae: X + Bonus: +Y = Z total" above the stepper
- [ ] "Influence spent last cycle" shows the correct value derived from `responses.influence_spend` (sum of absolute territory values from the latest submission)
- [ ] Pressing Confirm overwrites the character's current vitae to the stepper value (capped at max), not adds to it
- [ ] Pressing Confirm deducts the displayed influence spent from the character's tracker influence total
- [ ] The Confirm Feed button visually matches other submit-action buttons in the player portal (gold background, dark text using CSS vars)
- [ ] No regression to the player-facing feeding flow

---

## Files to Change

| File | Change |
|---|---|
| `public/js/player/feeding-tab.js` | Task 1: compute `stDefault`, add breakdown line; Task 2: rewrite `loadInfluenceSpend`; Task 3: rewrite confirm click handler |
| `public/css/player-layout.css` | Task 4: fix `.feed-confirm-btn` colours; add `.feed-st-vitae-total` |

**Do not touch:**
- Player-facing vessel allocation flow (`#fvc-confirm`, `doConfirmAllocation`, `updateVesselUI`)
- `public/js/game/tracker.js` — `trackerAdj` and `trackerRead` used as-is
- Any game app files (`suite/sheet.js`, `app.js`)

---

## Critical Constraints

- **`vitaeAllocation`** is a module-level var in `feeding-tab.js` — available at the ST panel render point. When null (no allocation yet), fall back to `safeVitae`.
- **`trackerRead`** must be imported in `feeding-tab.js` — check line 1 imports; add from `'../game/tracker.js'` if missing.
- **Influence deduction clamp**: `trackerAdj(charId, 'inf', -infSpent)` clamps to 0 naturally. If the character spent more influence than they currently have tracked, it floors to 0 — this is correct behaviour.
- **`responses.influence_spend` is only present on Cycle 2+ submissions** — Cycle 1 (CSV) has no `influence_spend` field. The `loadInfluenceSpend` filter `s.responses?.influence_spend` already handles this safely (returns '0' if no matching submission).

---

## Reference

- ST panel render: `public/js/player/feeding-tab.js` lines 687–701
- Confirm handler: `public/js/player/feeding-tab.js` lines 809–816
- `loadInfluenceSpend`: `public/js/player/feeding-tab.js` lines 910–928
- `responses.influence_spend` written by: `public/js/player/downtime-form.js` lines 290–297
- Button CSS: `public/css/player-layout.css` lines 2569–2573
- Reference button style: `.qf-btn-submit` at `player-layout.css` lines 1241–1246
- `trackerAdj`, `trackerRead`: `public/js/game/tracker.js`
