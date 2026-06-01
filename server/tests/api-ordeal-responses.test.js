/**
 * API tests — /api/ordeal-responses (issue #525).
 *
 * The player-facing ordeal create/submit path. Previously every create 400'd
 * because validate(ordealResponseSchema) required `ordeal_type` (the STORED
 * field) while the request body sends `type`. These tests lock the request
 * contract: POST { type, responses } creates a draft; the PUT submit
 * transition works; GET ?type= round-trips.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
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
