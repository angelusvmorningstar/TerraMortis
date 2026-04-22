# Story: rites.3 — Schema: relax sub_category enum for non-merit powers

## Status: review

## Summary

The `sub_category` field on `purchasable_power.schema.js` has an `enum` constraint that only allows merit-specific values (`general`, `influence`, `domain`, `standing`, `null`). This causes POST requests for new rites (and other non-merit powers) to fail schema validation with a 400 error if any other string value is present. The fix removes the enum, leaving `sub_category` as a free nullable string. The enum was always a schema-layer concern only — the application logic that reads sub_category values checks them explicitly by string and is unaffected.

---

## Scope

| Layer | Change |
|-------|--------|
| `server/schemas/purchasable_power.schema.js` | Remove `enum` from `sub_category` |

---

## Acceptance Criteria

1. POST `/api/rules` with a rite document and `sub_category: null` returns 201
2. POST `/api/rules` with `sub_category: "Transmutation 3"` returns 201
3. POST `/api/rules` with `sub_category: "general"` (merit value) still returns 201
4. No regression to existing merit sub_category filtering in the UI

---

## Tasks / Subtasks

- [x] Remove enum constraint from sub_category (AC: #1, #2, #3)
  - [x] Change `sub_category: { type: ['string', 'null'], enum: ['general', 'influence', 'domain', 'standing', null] }` to `sub_category: { type: ['string', 'null'] }` in `purchasable_power.schema.js`
  - [x] Update the comment from "Merit sub-category (general/influence/domain/standing)" to reflect it is used by all power categories
- [x] Verify via API test (AC: #1, #2, #3, #4)
  - [x] Add test: POST rite with `sub_category: null` → 201
  - [x] Add test: POST rite with `sub_category: "Transmutation 3"` → 201
  - [x] Add test: existing merit sub_category values still accepted

---

## Dev Notes

### Current schema line (line 122)

```js
// Merit sub-category (general/influence/domain/standing) — null for non-merits
sub_category: { type: ['string', 'null'], enum: ['general', 'influence', 'domain', 'standing', null] },
```

### Target

```js
// Sub-category: merits use general/influence/domain/standing; other categories use null or a free string
sub_category: { type: ['string', 'null'] },
```

### Why the enum is safe to remove

The UI code that filters/displays by sub_category (e.g. merit grid grouping) checks the value by explicit string comparison. The schema enum was only enforcing data quality at insert time — removing it does not change any runtime behaviour. Existing documents are unaffected.

### Tests

Extend `server/tests/api-rules-offering.test.js` with the new sub_category cases, or add a new describe block to `api-rules-offering.test.js` since it already seeds rite fixtures.

---

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log

### Completion Notes

- Removed `enum` constraint from `sub_category` — now `{ type: ['string', 'null'] }` only
- Updated comment to reflect field is shared across all power categories
- 3 new sub_category POST tests added to `api-rules-offering.test.js`
- 9/9 tests passing

### File List

- `server/schemas/purchasable_power.schema.js`
- `server/tests/api-rules-offering.test.js`

### Change Log

- 2026-04-23: Implemented rites.3 — removed sub_category enum restriction
