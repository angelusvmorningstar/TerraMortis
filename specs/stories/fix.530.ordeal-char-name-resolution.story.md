---
issue: 530
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/530
branch: morningstar-issue-530-ordeal-char-name-unknown
story: 530
---

# Story 530: Fix ordeal admin character name — resolve via player lookup

Status: review

## Story

As an ST,
I want the ordeal marking panel to show the correct character name for each submission,
so that I can identify who submitted each ordeal — currently every response shows "Unknown".

## Root cause

Two failure modes, both introduced in fix.527:

1. **POST stores `character_id: null`** — `req.user.character_ids?.[0]` is null/empty when the
   player's session token was issued before their characters were assigned (stale session at
   auth time). Storing null makes the admin's `character_id` lookup fail.

2. **`player_id` fallback always fails** — `charNameForSub()` tries
   `characters.find(c => String(c.player_id) === String(sub.player_id))` but character
   documents do not have a `player_id` field. The player→character link is one-directional:
   `players.character_ids[]` points to characters, not the other way around.

## Acceptance criteria

- [ ] Ordeal response submissions display the player's character name, not "Unknown"
- [ ] Works for existing `ordeal_responses` docs with `character_id: null` — no migration script

## Tasks

### [x] 1. POST — live player lookup when session character_ids is empty

`server/routes/ordeal-responses.js` — POST handler (lines 82–91).

Replace:
```js
const doc = {
  player_id: playerId,
  character_id: req.user.character_ids?.[0] ?? null,
```

With:
```js
// Resolve character_id even when the session's character_ids is stale or empty.
let characterId = req.user.character_ids?.[0] ?? null;
if (!characterId) {
  const player = await getCollection('players').findOne(
    { _id: req.user.player_id },
    { projection: { character_ids: 1 } }
  );
  characterId = player?.character_ids?.[0] ?? null;
}

const doc = {
  player_id: playerId,
  character_id: characterId,
```

`getCollection` is already imported at line 7. `req.user.player_id` is an ObjectId (set by
auth middleware at `server/middleware/auth.js:67`). The `findOne` call works directly with it.

This fixes all new submissions going forward, even if the player's session pre-dates character
assignment.

### [x] 2. GET /all — batch-enrich null-character_id docs via player lookup

`server/routes/ordeal-responses.js` — `GET /all` handler (lines 158–164).

Replace:
```js
router.get('/all', requireRole('st'), async (req, res) => {
  const filter = {};
  if (req.query.type) filter.ordeal_type = req.query.type;
  const docs = await col().find(filter).toArray();
  res.json(docs);
});
```

With:
```js
router.get('/all', requireRole('st'), async (req, res) => {
  const filter = {};
  if (req.query.type) filter.ordeal_type = req.query.type;
  const docs = await col().find(filter).toArray();

  // Batch-enrich: for docs with null character_id, resolve via player lookup.
  const nullCharDocs = docs.filter(d => !d.character_id && d.player_id);
  if (nullCharDocs.length) {
    const playerIds = [...new Set(nullCharDocs.map(d => d.player_id))];
    const players = await getCollection('players').find(
      { _id: { $in: playerIds } },
      { projection: { _id: 1, character_ids: 1 } }
    ).toArray();
    const playerMap = new Map(players.map(p => [String(p._id), p.character_ids?.[0] ?? null]));
    docs.forEach(d => {
      if (!d.character_id && d.player_id) {
        d.character_id = playerMap.get(String(d.player_id)) ?? null;
      }
    });
  }

  res.json(docs);
});
```

This enriches the in-memory response docs before sending them — it does NOT write back to the
database. Existing `ordeal_responses` docs retain `character_id: null` in MongoDB; the correct
value is resolved at query time. This is intentional: no migration script, no data risk.

With `character_id` now populated, the existing `charNameForSub()` in the admin panel resolves
the name via `characters.find(c => String(c._id) === String(sub.character_id))` — no frontend
change needed.

### [x] 3. Tests

`server/tests/api-ordeal-responses.test.js` — add two tests:

**Test A: POST stores character_id from live player lookup (not just session)**

The existing test `'stores character_id from first of character_ids'` passes `playerUser(['char-abc-001'])`,
which sets `req.user.character_ids = ['char-abc-001']`. That covers the session-has-ids path.

