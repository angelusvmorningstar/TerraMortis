/**
 * Push-cycle integration tests.
 *
 * Covers the full "New Cycle" wizard sequence at the API level:
 *   1. ST stages an outcome (ready)
 *   2. ST publishes (outcome_visibility → published)
 *   3. Player fetches submission → sees published_outcome, no st_review
 *   4. Blank narrative is published correctly (player gets empty string — a known risk, not a silent bug)
 *   5. Game session is created with correct game_number
 *   6. Players cannot create game sessions
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb, getTestCharacterIds } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;
let testChars = [];
let createdSubIds = [];
let createdSessionIds = [];
let createdCharIds = [];

beforeAll(async () => {
  await setupDb();
  app = createTestApp();

  // Try to use existing characters; if none, create minimal test fixtures
  testChars = await getTestCharacterIds(2);
  if (testChars.length < 2) {
    const { ObjectId } = await import('mongodb');
    const col = getCollection('characters');
    const base = {
      retired: false,
      attributes: {}, skills: {}, disciplines: {}, merits: [], powers: [], ordeals: {},
    };
    const a = await col.insertOne({ name: 'Publish Test A', ...base });
    const b = await col.insertOne({ name: 'Publish Test B', ...base });
    createdCharIds.push(a.insertedId, b.insertedId);
    testChars = [
      { id: a.insertedId.toString(), name: 'Publish Test A' },
      { id: b.insertedId.toString(), name: 'Publish Test B' },
    ];
  }
});

afterEach(async () => {
  const subCol = getCollection('downtime_submissions');
  for (const id of createdSubIds) await subCol.deleteOne({ _id: id });
  createdSubIds = [];

  const sesCol = getCollection('game_sessions');
  for (const id of createdSessionIds) await sesCol.deleteOne({ _id: id });
  createdSessionIds = [];
});

afterAll(async () => {
  if (createdCharIds.length) {
    const col = getCollection('characters');
    for (const id of createdCharIds) await col.deleteOne({ _id: id });
  }
  await teardownDb();
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function insertSub(charId, overrides = {}) {
  const { ObjectId } = await import('mongodb');
  const col = getCollection('downtime_submissions');
  const doc = {
    character_id: new ObjectId(charId),
    cycle_id: null,
    character_name: 'Test Character',
    player_name: 'Test Player',
    status: 'submitted',
    responses: {},
    ...overrides,
  };
  const result = await col.insertOne(doc);
  createdSubIds.push(result.insertedId);
  return { ...doc, _id: result.insertedId };
}

// ══════════════════════════════════════════════════════════════
//  PUBLISH SEQUENCE
// ══════════════════════════════════════════════════════════════

describe('Publish sequence — ST stages then publishes', () => {
  it('player sees published_outcome after ST sets outcome_visibility=published', async () => {
    const sub = await insertSub(testChars[0].id);

    // ST stages the narrative
    await request(app)
      .put(`/api/downtime_submissions/${sub._id}`)
      .set('X-Test-User', stUser())
      .send({
        'st_review.outcome_text': 'The night was long and fruitful.',
        'st_review.outcome_visibility': 'ready',
      });

    // ST publishes
    await request(app)
      .put(`/api/downtime_submissions/${sub._id}`)
      .set('X-Test-User', stUser())
      .send({ 'st_review.outcome_visibility': 'published' });

    // Player fetches — should see published_outcome, no st_review
    const res = await request(app)
      .get('/api/downtime_submissions')
      .set('X-Test-User', playerUser([testChars[0].id]));

    expect(res.status).toBe(200);
    const found = res.body.find(s => s._id.toString() === sub._id.toString());
    expect(found).toBeTruthy();
    expect(found.published_outcome).toBe('The night was long and fruitful.');
    expect(found.st_review).toBeUndefined();
  });

  it('player does NOT see published_outcome when visibility is only ready (not published)', async () => {
    const sub = await insertSub(testChars[0].id, {
      st_review: { outcome_text: 'Not yet published.', outcome_visibility: 'ready' },
    });

    const res = await request(app)
      .get('/api/downtime_submissions')
      .set('X-Test-User', playerUser([testChars[0].id]));

    const found = res.body.find(s => s._id.toString() === sub._id.toString());
    expect(found).toBeTruthy();
    expect(found.published_outcome).toBeUndefined();
    expect(found.st_review).toBeUndefined();
  });

  it('published_outcome is empty string when outcome_text is blank (known risk — wizard warns)', async () => {
    const sub = await insertSub(testChars[0].id, {
      st_review: { outcome_text: '', outcome_visibility: 'published' },
    });

    const res = await request(app)
      .get('/api/downtime_submissions')
      .set('X-Test-User', playerUser([testChars[0].id]));

    const found = res.body.find(s => s._id.toString() === sub._id.toString());
    expect(found).toBeTruthy();
    // Empty string is falsy — player UI renders "No results" for empty published_outcome
    expect(found.published_outcome).toBe('');
  });

  it('ST can re-publish with updated outcome_text (re-roll/correction scenario)', async () => {
    const sub = await insertSub(testChars[0].id, {
      st_review: { outcome_text: 'First draft.', outcome_visibility: 'published' },
    });

    // ST updates the text and keeps it published
    await request(app)
      .put(`/api/downtime_submissions/${sub._id}`)
      .set('X-Test-User', stUser())
      .send({ 'st_review.outcome_text': 'Corrected narrative.' });

    const res = await request(app)
      .get('/api/downtime_submissions')
      .set('X-Test-User', playerUser([testChars[0].id]));

    const found = res.body.find(s => s._id.toString() === sub._id.toString());
    expect(found.published_outcome).toBe('Corrected narrative.');
  });

  it('multiple characters publish independently — each player only sees their own', async () => {
    await insertSub(testChars[0].id, {
      st_review: { outcome_text: 'Story A.', outcome_visibility: 'published' },
    });
    await insertSub(testChars[1].id, {
      st_review: { outcome_text: 'Story B.', outcome_visibility: 'published' },
    });

    // Player owning char 0 only
    const res = await request(app)
      .get('/api/downtime_submissions')
      .set('X-Test-User', playerUser([testChars[0].id]));

    expect(res.body.every(s => s.published_outcome !== 'Story B.')).toBe(true);
    const mine = res.body.find(s => s.published_outcome === 'Story A.');
    expect(mine).toBeTruthy();
  });
});

// ══════════════════════════════════════════════════════════════
//  GAME SESSION AUTO-CREATION
// ══════════════════════════════════════════════════════════════

describe('POST /api/game_sessions — wizard auto-creation', () => {
  it('ST can create a game session with game_number and session_date', async () => {
    const res = await request(app)
      .post('/api/game_sessions')
      .set('X-Test-User', stUser())
      .send({ session_date: '2026-05-01', game_number: 3 });

    expect(res.status).toBe(201);
    expect(res.body.game_number).toBe(3);
    expect(res.body.session_date).toBe('2026-05-01');
    expect(Array.isArray(res.body.attendance)).toBe(true);
    createdSessionIds.push(res.body._id);
  });

  it('session is retrievable after creation', async () => {
    const created = await request(app)
      .post('/api/game_sessions')
      .set('X-Test-User', stUser())
      .send({ session_date: '2026-05-01', game_number: 4 });
    createdSessionIds.push(created.body._id);

    const res = await request(app)
      .get('/api/game_sessions')
      .set('X-Test-User', stUser());

    expect(res.status).toBe(200);
    const found = res.body.find(s => s.game_number === 4);
    expect(found).toBeTruthy();
    expect(found.session_date).toBe('2026-05-01');
  });

  it('player cannot create a game session', async () => {
    const res = await request(app)
      .post('/api/game_sessions')
      .set('X-Test-User', playerUser([]))
      .send({ session_date: '2026-05-01', game_number: 99 });

    expect(res.status).toBe(403);
  });

  it('session creation fails without session_date', async () => {
    const res = await request(app)
      .post('/api/game_sessions')
      .set('X-Test-User', stUser())
      .send({ game_number: 5 });

    expect(res.status).toBe(400);
  });
});

// ══════════════════════════════════════════════════════════════
//  ST OVERRIDE / RE-ROLL SAFETY
// ══════════════════════════════════════════════════════════════

describe('ST override protections', () => {
  it('player cannot set outcome_visibility directly', async () => {
    const sub = await insertSub(testChars[0].id);
    const res = await request(app)
      .put(`/api/downtime_submissions/${sub._id}`)
      .set('X-Test-User', playerUser([testChars[0].id]))
      .send({ 'st_review.outcome_visibility': 'published' });

    // Request succeeds but st_review fields are stripped
    expect(res.status).toBe(200);
    const col = getCollection('downtime_submissions');
    const doc = await col.findOne({ _id: sub._id });
    expect(doc.st_review?.outcome_visibility).toBeUndefined();
  });

  it('ST can override published outcome after initial publish', async () => {
    const sub = await insertSub(testChars[0].id, {
      st_review: { outcome_text: 'Original.', outcome_visibility: 'published' },
    });

    const updateRes = await request(app)
      .put(`/api/downtime_submissions/${sub._id}`)
      .set('X-Test-User', stUser())
      .send({ 'st_review.outcome_text': 'Overridden by ST.' });

    expect(updateRes.status).toBe(200);

    const playerRes = await request(app)
      .get('/api/downtime_submissions')
      .set('X-Test-User', playerUser([testChars[0].id]));

    const found = playerRes.body.find(s => s._id.toString() === sub._id.toString());
    expect(found.published_outcome).toBe('Overridden by ST.');
  });
});
