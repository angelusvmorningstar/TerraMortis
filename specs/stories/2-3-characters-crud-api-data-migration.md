# Story 2.3: Characters CRUD API + Data Migration

**Status:** review

## Story

As an ST,
I want to read and write character data through the API,
so that changes made by any ST are available to all STs immediately.

## Acceptance Criteria

1. `GET /api/characters` returns all characters from MongoDB
2. `GET /api/characters/:id` returns a single character by MongoDB `_id`
3. `PUT /api/characters/:id` updates a character and returns the updated document
4. `POST /api/characters` creates a new character and returns it with `_id`
5. `DELETE /api/characters/:id` removes a character and returns 204
6. Migration script seeds `chars_test.json` into MongoDB `characters` collection
7. Client-side `api.js` module provides `apiGet`, `apiPut`, `apiPost`, `apiDelete` functions
8. All error responses follow the architecture pattern (`{ error, message }` with British English)

## Tasks / Subtasks

- [x] Task 1: Characters route file (AC: #1-5, #8)
  - [x] Create `server/routes/characters.js` with GET list, GET one, PUT, POST, DELETE
  - [x] Mount routes in `server/index.js`
  - [x] Error handling: 404 for not found, 400 for invalid ObjectId
- [x] Task 2: Migration script (AC: #6)
  - [x] Create `server/migrate.js` — reads `data/chars_test.json`, inserts into `characters` collection
  - [x] Script clears existing characters before insert (idempotent)
  - [x] Logs count of inserted characters
- [x] Task 3: Client-side API module (AC: #7)
  - [x] Create `public/js/data/api.js` with `apiGet`, `apiPut`, `apiPost`, `apiDelete`
  - [x] All functions attach auth token from localStorage (when present, for future use)
  - [x] Base URL configurable (localhost for dev, production URL later)
- [x] Task 4: Verify end-to-end (AC: #1-6)
  - [x] Run migration script, verify 12 characters in MongoDB
  - [x] Start server, GET /api/characters returns the seeded data
  - [x] GET /api/characters/:id returns a single character
  - [x] PUT updates and returns updated document

## Dev Notes

### Architecture Compliance

**Source:** `specs/architecture-st-admin.md`

The API is a thin CRUD pipe. No business logic. Character validation stays in the browser.

### Route Pattern

```
GET    /api/characters              → list all
GET    /api/characters/:id          → get one
PUT    /api/characters/:id          → update one
POST   /api/characters              → create one
DELETE /api/characters/:id          → delete one
```

### Error Response Pattern

```json
{ "error": "NOT_FOUND", "message": "Character not found" }
{ "error": "VALIDATION_ERROR", "message": "Invalid character ID format" }
```

British English in messages. `UPPER_SNAKE_CASE` error codes.

### Data Format

Characters are stored as-is from the v2 schema. MongoDB adds `_id` (ObjectId). The existing character objects have no `_id` field — MongoDB generates them on insert.

`chars_test.json` is a bare array of character objects at the top level.

### Client API Module Pattern

```js
// public/js/data/api.js
const API_BASE = location.hostname === 'localhost' ? 'http://localhost:3000' : '';

export async function apiGet(path) { ... }
export async function apiPut(path, body) { ... }
export async function apiPost(path, body) { ... }
export async function apiDelete(path) { ... }
```

### Migration Script

Standalone Node.js script. Uses the same `MONGODB_URI` from server `.env`. Reads `data/chars_test.json`, drops existing `characters` collection, inserts all documents.

### What This Story Does NOT Do

- No frontend rendering changes (story 2.4)
- No auth middleware on routes (deferred)
- No other collection routes (story 2.5)

### References

- [Source: specs/architecture-st-admin.md — API Endpoint Naming, API Response Format, Client-Side API Communication]
- [Source: specs/architecture/coding-standards.md — naming conventions]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Migration script originally placed in `scripts/` at repo root, but root package.json is `"type": "commonjs"` and node_modules lives in `server/`. Moved to `server/migrate.js` to run in the correct ES module context.
- Stale server processes on port 3000 from previous tests caused false failures — always kill before testing.

### Completion Notes List

- Characters CRUD route with full REST endpoints (list, get, create, update, delete)
- Error responses use British English and UPPER_SNAKE_CASE codes per architecture
- ObjectId validation prevents MongoDB errors on malformed IDs
- PUT uses `$set` to merge updates (does not replace entire document)
- Migration script inserts 12 test characters, idempotent (deletes before insert)
- Client-side `api.js` provides typed fetch wrappers with auth token support (future-proofed)
- `npm run migrate` added to server package.json

### File List

- `server/routes/characters.js` — NEW
- `server/migrate.js` — NEW
- `server/index.js` — MODIFIED (route mounting)
- `server/package.json` — MODIFIED (migrate script)
- `public/js/data/api.js` — NEW
- `server/routes/.gitkeep` — DELETED (replaced by actual route file)