New test: player with **empty** session `character_ids` but player record has `character_ids` in
the DB. In the test environment, the player record for `p-player-001` likely has no
`character_ids` (it's a synthetic test user), so `character_id` will still be null unless we
seed a player record. Keep this test simple — verify that the POST handler doesn't 500 when the
player lookup returns nothing (null character_id is acceptable fallback):

```js
it('POST with empty character_ids stores character_id: null gracefully', async () => {
  // playerUser([]) = character_ids:[], player not in DB → live lookup returns null
  const res = await request(app)
    .post('/api/ordeal-responses')
    .set('X-Test-User', playerUser([]))
    .send({ type: 'rules' });
  expect(res.status).toBe(201);
  expect(res.body.character_id).toBeNull();
});
```

Note: this test is identical to the existing `'creates with responses defaulted to {} when
omitted'` plus the character_id assertion. Verify the existing test already covers this path
and skip adding a duplicate if so.

**Test B: GET /all enriches null-character_id docs**

This requires seeding an `ordeal_responses` doc with `character_id: null` and a `players` doc
that links to a character. In the test harness, this is complex to set up correctly since the
players collection is live. Use a simpler assertion: `GET /all` returns 200 with an array
(already covered by the existing test). No additional test needed for the enrichment path
unless the seeding is straightforward.

**Run the existing suite to confirm no regressions:**
```
npx vitest run tests/api-ordeal-responses.test.js tests/api-ordeal-submissions.test.js
```
Both files must stay green (15 + 10 = 25).

## Dev notes

### Files changing

| File | Change |
|---|---|
| `server/routes/ordeal-responses.js` | POST: live player lookup; GET /all: batch enrichment |
| `server/tests/api-ordeal-responses.test.js` | Verify existing test covers null character_id path |

### Files NOT changing

- `public/js/admin/ordeals-admin.js` — `charNameForSub()` already works correctly once
  `character_id` is populated; no frontend change needed
- `server/schemas/ordeal.schema.js` — `character_id` already allowed as a property

### Key invariants to preserve

- The enrichment in GET /all mutates the **in-memory** `docs` array only. Never writes to
  MongoDB from a GET handler.
- `cascadePlayerOrdealXp` still uses `existing.player_id` (ObjectId from the DB record) for
  lookups — unchanged.
- `character_id` in the stored document stays whatever was set at POST time; the enrichment
  is a read-time overlay only. This is correct — the canonical source of truth for the
  player→character link remains the `players.character_ids` field.

### Test harness note

The test player `p-player-001` (from `playerUser()`) is a synthetic user with no corresponding
`players` collection entry. The live player lookup in the POST handler calls
`getCollection('players').findOne({ _id: 'p-player-001' })` — this returns null, so
`characterId` stays null. This is correct and safe; existing tests that pass `playerUser([])` 
already assert `character_id: null`.

Tests that pass `playerUser(['char-abc-001'])` exercise the session-has-ids path (no DB
lookup needed). Both paths are covered.

### Server-only change

No Netlify deploy needed — this is a Render (API) change only. Not testable on dev site
(dev proxies `/api/*` to the prod Render API). Verify via `tm_suite_test` and confirm in
production after merge to main.

## Dev agent record

### Agent model used

claude-sonnet-4-6

### Completion notes

**Two server-only edits to `ordeal-responses.js`:**

1. **POST handler**: when `req.user.character_ids?.[0]` is null/empty, performs a live
   `players.findOne` to resolve the current `character_ids` from the DB. Stores the first
   character as `character_id` (or null if the player has none). Fixes all new submissions
   regardless of session staleness.

2. **GET /all handler**: after fetching all docs, identifies those with `character_id: null`
   and a `player_id`, batch-fetches their player records in one query, builds a Map keyed by
   `String(player._id)` → `character_ids[0]`, then applies the resolved `character_id` to
   each qualifying doc in-memory. Never writes back to MongoDB. Fixes all existing docs
   without a migration script.

**Test added:** `'enriches null character_id from the player record batch lookup'` — seeds a
synthetic player with `character_ids: [fakeCharId]` and an `ordeal_responses` doc with
`character_id: null` linked by `player_id`; calls `GET /all` as ST; asserts the returned doc
has `character_id` matching `fakeCharId`. Cleanup via try/finally to avoid state leakage.

**26/26 green** (`api-ordeal-responses` 16, `api-ordeal-submissions` 10).

### File list

**Modified:**
- `server/routes/ordeal-responses.js`
- `server/tests/api-ordeal-responses.test.js`
- `specs/stories/fix.530.ordeal-char-name-resolution.story.md` (this file)

### Change log

- 2026-06-01: Story created from issue #530. Root cause confirmed via code audit.
  Status → ready-for-dev.
- 2026-06-01: Implemented tasks 1–3. 26 tests green (16 + 10). Status → review.
- 2026-06-01 (QA, Quinn): Verdict **PASS**. Added 1 test: POST resolves `character_id` via
  live player DB lookup when session `character_ids` is empty — seeds a player with
  `_id: PLAYER_ID` and `character_ids: [fakeCharId]`, POSTs with empty session, asserts
  `character_id` matches the DB-resolved value. This is the exact production bug scenario
  that triggered #530. `api-ordeal-responses` now 17 green; `api-ordeal-submissions` 10
  green. No other gaps.
