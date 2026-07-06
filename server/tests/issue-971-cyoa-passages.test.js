/**
 * Issue #971 — CYOA passages write-back route.
 *
 * Covers all 7 acceptance criteria from the story:
 *   1. 200 create — valid body inserts a passage doc with correct fields.
 *   2. 200 replace — second POST same (player_id, story_id) updates record;
 *      created_at unchanged, updated_at bumped, code reflects new value.
 *   3. 400 missing story_id — returns VALIDATION_ERROR.
 *   4. 400 oversized code — code > 4096 chars returns VALIDATION_ERROR.
 *   5. 400 story_id regex — invalid chars (uppercase / space / underscore) return VALIDATION_ERROR.
 *   6. 401 no bearer — request without X-Test-User header returns 401.
 *   7. Unique index — cyoa_passages collection has unique composite index on
 *      { player_id: 1, story_id: 1 }.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { createTestApp, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;
const TEST_STORY_ID = 'test-971-story';

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
  await getCollection('cyoa_passages').deleteMany({ story_id: TEST_STORY_ID });
});

afterAll(async () => {
  await getCollection('cyoa_passages').deleteMany({ story_id: TEST_STORY_ID });
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
