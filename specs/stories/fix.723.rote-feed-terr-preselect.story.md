---
title: 'Rote feed in DT processing: territory not pre-selected; action type display wrong'
type: 'fix'
issue: 723
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/723
branch: ms/issue-723-rote-feed-terr-preselect
created: '2026-06-14'
status: done
recommended_model: 'sonnet — two targeted edits + one CSS rule; low scope'
context:
  - public/js/admin/downtime-views.js
  - public/css/admin-layout.css
---

## Intent

Two bugs on the rote feed action card in DT processing, found during DT4.

**Bug 1 — Territory not pre-selected:**
Aleksei selected The Second City for their rote hunt; Keeper selected The Barrens. Neither
territory is pre-active in the DT processing territory pill row — N/A is shown instead. The
ST has to manually set territory they can already see on the player form.

**Root cause:** Two `_rotePillSet` / `_rtPillSet` builders read from
`responses.feeding_territories_rote` (a JSON status-grid). DT4 app-form submissions write
the rote territory to `project_N_territory` (a plain slug string) instead. The builders
never fall back to that key, so the set is always empty and N/A wins by default.

**Bug 2 — Action type shows dropdown, should be a chip:**
The rote feed action type is fixed — it cannot be recategorised. Yet `_renderActionTypeRow`
renders a full `<select>` dropdown for it. The correct display is a read-only text chip,
matching the merit category chip pattern used elsewhere in DT processing.

---

## Root cause code

| File | Lines | Role |
|------|-------|------|
| `public/js/admin/downtime-views.js` | 7021–7041 | `_renderRightMechanics` — rote pills in detail panel |
| `public/js/admin/downtime-views.js` | 8238–8262 | `_renderActionTypeRow` — rote pills in inline row |
| `public/js/admin/downtime-views.js` | 8196–8202 | `_renderActionTypeRow` — action type `<select>` |
| `public/css/admin-layout.css` | 6087+ | `proc-merit-cat-chip` pattern to reuse |

**Key data facts:**
- `entry.projTerritory` is already populated from `resp[`project_${slot}_territory`]` (line 3011); it holds the raw form slug (e.g. `'secondcity'`, `'barrens'`)
- `TERRITORY_SLUG_MAP['secondcity'] = 'secondcity'` (pass-through)
- `TERRITORY_SLUG_MAP['barrens'] = null` — so `null ?? entry.projTerritory` gives `'barrens'`, which matches the Barrens pill's `data-terr-id="barrens"`
- The `_rotePillSet` / `_rtPillSet` is a `Set<string>` passed to `_renderInlineTerrPills` as `feedingSet`; a pill is active when `feedingSet.has(t.id)`

---

## Current code (verbatim)

### `_renderRightMechanics` — detail panel rote pills (lines 7021–7041)

```js
if (entry.originalActionType === 'rote') {
  const _rtSub = submissions.find(s => s._id === entry.subId);
  const _rtOvrArr = _rtSub?.st_review?.territory_overrides?.feeding_rote;
  let _rtPillSet;
  if (Array.isArray(_rtOvrArr)) {
    _rtPillSet = new Set(_rtOvrArr);
  } else {
    _rtPillSet = new Set();
    try {
      const _rtGrid = JSON.parse(_rtSub?.responses?.feeding_territories_rote || '{}');
      for (const [slug, status] of Object.entries(_rtGrid)) {
        if (!status || status === 'none' || status === 'Not feeding here') continue;
        const tid = TERRITORY_SLUG_MAP[slug];
        if (tid) _rtPillSet.add(tid);
      }
    } catch { /* ignore */ }
  }
  h += `<div class="proc-feed-mod-panel">`;
  h += `<div class="proc-mod-panel-title">Territory</div>`;
  h += _renderInlineTerrPills(entry.subId, 'feeding_rote', '', _rtPillSet, true);
  h += `</div>`;
}
```

### `_renderActionTypeRow` — inline row rote pills (lines 8238–8262)

