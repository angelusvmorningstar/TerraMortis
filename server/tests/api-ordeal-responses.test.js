/**
 * API tests — /api/ordeal-responses (issues #525, #527).
 *
 * #525: Player-facing ordeal create/submit path. Every create was 400'd because
 * validate(ordealResponseSchema) required `ordeal_type` (the STORED field) while
 * the request body sends `type`. Tests lock the request contract.
 *
 * #527: ST marking path. Admin reads ordeal_responses/all; STs save marking data
 * via PUT; marking complete cascades XP.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { ObjectId } from 'mongodb';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;
const PLAYER_ID = 'p-player-001'; // matches playerUser() default

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
});

afterEach(async () => {
  await getCollection('ordeal_responses').deleteMany({ player_id: PLAYER_ID });
});

afterAll(async () => {
  await teardownDb();
});

describe('POST /api/ordeal-responses — create (issue #525)', () => {
  it('401 without auth', async () => {
    const res = await request(app).post('/api/ordeal-responses').send({ type: 'rules', responses: {} });
    expect(res.status).toBe(401);
  });

  it('creates a draft from { type, responses } (the request contract)', async () => {
    const res = await request(app)
      .post('/api/ordeal-responses')
      .set('X-Test-User', playerUser([]))
      .send({ type: 'rules', responses: { q1: 'an answer' } });
    expect(res.status).toBe(201);
    expect(res.body.ordeal_type).toBe('rules');
    expect(res.body.status).toBe('draft');
    expect(res.body.responses).toEqual({ q1: 'an answer' });
    expect(res.body.player_id).toBe(PLAYER_ID);
  });

  it('stores character_id from first of character_ids (issue #527 Task 1)', async () => {
    const res = await request(app)
      .post('/api/ordeal-responses')
      .set('X-Test-User', playerUser(['char-abc-001', 'char-abc-002']))
      .send({ type: 'lore', responses: {} });
    expect(res.status).toBe(201);
    expect(res.body.character_id).toBe('char-abc-001');
  });

  it('stores character_id: null when player has no characters', async () => {
    const res = await request(app)
      .post('/api/ordeal-responses')
      .set('X-Test-User', playerUser([]))
      .send({ type: 'covenant', responses: {} });
    expect(res.status).toBe(201);
    expect(res.body.character_id).toBeNull();
  });

  it('resolves character_id via live player lookup when session character_ids is empty (issue #530)', async () => {
    // This is the production bug scenario: empty session + player in DB with characters.
    const fakeCharId = new ObjectId();
    const playersCol = getCollection('players');
    await playersCol.insertOne({ _id: PLAYER_ID, character_ids: [fakeCharId] });
    try {
      const res = await request(app)
        .post('/api/ordeal-responses')
        .set('X-Test-User', playerUser([]))  // session has no character_ids
        .send({ type: 'lore' });
      expect(res.status).toBe(201);
      expect(String(res.body.character_id)).toBe(String(fakeCharId));
    } finally {
      await playersCol.deleteOne({ _id: PLAYER_ID });
    }
  });

  it('rejects an invalid type', async () => {
    const res = await request(app)
      .post('/api/ordeal-responses')
      .set('X-Test-User', playerUser([]))
      .send({ type: 'banana', responses: {} });
    expect(res.status).toBe(400);
  });

  it('409 on a duplicate create for the same type', async () => {
    await request(app).post('/api/ordeal-responses').set('X-Test-User', playerUser([])).send({ type: 'lore', responses: {} });
    const res = await request(app)
      .post('/api/ordeal-responses')
      .set('X-Test-User', playerUser([]))
      .send({ type: 'lore', responses: {} });
    expect(res.status).toBe(409);
  });

  it('creates with responses defaulted to {} when omitted', async () => {
    const res = await request(app)
      .post('/api/ordeal-responses')
      .set('X-Test-User', playerUser([]))
      .send({ type: 'rules' });
    expect(res.status).toBe(201);
    expect(res.body.responses).toEqual({});
  });
});

describe('PUT /api/ordeal-responses/:id — not found', () => {
  it('404 for a non-existent ID', async () => {
    const res = await request(app)
      .put('/api/ordeal-responses/000000000000000000000001')
      .set('X-Test-User', playerUser([]))
      .send({ responses: { q1: 'nope' } });
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/ordeal-responses/:id — ownership', () => {
  it('403 when a player edits another player\'s response', async () => {
    const created = await request(app)
      .post('/api/ordeal-responses')
      .set('X-Test-User', playerUser([]))
      .send({ type: 'rules', responses: {} });
    expect(created.status).toBe(201);

    const res = await request(app)
      .put(`/api/ordeal-responses/${created.body._id}`)
      .set('X-Test-User', playerUser([], { player_id: 'p-other-999' }))
      .send({ responses: { q1: 'hijack' }, status: 'submitted' });
    expect(res.status).toBe(403);
  });
});

describe('Ordeal response flow — submit + read back (issue #525)', () => {
  it('POST draft → PUT submit → GET round-trips', async () => {
    const created = await request(app)
      .post('/api/ordeal-responses')
      .set('X-Test-User', playerUser([]))
      .send({ type: 'covenant', responses: { q1: 'draft' } });
    expect(created.status).toBe(201);

    const submitted = await request(app)
      .put(`/api/ordeal-responses/${created.body._id}`)
      .set('X-Test-User', playerUser([]))
      .send({ responses: { q1: 'final' }, status: 'submitted' });
    expect(submitted.status).toBe(200);
    expect(submitted.body.status).toBe('submitted');
    expect(typeof submitted.body.submitted_at).toBe('string');

    const fetched = await request(app)
      .get('/api/ordeal-responses?type=covenant')
      .set('X-Test-User', playerUser([]));
    expect(fetched.status).toBe(200);
    expect(fetched.body.ordeal_type).toBe('covenant');
    expect(fetched.body.responses).toEqual({ q1: 'final' });
  });
});

describe('GET /api/ordeal-responses/all — character_id enrichment (issue #530)', () => {
  it('enriches null character_id from the player record batch lookup', async () => {
    const fakeCharId = new ObjectId();
    const playersCol = getCollection('players');
    const responsesCol = getCollection('ordeal_responses');

    const { insertedId: playerId } = await playersCol.insertOne({
      username: 'test-enrich-530',
      character_ids: [fakeCharId],
    });
    const { insertedId: docId } = await responsesCol.insertOne({
      player_id: playerId,
      character_id: null,
      ordeal_type: 'rules',
      status: 'submitted',
      responses: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    try {
      const res = await request(app)
        .get('/api/ordeal-responses/all')
        .set('X-Test-User', stUser());
      expect(res.status).toBe(200);
      const found = res.body.find(r => String(r._id) === String(docId));
      expect(found).toBeTruthy();
      expect(String(found.character_id)).toBe(String(fakeCharId));
    } finally {
      await responsesCol.deleteOne({ _id: docId });
      await playersCol.deleteOne({ _id: playerId });
    }
  });
});

describe('GET /api/ordeal-responses/all — ST listing (issue #527)', () => {
  it('returns all submitted responses for an ST', async () => {
    const created = await request(app)
      .post('/api/ordeal-responses')
      .set('X-Test-User', playerUser([]))
      .send({ type: 'rules', responses: { q1: 'answer' } });
    expect(created.status).toBe(201);

    await request(app)
      .put(`/api/ordeal-responses/${created.body._id}`)
      .set('X-Test-User', playerUser([]))
      .send({ responses: { q1: 'final' }, status: 'submitted' });

    const res = await request(app)
      .get('/api/ordeal-responses/all')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const found = res.body.find(r => String(r._id) === String(created.body._id));
    expect(found).toBeTruthy();
    expect(found.status).toBe('submitted');
  });

  it('403 for a player hitting /all', async () => {
    const res = await request(app)
      .get('/api/ordeal-responses/all')
      .set('X-Test-User', playerUser([]));
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/ordeal-responses/:id — ST marking (issue #527)', () => {
  it('ST can save marking progress (in_progress)', async () => {
    const created = await request(app)
      .post('/api/ordeal-responses')
      .set('X-Test-User', playerUser([]))
      .send({ type: 'lore', responses: { q1: 'an answer' } });
    expect(created.status).toBe(201);

    const res = await request(app)
      .put(`/api/ordeal-responses/${created.body._id}`)
      .set('X-Test-User', stUser())
      .send({
        marking: {
          status: 'in_progress',
          answers: [{ question_index: 0, result: 'yes', feedback: 'Good' }],
        },
      });
    expect(res.status).toBe(200);
    expect(res.body.marking.status).toBe('in_progress');
    expect(res.body.marking.answers).toHaveLength(1);
  });

  it('ST marking complete sets xp_awarded:3 and marked_at', async () => {
    const created = await request(app)
      .post('/api/ordeal-responses')
      .set('X-Test-User', playerUser([]))
      .send({ type: 'covenant', responses: { q1: 'my covenant answer' } });
    expect(created.status).toBe(201);

    const res = await request(app)
      .put(`/api/ordeal-responses/${created.body._id}`)
      .set('X-Test-User', stUser())
      .send({
        status: 'approved',
        marking: {
          status: 'complete',
          overall_feedback: 'Well done',
          answers: [{ question_index: 0, result: 'yes', feedback: '' }],
        },
      });
    expect(res.status).toBe(200);
    expect(res.body.marking.status).toBe('complete');
    expect(res.body.marking.xp_awarded).toBe(3);
    expect(typeof res.body.marking.marked_at).toBe('string');
    expect(res.body.status).toBe('approved');
  });

  it('player cannot set marking data — field is silently ignored', async () => {
    const created = await request(app)
      .post('/api/ordeal-responses')
      .set('X-Test-User', playerUser([]))
      .send({ type: 'rules', responses: {} });
    expect(created.status).toBe(201);

    const res = await request(app)
      .put(`/api/ordeal-responses/${created.body._id}`)
      .set('X-Test-User', playerUser([]))
      .send({ marking: { status: 'complete' } });
    expect(res.status).toBe(200);
    expect(res.body.marking).toBeUndefined();
  });
});
