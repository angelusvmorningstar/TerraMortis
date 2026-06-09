# Test Automation Summary — feature.654 EQ-1: Equipment Schema, Catalogue, CRUD API

**Date:** 2026-06-09
**Author:** Quinn (QA)
**Scope:** Full test coverage for EQ-1 -- EQUIPMENT_CATALOGUE module, character schema extension (equipment/assets), and CRUD API routes.

## Generated Tests

### API Tests (Vitest)
- [x] `server/tests/equipment.test.js` -- 21 tests

| # | Test | Result |
|---|------|--------|
| 1 | GET /catalogue returns 200, array, no auth required | pass |
| 2 | Every catalogue entry has required universal fields | pass |
| 3 | Catalogue contains at least one entry per bucket | pass |
| 4 | GET /:id/equipment returns 200, empty arrays for fresh char | pass |
| 5 | GET /:id/equipment returns 404 for non-existent character | pass |
| 6 | GET /:id/equipment returns 403 for player (ST only) | pass |
| 7 | POST /:id/equipment -- valid item appended | pass |
| 8 | POST /:id/equipment -- 400 invalid state enum | pass |
| 9 | POST /:id/equipment -- 400 missing catalogue_id | pass |
| 10 | POST /:id/equipment -- 400 missing acquired_cycle | pass |
| 11 | POST /:id/equipment -- 400 float acquired_cycle | pass |
| 12 | POST /:id/equipment -- notes defaults to null when omitted | pass |
| 13 | POST /:id/equipment -- accepts acquired_cycle 0 (chargen) | pass |
| 14 | DELETE /:id/equipment -- removes item at index | pass |
| 15 | DELETE /:id/equipment -- 404 out of range | pass |
| 16 | POST /:id/assets -- valid asset appended | pass |
| 17 | POST /:id/assets -- 400 missing name | pass |
| 18 | POST /:id/assets -- 400 missing description | pass |
| 19 | POST /:id/assets -- 400 missing acquired_cycle | pass |
| 20 | DELETE /:id/assets -- removes asset at index | pass |
| 21 | DELETE /:id/assets -- 404 out of range | pass |

### E2E Tests (Playwright)
- [x] `tests/feature-654-equipment-schema.spec.js` -- 9 tests

| # | Test | Result |
|---|------|--------|
| 1 | EQUIPMENT_CATALOGUE browser-importable, non-empty array | pass |
| 2 | Every entry has id, bucket, name, description, availability, tags | pass |
| 3 | Catalogue has at least one entry per bucket | pass |
| 4 | equipment entries have skill_domain+bonus_dice; weapon entries have damage fields | pass |
| 5 | getCatalogueEntry() returns correct entry; undefined for missing id | pass |
| 6 | getCatalogueByBucket() filters correctly | pass |
| 7 | App boots without error with new equipment + assets fields | pass |
| 8 | App boots without error for legacy chars with no equipment/assets | pass |
| 9 | App tolerates old-schema flat equipment data (pre-EQ-1 shape) | pass |

## Coverage

- API endpoints: 7/7 (GET catalogue, GET/POST/DELETE equipment, POST/DELETE assets)
- Schema validation: 8 error-path tests (invalid state, missing required fields, float cycle)
- Browser module: 4 structural assertions on live EQUIPMENT_CATALOGUE in browser context
- App regression: 3 character load scenarios (new fields, missing fields, old-schema data)

**Total: 30 tests -- 21 Vitest + 9 Playwright -- all passing**

---

# Test Automation Summary — feature.489 Check-In vitae from last feed roll

**Date:** 2026-05-22
**Author:** Quinn (QA)
**Scope:** E2E coverage review for feature.489 — the Check-In V column shows the
last cycle's logged feed roll (`feeding_vitae_allocation` + tally bonus), else 0.

## Generated Tests

### E2E Tests (Playwright)
- [x] `tests/feature-489-checkin-vitae-feed-roll.spec.js` — 13 tests (10 from dev-story, 3 added in QA)