```js
if (entry.originalActionType === 'rote') {
  // Rote feed: single row writing to feeding_rote (what the matrix reads)
  const _roteSub = submissions.find(s => s._id === entry.subId);
  const _roteOvrArr = _roteSub?.st_review?.territory_overrides?.feeding_rote;
  let _rotePillSet;
  if (Array.isArray(_roteOvrArr)) {
    _rotePillSet = new Set(_roteOvrArr);
  } else {
    _rotePillSet = new Set();
    try {
      const _roteGrid = JSON.parse(_roteSub?.responses?.feeding_territories_rote || '{}');
      for (const [slug, status] of Object.entries(_roteGrid)) {
        if (!status || status === 'none' || status === 'Not feeding here') continue;
        let tid;
        if (/^[a-f0-9]{24}$/i.test(slug)) {
          const terrDoc = (cachedTerritories || []).find(t => String(t._id) === slug);
          tid = terrDoc?.slug || null;
        } else {
          tid = TERRITORY_SLUG_MAP[slug];
        }
        if (tid) _rotePillSet.add(tid);
      }
    } catch { /* ignore */ }
  }
  h += _renderInlineTerrPills(entry.subId, 'feeding_rote', '', _rotePillSet);
}
```

### `_renderActionTypeRow` — action type select (lines 8196–8202)

```js
h += `<div class="proc-recat-row${suppressTerrPills ? ' proc-recat-row-top' : ''}">`;
h += `<span class="proc-feed-lbl">Action Type</span>`;
h += `<select class="proc-recat-select" data-proc-key="${esc(key)}">`;
for (const [val, lbl] of Object.entries(ACTION_TYPE_LABELS)) {
  h += `<option value="${esc(val)}"${actionType === val ? ' selected' : ''}>${esc(lbl)}</option>`;
}
h += `</select>`;
```

---

## Tasks

### T1 — Add `entry.projTerritory` fallback to both `_rotePillSet` builders [x]

Apply the same one-line fallback in **both** locations. After the `} catch { /* ignore */ }` block (when the ST has no override saved AND `feeding_territories_rote` is absent/empty), seed the set from the entry's already-computed `projTerritory`.

**Location A: `_renderRightMechanics` (around line 7036)**

```js
// BEFORE (inside the else branch, after the try/catch):
    } catch { /* ignore */ }
  }

// AFTER:
    } catch { /* ignore */ }
    // Fallback: seed from player's submitted project territory slug (app-form writes here,
    // not to feeding_territories_rote). TERRITORY_SLUG_MAP['barrens'] = null, so ?? keeps 'barrens'.
    if (_rtPillSet.size === 0 && entry.projTerritory) {
      _rtPillSet.add(TERRITORY_SLUG_MAP[entry.projTerritory] ?? entry.projTerritory);
    }
  }
```

Full diff context (replace the closing block of the `else` branch):

```js
// BEFORE:
    } else {
      _rtPillSet = new Set();
      try {
        const _rtGrid = JSON.parse(_rtSub?.responses?.feeding_territories_rote || '{}');
        for (const [slug, status] of Object.entries(_rtGrid)) {
          if (!status || status === 'none' || status === 'Not feeding here') continue;
          const tid = TERRITORY_SLUG_MAP[slug];
          if (tid) _rtPillSet.add(tid);
        }
      } catch { /* ignore */ }
    }

// AFTER:
    } else {
      _rtPillSet = new Set();
      try {
        const _rtGrid = JSON.parse(_rtSub?.responses?.feeding_territories_rote || '{}');
        for (const [slug, status] of Object.entries(_rtGrid)) {
          if (!status || status === 'none' || status === 'Not feeding here') continue;
          const tid = TERRITORY_SLUG_MAP[slug];
          if (tid) _rtPillSet.add(tid);
        }
      } catch { /* ignore */ }
      if (_rtPillSet.size === 0 && entry.projTerritory) {
        _rtPillSet.add(TERRITORY_SLUG_MAP[entry.projTerritory] ?? entry.projTerritory);
      }
    }
```

**Location B: `_renderActionTypeRow` (around line 8260)**

