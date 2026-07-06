---
issue: 971
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/971
branch: piatra/issue-971-cyoa-passages-route
---

# Story 971: POST /api/cyoa/passages — CYOA cross-project write-back route

**Story ID:** feat.971
**Status:** Done
**Date:** 2026-07-07
**Issue:** [#971](https://github.com/angelusvmorningstar/TerraMortis/issues/971)
**Branch:** `piatra/issue-971-cyoa-passages-route`

---

## User Story

As a CYOA player reaching a story ending,
I want my passage record stored in TerraMortis automatically,
so that my official run is on record and the ST can see it in a future admin view.

---

## Background

The CYOA player page (`https://cyoa-efa060.gitlab.io`) fires a fire-and-forget POST on the
ending screen. The client marks "done" only on 2xx and retries on the next ending-screen load.
No coordinated release is needed — the moment this route ships to `main`, records start
flowing. 404/non-2xx responses are tolerated by the client without breaking the player experience.

CORS is already handled: `https://cyoa-efa060.gitlab.io` was added to `CORS_ORIGIN` on Render
on 2026-07-06. `Authorization` and `Content-Type` are already in the allow-headers list
(`server/index.js:53-59`). No CORS change is needed in this PR.

Auth model: `requireAuth` returns 401 if no Discord bearer is present. No additional role
gating — any authenticated user (player or ST) can POST their own record. The `req.user`
shape after `requireAuth` is `{ id (discord_id), player_id, character_ids, role }` (see
`server/middleware/auth.js:55-70`).

---

## Acceptance Criteria

- [ ] `POST /api/cyoa/passages` with a valid body returns `200 { ok: true }` and upserts
      a document into the `cyoa_passages` collection.
- [ ] A second POST with the same `(player_id, story_id)` and a different `code` replaces
      the record: `updated_at` is bumped, `created_at` is unchanged.
- [ ] Missing any required field returns `400 { error: 'VALIDATION_ERROR', message: <what failed> }`.
- [ ] `story_id` not matching `^[a-z0-9-]+$` or exceeding 64 chars returns 400.
- [ ] `code` exceeding 4096 chars returns 400.
- [ ] Request with no `Authorization` header returns 401 (falls through `requireAuth`).
- [ ] A unique index on `{ player_id: 1, story_id: 1 }` exists on the `cyoa_passages`
      collection and is enforced.
- [ ] The character schema and characters route are not modified.
- [ ] No GET endpoint is added (v2 scope).

---

## Design

### Document shape — `cyoa_passages` collection

```
{
  player_id,    // ObjectId — from req.user.player_id (players collection lookup at auth time)
  discord_id,   // string   — from req.user.id (Discord snowflake)
  character,    // string, <=128 — TM character name run was played as; may be ""
  story_id,     // string, [a-z0-9-]+, <=64
  version,      // string, <=16
  outcome,      // string, <=32  — ending class tag
  code,         // string, <=4096 — opaque replayable passage record; stored, not decoded
  created_at,   // ISO date string — set on first insert only ($setOnInsert)
  updated_at,   // ISO date string — set on every write ($set)
}
```

One document per `(player_id, story_id)` pair. Replaying an epilogue overwrites the prior
record — accepted behaviour per spec.

### Upsert operation

```js
filter:  { player_id: req.user.player_id, story_id }
update:  {
  $set: { discord_id, character, story_id, version, outcome, code, updated_at: new Date().toISOString() },
  $setOnInsert: { created_at: new Date().toISOString() },
}
options: { upsert: true }
```

### Unique index

Either:

(a) Declare the index inline in `server/routes/cyoa.js` at router construction time, so
    the collection is self-describing and ready on first use; OR

(b) Add a small `ensureIndex` call in `server/index.js` in the startup hook alongside the
    route mount.

Option (b) is the belt-and-braces choice — a race during the route's first seconds cannot
create duplicates. Developer's judgement. Both are acceptable.

---

## Implementation

### Pre-flight: confirm base branch

Branch `piatra/issue-971-cyoa-passages-route` should be off `dev`. Verify before starting:

```bash
git log HEAD..origin/dev --oneline
```

Merge any outstanding `dev` commits before writing any code.

---

### File 1 — `server/routes/cyoa.js` (new file)

Create an Express Router. Export it as the default export.

**Validation rules** (match the pattern in `server/routes/equipment-catalogue.js` — inline
checks returning `400 { error: 'VALIDATION_ERROR', message: <what failed> }`, no external
schema library needed):

| Field       | Type   | Rules                              |
|-------------|--------|------------------------------------|
| `story_id`  | string | required; `/^[a-z0-9-]+$/`; <=64  |
| `version`   | string | required; <=16                     |
| `outcome`   | string | required; <=32                     |
| `character` | string | required (may be empty string); <=128 |
| `code`      | string | required; <=4096                   |

Return `400` as soon as the first failing check is found. The `message` should name the
field and the constraint that failed, e.g. `"story_id must match ^[a-z0-9-]+$"`.

After validation passes, run the upsert described above and return `200 { ok: true }`.

Skeleton structure:

```js
import { Router } from 'express';
import { getCollection } from '../db.js';

const router = Router();

router.post('/passages', async (req, res) => {
  const { story_id, version, outcome, character, code } = req.body ?? {};

  // --- validation ---
  // (inline checks — return 400 on first failure)

  // --- upsert ---
  const col = getCollection('cyoa_passages');
  const now = new Date().toISOString();
  await col.updateOne(
    { player_id: req.user.player_id, story_id },
    {
      $set: { discord_id: req.user.id, character, story_id, version, outcome, code, updated_at: now },
      $setOnInsert: { created_at: now },
    },
    { upsert: true },
  );

  res.json({ ok: true });
});

export default router;
```

Add the `ensureIndex` call here or in `server/index.js` per Design above.

---

### File 2 — `server/index.js`

Add the import near the other route imports (alphabetically or grouped with new routes):

```js
import cyoaRouter from './routes/cyoa.js';
```

Add the mount after the `/api/attendance` line (~107), before the rules-engine block:

```js
app.use('/api/cyoa', requireAuth, noCache(), cyoaRouter);
```

If the `ensureIndex` approach is chosen (option b above), add a startup call here after
`connectDb()` resolves. Follow the pattern of any existing index-ensure call in
`server/index.js` if one exists, or do it inline:

```js
// Ensure unique index on cyoa_passages after DB connects
getDb().collection('cyoa_passages').createIndex(
  { player_id: 1, story_id: 1 },
  { unique: true, background: true },
);
```

---

### File 3 — `server/tests/helpers/test-app.js`

Add the cyoa router mount in `createTestApp()`, alongside the other `mockAuth` mounts:

```js
import cyoaRouter from '../../routes/cyoa.js';
// ...
app.use('/api/cyoa', mockAuth, noCache(), cyoaRouter);
```

---

### File 4 — `server/tests/issue-971-cyoa-passages.test.js` (new file)

Follow the pattern of `server/tests/issue-868-ecm-1-equipment-catalogue-api.test.js`:
`vitest` + `supertest` + `createTestApp` + `mockAuth` via `X-Test-User` header.

Use `playerUser()` as the default auth user for all write tests (any authenticated user
may POST their own record — no ST role needed).

**Setup / teardown:**

- `beforeAll`: `setupDb()` + `app = createTestApp()`
- `afterEach`: delete all docs in `cyoa_passages` where `player_id` matches the test user's
  `player_id` (or use a test-specific `story_id` prefix to scope cleanup)
- `afterAll`: `teardownDb()`

**Test cases:**

1. **200 create** — POST valid body as `playerUser()` → status 200, body `{ ok: true }`,
   doc inserted into `cyoa_passages` with correct field values, `created_at` and `updated_at`
   both populated as ISO strings.

2. **200 replace** — POST valid body (same `player_id` + `story_id`, different `code`) → status
   200, `updated_at` is newer than the original, `created_at` is unchanged, `code` reflects
   the new value.

3. **400 missing story_id** — POST body without `story_id` → status 400,
   `body.error === 'VALIDATION_ERROR'`.

4. **400 oversized code** — POST body with `code` of 4097 chars → status 400,
   `body.error === 'VALIDATION_ERROR'`.

5. **400 story_id regex** — POST body with `story_id` containing uppercase letters, spaces,
   or underscores (e.g. `"My_Story"` or `"My Story"`) → status 400,
   `body.error === 'VALIDATION_ERROR'`.

6. **401 no bearer** — POST without `X-Test-User` header → status 401 (falls through
   `mockAuth`).

7. **Unique index** — after app creation, call `getCollection('cyoa_passages').indexInformation()`
   and assert there is exactly one index entry with keys `{ player_id: 1, story_id: 1 }` and
   `unique: true`. This verifies the index was created at startup, not just at write time.

---

## Files to Change / Create

| File | Change |
|---|---|
| `server/routes/cyoa.js` | New file — Router with `POST /passages` |
| `server/index.js` | Import + mount `cyoaRouter`; optional `ensureIndex` call |
| `server/tests/helpers/test-app.js` | Add `/api/cyoa` mount with `mockAuth` |
| `server/tests/issue-971-cyoa-passages.test.js` | New test file — 7 test cases |
| `specs/stories/971-cyoa-passages-route.story.md` | This file (include in PR) |

No changes to: character schema, character routes, GET endpoints, CORS config.

---

## Dev Agent Record

_(To be completed by dev agent on implementation.)_

### Files Changed

### Completion Notes
