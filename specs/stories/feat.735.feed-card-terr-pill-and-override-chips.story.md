---
title: 'DT Processing: harmonise feeding card territory pill + expand feed override to chips'
type: 'feature'
issue: 735
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/735
branch: ms/issue-735-feed-card-terr-chips
created: '2026-06-15'
status: done
recommended_model: 'sonnet — three contained changes in one file'
context:
  - public/js/admin/downtime-views.js
  - public/css/admin-layout.css
---

## Intent

Two UX improvements to the DT Processing feeding card:

1. **Territory pill (normal feed)** — wrap the existing flat inline pill row in a
   `proc-feed-mod-panel` bordered panel to match the rote feed card's style.

2. **Feed declaration panel** — replace the feeding method `<select>` dropdown
   with toggle chip buttons, and add a new Blood Type override row using the
   same chip pattern.

---

## Root cause / motivation

The rote feed card already has the correct territory panel style (bordered,
titled "Territory") via `_renderActionTypeRow()`. The normal feeding card renders
territory pills as a bare inline row inside `proc-recat-row` — inconsistent.

The Feed Declaration override uses a plain `<select>` for feeding method only.
The DT player form uses full-width toggle chips for both Blood Type and feeding
method. Matching that style makes the override feel native, and adding Blood Type
override lets STs correct an incorrect player submission without reopening the
form.

---

## File locations

| File | Lines | Notes |
|------|-------|-------|
| `public/js/admin/downtime-views.js` | 9651–9654 | Territory pill row — `renderNormalisedCard()`, normal feed branch |
| `public/js/admin/downtime-views.js` | 7058–7061 | Rote feed territory panel — target CSS structure to match |
| `public/js/admin/downtime-views.js` | 7949–7964 | Feed Declaration panel — `_renderFeedRightPanel()` |
| `public/js/admin/downtime-views.js` | 4817–4831 | Existing violence override `change` handler — replace with chip handler |
| `public/js/admin/downtime-views.js` | 5060 | `saveEntryReview` call shape — `blood_type` already saved here for detail card |

---

## Data shapes

### Player-declared values (read-only display)

| Field | Location | Shape |
|-------|----------|-------|
| Feeding method | `feedSub.responses.feed_violence` | `'kiss'` \| `'violent'` \| `''` |
| Blood type | `feedSub.responses._feed_blood_types` | JSON-stringified array, e.g. `'["human"]'` or `'["animal","human"]'` |

### ST override values (new read/write)

| Field | Location | Values |
|-------|----------|--------|
| Feeding method override | `feedSub.st_review.feed_violence_st_override` | `'kiss'` \| `'violent'` \| absent |
| Blood type override | `feedSub.st_review.feed_blood_type_st_override` | `'animal'` \| `'human'` \| `'kindred'` \| absent |

Use `feed_blood_type_st_override` consistently across all read and write sites
(render, event handler, `updateSubmission` call). Do not use any other key name.

---

## T1 — Wrap normal-feed territory pill in bordered panel

**File:** `public/js/admin/downtime-views.js`

In `renderNormalisedCard()` at lines 9651–9654, change:

```js
// BEFORE:
h += `<div class="proc-recat-row">`;
h += `<span class="proc-feed-lbl">Territories</span>`;
h += _renderInlineTerrPills(entry.subId, 'feeding', '', _feedSet, true);
h += `</div>`;
```

```js
// AFTER:
h += `<div class="proc-feed-mod-panel">`;
h += `<div class="proc-mod-panel-title">Territory</div>`;
h += _renderInlineTerrPills(entry.subId, 'feeding', '', _feedSet, true);
h += `</div>`;
```

**Why this works:** `proc-feed-mod-panel` and `proc-mod-panel-title` are already
styled in `admin-layout.css` and used identically in `_renderActionTypeRow()`
(line 7058). No CSS additions needed.

---

## T2 — Replace Feed Declaration dropdown with chip buttons + add blood type row

**File:** `public/js/admin/downtime-views.js`  
**Function:** `_renderFeedRightPanel()` — replace lines 7949–7964 entirely.

### Player-declared display

For blood type: parse `feedSub.responses._feed_blood_types` as a JSON array and
join with " / " for display (e.g. `"Human"` or `"Animal / Human"`). Capitalise
each value for display. Empty array or parse failure → `'<em>Not specified</em>'`.

For feeding method: existing `_viLabel()` helper already handles this.

### ST override chips