```js
// BEFORE:
    } else {
      _rotePillSet = new Set();
      try {
        const _roteGrid = JSON.parse(_roteSub?.responses?.feeding_territories_rote || '{}');
        for (const [slug, status] of Object.entries(_roteGrid)) {
          if (!status || status === 'none' || status === 'Not feeding here') continue;
          let tid;
          if (/^[a-f0-9]{24}$/i.test(slug)) {
            const terrDoc = (cachedTerritories || []).find(t => String(t._id) === slug);
            tid = terrDoc?.slug || null;
          } else {
            tid = TERRITORY_SLUG_MAP[slug];
          }
          if (tid) _rotePillSet.add(tid);
        }
      } catch { /* ignore */ }
    }

// AFTER:
    } else {
      _rotePillSet = new Set();
      try {
        const _roteGrid = JSON.parse(_roteSub?.responses?.feeding_territories_rote || '{}');
        for (const [slug, status] of Object.entries(_roteGrid)) {
          if (!status || status === 'none' || status === 'Not feeding here') continue;
          let tid;
          if (/^[a-f0-9]{24}$/i.test(slug)) {
            const terrDoc = (cachedTerritories || []).find(t => String(t._id) === slug);
            tid = terrDoc?.slug || null;
          } else {
            tid = TERRITORY_SLUG_MAP[slug];
          }
          if (tid) _rotePillSet.add(tid);
        }
      } catch { /* ignore */ }
      if (_rotePillSet.size === 0 && entry.projTerritory) {
        _rotePillSet.add(TERRITORY_SLUG_MAP[entry.projTerritory] ?? entry.projTerritory);
      }
    }
```

**Why `?? entry.projTerritory`:** `TERRITORY_SLUG_MAP['barrens'] = null` (explicitly). Nullish coalescing means `null ?? 'barrens' = 'barrens'`, which matches the Barrens pill's `data-terr-id`. Without `??`, Barrens submissions would silently produce an empty set.

**ST override takes priority:** The `if (Array.isArray(_roteOvrArr))` branch runs first and populates the set from the saved override; the fallback only applies when that branch did NOT run (i.e. no ST override yet).

---

### T2 — Show read-only chip for rote feed action type [x]

**File:** `public/js/admin/downtime-views.js`, lines 8196–8202 (inside `_renderActionTypeRow`).

Replace the `<select>` with a chip when `entry.originalActionType === 'rote'`:

```js
// BEFORE:
h += `<div class="proc-recat-row${suppressTerrPills ? ' proc-recat-row-top' : ''}">`;
h += `<span class="proc-feed-lbl">Action Type</span>`;
h += `<select class="proc-recat-select" data-proc-key="${esc(key)}">`;
for (const [val, lbl] of Object.entries(ACTION_TYPE_LABELS)) {
  h += `<option value="${esc(val)}"${actionType === val ? ' selected' : ''}>${esc(lbl)}</option>`;
}
h += `</select>`;

// AFTER:
h += `<div class="proc-recat-row${suppressTerrPills ? ' proc-recat-row-top' : ''}">`;
h += `<span class="proc-feed-lbl">Action Type</span>`;
if (entry.originalActionType === 'rote') {
  h += `<span class="proc-merit-cat-chip proc-action-type-rote">Rote Feed</span>`;
} else {
  h += `<select class="proc-recat-select" data-proc-key="${esc(key)}">`;
  for (const [val, lbl] of Object.entries(ACTION_TYPE_LABELS)) {
    h += `<option value="${esc(val)}"${actionType === val ? ' selected' : ''}>${esc(lbl)}</option>`;
  }
  h += `</select>`;
}
```

**File:** `public/css/admin-layout.css` — add one rule after the existing `proc-merit-cat-*` block (around line 6100):

```css
.proc-action-type-rote { background: var(--surf2); color: var(--txt2); border: 1px solid var(--bdr); }
```

This reuses the `proc-merit-cat-chip` base class (already defined: 10px, 700 weight, uppercase, 2px 7px padding, border-radius 3px) and adds a neutral surface-tier colour consistent with Retainer/Staff chips.