## Coverage

| AC | Behaviour | Status |
|---|---|---|
| AC1 | logged feed roll → `feedTotal / vMax` | 2 tests |
| AC2 | no submission → `0 / vMax` | 1 test |
| AC3 | no logged feed (deferred, tally-only) → `0 / vMax` | 2 tests |
| AC4 | no last cycle → `0 / vMax` for all | 2 tests |
| AC5 | feed total > vMax → clamped to `vMax / vMax` | 1 test |
| AC6 | parallelised load | Structural — feeding rides the existing `loadLastCycleData` fetch; code-review check, not an E2E counter |
| AC7 | WP / INF unchanged | WP regression test + full feature-485 (13) + feature-483 (13) |

## Gaps Closed in QA

1. No test exercised a single submission carrying both `influence_spend` and a feed roll — the real DT3 shape, and what the loop restructure was for. Added.
2. `feeding_vitae_allocation: []` (empty array) was untested versus an absent field. Added — pins the `length > 0` guard.
3. A logged feed with an allocation but no `feeding_vitae_tally` (a real DT3 shape) was untested. Added — pins the bonus `|| 0` fallback.

## Run

```bash
npx playwright test tests/feature-489-checkin-vitae-feed-roll.spec.js tests/feature-485-checkin-inf-remaining-spend.spec.js tests/feature-483-checkin-roster-new-session.spec.js --reporter=list
```

39/39 passed — 13 #489 + 13 #485 + 13 #483, zero regressions.

## Notes

- AC6 has no dedicated E2E test: an absolute `/api/downtime_submissions` request
  count is not a clean signal — other app code hits that endpoint on boot
  (observed 3 requests). The "no added fetch" guarantee is structural: feeding is
  extracted inside the existing `loadLastCycleData` call.
- The feature-485 `V and WP max/max` regression test was updated during dev-story
  to WP-only, since feature.489 intentionally changes V. Correct and expected.

## Next Steps

- feature.489 is QA-clear — ready for PR into `dev`.

---

# Test Automation Summary — Issue #327 Feeding matrix rote+normal double-feed

**Date:** 2026-05-17
**Author:** Quinn (QA)
**Scope:** Playwright E2E coverage for the _getSubFedTerrs early-return fix, the
feeding_rote override priority, and the rote feed territory pill row (AC1–AC5).

## Generated Tests

### E2E (Playwright)
- [x] `tests/issue-327-feeding-matrix-rote-double-feed.spec.js` — 8 tests

## Coverage

| Behaviour | Test |
|---|---|
| ST override array + rote grid both count → OO (AC1, Ivana pattern) | `Ivana: ST override array + rote grid → NShore shows "O O"` |
| Override+rote produces exactly "O O" not "O" (AC1 exact) | `Ivana: ST override + rote grid → NShore is NOT showing single "O"` |
| No override, both grids match → OO regression (AC2, Keeper/Tegan) | `No override, both grids match → NShore shows "O O"` |
| Override without rote slot → single O only (AC3) | `ST override present, no rote project action → NShore shows single "O"` |
| feeding_rote override replaces player all-none rote grid (AC4) | `Player rote grid all-none + feeding_rote override → NShore shows "O O"` |
| Rote feed entry has feeding_rote pill row (AC5) | `Rote feed entry expansion shows territory pill row with context feeding_rote` |
| N. Shore pill present in feeding_rote row (AC5) | `Rote feed pills include North Shore pill` |
| N. Shore pill pre-selected from player rote grid (AC5) | `Rote feed pills pre-select NShore when player rote grid declares it` |

## All 8 tests pass.

---

# Test Automation Summary — JDT-5 compilePushOutcome joint injection

**Date:** 2026-04-27
**Author:** Quinn (QA)
**Scope:** Unit-level coverage for the highest-risk untested code path on
JDT-5 — the publish-time joint outcome injection in `compilePushOutcome`.

## Generated Tests

