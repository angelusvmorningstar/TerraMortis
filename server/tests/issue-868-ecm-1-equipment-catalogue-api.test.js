/**
 * Issue #868 — ECM-1: CRUD API for equipment_catalogue.
 *
 * Covers all five endpoints from epic D3 plus the /:id/impact endpoint
 * ECM-6 will consume. Negative paths per the AC: 400 invalid bucket /
 * missing required, 401 unauth write, 404 missing id, 409 delete with
 * holders.
 *
 * Also asserts the /api/equipment/catalogue alias forwards to the same
 * data the new bulk-read returns (epic D3 / AC#3).
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { ObjectId } from 'mongodb';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;
const seededItemIds = [];
const seededCharIds = [];

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
});

afterAll(async () => {
  if (seededItemIds.length) {
    await getCollection('equipment_catalogue').deleteMany({ _id: { $in: seededItemIds } });
  }
  if (seededCharIds.length) {
    await getCollection('characters').deleteMany({ _id: { $in: seededCharIds } });
  }
  await teardownDb();
});

afterEach(async () => {
  if (seededItemIds.length) {
    await getCollection('equipment_catalogue').deleteMany({ _id: { $in: seededItemIds } });
    seededItemIds.length = 0;
  }
  if (seededCharIds.length) {
    await getCollection('characters').deleteMany({ _id: { $in: seededCharIds } });
    seededCharIds.length = 0;
  }
});

async function seedItem(overrides = {}) {
  const now = new Date().toISOString();
  const doc = {
    bucket: 'equipment',
    name: 'Test Item',
    description: 'fixture',
    availability: 2,
    tags: ['test'],
    damage_mod: null, damage_type: null, weapon_type: null,
    armour_value: null, defence_penalty: null,
    skill_domain: null, bonus_dice: 1,
    created_at: now, updated_at: now,
    ...overrides,
  };
  const result = await getCollection('equipment_catalogue').insertOne(doc);
  seededItemIds.push(result.insertedId);
  return { _id: result.insertedId, ...doc };
}

async function seedCharWithItem(catalogueId, name = 'Test Holder') {
  const result = await getCollection('characters').insertOne({
    name,
    _ecm1_test: true,
    equipment: [{ catalogue_id: catalogueId, state: 'owned', acquired_cycle: 0 }],
  });
  seededCharIds.push(result.insertedId);
  return result.insertedId;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/equipment_catalogue (public — list)
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/equipment_catalogue', () => {
  it('returns 200 with all items, no auth required', async () => {
    await seedItem({ name: 'Alpha', bucket: 'weapon' });
    await seedItem({ name: 'Bravo', bucket: 'armour' });
    const res = await request(app).get('/api/equipment_catalogue');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const names = res.body.map(d => d.name);
    expect(names).toContain('Alpha');
    expect(names).toContain('Bravo');
  });

  it('sorts by bucket then name (deterministic order across calls)', async () => {
    await seedItem({ name: 'Zebra', bucket: 'equipment' });
    await seedItem({ name: 'Aardvark', bucket: 'equipment' });
    const res = await request(app).get('/api/equipment_catalogue');
    const equip = res.body.filter(d => d.bucket === 'equipment');
    const idxA = equip.findIndex(d => d.name === 'Aardvark');
    const idxZ = equip.findIndex(d => d.name === 'Zebra');
    expect(idxA).toBeLessThan(idxZ);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/equipment_catalogue/:id
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/equipment_catalogue/:id', () => {
  it('returns 200 with the single item', async () => {
    const seed = await seedItem({ name: 'Single' });
    const res = await request(app).get(`/api/equipment_catalogue/${seed._id}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Single');
    expect(String(res.body._id)).toBe(String(seed._id));
  });

  it('returns 404 for non-existent ObjectId', async () => {
    const ghostId = new ObjectId();
    const res = await request(app).get(`/api/equipment_catalogue/${ghostId}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('returns 404 for malformed id (collapses to NOT_FOUND surface)', async () => {
    const res = await request(app).get('/api/equipment_catalogue/not-a-valid-id');
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/equipment_catalogue
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/equipment_catalogue', () => {
  it('creates a new item when ST + body valid', async () => {
    const res = await request(app)
      .post('/api/equipment_catalogue')
      .set('X-Test-User', stUser())
      .send({ bucket: 'weapon', name: 'Glock 17', description: 'Pistol', availability: 2, damage_mod: 2 });
    expect(res.status).toBe(201);
    expect(res.body._id).toBeDefined();
    expect(res.body.name).toBe('Glock 17');
    expect(res.body.created_at).toBeDefined();
    expect(res.body.updated_at).toBeDefined();
    seededItemIds.push(new ObjectId(res.body._id));
  });

  it('returns 401 without auth header', async () => {
    const res = await request(app)
      .post('/api/equipment_catalogue')
      .send({ bucket: 'equipment', name: 'X' });
    expect(res.status).toBe(401);
  });

  it('returns 403 when caller is a player (not ST)', async () => {
    const res = await request(app)
      .post('/api/equipment_catalogue')
      .set('X-Test-User', playerUser())
      .send({ bucket: 'equipment', name: 'X' });
    expect(res.status).toBe(403);
  });

  it('returns 400 when required `name` is missing', async () => {
    const res = await request(app)
      .post('/api/equipment_catalogue')
      .set('X-Test-User', stUser())
      .send({ bucket: 'equipment' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when required `bucket` is missing', async () => {
    const res = await request(app)
      .post('/api/equipment_catalogue')
      .set('X-Test-User', stUser())
      .send({ name: 'No bucket' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when bucket is outside the enum', async () => {
    const res = await request(app)
      .post('/api/equipment_catalogue')
      .set('X-Test-User', stUser())
      .send({ bucket: 'wandwood', name: 'Magic Stick' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('does not honour a client-supplied _id', async () => {
    const sentinel = new ObjectId();
    const res = await request(app)
      .post('/api/equipment_catalogue')
      .set('X-Test-User', stUser())
      .send({ _id: sentinel, bucket: 'equipment', name: 'Try-injection' });
    // Either 201 (with a fresh _id) or a validation rejection — both acceptable,
    // but the document must NOT end up with the client _id.
    if (res.status === 201) {
      expect(String(res.body._id)).not.toBe(String(sentinel));
      seededItemIds.push(new ObjectId(res.body._id));
    } else {
      expect(res.status).toBe(400);
    }
    const probe = await getCollection('equipment_catalogue').findOne({ _id: sentinel });
    expect(probe).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/equipment_catalogue/:id
// ─────────────────────────────────────────────────────────────────────────────

describe('PATCH /api/equipment_catalogue/:id', () => {
  it('updates allowlisted fields when ST', async () => {
    const seed = await seedItem({ name: 'Old' });
    const res = await request(app)
      .patch(`/api/equipment_catalogue/${seed._id}`)
      .set('X-Test-User', stUser())
      .send({ name: 'New', availability: 4 });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('New');
    expect(res.body.availability).toBe(4);
    expect(res.body.updated_at).not.toBe(seed.updated_at);
  });

  it('ignores non-allowlisted fields (immutable bucket, _id, created_at)', async () => {
    const seed = await seedItem({ bucket: 'equipment', name: 'Stable' });
    const res = await request(app)
      .patch(`/api/equipment_catalogue/${seed._id}`)
      .set('X-Test-User', stUser())
      .send({ bucket: 'weapon', _id: new ObjectId(), created_at: '1999-01-01T00:00:00.000Z', name: 'OK' });
    expect(res.status).toBe(200);
    expect(res.body.bucket).toBe('equipment');
    expect(String(res.body._id)).toBe(String(seed._id));
    expect(res.body.name).toBe('OK');
  });

  it('returns 400 when no updatable fields provided', async () => {
    const seed = await seedItem();
    const res = await request(app)
      .patch(`/api/equipment_catalogue/${seed._id}`)
      .set('X-Test-User', stUser())
      .send({ bucket: 'weapon' });   // bucket is non-updatable
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  // #873 ECM-6 schema-widen: mechanical_effect added to the schema and PATCH
  // allowlist after ECM-2 surfaced the field on asset entries. Per epic
  // Non-Goal "no state-enum per-bucket validation", the schema accepts the
  // field across all buckets; the admin UI scopes it to assets.
  it('accepts mechanical_effect on PATCH (ECM-6 schema-widen)', async () => {
    const seed = await seedItem({ bucket: 'asset', name: 'Warehouse', mechanical_effect: null });
    const res = await request(app)
      .patch(`/api/equipment_catalogue/${seed._id}`)
      .set('X-Test-User', stUser())
      .send({ mechanical_effect: 'Confers +1 Resources for the cycle.' });
    expect(res.status).toBe(200);
    expect(res.body.mechanical_effect).toBe('Confers +1 Resources for the cycle.');
  });

  it('returns 401 without auth header', async () => {
    const seed = await seedItem();
    const res = await request(app)
      .patch(`/api/equipment_catalogue/${seed._id}`)
      .send({ name: 'X' });
    expect(res.status).toBe(401);
  });

  it('returns 403 when caller is a player', async () => {
    const seed = await seedItem();
    const res = await request(app)
      .patch(`/api/equipment_catalogue/${seed._id}`)
      .set('X-Test-User', playerUser())
      .send({ name: 'X' });
    expect(res.status).toBe(403);
  });

  it('returns 404 for non-existent id', async () => {
    const res = await request(app)
      .patch(`/api/equipment_catalogue/${new ObjectId()}`)
      .set('X-Test-User', stUser())
      .send({ name: 'Phantom' });
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/equipment_catalogue/:id
// ─────────────────────────────────────────────────────────────────────────────

describe('DELETE /api/equipment_catalogue/:id', () => {
  it('deletes the item when ST + no holders', async () => {
    const seed = await seedItem({ name: 'Deletable' });
    const res = await request(app)
      .delete(`/api/equipment_catalogue/${seed._id}`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(204);
    const probe = await getCollection('equipment_catalogue').findOne({ _id: seed._id });
    expect(probe).toBeNull();
  });

  it('returns 409 with holder count + names when held by characters (D5)', async () => {
    const seed = await seedItem({ name: 'Held Item' });
    await seedCharWithItem(seed._id, 'Holder One');
    await seedCharWithItem(seed._id, 'Holder Two');
    const res = await request(app)
      .delete(`/api/equipment_catalogue/${seed._id}`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('CONFLICT');
    expect(res.body.holders).toBe(2);
    expect(res.body.character_names).toEqual(expect.arrayContaining(['Holder One', 'Holder Two']));
    const probe = await getCollection('equipment_catalogue').findOne({ _id: seed._id });
    expect(probe).not.toBeNull();
  });

  it('returns 401 without auth header', async () => {
    const seed = await seedItem();
    const res = await request(app).delete(`/api/equipment_catalogue/${seed._id}`);
    expect(res.status).toBe(401);
  });

  it('returns 403 when caller is a player', async () => {
    const seed = await seedItem();
    const res = await request(app)
      .delete(`/api/equipment_catalogue/${seed._id}`)
      .set('X-Test-User', playerUser());
    expect(res.status).toBe(403);
  });

  it('returns 404 for non-existent id', async () => {
    const res = await request(app)
      .delete(`/api/equipment_catalogue/${new ObjectId()}`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/equipment_catalogue/:id/impact  (ECM-6 banner data)
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/equipment_catalogue/:id/impact', () => {
  it('returns zero holders for an unheld item', async () => {
    const seed = await seedItem({ name: 'Unheld' });
    const res = await request(app).get(`/api/equipment_catalogue/${seed._id}/impact`);
    expect(res.status).toBe(200);
    expect(res.body.holders).toBe(0);
    expect(res.body.character_names).toEqual([]);
  });

  it('returns holder count + names for a held item', async () => {
    const seed = await seedItem({ name: 'Held' });
    await seedCharWithItem(seed._id, 'Alice');
    await seedCharWithItem(seed._id, 'Bob');
    const res = await request(app).get(`/api/equipment_catalogue/${seed._id}/impact`);
    expect(res.status).toBe(200);
    expect(res.body.holders).toBe(2);
    expect(res.body.character_names).toEqual(expect.arrayContaining(['Alice', 'Bob']));
  });

  it('returns 404 for non-existent id', async () => {
    const res = await request(app).get(`/api/equipment_catalogue/${new ObjectId()}/impact`);
    expect(res.status).toBe(404);
  });

  it('does not require auth', async () => {
    const seed = await seedItem();
    const res = await request(app).get(`/api/equipment_catalogue/${seed._id}/impact`);
    expect(res.status).toBe(200);
  });
});

// (ECM-7 #874 removed the /api/equipment/catalogue legacy alias and its
// describe block here. The canonical bulk read is GET /api/equipment_catalogue;
// the legacy mount + routes/equipment.js were deleted in the same PR.)
