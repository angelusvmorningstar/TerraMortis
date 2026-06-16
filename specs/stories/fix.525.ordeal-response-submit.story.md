---
issue: 525
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/525
branch: morningstar-issue-525-ordeals-submit
story: 525
---

# Story 525: Fix ordeal submission — request schema field-name mismatch 400s every create

Status: review

## Story

As a player,
I want to start and submit ordeals (Rules / Lore / Covenant) from the player app,
so that I can complete the knowledge ordeals that award XP — which is currently impossible because every create is rejected.

## Root cause (confirmed)

`POST /api/ordeal-responses` is gated by `validate(ordealResponseSchema)` (`server/routes/ordeal-responses.js:70`). The middleware (`server/middleware/validate.js`, AJV, `coerceTypes:false`) validates **the request body** against the schema and returns **400** when a `required` field is missing.

- The client sends `{ type, responses }` (`public/js/tabs/ordeal-form.js:45-48` saveDraft, `:78-81` submit). The route handler also reads `type` (`ordeal-responses.js:71`).
- But `ordealResponseSchema` has **`required: ['ordeal_type']`** and a property `ordeal_type` (`server/schemas/ordeal.schema.js:79-96`) — it describes the **stored document** shape (the handler stores `ordeal_type: type` at `:84`), not the request.
- So the inbound body has no `ordeal_type` → AJV `required` fails → **400 on every create**. Players can never create a response; the "start" view renders (its GETs aren't validated) but the first save/submit POST is rejected.

The schema is imported in exactly one place — the POST above (`grep` confirmed) — so it is purely a request validator and can be aligned to the request shape with no other impact.

## Acceptance criteria

1. `POST /api/ordeal-responses` with a body of `{ type: 'rules'|'lore'|'covenant', responses: {...} }` from an authenticated player passes validation and creates a draft (201), as the handler already intends.
2. An invalid/missing `type` is still rejected (the handler's `VALID_TYPES` check at `:72` already covers the value; the schema must not reject a well-formed request).
3. The full player flow works end-to-end for each ordeal type: start → save draft (POST then PUT) → submit (PUT `status:'submitted'`) → the response persists and is retrievable via `GET /api/ordeal-responses?type=…` and visible to ST via `GET /api/ordeal-responses/all`.
4. A regression test exists for the POST create path (there is currently **no** `api-ordeal-responses.test.js`).
5. No change to the stored-document shape (`ordeal_responses` docs keep `ordeal_type`, `player_id`, `status`, `responses`, timestamps) — only the request validation is corrected.

## Tasks / Subtasks

- [x] **Fix the request schema** (AC 1, 2, 5)
  - [x] `server/schemas/ordeal.schema.js`: added `type` property `{enum:['rules','lore','covenant']}` and changed `required` from `['ordeal_type']` to `['type']`. Kept `responses`/`additionalProperties` and the stored-doc properties (incl. `ordeal_type`) as allowed-but-not-required, with a comment explaining the request-vs-stored shape.
  - [x] Confirmed `ordealResponseSchema` is imported only at `ordeal-responses.js:10` (the POST) — change is request-only; stored-doc shape unchanged.
- [x] **Verify the end-to-end flow** (AC 3)
  - [x] POST → PUT(submit) → GET round-trip is covered by a test and green. `req.user.player_id` is a string for real players (`playerUser()` default `p-player-001`); POST stores it and GET keys on it consistently — no mis-key in practice.
  - [x] The "start" view reads only; once create succeeds the flow works. (Server-only change; not run in-browser on dev — see notes.)
- [x] **Add regression tests** (AC 4)
  - [x] New `server/tests/api-ordeal-responses.test.js`: 401 without auth; POST `{type:'rules',responses}` → 201 (`ordeal_type:'rules'`, `status:'draft'`); invalid `type` → 400; duplicate → 409; POST→PUT(submit)→GET round-trip. 5 tests green.
  - [x] **Harness gap fixed:** `server/tests/helpers/test-app.js` did not mount the `ordeal-responses` router at all (only `ordeal_submissions`) — added the `/api/ordeal-responses` mount mirroring `server/index.js:90`. This is a compounding reason the bug shipped untested.
  - [x] Ran only the touched specs: `api-ordeal-responses` (5) + `api-ordeal-submissions` (10) = 15 green.

## Dev Notes

### Key files
- `server/schemas/ordeal.schema.js` — `ordealResponseSchema` (the fix, lines 79-96)
- `server/routes/ordeal-responses.js` — POST `/` validates with the schema (`:70`), reads `type` (`:71`), stores `ordeal_type` (`:84`); PUT submit (`:98-142`); GET (`:51`), GET `/all` (`:145`)
- `public/js/tabs/ordeal-form.js` — client POST/PUT (`:45,50,78,83`); sends `{type, responses}`
- `public/js/tabs/ordeals-view.js` — the "start" view (reads only)
- `server/middleware/validate.js` — AJV validator (400 on required-missing)
- `server/tests/api-ordeal-submissions.test.js` — pattern for the new responses test

### Why this slipped through
The `ordeal_responses` endpoint had **no test** (only `ordeal_submissions` did), so a schema that modelled the stored document rather than the request was never exercised against a real POST. AC 4 closes that gap.

### Scope / calibration
- Tiny, surgical fix (one schema object) + a new test file. Hobby-scale; do not refactor the two-collection model (`ordeal_responses` vs `ordeal_submissions`) here — that is out of scope unless it turns out the client also needs `ordeal_submissions` (it does not for start/submit; it only reads `/mine`).
- **Server change**: not verifiable on the dev site (dev frontend proxies `/api/*` to the prod API); verify via `tm_suite_test` and a local run. It works in production once on `main`.
- Test DB isolation: `tm_suite_test` via vitest setupFile. Targeted tests only.

### References
- Issue #525; ORD epic (prior ordeals work)
- `server/index.js:90` — `/api/ordeal-responses` mount (hyphenated; client matches)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8

### Debug Log References

- Writing the test first surfaced a SECOND gap before the schema bug: `POST /api/ordeal-responses` returned **404** in the test harness because `server/tests/helpers/test-app.js` never mounted the `ordeal-responses` router (it only had `ordeal_submissions`). After adding the mount, the test then failed with the real bug — the schema 400 on create — and passed once the schema was corrected. (Red → real-red → green.)

### Completion Notes List

**Root cause & fix:** `validate(ordealResponseSchema)` required `ordeal_type` (the stored-doc field) while the request body is `{ type, responses }`, so every create 400'd. Fixed `ordealResponseSchema` to require `type` (enum rules/lore/covenant) instead; `ordeal_type` stays an allowed-but-not-required property. Schema is request-only (single import at the POST), so the stored-doc shape is unchanged.

**Harness gap:** the test-app helper was missing the `ordeal-responses` mount entirely — added it (mirrors `index.js:90`). This is why the field-name mismatch was never caught.

**Tests:** new `api-ordeal-responses.test.js` (5) green; `api-ordeal-submissions.test.js` (10) still green after the shared-helper change.

**Deploy note:** server-side change (schema). Not verifiable on the dev site (dev proxies `/api/*` to the prod API); works once on `main`. Verified via `tm_suite_test`.

### File List

**New:**
- `server/tests/api-ordeal-responses.test.js`

**Modified:**
- `server/schemas/ordeal.schema.js` (request schema: require `type`, add `type` enum property)
- `server/tests/helpers/test-app.js` (mount the `ordeal-responses` router)
- `specs/stories/fix.525.ordeal-response-submit.story.md` (this file)
- `specs/stories/sprint-status.yaml`

### Change Log

- 2026-06-01: Fixed #525 — ordeal create 400'd because the request schema required the stored-doc field `ordeal_type` while the body sends `type`. Schema now requires `type`. Added the missing test-app mount + a regression suite. Status → review.
- 2026-06-01 (QA, Quinn): Verdict **PASS**. Added two tests to `api-ordeal-responses.test.js` — POST with `responses` omitted defaults to `{}` (201), and the PUT ownership guard (a player editing another's response → 403). `api-ordeal-responses` now 7 green; `api-ordeal-submissions` 10 green. No blocking gaps; the ST approve→XP-cascade path is existing behaviour outside this fix's scope.