Use `proc-spec-chip` buttons with `is-active` toggle (already styled in
`admin-layout.css`). Each chip row sits inside a `proc-mod-row`. No new CSS
needed.

**Violence chips** — three buttons in a `proc-feed-chips` wrapper:
- `value=""` "No override" (active when `stViOverride` is falsy)
- `value="kiss"` "The Kiss (subtle)"
- `value="violent"` "Violent"

**Blood type chips** — three buttons:
- `value=""` "No override" (active when `stBtOverride` is falsy)  
- `value="animal"` "Animal"
- `value="human"` "Human"
- `value="kindred"` "Kindred"

```js
// AFTER (full replacement of lines 7949–7964):

// ── DTFP-5: feed-violence + blood-type ST overrides ──
const playerVi      = feedSub?.responses?.feed_violence || '';
const stViOverride  = feedSub?.st_review?.feed_violence_st_override || '';
const playerBtRaw   = feedSub?.responses?.['_feed_blood_types'] || '[]';
let   playerBtArr   = [];
try   { playerBtArr = JSON.parse(playerBtRaw); } catch { playerBtArr = []; }
const playerBtLabel = playerBtArr.length
  ? playerBtArr.map(v => v.charAt(0).toUpperCase() + v.slice(1)).join(' / ')
  : '';
const stBtOverride  = feedSub?.st_review?.feed_blood_type_st_override || '';
const _viLabel = (v) => v === 'kiss' ? 'The Kiss (subtle)' : v === 'violent' ? 'Violent' : '';

h += `<div class="proc-feed-mod-panel proc-feed-violence-block" data-proc-key="${esc(key)}">`;
h += `<div class="proc-mod-panel-title">Feed declaration</div>`;

// Blood type row
h += `<div class="proc-mod-row"><span class="proc-mod-label">Blood type</span>`;
h += `<span class="proc-feed-violence-val">${esc(playerBtLabel) || '<em>Not specified</em>'}</span></div>`;
h += `<div class="proc-mod-row proc-feed-chips-row">`;
h += `<span class="proc-mod-label">ST override</span>`;
h += `<div class="proc-feed-chips">`;
for (const [val, lbl] of [['', 'No override'], ['animal', 'Animal'], ['human', 'Human'], ['kindred', 'Kindred']]) {
  const active = (val === '' ? !stBtOverride : stBtOverride === val) ? ' is-active' : '';
  h += `<button type="button" class="proc-spec-chip proc-feed-bt-chip${active}" data-sub-id="${esc(entry.subId)}" data-value="${esc(val)}">${esc(lbl)}</button>`;
}
h += `</div></div>`;

// Feeding method row
h += `<div class="proc-mod-row"><span class="proc-mod-label">Player declared</span>`;
h += `<span class="proc-feed-violence-val">${esc(_viLabel(playerVi)) || '<em>Not specified</em>'}</span></div>`;
h += `<div class="proc-mod-row proc-feed-chips-row">`;
h += `<span class="proc-mod-label">ST override</span>`;
h += `<div class="proc-feed-chips">`;
for (const [val, lbl] of [['', 'No override'], ['kiss', 'The Kiss (subtle)'], ['violent', 'Violent']]) {
  const active = (val === '' ? !stViOverride : stViOverride === val) ? ' is-active' : '';
  h += `<button type="button" class="proc-spec-chip proc-feed-vi-chip${active}" data-sub-id="${esc(entry.subId)}" data-value="${esc(val)}">${esc(lbl)}</button>`;
}
h += `</div></div>`;

h += `</div>`; // proc-feed-violence-block
```

---

## T3 — Wire chip event handlers

**File:** `public/js/admin/downtime-views.js`

Find the existing violence override handler at lines 4817–4831 and **replace
the entire block** (the `select` change handler) with handlers for both chip
types.

