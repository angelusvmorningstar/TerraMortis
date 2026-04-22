# Story: rites.2 — Cult-Gated Powers

## Status: review

## Summary

Devotions (and other purchasable powers) can be gated to Mystery Cult membership. The first use case is The Moulding Room's exclusive devotions. A new `cult` field on the power record is matched against the `cult_name` strings on the character's Mystery Cult Initiation merits.

---

## Scope

| Layer | Change |
|-------|--------|
| `server/schemas/purchasable_power.schema.js` | Add `cult` field |
| `server/routes/rules.js` | Add `cult` to `UPDATABLE_FIELDS` |
| `public/js/editor/merits.js` | `getCharCults()` helper + gate in `meetsDevPrereqs()` + display in `devPrereqStr()` |
| `public/js/admin/rules-view.js` | Add `cult` text field to create/edit form |
| `public/js/admin/data-portability.js` | Add `cult` to export headers, row mapping, and import handler |

Out of scope: populating existing Moulding Room devotions with their cult name (data entry via admin UI or CSV import once field exists).

---

## Acceptance Criteria

1. A devotion with `cult: "The Moulding Room"` is only available to add for characters who have a Mystery Cult Initiation merit with `cult_name: "The Moulding Room"`
2. A character with multiple MCI merits can access devotions from any of their cults
3. The devotion prereq display shows e.g. `"The Moulding Room members only"` alongside discipline requirements
4. ST can set/edit the `cult` field via the rules admin edit form
5. The `cult` field round-trips correctly through CSV export and import
6. No regression to bloodline gating or existing devotion prereq checks

---

## Tasks / Subtasks

- [x] Add `cult` field to server schema (AC: #5)
  - [x] Add `cult: { type: ['string', 'null'] }` to `purchasable_power.schema.js` properties block
- [x] Add `cult` to API UPDATABLE_FIELDS (AC: #4, #5)
  - [x] Add `'cult'` to `UPDATABLE_FIELDS` Set in `server/routes/rules.js`
- [x] Implement cult gate in `merits.js` (AC: #1, #2, #3)
  - [x] Add `getCharCults(c)` helper — returns a `Set` of cult names from character's MCI merits
  - [x] In `meetsDevPrereqs()` (line 417): add cult gate after bloodline check
  - [x] In `devPrereqStr()` (line 428): add cult display line
- [x] Add `cult` field to rules admin form (AC: #4)
  - [x] Add `cult` text input to create form (after `bloodline`, line 303)
  - [x] Add `cult` text input to edit form (after `bloodline`, line 332)
- [x] Add `cult` to data portability (AC: #5)
  - [x] Add `'cult'` to `rulesHeaders()` array (after `'offering'`)
  - [x] Add `d.cult || ''` to `rulesToRows()` mapping
  - [x] Add `cult` to import handler string fields (after `offering`)

---

## Dev Notes

### Cult membership on a character

Cult membership is **not** a top-level field — it lives on merit objects:

```js
c.merits = [
  { name: 'Mystery Cult Initiation', rating: 3, cult_name: 'The Moulding Room', ... },
  { name: 'Mystery Cult Initiation', rating: 2, cult_name: 'Some Other Cult', ... },
]
```

`getCharCults(c)` must filter merits where `name === 'Mystery Cult Initiation'` and collect their `cult_name` values.

### Gate implementation

```js
function getCharCults(c) {
  return new Set(
    (c.merits || [])
      .filter(m => m.name === 'Mystery Cult Initiation' && m.cult_name)
      .map(m => m.cult_name)
  );
}

export function meetsDevPrereqs(c, dev) {
  if (dev.bl && (c.bloodline || '') !== dev.bl) return false;
  if (dev.cult && !getCharCults(c).has(dev.cult)) return false;  // ← add
  const discs = c.disciplines || {};
  if (!dev.p || !dev.p.length) return true;
  if (dev.or) return dev.p.some(p => (discs[p.disc]?.dots || 0) >= p.dots);
  return dev.p.every(p => (discs[p.disc]?.dots || 0) >= p.dots);
}
```

### prereq string display

```js
export function devPrereqStr(dev) {
  const parts = [];
  if (dev.bl) parts.push(dev.bl + ' only');
  if (dev.cult) parts.push(dev.cult + ' members only');  // ← add
  if (dev.p && dev.p.length) parts.push(dev.p.map(p => p.disc + ' ' + p.dots).join(dev.or ? ' or ' : ', '));
  return parts.join('; ') || 'None';
}
```

### Rules admin form

`rules-view.js` lines 302–303 (create) and 331–332 (edit) already have `Exclusive` and `Bloodline` fields rendered via `mf()`. Add `Cult` immediately after `Bloodline` in both blocks.

### Data portability

`rulesHeaders()` currently ends with `'offering'` (added in rites.1). Add `'cult'` after it.
`rulesToRows()` currently ends with `d.offering || ''`. Add `d.cult || ''` after it.
Import handler: add `cult` after `offering` in the simple nullable string fields block (around line 367).

---

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log

### Completion Notes

- `getCharCults(c)` collects cult names from all MCI merits — supports multi-cult characters naturally via Set membership
- Cult gate added after bloodline check in `meetsDevPrereqs()` — both gates independent
- `devPrereqStr()` shows e.g. "The Moulding Room members only" before discipline requirements
- Rules admin create + edit forms both gain a `Cult` text field after `Bloodline`
- Data portability: `cult` added to headers, row export, and import handler
- Existing rules API tests (6/6) pass — no regression

### File List

- `server/schemas/purchasable_power.schema.js`
- `server/routes/rules.js`
- `public/js/editor/merits.js`
- `public/js/admin/rules-view.js`
- `public/js/admin/data-portability.js`

### Change Log

- 2026-04-23: Implemented rites.2 — cult-gated powers
