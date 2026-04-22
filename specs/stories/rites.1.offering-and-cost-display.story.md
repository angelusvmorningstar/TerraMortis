# Story: rites.1 — Rite Offering & Activation Cost Display

## Status: review

## Summary

Rites currently show XP cost on their badge but never display activation cost (1 V / 1 WP) or the required offering/sacrament material. Both fields exist in the rules DB; neither is surfaced to the user. This story pipes them through schema → API → character sheet drawer.

---

## Scope

| Layer | Change |
|-------|--------|
| `server/schemas/purchasable_power.schema.js` | Add `offering` field |
| `server/routes/rules.js` | Add `offering` to `UPDATABLE_FIELDS` |
| `public/js/editor/sheet.js` | Show `cost` + `offering` in rite drawer |

Out of scope: downtime form, rules admin view, admin rite editor UI (separate stories).

---

## Acceptance criteria

1. A rite drawer on the character sheet (both view and edit mode) displays a single cost line:
   - When no offering: `"1 WP"` / `"1 V"` as-is
   - When offering present: `"1 WP & A rod or staff"` — cost and offering joined with ` & `
   - Sourced by looking up the rule's `cost` and `offering` fields in the rules DB
2. The `offering` field passes schema validation on POST/PUT to `/api/rules`
3. No regression to the XP cost badge, free/XP toggle, or drawer stats/effect display

---

## Tasks / Subtasks

- [x] Add `offering` field to server schema (AC: #2)
  - [x] Add `offering: { type: ['string', 'null'] }` to `purchasable_power.schema.js` properties block
- [x] Add `offering` to API UPDATABLE_FIELDS (AC: #2)
  - [x] Add `'offering'` to the `UPDATABLE_FIELDS` Set in `server/routes/rules.js`
- [x] Display cost + offering in rite drawer (AC: #1, #3)
  - [x] In `sheet.js` `ritP.forEach` block, look up rule entry by name from `getRulesByCategory('rite')`
  - [x] Build `costLine` string: `baseCost` alone when no offering, `"baseCost & offering"` when offering present
  - [x] Render `costLine` in both edit-mode and view-mode drawer HTML using `disc-power-stats` class
  - [x] Confirm existing XP badge, free/XP toggle, stats, and effect display are unaffected

---

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log

### Completion Notes

- Added `offering: { type: ['string', 'null'] }` to `purchasable_power.schema.js`
- Added `'offering'` to `UPDATABLE_FIELDS` in `rules.js`
- In `sheet.js` rite `forEach` block: looks up rule by name from `getRulesByCategory('rite')`, builds `costLine` as `"cost & offering"` or `"cost"` alone, prepends `Cost: ...` as a `disc-power-stats` div in both edit and view mode drawers
- Discipline drawers (lines 398/409) untouched — only rite drawer lines 498/500 patched

### File List

- `server/schemas/purchasable_power.schema.js`
- `server/routes/rules.js`
- `public/js/editor/sheet.js`

### Change Log

- 2026-04-23: Implemented rites.1 — offering and activation cost display in rite drawers

---

## Data flow

Rites on a character are stored in `c.powers[]` with `{ category, name, tradition, level, free, stats, effect }`. They do **not** carry `cost` or `offering` — those live on the rules document in `purchasable_powers`.

The character sheet already calls `getRulesByCategory('rite')` to populate the add-rite dropdown (sheet.js ~line 506). Use the same cached array to look up the rule by name when rendering each rite drawer.

```js
const ruleEntry = getRulesByCategory('rite')?.find(r => r.name === p.name);
const activationCost = ruleEntry?.cost ?? null;
const offering = ruleEntry?.offering ?? null;
```

---

## Implementation

### 1. Schema — `server/schemas/purchasable_power.schema.js`

Add `offering` to the `properties` block:

```js
offering: { type: ['string', 'null'] },
```

### 2. API allowlist — `server/routes/rules.js`

Add `'offering'` to `UPDATABLE_FIELDS`:

```js
const UPDATABLE_FIELDS = new Set([
  'name', 'parent', 'rank', 'rating_range', 'description',
  'pool', 'resistance', 'cost', 'action', 'duration',
  'prereq', 'exclusive', 'sub_category', 'xp_fixed', 'bloodline',
  'offering',   // ← add
]);
```

### 3. Character sheet drawer — `public/js/editor/sheet.js`

In the `ritP.forEach(p => { ... })` block (around line 483), look up the rule entry and extend **both** the edit-mode and view-mode drawer HTML.

Build the cost string before constructing the drawer HTML:

```js
const ruleEntry = getRulesByCategory('rite')?.find(r => r.name === p.name);
const baseCost = ruleEntry?.cost ?? null;
const offering = ruleEntry?.offering ?? null;
const costLine = baseCost
  ? (offering ? `${baseCost} & ${offering}` : baseCost)
  : null;
```

In the drawer, render `costLine` as a single line inside `disc-power`, before `stats` and `effect`:

```html
<!-- only when costLine is non-null -->
<div class="disc-power-stats">Cost: 1 WP & A rod or staff</div>
```

---

## CSS

No new classes needed. The cost line reuses the existing `disc-power-stats` style, which already renders at reduced opacity in the drawer.

---

## Notes

- `cost` is already stored on rules documents (`"1 V"` / `"1 WP"`) — no data migration needed for cost
- `offering` requires a DB import after the CSV export script adds the column — that is a separate task (rites.0 — CSV export)
- If `getRulesByCategory('rite')` returns null (rules not yet loaded), the drawer simply omits the meta block — no error
- Do not store `cost` or `offering` redundantly on `c.powers[]` entries
