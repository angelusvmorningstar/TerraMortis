# Test Automation Summary — issue-293: Regent Appoints Lieutenant

**Date:** 2026-05-14
**Author:** Quinn (QA)
**Scope:** API coverage for `PATCH /api/territories/:id/lieutenant`

## Generated Tests

### API Tests

- [x] `server/tests/api-territories-regent-lieutenant.test.js` — 14 cases covering the lieutenant endpoint

## Coverage Detail

| Group | Cases | Status |
|---|---|---|
| ST happy path | set lieutenant, clear to null | 2/2 |
| Regent happy path | appoint lieutenant, clear lieutenant | 2/2 |
| Validation | self-appoint, non-existent char, retired char, bad type, invalid char ObjectId | 5/5 |
| Territory lookup | 404 ghost ObjectId, 400 slug-style ID | 2/2 |
| Scope isolation | only lieutenant_id + updated_at written; other fields untouched | 1/1 |
| Auth | non-regent 403, unauthenticated 401 | 2/2 |
| **Total** | | **14/14** |

## Coverage vs Acceptance Criteria

| AC | Description | Test status |
|---|---|---|
| AC1 | Endpoint exists, regent + ST access | Covered |
| AC2 | Self-appointment blocked (400) | Covered |
| AC3 | Character existence + retired check | Covered |
| AC4 | Non-regent forbidden (403) | Covered |
| AC5-8 | Frontend charPicker, Save button, re-render on save | No E2E framework — manual verification required |
| AC9 | Dev-fixtures echo handler | Dev-mode only — manual |
| AC10 | ST admin panel unchanged | No regression needed; POST /api/territories not touched |

## QA Additions (beyond the 10 dev-written tests)

Four additional cases added to fill gaps in the dev suite:

1. `404` — valid ObjectId that resolves to no territory
2. `400` — slug-style (non-ObjectId) territory ID
3. `400` — `lieutenant_id` is a string that fails ObjectId parsing
4. Scope isolation — `feeding_rights`, `ambience`, `regent_id` all survive the write

## Run

```bash
cd server && npx vitest run tests/api-territories-regent-lieutenant.test.js
```

14/14 passed.

## Manual Verification Checklist (AC5-8)

Since the project has no browser E2E framework, verify in-browser:

- [ ] Regency tab shows a charPicker in the Lieutenant slot (slot 2), not a locked label
- [ ] Picker is pre-filled with the current lieutenant if one exists
- [ ] Regent's own character is excluded from the lieutenant picker options
- [ ] "Save Lieutenant" button is present and separate from "Save Feeding Rights"
- [ ] After saving a new lieutenant, the tab re-renders — feeding-right slots start at position 3
- [ ] After clearing the lieutenant, feeding-right slots start at position 2
- [ ] Error message shown if the API call fails
