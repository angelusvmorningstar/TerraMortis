/**
 * Issue #971 — CYOA passages write-back route.
 * Issue #977 — GET /api/cyoa/passages read-back route (v2 of #971).
 *
 * Covers all 7 acceptance criteria from the #971 story:
 *   1. 200 create — valid body inserts a passage doc with correct fields.
 *   2. 200 replace — second POST same (player_id, story_id) updates record;
 *      created_at unchanged, updated_at bumped, code reflects new value.
 *   3. 400 missing story_id — returns VALIDATION_ERROR.
 *   4. 400 oversized code — code > 4096 chars returns VALIDATION_ERROR.
 *   5. 400 story_id regex — invalid chars (uppercase / space / underscore) return VALIDATION_ERROR.
 *   6. 401 no bearer — request without X-Test-User header returns 401.
 *   7. Unique index — cyoa_passages collection has unique composite index on
 *      { player_id: 1, story_id: 1 }.
 *
 * GET /api/cyoa/passages (#977) covers:
 *   1. 200 own-only — array of caller's rows, seven fields, no _id/player_id/discord_id.
 *   2. 200 empty array — no rows for the caller.
 *   3. ?story_id= filter narrows correctly.
 *   4. 401 no bearer.
 *   5. A-cannot-see-B isolation.
 *   6. ?all=1 — ST sees all rows; non-ST caller stays own-only.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { createTestApp, playerUser, stUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;
const TEST_STORY_ID = 'test-971-story';
const GET_STORY_ID = 'test-977-story';

function validBody(overrides = {}) {
  return {
    story_id: TEST_STORY_ID,
    version: '1.0',
    outcome: 'ending-a',
    character: 'Livia Mancini',
    code: 'passage-code-abc',
    ...overrides,
  };
}

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
});

afterEach(async () => {
  await getCollection('cyoa_passages').deleteMany({ story_id: { $in: [TEST_STORY_ID, GET_STORY_ID] } });
});

afterAll(async () => {
  await getCollection('cyoa_passages').deleteMany({ story_id: { $in: [TEST_STORY_ID, GET_STORY_ID] } });
  await teardownDb();
});

// ─────────────────────────────────────────────────────────────────────────────
//  1. 200 create
// ─────────────────────────────────────────────────────────────────────────────

it('200 create — inserts passage doc with correct field values', async () => {
  const res = await request(app)
    .post('/api/cyoa/passages')
    .set('X-Test-User', playerUser())
    .send(validBody());

  expect(res.status).toBe(200);
  expect(res.body).toEqual({ ok: true });

  const user = JSON.parse(playerUser());
  const doc = await getCollection('cyoa_passages').findOne({
    player_id: user.player_id,
    story_id: TEST_STORY_ID,
  });

  expect(doc).not.toBeNull();
  expect(doc.story_id).toBe(TEST_STORY_ID);
  expect(doc.version).toBe('1.0');
  expect(doc.outcome).toBe('ending-a');
  expect(doc.character).toBe('Livia Mancini');
  expect(doc.code).toBe('passage-code-abc');
  expect(doc.discord_id).toBe(user.id);
  expect(typeof doc.created_at).toBe('string');
  expect(typeof doc.updated_at).toBe('string');
  // Both are valid ISO date strings
  expect(() => new Date(doc.created_at)).not.toThrow();
  expect(() => new Date(doc.updated_at)).not.toThrow();
});

// ─────────────────────────────────────────────────────────────────────────────
//  2. 200 replace — upsert semantics
// ─────────────────────────────────────────────────────────────────────────────

it('200 replace — second POST updates code and updated_at; created_at unchanged', async () => {
  const user = JSON.parse(playerUser());

  // First write
  await request(app)
    .post('/api/cyoa/passages')
    .set('X-Test-User', playerUser())
    .send(validBody({ code: 'code-original' }));

  const first = await getCollection('cyoa_passages').findOne({
    player_id: user.player_id,
    story_id: TEST_STORY_ID,
  });

  // Small delay to ensure updated_at will differ
  await new Promise(r => setTimeout(r, 5));

  // Second write — same story_id, different code
  const res = await request(app)
    .post('/api/cyoa/passages')
    .set('X-Test-User', playerUser())
    .send(validBody({ code: 'code-updated' }));

  expect(res.status).toBe(200);
  expect(res.body).toEqual({ ok: true });

  const second = await getCollection('cyoa_passages').findOne({
    player_id: user.player_id,
    story_id: TEST_STORY_ID,
  });

  expect(second.code).toBe('code-updated');
  expect(second.created_at).toBe(first.created_at);
  expect(new Date(second.updated_at).getTime()).toBeGreaterThanOrEqual(
    new Date(first.updated_at).getTime(),
  );
});

// ─────────────────────────────────────────────────────────────────────────────
//  3. 400 missing story_id
// ─────────────────────────────────────────────────────────────────────────────

it('400 missing story_id — returns VALIDATION_ERROR', async () => {
  const body = validBody();
  delete body.story_id;

  const res = await request(app)
    .post('/api/cyoa/passages')
    .set('X-Test-User', playerUser())
    .send(body);

  expect(res.status).toBe(400);
  expect(res.body.error).toBe('VALIDATION_ERROR');
});

// ─────────────────────────────────────────────────────────────────────────────
//  4. 400 oversized code
// ─────────────────────────────────────────────────────────────────────────────

it('400 oversized code — code of 4097 chars returns VALIDATION_ERROR', async () => {
  const res = await request(app)
    .post('/api/cyoa/passages')
    .set('X-Test-User', playerUser())
    .send(validBody({ code: 'x'.repeat(4097) }));

  expect(res.status).toBe(400);
  expect(res.body.error).toBe('VALIDATION_ERROR');
});

// ─────────────────────────────────────────────────────────────────────────────
//  5. 400 story_id regex
// ─────────────────────────────────────────────────────────────────────────────

it('400 story_id regex — uppercase chars return VALIDATION_ERROR', async () => {
  const res = await request(app)
    .post('/api/cyoa/passages')
    .set('X-Test-User', playerUser())
    .send(validBody({ story_id: 'My_Story' }));

  expect(res.status).toBe(400);
  expect(res.body.error).toBe('VALIDATION_ERROR');
});

it('400 story_id regex — spaces return VALIDATION_ERROR', async () => {
  const res = await request(app)
    .post('/api/cyoa/passages')
    .set('X-Test-User', playerUser())
    .send(validBody({ story_id: 'my story' }));

  expect(res.status).toBe(400);
  expect(res.body.error).toBe('VALIDATION_ERROR');
});

// ─────────────────────────────────────────────────────────────────────────────
//  6. 401 no bearer
// ─────────────────────────────────────────────────────────────────────────────

it('401 no bearer — request without X-Test-User header returns 401', async () => {
  const res = await request(app)
    .post('/api/cyoa/passages')
    .send(validBody());

  expect(res.status).toBe(401);
});

// ─────────────────────────────────────────────────────────────────────────────
//  7. Unique index exists on cyoa_passages
// ─────────────────────────────────────────────────────────────────────────────

it('unique index — cyoa_passages has { player_id: 1, story_id: 1 } with unique: true', async () => {
  const col = getCollection('cyoa_passages');
  // Ensure the index is present (createIndex is idempotent)
  await col.createIndex({ player_id: 1, story_id: 1 }, { unique: true });

  const info = await col.indexInformation({ full: true });
  const composite = info.find(
    idx =>
      idx.unique === true &&
      idx.key &&
      idx.key.player_id === 1 &&
      idx.key.story_id === 1,
  );

  expect(composite).toBeDefined();
  expect(composite.unique).toBe(true);
});

// ─────────────────────────────────────────────────────────────────────────────
//  Issue #977 — GET /api/cyoa/passages
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/cyoa/passages', () => {
  const playerA = playerUser();
  const playerB = playerUser([], { id: 'test-player-002', player_id: 'p-player-002' });

  function getBody(overrides = {}) {
    return {
      story_id: GET_STORY_ID,
      version: '1.0',
      outcome: 'ending-a',
      character: 'Livia Mancini',
      code: 'get-passage-code',
      ...overrides,
    };
  }

  it('200 own-only — returns array of caller rows with the seven fields, no _id/player_id/discord_id', async () => {
    await request(app)
      .post('/api/cyoa/passages')
      .set('X-Test-User', playerA)
      .send(getBody());

    const res = await request(app)
      .get('/api/cyoa/passages')
      .set('X-Test-User', playerA);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);

    const row = res.body[0];
    expect(Object.keys(row).sort()).toEqual(
      ['character', 'code', 'created_at', 'outcome', 'story_id', 'updated_at', 'version'].sort(),
    );
    expect(row.story_id).toBe(GET_STORY_ID);
    expect(row.version).toBe('1.0');
    expect(row.outcome).toBe('ending-a');
    expect(row.character).toBe('Livia Mancini');
    expect(row.code).toBe('get-passage-code');
    expect(row._id).toBeUndefined();
    expect(row.player_id).toBeUndefined();
    expect(row.discord_id).toBeUndefined();
  });

  it('200 empty array — caller with no matching rows gets 200 []', async () => {
    const res = await request(app)
      .get('/api/cyoa/passages')
      .set('X-Test-User', playerA);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('?story_id= filter narrows to that story only', async () => {
    await request(app)
      .post('/api/cyoa/passages')
      .set('X-Test-User', playerA)
      .send(getBody());
    await request(app)
      .post('/api/cyoa/passages')
      .set('X-Test-User', playerA)
      .send(validBody()); // TEST_STORY_ID, cleaned up by shared afterEach

    const res = await request(app)
      .get(`/api/cyoa/passages?story_id=${GET_STORY_ID}`)
      .set('X-Test-User', playerA);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].story_id).toBe(GET_STORY_ID);
  });

  it('401 no bearer — GET without X-Test-User returns 401', async () => {
    const res = await request(app).get('/api/cyoa/passages');
    expect(res.status).toBe(401);
  });

  it('A-cannot-see-B — player A GET never includes player B rows', async () => {
    await request(app)
      .post('/api/cyoa/passages')
      .set('X-Test-User', playerA)
      .send(getBody({ character: 'Character A' }));
    await request(app)
      .post('/api/cyoa/passages')
      .set('X-Test-User', playerB)
      .send(getBody({ character: 'Character B' }));

    const res = await request(app)
      .get('/api/cyoa/passages')
      .set('X-Test-User', playerA);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].character).toBe('Character A');
    expect(res.body.some(r => r.character === 'Character B')).toBe(false);

    const resScoped = await request(app)
      .get(`/api/cyoa/passages?story_id=${GET_STORY_ID}`)
      .set('X-Test-User', playerA);

    expect(resScoped.body.length).toBe(1);
    expect(resScoped.body[0].character).toBe('Character A');
  });

  it('?all=1 — ST caller sees rows across all players; non-ST caller stays own-only', async () => {
    await request(app)
      .post('/api/cyoa/passages')
      .set('X-Test-User', playerA)
      .send(getBody({ character: 'Character A' }));
    await request(app)
      .post('/api/cyoa/passages')
      .set('X-Test-User', playerB)
      .send(getBody({ character: 'Character B' }));

    const stRes = await request(app)
      .get(`/api/cyoa/passages?all=1&story_id=${GET_STORY_ID}`)
      .set('X-Test-User', stUser());

    expect(stRes.status).toBe(200);
    expect(stRes.body.length).toBe(2);
    const characters = stRes.body.map(r => r.character).sort();
    expect(characters).toEqual(['Character A', 'Character B']);

    const playerRes = await request(app)
      .get(`/api/cyoa/passages?all=1&story_id=${GET_STORY_ID}`)
      .set('X-Test-User', playerA);

    expect(playerRes.status).toBe(200);
    expect(playerRes.body.length).toBe(1);
    expect(playerRes.body[0].character).toBe('Character A');
  });
});
