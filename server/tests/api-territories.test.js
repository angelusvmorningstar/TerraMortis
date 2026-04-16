/**
 * API tests — /api/territories
 *
 * Covers:
 *   GET /  — list all (ST only)
 *   POST / — create/upsert by territory id field
 *   PUT /:id — update by MongoDB _id, 404/400
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;
const createdTerritoryIds = [];

const testTerritory = (id = 'test_territory_quinn') => ({
  id,
  name: 'Quinn Test Territory',
  ambience: 'neutral',
  regent_id: null,
  lieutenant_id: null,
  feeding_rights: [],
});

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
});

afterEach(async () => {
  const col = getCollection('territories');
  for (const mongoId of createdTerritoryIds) {
    await col.deleteOne({ _id: mongoId });
  }
  // Also clean up by territory id field (for upserts)
  await col.deleteMany({ id: { $regex: /^test_territory_quinn/ } });
  createdTerritoryIds.length = 0;
});

afterAll(async () => {
  await teardownDb();
});

// ── GET / ─────────────────────────────────────────────────────────────────────

describe('GET /api/territories', () => {
  it('ST can list all territories', async () => {
    const res = await request(app)
      .get('/api/territories')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('player is blocked', async () => {
    const res = await request(app)
      .get('/api/territories')
      .set('X-Test-User', playerUser([]));
    expect(res.status).toBe(403);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/territories');
    expect(res.status).toBe(401);
  });
});

// ── POST / ────────────────────────────────────────────────────────────────────

describe('POST /api/territories', () => {
  it('ST can create a territory', async () => {
    const res = await request(app)
      .post('/api/territories')
      .set('X-Test-User', stUser())
      .send(testTerritory('test_territory_quinn_create'));
    expect(res.status).toBe(201);
    expect(res.body.id).toBe('test_territory_quinn_create');
    expect(res.body.name).toBe('Quinn Test Territory');
    expect(res.body._id).toBeTruthy();
  });

  it('upserts when territory id already exists', async () => {
    const slug = 'test_territory_quinn_upsert';
    // First create
    await request(app)
      .post('/api/territories')
      .set('X-Test-User', stUser())
      .send(testTerritory(slug));

    // Upsert with updated ambience
    const res = await request(app)
      .post('/api/territories')
      .set('X-Test-User', stUser())
      .send({ ...testTerritory(slug), ambience: 'hostile' });
    expect(res.status).toBe(201);
    expect(res.body.ambience).toBe('hostile');
  });

  it('returns 400 when id field is missing', async () => {
    const res = await request(app)
      .post('/api/territories')
      .set('X-Test-User', stUser())
      .send({ name: 'No ID Territory' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('player is blocked from creating', async () => {
    const res = await request(app)
      .post('/api/territories')
      .set('X-Test-User', playerUser([]))
      .send(testTerritory('test_territory_quinn_player'));
    expect(res.status).toBe(403);
  });
});

// ── PUT /:id ──────────────────────────────────────────────────────────────────

describe('PUT /api/territories/:id', () => {
  it('ST can update a territory by MongoDB _id', async () => {
    const create = await request(app)
      .post('/api/territories')
      .set('X-Test-User', stUser())
      .send(testTerritory('test_territory_quinn_put'));
    const mongoId = create.body._id;

    const update = await request(app)
      .put(`/api/territories/${mongoId}`)
      .set('X-Test-User', stUser())
      .send({ ambience: 'thriving' });
    expect(update.status).toBe(200);
    expect(update.body.ambience).toBe('thriving');
  });

  it('returns 404 for non-existent territory', async () => {
    const res = await request(app)
      .put('/api/territories/000000000000000000000000')
      .set('X-Test-User', stUser())
      .send({ ambience: 'hostile' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('returns 400 for malformed ID', async () => {
    const res = await request(app)
      .put('/api/territories/not-an-id')
      .set('X-Test-User', stUser())
      .send({ ambience: 'hostile' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('player is blocked from updating', async () => {
    const create = await request(app)
      .post('/api/territories')
      .set('X-Test-User', stUser())
      .send(testTerritory('test_territory_quinn_put_player'));
    const mongoId = create.body._id;

    const res = await request(app)
      .put(`/api/territories/${mongoId}`)
      .set('X-Test-User', playerUser([]))
      .send({ ambience: 'hostile' });
    expect(res.status).toBe(403);
  });
});
