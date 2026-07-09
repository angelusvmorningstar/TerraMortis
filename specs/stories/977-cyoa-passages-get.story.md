---
issue: 977
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/977
branch: piatra/issue-977-cyoa-passages-get
---

# Story 977: GET /api/cyoa/passages — CYOA passage read-back (v2 of #971)

**Story ID:** feat.977
**Status:** Ready for Review (implemented + 14/14 vitest green locally; awaiting Peter's push/deploy)
**Date:** 2026-07-09
**Issue:** [#977](https://github.com/angelusvmorningstar/TerraMortis/issues/977)
**Branch:** `piatra/issue-977-cyoa-passages-get`

---

## User Story

As a returning CYOA player signing in on any device,
I want the server to return my stored canonical passage record(s),
so that the CYOA page can replay my official finished playthrough client-side even after a
reset, cleared storage, or a new device.

---

## Background

Follow-up to #971. The POST write-back shipped in PRs #972/#973 and stores one document per
`(player_id, story_id)` in the `cyoa_passages` collection. This story adds the matching read
path that was explicitly deferred to v2 (see the "No GET endpoint in v1 (scoped to v2)" note in
`server/routes/cyoa.js`).

The CYOA client is **already deployed** calling `GET /api/cyoa/passages?story_id=<id>` and
tolerating 404, so this ships on any cadence with zero coordination. Decoding of `code` stays
CYOA-side; TerraMortis only returns the stored rows.

Auth model is unchanged from #971: the parent mount at `server/index.js:109` applies
`requireAuth + noCache()`, so a request with no bearer falls through `requireAuth` and returns
401 before reaching the handler. The `req.user` shape is
`{ id (discord_id), player_id, character_ids, role }` (`server/middleware/auth.js:55-70`).
Role helper `isStRole(user)` is exported from `server/middleware/auth.js:82`.

---

## Acceptance Criteria

- [ ] `GET /api/cyoa/passages` returns `200` with a JSON **array** of the caller's own passage
      records, each shaped `{ story_id, version, outcome, character, code, created_at, updated_at }`.
- [ ] Records are filtered to the caller only: `player_id === req.user.player_id`. Player A must
      never receive player B's rows.
- [ ] `?story_id=<id>` narrows the result to that single story (the client always sends this).
- [ ] `200 []` (empty array, not 404) when the caller has no matching rows.
- [ ] A request with no `Authorization` header returns `401` (falls through `requireAuth`).
- [ ] `?all=1` with an ST caller (`isStRole(req.user) === true`) returns rows across all players;
      `?all=1` from a non-ST caller is ignored and still returns own-only rows.
- [ ] Vitest coverage added to `server/tests/issue-971-cyoa-passages.test.js` (or a sibling file)
      mirroring the POST cases: 200 own-only, 200 empty array, `story_id` filter, 401 no bearer,
      and A-cannot-see-B isolation.
- [ ] No changes to the character schema or characters route. No new dependencies.

---

## Design

### Handler — add to `server/routes/cyoa.js` (same router, above `export default`)

```js
router.get('/passages', async (req, res) => {
  const col = getCollection('cyoa_passages');

  const filter = {};
  // Own-only by default; ST may request all rows with ?all=1.
  if (!(req.query.all === '1' && isStRole(req.user))) {
    filter.player_id = req.user.player_id;
  }
  if (typeof req.query.story_id === 'string' && req.query.story_id) {
    filter.story_id = req.query.story_id;
  }

  const docs = await col
    .find(filter)
    .project({ _id: 0, story_id: 1, version: 1, outcome: 1, character: 1, code: 1, created_at: 1, updated_at: 1 })
    .toArray();

  res.json(docs);
});
```

Add `isStRole` to the existing import:
`import { isStRole } from '../middleware/auth.js';`

### Notes

- Projection drops `_id`, `player_id`, and `discord_id` — the client only needs the seven
  playback fields, and the read never leaks the internal keys.
- No validation on `story_id` for the read path: an unknown/malformed value simply yields `[]`.
- `noCache()` is already applied at the mount, matching the POST — no per-route cache header.
- The `?all=1` branch is included because it is cheap and specced, but the client never uses it;
  it is guarded so a non-ST caller can never escape the own-only filter.

---

## Test Plan

Extend the vitest suite (pattern from `server/tests/issue-971-cyoa-passages.test.js`), seeding
rows for two players via direct `getCollection('cyoa_passages').insertMany(...)` or POSTs:

1. **200 own-only** — player A GET returns only A's rows (array), each with the seven fields and
   no `player_id` / `discord_id` / `_id`.
2. **200 empty array** — player with no rows gets `200 []`.
3. **story_id filter** — `?story_id=<id>` returns only rows for that story.
4. **401 no bearer** — GET without `X-Test-User` returns 401.
5. **A-cannot-see-B** — seed a row for player B; player A's GET (with and without `?story_id`)
   never includes B's row.
6. **(optional) all=1 ST vs non-ST** — ST `?all=1` sees both players' rows; player `?all=1`
   still sees own-only.

---

## Dev Notes

- Do **not** push, open a PR, merge, or deploy. Commit locally only. Peter controls deploy cadence
  (each Netlify/Render deploy costs money) and will authorise the push/merge separately.
- Run only the CYOA suite while iterating: `cd server && npx vitest run tests/issue-971-cyoa-passages.test.js`.