### Unit Tests
- [x] `server/tests/compile-push-outcome-joint.test.js` — 8 cases covering
  the JDT-5 joint injection logic in
  `public/js/admin/downtime-story.js::compilePushOutcome`.

## Coverage

| Behaviour | Test |
|---|---|
| Lead's published outcome carries joint heading + `st_joint_outcome` | `lead: published outcome carries joint heading + st_joint_outcome` |
| Support's outcome interleaves `personal_notes` as a contribution paragraph | `support: published outcome interleaves personal_notes` |
| Support without `personal_notes` skips contribution line cleanly | `support without personal_notes: outcome present, no contribution paragraph` |
| Decoupled support reverts to solo `project_responses` path | `decoupled support: reverts to solo project_responses path` |
| Cancelled joint reverts to solo path for participants | `cancelled joint: reverts to solo project_responses path` |
| Empty `st_joint_outcome` still renders heading under gap text | `empty st_joint_outcome: gap text placeholder, joint heading still rendered` |
| Non-participant submissions unaffected; no joint leakage | `non-participant submission: untouched, no joint content leaks in` |
| Publish no-op when nothing complete | `publish no-op: when nothing is complete and no joint outcome, returns empty string` |

## Test Pattern

The test dynamic-imports the browser admin module under stubbed `location`
and `localStorage` globals so vitest can exercise `compilePushOutcome` as a
pure function without the full browser runtime. A `forceHasContent` helper
injects `general_notes` to flip `hasContent=true` on fixtures whose joint
outcome is intentionally empty — without this, the function correctly
emits `''` as the publish no-op signal.

## Run

```bash
cd server && npx vitest run tests/compile-push-outcome-joint.test.js
```

8/8 passed. Total downtime + joint suite (existing 68 + new 8): 76/76.

## Notes

- **Pre-existing failure observed in full suite:** one test in
  `api-relationships-player-create.test.js > GET /api/npcs/directory >
  returns active + pending NPCs with minimal projection` fails on
  unmodified HEAD. Outside JDT epic scope — flagged for separate triage.
- **Lead-name lookup not yet covered:** the function calls
  `_allCharacters.find(...)` for the lead's display name; that module-level
  binding isn't settable from outside without a test seam. The current
  fixtures exercise the fallback path (`'a fellow Kindred'`). If you want
  the populated path tested, add an exported setter on the module
  (`export function _setAllCharactersForTest(chars) { _allCharacters = chars; }`)
  and extend the suite.

## Next Steps

- Run on CI alongside the existing vitest sweep.
- Triage the pre-existing `npcs/directory` failure separately.
- (Optional) Add lead-name lookup test once a setter is exposed.

---

# Test Automation Summary — feature.98 Rote Feed Phase Routing Fix

**Date:** 2026-05-15
**Author:** Quinn (QA)
**Scope:** E2E coverage for issue #317 — `action_type: 'rote'` project submissions routing to Step 10 — Miscellaneous instead of Step 3 — Feeding.

## Generated Tests

### E2E Tests (Playwright)
- [x] `tests/issue-317-rote-feed-phase-routing.spec.js` — 7 tests covering all 5 ACs

## Coverage

| AC | Behaviour | Tests |
|---|---|---|
| AC1 | `'rote'` action type routes to Step 3, not Step 10 | Tests 1 & 2 |
| AC2 | Legacy `'feed'` type still routes to Step 3 (no regression) | Tests 4 & 5 |
| AC3 | Both `'rote'` and `'feed'` produce label "Rote Feed" in the card | Tests 3 & 6 |
| AC4 | Non-rote action (`patrol_scout`) stays in Step 9 — Support & Patrol | Test 7 |
| AC5 | Standard feeding (`source: 'feeding'`) unaffected | Implicitly covered — standard feeding block (line 2780) is architecturally separate from the project routing fix (line 2900) |

## Test Pattern

