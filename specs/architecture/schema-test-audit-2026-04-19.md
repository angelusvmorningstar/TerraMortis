# Schema & Test Audit — 2026-04-19

## Schemas

### Strictness Summary

| Schema | additionalProperties | Partial variant |
|---|---|---|
| character | false (STRICT) | Yes — `characterPartialSchema` via `derivePartialSchema()` |
| purchasable_power | false (STRICT) | No |
| downtime_submission | true (permissive) | No — intentional; dynamic slot keys |
| game_session | true (permissive) | No — flexible attendance |
| player | true (permissive) | No |
| territory | true (permissive) | No |
| ordeal/rubric/submission | true (permissive) | No |
| investigation | true (permissive) | No |
| session_log | true (permissive) | No |
| ticket | true (permissive) | No |

### Known Issues / Deferred

- **character: multiple `free_*` merit fields** — `free_mci`, `free_vm`, `free_lk`, `free_inv`, etc. These are source-tracking fields from the Excel import. Could be consolidated to a single `free_grants: [{source, dots}]` array. Large schema refactor + DB migration; deferred to Peter's arch refactor.
- **character: dual fighting_styles + fighting_picks** — `fighting_styles[].picks` (legacy) and `fighting_picks[]` (v3). Legacy `picks` field is still tolerated for backward compatibility. Clean up once migration is confirmed complete in production.
- **character: inline ordeals vs ordeal_submissions collection** — `character.ordeals[]` tracks completion state on the character; `ordeal_submissions` collection tracks full submission workflow. Not duplicate — different concerns.

## Tests

### Redundancy Fixed

`api-players-sessions-residency.test.js` previously duplicated all of `/api/players` CRUD (GET, POST, PUT, DELETE) that was already covered — more thoroughly — in `api-players.test.js`. The players section has been removed. The file now covers only `/api/game_sessions` and `/api/territory-residency`.

### Coverage Map (post-fix)

| Route | Primary test file |
|---|---|
| `/api/characters` (list, role gate) | api-characters.test.js |
| `/api/characters` (CRUD, public, game-xp) | api-characters-crud.test.js |
| `/api/players` (full CRUD, /me) | api-players.test.js |
| `/api/game_sessions` (CRUD, /next) | api-players-sessions-residency.test.js |
| `/api/game_sessions` (DELETE) | api-game-sessions-delete.test.js |
| `/api/territory-residency` | api-players-sessions-residency.test.js |
| `/api/downtime_*` (state machine) | api-downtime.test.js |
| `/api/downtime_*` (regent gate) | api-downtime-regent-gate.test.js |
| `/api/territories` | api-territories.test.js |
| `/api/ordeal_submissions` | api-ordeal-submissions.test.js |
| `/api/archive_documents` | api-archive-documents.test.js |
| Downtime cycle wizard | api-publish-cycle.test.js |

### Not Covered by Tests

- `/api/tracker_state` — no server test; covered implicitly via EPA.2 manual testing
- `/api/rules` — no server test
- `/api/attendance` (GET only) — no server test
- `/api/npcs` — no server test