```js
// REPLACE: lines 4817–4831 (proc-feed-violence-st-override select handler)

// Wire feeding method override chips
container.querySelectorAll('.proc-feed-vi-chip').forEach(btn => {
  btn.addEventListener('click', async e => {
    e.stopPropagation();
    const subId = btn.dataset.subId;
    const newVal = btn.dataset.value || null;
    const sub = submissions.find(s => s._id === subId);
    if (sub) {
      if (!sub.st_review) sub.st_review = {};
      if (newVal) sub.st_review.feed_violence_st_override = newVal;
      else delete sub.st_review.feed_violence_st_override;
    }
    await updateSubmission(subId, { 'st_review.feed_violence_st_override': newVal });
    // Update active state on sibling chips
    container.querySelectorAll(`.proc-feed-vi-chip[data-sub-id="${subId}"]`).forEach(b => {
      b.classList.toggle('is-active', b.dataset.value === (newVal || ''));
    });
  });
});

// Wire blood type override chips
container.querySelectorAll('.proc-feed-bt-chip').forEach(btn => {
  btn.addEventListener('click', async e => {
    e.stopPropagation();
    const subId = btn.dataset.subId;
    const newVal = btn.dataset.value || null;
    const sub = submissions.find(s => s._id === subId);
    if (sub) {
      if (!sub.st_review) sub.st_review = {};
      if (newVal) sub.st_review.feed_blood_type_st_override = newVal;
      else delete sub.st_review.feed_blood_type_st_override;
    }
    await updateSubmission(subId, { 'st_review.feed_blood_type_st_override': newVal });
    // Update active state on sibling chips
    container.querySelectorAll(`.proc-feed-bt-chip[data-sub-id="${subId}"]`).forEach(b => {
      b.classList.toggle('is-active', b.dataset.value === (newVal || ''));
    });
  });
});
```

---

## T4 — Minor CSS: chip row layout

**File:** `public/css/admin-layout.css`

Add a layout rule so the chip row label and chips sit on the same row. Add near
the existing `proc-feed-mod-panel` block (search for `.proc-feed-mod-panel`):

```css
.proc-feed-chips-row { align-items: flex-start; }
.proc-feed-chips { display: flex; flex-wrap: wrap; gap: 4px; }
```

Check that `proc-mod-row` already has `display: flex` (it does — verify before
adding any duplicate flex declaration).

---

## Acceptance criteria

- [x] Normal feeding card territory pill is inside a bordered panel with "Territory" heading (matching rote card)
- [x] Feed Declaration panel shows Blood Type row: player declared (read-only) + ST override chips (No override / Animal / Human / Kindred)
- [x] Feed Declaration panel shows feeding method row: player declared (read-only) + ST override chips (No override / The Kiss (subtle) / Violent)
- [x] Active chip highlights correctly on load (matches persisted `st_review` value)
- [x] Clicking a chip persists to `st_review.feed_violence_st_override` or `st_review.feed_blood_type_st_override` via `updateSubmission`
- [x] Clicking the active chip again (or "No override") clears the override and removes the key
- [x] `feed_blood_type_st_override` key used consistently at all read + write sites — no other spelling
- [x] No regression on rote feed territory pill (unchanged)

---

## Guardrails

- Only `public/js/admin/downtime-views.js` and `public/css/admin-layout.css` change.
- Do NOT touch `_renderActionTypeRow()` — rote territory panel is already correct.
- Do NOT touch `_entryTerritories()` — filter logic is separate from rendering.
- The `_viLabel()` helper can remain as an inline const inside `_renderFeedRightPanel()` (it's local scope only).
- `proc-spec-chip` CSS is already in `admin-layout.css` (`.is-active` state included). Do not duplicate its styles.
- The `proc-recat-row` div and `proc-feed-lbl` span being removed in T1 — confirm neither is used elsewhere in `renderNormalisedCard()` before deletion (grep for both class names to confirm).

---

## Dev Agent Record

### Files changed

- `public/js/admin/downtime-views.js` — T1: territory pill wrapped in `proc-feed-mod-panel`; T2: Feed Declaration replaced with chip rows for blood type + feeding method; T3: select handler replaced with two chip click handlers
- `public/css/admin-layout.css` — T4: added `.proc-feed-chips-row` and `.proc-feed-chips` layout rules

### Completion notes

T1 replaces the bare `proc-recat-row` wrapper with `proc-feed-mod-panel` + `proc-mod-panel-title` — same pattern as `_renderActionTypeRow()`. T2 adds blood type override row above the feeding method row; each uses `proc-spec-chip proc-feed-bt-chip` / `proc-feed-vi-chip` with `is-active` toggling on load from persisted `st_review` values. T3 replaces the single `select` change handler with two chip click handlers that update the in-memory `sub.st_review`, call `updateSubmission`, then toggle sibling chip active states. `feed_blood_type_st_override` is the sole key name used at all sites. No Playwright tests written — no existing fixture harness for `_renderFeedRightPanel`; visual AC verified by code inspection.
