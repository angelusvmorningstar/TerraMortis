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