---

### T3 — QA: write and run Playwright spec [x]

**File:** `tests/fix-723-rote-feed-terr-preselect.spec.js`

Use the same `setupProcessing` + project submission pattern from
`tests/fix-719-dt-terr-pills-second-city.spec.js`. For the rote feed, set
`_raw.projects: [{ action_type: 'rote', primary_pool: null, desired_outcome: '' }]`
(so `entry.originalActionType === 'rote'`) and set
`responses.project_1_territory: '<slug>'`.

Test cases required:

| # | Setup | Assertion |
|---|-------|-----------|
| 1 | `project_1_territory: 'secondcity'`, no ST override | `.proc-terr-pill[data-terr-id="secondcity"]` has class `is-active` in detail panel |
| 2 | `project_1_territory: 'barrens'`, no ST override | `.proc-terr-pill[data-terr-id="barrens"]` has class `is-active` in detail panel |
| 3 | `st_review.territory_overrides.feeding_rote: ['academy']` | `is-active` pill is `academy`, not `secondcity` (override wins) |
| 4 | `project_1_territory: 'secondcity'` | No `.proc-recat-select` in action type row (chip replaced it) |
| 5 | `project_1_territory: 'secondcity'` | `.proc-action-type-rote` chip visible with text "ROTE FEED" (uppercase via CSS) |

---

## Acceptance criteria

- [ ] Given a player submitted a rote hunt with `project_1_territory: 'secondcity'`, the
  Second City territory pill is `is-active` when the ST opens that action in DT processing
- [ ] Given a player submitted a rote hunt with `project_1_territory: 'barrens'`, the
  Barrens pill is `is-active`
- [ ] ST territory overrides (`st_review.territory_overrides.feeding_rote`) still take
  priority over the player's submitted value
- [ ] The action type row shows a read-only chip ("ROTE FEED") instead of a `<select>`
  dropdown for rote feed actions
- [ ] Non-rote project actions are unaffected — they still show the `<select>` dropdown

---

## Guardrails

- Only `downtime-views.js` (T1 + T2 JS) and `admin-layout.css` (T2 CSS) change.
- T1 adds **two** fallback lines — one in `_renderRightMechanics`, one in `_renderActionTypeRow`. Both are required.
- The `??` operator is critical for Barrens (`TERRITORY_SLUG_MAP['barrens'] = null`); `||` would fail here.
- Do NOT change the save path — the existing `proc-terr-pill` click handler already writes to `st_review.territory_overrides.feeding_rote` (no change needed there).
- `entry.projTerritory` is already computed at queue-build time (line 3011); no re-read needed.

---

## Dev Agent Record

### Files changed
- `public/js/admin/downtime-views.js` — T1: added `entry.projTerritory` fallback to `_renderRightMechanics` and `_renderActionTypeRow` (both `_rtPillSet` builders); T2: replaced unconditional `<select>` with conditional chip/select in `_renderActionTypeRow` for rote actions
- `public/css/admin-layout.css` — T2: added `.proc-action-type-rote` colour modifier rule after the existing `proc-merit-cat-*` block
- `tests/fix-723-rote-feed-terr-preselect.spec.js` — T3: 5 Playwright tests covering all ACs; 5/5 pass

### Completion notes
T1: Both `_rotePillSet`/`_rtPillSet` builders now fall back to `entry.projTerritory` when the JSON grid (`feeding_territories_rote`) is empty and no ST override exists. `TERRITORY_SLUG_MAP['barrens'] = null`, so `?? entry.projTerritory` preserves `'barrens'` correctly. ST overrides (`st_review.territory_overrides.feeding_rote`) still take priority via the `Array.isArray` branch. T2: Rote feed action type now renders a read-only `.proc-merit-cat-chip.proc-action-type-rote` chip instead of the recategorisation `<select>`; non-rote actions unchanged. T3: 5/5 Playwright tests pass covering both territory slugs, ST override precedence, absent dropdown, and chip visibility.
