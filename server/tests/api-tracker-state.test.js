/**
 * API tests — /api/tracker_state
 *
 * Covers EPA.2: centralised tracker state with influence field.
 * - GET returns 404 for unknown character
 * - PUT upserts vitae + influence in one call
 * - Subsequent GET returns persisted influence
 * - Player role is blocked (ST-only endpoint)
 * - Unauthenticated requests rejected
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { ObjectId } from 'mongodb';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;
const TEST_CHAR_ID = new ObjectId().toHexString();

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
});

afterAll(async () => {
  await getCollection('tracker_state').deleteMany({ character_id: TEST_CHAR_ID });
  await teardownDb();
});

describe('GET /api/tracker_state/:id — Auth', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get(`/api/tracker_state/${TEST_CHAR_ID}`);
    expect(res.status).toBe(401);
  });

  it('player is blocked (ST-only)', async () => {
    const res = await request(app)
      .get(`/api/tracker_state/${TEST_CHAR_ID}`)
      .set('X-Test-User', playerUser([]));
    expect(res.status).toBe(403);
  });
});

describe('GET /api/tracker_state/:id — Not found', () => {
  it('returns 404 for unknown character', async () => {
    const unknownId = new ObjectId().toHexString();
    const res = await request(app)
      .get(`/api/tracker_state/${unknownId}`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/tracker_state/:id — Upsert', () => {
  it('upserts vitae and influence together (EPA.2)', async () => {
    const res = await request(app)
      .put(`/api/tracker_state/${TEST_CHAR_ID}`)
      .set('X-Test-User', stUser())
      .send({ vitae: 7, influence: 4, willpower: 5, bashing: 0, lethal: 0, aggravated: 0 });
    expect(res.status).toBe(200);
    expect(res.body.vitae).toBe(7);
    expect(res.body.influence).toBe(4);
    expect(res.body.willpower).toBe(5);
  });

  it('subsequent GET returns persisted influence', async () => {
    const res = await request(app)
      .get(`/api/tracker_state/${TEST_CHAR_ID}`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(res.body.vitae).toBe(7);
    expect(res.body.influence).toBe(4);
  });

  it('partial update preserves existing fields', async () => {
    const res = await request(app)
      .put(`/api/tracker_state/${TEST_CHAR_ID}`)
      .set('X-Test-User', stUser())
      .send({ vitae: 3 });
    expect(res.status).toBe(200);
    expect(res.body.vitae).toBe(3);
    // influence should still be set from previous upsert
    expect(res.body.influence).toBe(4);
  });

  it('can update influence independently', async () => {
    const res = await request(app)
      .put(`/api/tracker_state/${TEST_CHAR_ID}`)
      .set('X-Test-User', stUser())
      .send({ influence: 0 });
    expect(res.status).toBe(200);
    expect(res.body.influence).toBe(0);
  });

  it('player is blocked from writing tracker state', async () => {
    const res = await request(app)
      .put(`/api/tracker_state/${TEST_CHAR_ID}`)
      .set('X-Test-User', playerUser([]))
      .send({ vitae: 10 });
    expect(res.status).toBe(403);
  });
});
