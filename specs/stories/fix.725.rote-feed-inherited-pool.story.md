---
title: 'Rote feed: inherited pool from primary hunt not surfacing in DT Processing'
type: 'fix'
issue: 725
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/725
branch: ms/issue-725-rote-feed-inherited-pool
created: '2026-06-14'
status: done
recommended_model: 'sonnet — one targeted edit + one Playwright spec; low scope'
context:
  - public/js/admin/downtime-views.js
---

## Intent

The rote feed action card in DT Processing shows a blank dice pool builder
("— + — ±0 = 0") even though the player form displays the full inherited pool
("Pool: 9 (inherited from primary hunt) — 3 Presence · 4 Empathy · 1 Majesty
· +1 Groups").

The pool data exists in the submission — the primary feeding method and
components are in `resp['_feed_method']`, `resp['_feed_disc']`,
`resp['_feed_custom_attr']`, `resp['_feed_custom_skill']` etc. It just isn't
reaching `entry.poolPlayer` for rote actions.

---

## Root cause

### Code path

| File | Lines | Role |
|------|-------|------|
| `public/js/admin/downtime-views.js` | 2868–2932 | Feeding block — builds `poolLabel` from `resp` keys, pushes feeding queue entry |
| `public/js/admin/downtime-views.js` | 2934–3014 | Projects loop — rote action entry built here |
| `public/js/admin/downtime-views.js` | 3005 | `poolPlayer` for rote entry — the broken line |

### Why it's empty

Line 3005 reads:
```js
poolPlayer: proj.primary_pool?.expression || resp[`project_${slot}_pool_expr`] || '',
```

- `proj.primary_pool` is `null` for rote projects (DT4 player form writes `project_N_action: 'rote'` but no `project_N_pool_expr` — the pool is displayed client-side as "inherited")
- `resp[`project_${slot}_pool_expr`]` is also empty for the same reason

`poolLabel` (the correctly-derived primary feed pool string) is a `const` scoped
inside the feeding `{}` block (lines 2868–2932) and is **out of scope** at line 3005.

### The pool label computation (lines 2907–2909)

```js
const poolLabel = feedMethod === 'other' && (feedCustomAttr || feedCustomSkill)
  ? [feedCustomAttr, feedCustomSkill, feedCustomDisc || feedDisc].filter(Boolean).join(' + ')
  : [methodLabel, feedDisc].filter(Boolean).join(' + ');
```

Where:
- `feedMethod`      = `resp['_feed_method'] || ''`
- `feedDisc`        = `resp['_feed_disc'] || ''`
- `feedCustomAttr`  = `resp['_feed_custom_attr'] || ''`
- `feedCustomSkill` = `resp['_feed_custom_skill'] || ''`
- `feedCustomDisc`  = `resp['_feed_custom_disc'] || ''`
- `methodLabel`     = human label for feedMethod (from `FEED_METHOD_LABELS_MAP`)

All these `resp` keys are available throughout the whole submission loop — the problem
is purely block scoping.

---

## Fix

**Hoist `feedPoolLabel` before the feeding block** so it's in scope at line 3005.

The feeding block already computes `poolLabel` from these keys. We just need to
compute an equivalent variable before the block opens (around line 2868), then:
1. Use it as the feeding entry's `poolPlayer` (replacing the inline `poolLabel`)
2. Reference it as a third fallback at line 3005 for the rote entry

### Exact change

**Before the feeding block** (insert around line 2868, before the `{` that opens
the feeding block):

```js
// Hoist primary feed pool label so the rote queue entry can inherit it
const _feedMethod      = resp['_feed_method'] || '';
const _feedDisc        = resp['_feed_disc']   || '';
const _feedCustomAttr  = resp['_feed_custom_attr']  || '';
const _feedCustomSkill = resp['_feed_custom_skill'] || '';
const _feedCustomDisc  = resp['_feed_custom_disc']  || '';
const _feedDesc        = sub._raw?.feeding?.method || resp['feeding_description'] || '';
const _feedTrunc       = _feedDesc.length > 40 ? _feedDesc.slice(0, 40) + '…' : _feedDesc;
const _feedBaseLabel   = FEED_METHOD_LABELS_MAP[_feedMethod] || _feedMethod;
const _feedMethodLabel = _feedMethod === 'other' && _feedTrunc
  ? _feedTrunc
  : (_feedTrunc && _feedTrunc !== _feedBaseLabel ? `${_feedBaseLabel} — ${_feedTrunc}` : _feedBaseLabel);
const feedPoolLabel = _feedMethod === 'other' && (_feedCustomAttr || _feedCustomSkill)
  ? [_feedCustomAttr, _feedCustomSkill, _feedCustomDisc || _feedDisc].filter(Boolean).join(' + ')
  : [_feedMethodLabel, _feedDisc].filter(Boolean).join(' + ');
```

**Inside the feeding block** — replace `poolPlayer: poolLabel` (line 2921) with
`poolPlayer: feedPoolLabel`. The internal `poolLabel` can be removed or left; if
left it will shadow `feedPoolLabel` inside the block but both are identical.

Simplest approach: replace the internal `poolLabel` const at line 2907 with a
reference to `feedPoolLabel`:

```js
// BEFORE (line 2907):
const poolLabel = feedMethod === 'other' && (feedCustomAttr || feedCustomSkill)
  ? [feedCustomAttr, feedCustomSkill, feedCustomDisc || feedDisc].filter(Boolean).join(' + ')
  : [methodLabel, feedDisc].filter(Boolean).join(' + ');

// AFTER:
const poolLabel = feedPoolLabel; // computed above the feeding block; same value
```

**Line 3005 — rote entry `poolPlayer`:**

```js
// BEFORE:
poolPlayer: proj.primary_pool?.expression || resp[`project_${slot}_pool_expr`] || '',

// AFTER:
poolPlayer: proj.primary_pool?.expression || resp[`project_${slot}_pool_expr`] || feedPoolLabel,
```

### Why this is correct

- `feedPoolLabel` is the exact same string that the feeding queue entry uses as
  `poolPlayer` — the ST already sees it on the feeding card. We're just surfacing
  it on the rote card too.
- If `project_N_pool_expr` is ever populated (future form change), it still wins
  via the middle fallback — `feedPoolLabel` is the last resort.
- No schema or API change needed; `sub.feeding_review.pool_player` is not required
  (that's the ST-validated value; what we want here is the player-submitted
  expression so the ST can see what to validate).

---

## Tasks

### T1 — Hoist `feedPoolLabel` and wire it to rote entry [x]

**File:** `public/js/admin/downtime-views.js`

Three edits in sequence:

**Edit A** — Insert `feedPoolLabel` block **immediately before** the feeding `{` block
(the line `// ── Feeding ...` around line 2868). The exact insertion point is after
the sorcery loop closes and before the feeding comment:

```js
// INSERT BEFORE: // ── Feeding (all submissions get an entry …
const _feedMethod      = resp['_feed_method'] || '';
const _feedDisc        = resp['_feed_disc']   || '';
const _feedCustomAttr  = resp['_feed_custom_attr']  || '';
const _feedCustomSkill = resp['_feed_custom_skill'] || '';
const _feedCustomDisc  = resp['_feed_custom_disc']  || '';
const _feedDesc        = sub._raw?.feeding?.method || resp['feeding_description'] || '';
const _feedTrunc       = _feedDesc.length > 40 ? _feedDesc.slice(0, 40) + '…' : _feedDesc;
const _feedBaseLabel   = FEED_METHOD_LABELS_MAP[_feedMethod] || _feedMethod;
const _feedMethodLabel = _feedMethod === 'other' && _feedTrunc
  ? _feedTrunc
  : (_feedTrunc && _feedTrunc !== _feedBaseLabel
      ? `${_feedBaseLabel} — ${_feedTrunc}`
      : _feedBaseLabel);
const feedPoolLabel = _feedMethod === 'other' && (_feedCustomAttr || _feedCustomSkill)
  ? [_feedCustomAttr, _feedCustomSkill, _feedCustomDisc || _feedDisc].filter(Boolean).join(' + ')
  : [_feedMethodLabel, _feedDisc].filter(Boolean).join(' + ');
```

**Edit B** — Inside the feeding `{}` block, replace the standalone `poolLabel`
computation (~line 2907) so it reuses the hoisted value instead of re-deriving:

```js
// BEFORE:
const poolLabel = feedMethod === 'other' && (feedCustomAttr || feedCustomSkill)
  ? [feedCustomAttr, feedCustomSkill, feedCustomDisc || feedDisc].filter(Boolean).join(' + ')
  : [methodLabel, feedDisc].filter(Boolean).join(' + ');

// AFTER:
const poolLabel = feedPoolLabel;
```

This keeps all existing references to `poolLabel` inside the feeding block
unchanged (`poolPlayer: poolLabel`, `description: poolLabel || ...`).

**Edit C** — At the rote queue-entry push (~line 3005), add `feedPoolLabel` as
third fallback:

```js
// BEFORE:
poolPlayer: proj.primary_pool?.expression || resp[`project_${slot}_pool_expr`] || '',

// AFTER:
poolPlayer: proj.primary_pool?.expression || resp[`project_${slot}_pool_expr`] || feedPoolLabel,
```

---

### T2 — QA: write and run Playwright spec [x]

**File:** `tests/fix-725-rote-feed-inherited-pool.spec.js`

Use the same `setupProcessing` pattern from `tests/fix-723-rote-feed-terr-preselect.spec.js`.

Set `resp['_feed_method']` and `resp['_feed_disc']` on the submission so the feeding
pool label has a known value, then open the rote action card and assert that
`entry.poolPlayer` (surfaced as `.proc-pool-player-label` or equivalent) shows
the correct inherited string.

Test cases:

| # | Setup | Assertion |
|---|-------|-----------|
| 1 | `_feed_method: 'empathy'`, `_feed_disc: 'Majesty'` | Rote card pool display contains "Empathy" and "Majesty" |
| 2 | `_feed_method: 'other'`, `_feed_custom_attr: 'Presence'`, `_feed_custom_skill: 'Socialise'` | Rote card shows "Presence + Socialise" |
| 3 | No `_feed_method` | Rote card pool display is blank/empty (no crash) |

> **Note:** If `entry.poolPlayer` is displayed as the "Player Pool" button label or
> a text display in the pool builder, locate the correct selector first by reading
> `_renderActionTypeRow` around where `entry.poolPlayer` is used.

---

## Acceptance criteria

- [ ] Given a submission with `_feed_method: 'empathy'` and `_feed_disc: 'Majesty'`,
  the rote action card in DT Processing shows the inherited pool string in the pool
  builder area
- [ ] Given a submission with `_feed_method: 'other'` and custom attr/skill, the
  rote card shows the custom expression
- [ ] Given no primary feed method is set, the rote card pool area is blank — no
  crash, no regression
- [ ] The standard feeding action card is unaffected (its `poolPlayer` is unchanged)

---

## Guardrails

- Only `downtime-views.js` changes (one hoist block + two single-line edits).
- `feedPoolLabel` must be computed **outside** the feeding `{}` block scope.
- The feeding entry's `poolPlayer` must remain identical to what it was before —
  `poolLabel = feedPoolLabel` is a value alias, not a behaviour change.
- Do NOT read `sub.feeding_review.pool_validated` here — that's the ST's validated
  result, not the player's input. We want the raw player-submitted expression as
  the pool builder starting point.

---

## Dev Agent Record

### Files changed
- `public/js/admin/downtime-views.js` — Edit A: hoisted `feedPoolLabel` block before the feeding `{}` block; Edit B: aliased internal `poolLabel = feedPoolLabel`; Edit C: added `|| feedPoolLabel` as third fallback on rote entry's `poolPlayer`
- `tests/fix-725-rote-feed-inherited-pool.spec.js` — 3 Playwright tests, 3/3 passing

### Completion notes
Root cause was pure block scoping: `poolLabel` was `const`-scoped inside the feeding `{}` block and unavailable at the rote entry build site. Hoisted equivalent computation as `feedPoolLabel`, aliased inside the block to keep existing references intact, and added as fallback on the rote entry. `FEED_METHOD_LABELS_MAP` has keys `seduction/stalking/force/familiar/intimidation/other` — tests use `seduction` and `other`; unknown slugs fall back to raw slug string (lowercase).