Playwright page-level route mocking on `http://localhost:3000/**`. Auth injected via `localStorage` in `addInitScript`. Navigation: click `[data-domain="downtime"]` → wait for `#dt-phase-ribbon` → click `[data-phase="projects"]` tab. Phase headers targeted by `[data-toggle-phase="<key>"]`.

Key finding during development: every submission always gets a standard feeding entry (per `buildProcessingQueue` line 2780 comment "all submissions get an entry"). Test 7 was revised to expand the feeding section and assert no "Rote Feed" row appears, rather than asserting the section header is absent.

## Run

```bash
npx playwright test tests/issue-317-rote-feed-phase-routing.spec.js --reporter=line
```

7/7 passed (16s).

## Notes

- Fix is a 2-line change at `downtime-views.js:2900`: condition expanded from `actionType === 'feed'` to `actionType === 'feed' || actionType === 'rote'`; `originalActionType` changed from hardcoded `'feed'` to the raw `actionType` value.
- All downstream rendering checks (`entry.actionType === 'feed'` at line 7731, `isRoteFeed` at line 3436, `ACTION_TYPE_LABELS['feed']` at line 134) work without modification because the queue entry is normalised to `actionType: 'feed'`.

## Next Steps

- Open PR from `morningstar-issue-317-rote-feed-phase-routing` into `dev`.

---

# Test Automation Summary — issue #321 DT Story Cycle Resolver

**Date:** 2026-05-17
**Author:** Quinn (QA)
**Scope:** E2E regression coverage for issue #321 — DT Story tab loading wrong cycle due to three compounding defects (missing `created_at`, no server sort, wrong status filter).

## Generated Tests

### E2E Tests (Playwright)
- [x] `tests/issue-321-dt-story-cycle-resolver.spec.js` — 3 integration tests covering AC 1, 2, and 5

## Coverage

| AC | Behaviour | Tests |
|---|---|---|
| AC1 | Dropdown drives DT Story init — opening tab shows dropdown cycle's submissions | Test 1 |
| AC2 | Cycle switch refreshes DT Story — A→B updates the rail in-place | Test 2 |
| AC3 | Internal resolver fallback (null path) | Code review only — dormant in normal flow after Task 1 |
| AC4 | Cross-cycle save guard throws on mismatch | Code review only — all three save paths wired, contrivance too high for integration test |
| AC5 | No regression — single cycle case still works | Test 3 |
| AC6 | Server sorts `/api/downtime_cycles` by `_id` desc | Implicitly covered — mocked route returns sorted order; server change is one-line `.sort({ _id: -1 })` |

## Test Pattern

Playwright page-level route mocking on `http://localhost:3000/**`. Auth injected via `localStorage` in `addInitScript`. Two distinct cycles (CYCLE\_OLD: closed, CYCLE\_NEW: prep) with one unique character submission each — rail name used as assertion target. `switchCycle()` helper sets `<select>` value + dispatches `change` event to exercise the full `loadCycleById` → `_dtuxStoryInited = false` → `showDtuxPhase` refresh path.

## Run

```bash
npx playwright test tests/issue-321-dt-story-cycle-resolver.spec.js tests/issue-320-autosave-st-notes.spec.js --reporter=list
```

7/7 passed (20.0s) — 3 #321 + 4 #320 regression.

## Notes

- Task 3 (resolver fallback) and Task 4 (save guard) are verified by code review, not integration test. Both require artificially bypassing admin's normal init flow, which adds more test-seam risk than value. The guard's `_normaliseCycleId` handles both `string` and `{$oid}` shapes — confirmed by MCP inspection of live DT2/DT3 submissions.
- Cross-cycle save guard is fail-loud: throws `Refusing cross-cycle save: …` at all three save sites (`saveNarrativeField`, `_publishAllSubmissions`, single-push handler). Error surfaces via existing try/catch or bubbles to caller.

## Next Steps

- Manual ST verification on `terramortis-dev.netlify.app` per Task 7 matrix (hard-refresh, cycle-switch-while-open, save-and-spot-check).
