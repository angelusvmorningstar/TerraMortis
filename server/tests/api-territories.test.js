/**
 * API tests — /api/territories
 *
 * Covers (post-ADR-002 strict cutover):
 *   GET /                     — list all (ST + player)
 *   POST /                    — create new (no _id) or update existing (with _id), ST only
 *   PUT /:id                  — update by MongoDB _id, 404/400, ST only
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;
const createdTerritoryIds = [];

const testTerritory = (slug = 'test_territory_quinn') => ({
  slug,
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
  await col.deleteMany({ slug: { $regex: /^test_territory_quinn/ } });
  // Defensive cleanup for any legacy `id` field left behind on prior runs.
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

  it('player can list (GET is open to all authenticated users)', async () => {
    const res = await request(app)
      .get('/api/territories')
      .set('X-Test-User', playerUser([]));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/territories');
    expect(res.status).toBe(401);
  });
});

// ── POST / ────────────────────────────────────────────────────────────────────

describe('POST /api/territories', () => {
  it('ST can create a territory (no _id → insert with generated _id)', async () => {
    const res = await request(app)
      .post('/api/territories')
      .set('X-Test-User', stUser())
      .send(testTerritory('test_territory_quinn_create'));
    expect(res.status).toBe(201);
    expect(res.body._id).toBeTruthy();
    expect(res.body.slug).toBe('test_territory_quinn_create');
    expect(res.body.name).toBe('Quinn Test Territory');
  });

  it('ST can update an existing territory by _id', async () => {
    const create = await request(app)
      .post('/api/territories')
      .set('X-Test-User', stUser())
      .send(testTerritory('test_territory_quinn_update'));
    const mongoId = create.body._id;

    const update = await request(app)
      .post('/api/territories')
      .set('X-Test-User', stUser())
      .send({ _id: mongoId, ambience: 'hostile' });
    expect(update.status).toBe(200);
    expect(update.body._id).toBe(mongoId);
    expect(update.body.ambience).toBe('hostile');
  });

  it('POST with unknown _id returns 404 (no upsert by _id)', async () => {
    const res = await request(app)
      .post('/api/territories')
      .set('X-Test-User', stUser())
      .send({ _id: '000000000000000000000000', name: 'Phantom' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('POST with malformed _id returns 400', async () => {
    const res = await request(app)
      .post('/api/territories')
      .set('X-Test-User', stUser())
      .send({ _id: 'not-an-oid', name: 'Bad' });
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

  // Issue #9 — `map_coords` accepted at insert time and round-tripped.
  it('POST with valid `map_coords` round-trips', async () => {
    const res = await request(app)
      .post('/api/territories')
      .set('X-Test-User', stUser())
      .send({ ...testTerritory('test_territory_quinn_post_coords'), map_coords: { x: 33.3, y: 66.7 } });
    expect(res.status).toBe(201);
    expect(res.body.map_coords).toEqual({ x: 33.3, y: 66.7 });
  });

  // Issue #33 — defence-in-depth: schema rejects the retired legacy `id` field
  // so a stale browser session cannot silently insert a duplicate document.
  // Reproduces the 2026-05-05 incident pattern (5 dupes via apiPost with `id`).
  it('POST with legacy `id` field returns 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/territories')
      .set('X-Test-User', stUser())
      .send({
        id: 'test_territory_quinn_legacy_id',
        name: 'Legacy ID Reject',
        ambience: 'Settled',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'id' }),
      ]),
    );
  });

  // Issue #33 — strict schema also rejects other unknown fields (e.g. legacy
  // `regent_name` cache that one importer used to send).
  it('POST with unknown field returns 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/territories')
      .set('X-Test-User', stUser())
      .send({
        slug: 'test_territory_quinn_unknown',
        name: 'Unknown Field Reject',
        regent_name: 'Legacy Display Cache',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'regent_name' }),
      ]),
    );
  });

  // Issue #33 — sanity check: every field in the canonical post-ADR-002
  // contract round-trips cleanly through the strict schema.
  it('POST with full canonical fieldset round-trips (no rejection)', async () => {
    const res = await request(app)
      .post('/api/territories')
      .set('X-Test-User', stUser())
      .send({
        slug: 'test_territory_quinn_canonical',
        name: 'Canonical Round-Trip',
        ambience: 'Curated',
        ambienceMod: 3,
        regent_id: null,
        lieutenant_id: null,
        feeding_rights: [],
      });
    expect(res.status).toBe(201);
    expect(res.body.slug).toBe('test_territory_quinn_canonical');
    expect(res.body.ambienceMod).toBe(3);
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

  // Issue #9 — `map_coords` round-trips on PUT and validates components.
  it('PUT with valid `map_coords` round-trips', async () => {
    const create = await request(app)
      .post('/api/territories')
      .set('X-Test-User', stUser())
      .send(testTerritory('test_territory_quinn_put_coords'));
    const mongoId = create.body._id;

    const res = await request(app)
      .put(`/api/territories/${mongoId}`)
      .set('X-Test-User', stUser())
      .send({ map_coords: { x: 42.5, y: 71.25 } });
    expect(res.status).toBe(200);
    expect(res.body.map_coords).toEqual({ x: 42.5, y: 71.25 });
  });

  it('PUT with `map_coords.x` out of range returns 400', async () => {
    const create = await request(app)
      .post('/api/territories')
      .set('X-Test-User', stUser())
      .send(testTerritory('test_territory_quinn_put_coords_oor'));
    const mongoId = create.body._id;

    const res = await request(app)
      .put(`/api/territories/${mongoId}`)
      .set('X-Test-User', stUser())
      .send({ map_coords: { x: 150, y: 50 } });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('PUT with partial `map_coords` (missing y) returns 400', async () => {
    const create = await request(app)
      .post('/api/territories')
      .set('X-Test-User', stUser())
      .send(testTerritory('test_territory_quinn_put_coords_partial'));
    const mongoId = create.body._id;

    const res = await request(app)
      .put(`/api/territories/${mongoId}`)
      .set('X-Test-User', stUser())
      .send({ map_coords: { x: 50 } });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('PUT with `map_coords: null` clears the field', async () => {
    const create = await request(app)
      .post('/api/territories')
      .set('X-Test-User', stUser())
      .send({ ...testTerritory('test_territory_quinn_put_coords_clear'), map_coords: { x: 25, y: 25 } });
    const mongoId = create.body._id;

    const res = await request(app)
      .put(`/api/territories/${mongoId}`)
      .set('X-Test-User', stUser())
      .send({ map_coords: null });
    expect(res.status).toBe(200);
    expect(res.body.map_coords).toBeNull();
  });

  // Issue #141 — defense-in-depth follow-up to #33: PUT now carries the same
  // strict-schema gate as POST. A stale browser session posting the retired
  // legacy `id` field via PUT must be rejected, mirroring the POST path's
  // literal May-5 incident reproduction.
  it('PUT with legacy `id` body field returns 400 VALIDATION_ERROR', async () => {
    const create = await request(app)
      .post('/api/territories')
      .set('X-Test-User', stUser())
      .send(testTerritory('test_territory_quinn_put_legacy_id'));
    const mongoId = create.body._id;

    const res = await request(app)
      .put(`/api/territories/${mongoId}`)
      .set('X-Test-User', stUser())
      .send({
        id: 'test_territory_quinn_put_legacy_id',
        name: 'Legacy ID Reject (PUT)',
        ambience: 'Settled',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'id' }),
      ]),
    );
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
