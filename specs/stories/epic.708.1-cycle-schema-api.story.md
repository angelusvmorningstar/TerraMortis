---
issue: 708
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/708
branch: ms/issue-708-cycle-tab-game-phase
epic: CYCLE — Game Cycle Management Tab
story: 1 of 6
status: review
---

# Epic CYCLE — Story 1: Schema & API Foundations

## Story

**As an** ST,
**I want** the server to support a manual `game_phase` field on downtime cycles and a `chapters` collection,
**so that** the cycle management tab (stories 2–6) has a clean, authoritative API to read and write game phase state without relying on auto-derived logic.

---

## Epic Context

This is story 1 of 6 in the CYCLE epic (#708). The full epic replaces all auto-derived `cycle.status` logic with a single manual control surface in the admin app.

**Epic story breakdown (do not implement beyond story 1 in this story):**
- **Story 1 (this):** Schema + API — `game_phase` field, `chapters` collection, backward-compat `deriveCycleStatus` update
- **Story 2:** Cycle tab shell — new admin sidebar entry, chapter list/create, cycle list
- **Story 3:** Phase control panel — game/downtime/processing buttons with side effects (tracker reset, DT open/close)
- **Story 4:** DT prep access controls — move `out_of_window_player_ids` management into cycle tab
- **Story 5:** Publish pipeline — publish DT stories to Story tab, publish individual reports
- **Story 6:** Attendance + XP absorption — cycle-scoped attendance view within cycle tab

---

## Acceptance Criteria

- [ ] AC-1: `downtimeCycleSchema` in `server/schemas/downtime_submission.schema.js` accepts `game_phase` (enum: `'game'|'downtime'|'processing'`, nullable) and `chapter_id` (string, nullable)
- [ ] AC-2: `PUT /api/downtime_cycles/:id` persists `game_phase` and `chapter_id` when included in the request body (existing `additionalProperties: true` means schema is sufficient)
- [ ] AC-3: `deriveCycleStatus(cycle)` in `public/js/downtime/db.js` returns the appropriate legacy status when `game_phase` is set: `'game'` → `'game'`, `'downtime'` → `'active'`, `'processing'` → `'closed'`. When `game_phase` is null/absent, existing logic is unchanged.
- [ ] AC-4: `GET /api/chapters` returns all chapters sorted by `number` asc (no auth required — public read, consistent with territories)
- [ ] AC-5: `POST /api/chapters` creates a chapter (ST role required). Body: `{ number: int, label: string }`. Returns 201 with the created doc.
- [ ] AC-6: `PATCH /api/chapters/:id` updates `number` and/or `label` (ST role required). Returns 200 with the updated doc.
- [ ] AC-7: `DELETE /api/chapters/:id` deletes a chapter (ST role required). If any `downtime_cycles` document has `chapter_id` matching this chapter, returns 409 CONFLICT. Otherwise deletes and returns 200.
- [ ] AC-8: `GET /api/chapters/:id` returns a single chapter (no auth required). Returns 404 if not found.
- [ ] AC-9: `chaptersRouter` is mounted at `/api/chapters` in `server/index.js` with `requireAuth` (public reads inside the router; writes use `requireRole('st')`)
- [ ] AC-10: Vitest contract tests pass (≥12 tests)

---

## Dev Notes

### Design Decision: Extend `downtime_cycles`, not a new collection

**Do NOT create a new `game_cycles` collection.** Add `game_phase` directly to `downtime_cycles`.

Rationale:
- `downtime_cycles` is already the unit of "one game event" — every piece of game-cycle state lives there already (`phase_signoff`, `manual_open`, `out_of_window_player_ids`, `regent_confirmations`, etc.)
- ~14 reads of `cycle.status` exist across the codebase; all will transparently pick up the new field via the updated `deriveCycleStatus` without touching any call sites
- A new collection would require cross-collection joins everywhere or a mass migration; the extension is additive and non-breaking

### `game_phase` field semantics

```
game_phase: 'game'      → cycle is in game session (feeding, tracker, office powers active)
game_phase: 'downtime'  → submissions open, regent confirmations active
game_phase: 'processing'→ submissions closed, ST-only processing
game_phase: null        → legacy mode — derive from phase_signoff (backwards compat)
```

When `game_phase` is set (non-null), it is the authoritative source of truth. The legacy `deriveCycleStatus` derivation is the fallback for cycles that predate this story.

### `deriveCycleStatus` change (backwards-compatible wrapper)

Current logic in `public/js/downtime/db.js:67-79`:
```js
export function deriveCycleStatus(cycle) {
  const ps = cycle?.phase_signoff || {};
  if (ps.projects) return 'closed';
  if (cycle?.manual_open === true) return 'active';
  if (!ps.prep) return 'prep';
  if (!ps.city) return 'game';
  return 'active';
}
```

New logic — add a guard at the top before the existing body:
```js
export function deriveCycleStatus(cycle) {
  // Manual game_phase overrides legacy derivation when set (CYCLE epic #708)
  if (cycle?.game_phase === 'game')        return 'game';
  if (cycle?.game_phase === 'downtime')    return 'active';
  if (cycle?.game_phase === 'processing')  return 'closed';
  // Legacy derivation (unchanged) — covers cycles predating #708
  const ps = cycle?.phase_signoff || {};
  if (ps.projects) return 'closed';
  if (cycle?.manual_open === true) return 'active';
  if (!ps.prep) return 'prep';
  if (!ps.city) return 'game';
  return 'active';
}
```

**DO NOT change any other call sites.** All consumers of `deriveCycleStatus` and `cycle.status` will automatically pick up the correct value.

### `chapters` collection schema

Each document:
```json
{
  "_id": ObjectId,
  "number": 2,
  "label": "Chapter Two: The Price of Power",
  "created_at": "2026-06-11T00:00:00.000Z"
}
```

`number` is a positive integer used for sort order. `label` is the display name. Neither needs to be unique (ST may have draft chapters), but practically they will be.

### New file: `server/routes/chapters.js`

Follow the exact same pattern as `server/routes/game-sessions.js` — that file is the closest structural match (coordinator-role writes, open reads).

Key structure:
```js
import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getCollection } from '../db.js';
import { requireRole } from '../middleware/auth.js';

const col = () => getCollection('chapters');

function parseId(id) {
  try { return new ObjectId(id); } catch { return null; }
}

export const chaptersRouter = Router();

chaptersRouter.get('/', async (req, res) => { ... });       // public read
chaptersRouter.get('/:id', async (req, res) => { ... });    // public read
chaptersRouter.post('/', requireRole('st'), async (req, res) => { ... });
chaptersRouter.patch('/:id', requireRole('st'), async (req, res) => { ... });
chaptersRouter.delete('/:id', requireRole('st'), async (req, res) => { ... });
```

For `DELETE`: query `downtime_cycles` for any doc with `chapter_id: req.params.id` (string match — `chapter_id` is stored as a string). If found, return `409 CONFLICT` with `{ error: 'CHAPTER_IN_USE', linked_cycles: N }`.

### `server/index.js` mount pattern

Follow the exact pattern of existing router mounts. Add near the other admin/data routes:
```js
import chaptersRouter from './routes/chapters.js';
// ...
app.use('/api/chapters', requireAuth, noCache(), chaptersRouter);
```

`requireAuth` at the mount level ensures the session is valid; the router's public endpoints don't add further role checks, and write endpoints use `requireRole('st')` internally. This matches the `territories` pattern.

### `downtimeCycleSchema` additions

In `server/schemas/downtime_submission.schema.js`, within the `downtimeCycleSchema.properties` object, add after the existing `feeding_rights_confirmed` property:

```js
// CYCLE epic (#708): manual game phase control. Replaces auto-derive when set.
// null means derive from phase_signoff (legacy cycles). See deriveCycleStatus.
game_phase: { type: ['string', 'null'], enum: ['game', 'downtime', 'processing', null] },
chapter_id: { type: ['string', 'null'] },  // ref to chapters collection _id as string
```

**Important:** The schema has `additionalProperties: true`, so the PUT handler already passes unknown fields through. The schema addition is documentation + validation only — the PUT handler doesn't need to change.

### Existing code to preserve (do not touch)

- `cyclesRouter.post('/:id/confirm-feeding', ...)` — feeding confirmation, unrelated
- `setManualOpen()` and `signoffPhase()` — legacy controls, still used by DT Prep tab until Story 4 absorbs them
- `openGamePhase()` in `public/js/downtime/db.js:50-52` — sets `status: 'game'` directly; after this story, callers should migrate to setting `game_phase: 'game'` instead, but that migration is Story 3's job, NOT this story
- All existing `cycle.status` reads across the codebase — untouched; `deriveCycleStatus` change handles them transparently

### Auth pattern for chapters

Read endpoints (`GET /`, `GET /:id`) — `requireAuth` at the router mount level is sufficient. No additional role check inside the handler.

Write endpoints — `requireRole('st')` inside the handler, matching the pattern used in `downtime.js` cyclesRouter and `game-sessions.js`.

### Vitest test file

Create `server/tests/epic.708.1-cycle-schema-api.test.js`.

Tests must be static-grep Vitest contracts (read files with `fs.readFileSync`, assert `toContain` / `toMatch`), matching the project's established testing pattern (see `server/tests/feature.691.hos-city-status-power.test.js` as the canonical example).

Required assertions (≥12):
- `SCHEMA` contains `'game_phase'`
- `SCHEMA` contains `'chapter_id'`
- `SCHEMA` game_phase enum contains `'processing'`
- `CHAPTERS` route contains `'/chapters'` endpoint handlers
- `CHAPTERS` route enforces ST role on POST
- `CHAPTERS` route enforces ST role on PATCH
- `CHAPTERS` route enforces ST role on DELETE
- `CHAPTERS` route checks for in-use cycles before delete (409)
- `INDEX` imports `chaptersRouter`
- `INDEX` mounts at `'/api/chapters'`
- `DB` (downtime/db.js) contains guard for `game_phase === 'game'`
- `DB` contains guard for `game_phase === 'downtime'`
- `DB` contains guard for `game_phase === 'processing'`

---

## Tasks

- [x] **Task 1** — Update `server/schemas/downtime_submission.schema.js`: add `game_phase` and `chapter_id` to `downtimeCycleSchema.properties`
- [x] **Task 2** — Update `public/js/downtime/db.js`: add `game_phase` guard block at the top of `deriveCycleStatus` (3 lines, before existing body)
- [x] **Task 3** — Create `server/routes/chapters.js`: CRUD router with GET /, GET /:id, POST /, PATCH /:id, DELETE /:id (with in-use cycle check)
- [x] **Task 4** — Update `server/index.js`: import `chaptersRouter` and mount at `/api/chapters` with `requireAuth, noCache()`
- [x] **Task 5** — Create `server/tests/epic.708.1-cycle-schema-api.test.js`: ≥12 static-grep Vitest contract tests
- [x] **Task 6** — Run `npx vitest run server/tests/epic.708.1-cycle-schema-api.test.js` and confirm all pass

---

## File List

**New:**
- `server/routes/chapters.js`
- `server/tests/epic.708.1-cycle-schema-api.test.js`

**Modified:**
- `server/schemas/downtime_submission.schema.js` (add `game_phase`, `chapter_id` to `downtimeCycleSchema`)
- `server/index.js` (import + mount chaptersRouter)
- `public/js/downtime/db.js` (guard block in `deriveCycleStatus`)

---

## Dev Agent Record

### Debug Log
_Empty_

### Completion Notes
- Added `game_phase` (nullable enum: game/downtime/processing) and `chapter_id` (nullable string) to `downtimeCycleSchema`
- Updated `deriveCycleStatus` with a 3-line guard block before the legacy `phase_signoff` logic — fully backwards-compatible; null `game_phase` falls through to existing behaviour unchanged
- Created `server/routes/chapters.js`: GET /, GET /:id (public); POST /, PATCH /:id, DELETE /:id (ST-only). DELETE returns 409 CHAPTER_IN_USE if any cycle references the chapter
- Mounted `chaptersRouter` at `/api/chapters` with `requireAuth, noCache()` in `server/index.js`
- 20 Vitest contract tests — all pass

### Change Log
- 2026-06-11: Story implemented — schema fields, deriveCycleStatus guard, chapters CRUD API, 20 passing tests
