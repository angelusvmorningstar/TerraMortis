/**
 * API tests — equipment schema, catalogue, and CRUD routes (EQ-1, issue #654).
 *
 * Catalogue:
 *   GET /api/equipment/catalogue — public, returns EQUIPMENT_CATALOGUE array.
 *
 * Character-scoped (ST auth required):
 *   GET  /:id/equipment              — returns { equipment, assets }
 *   POST /:id/equipment              — append item; validates catalogue_id, state, acquired_cycle
 *   DELETE /:id/equipment/:idx       — remove by index
 *   POST /:id/assets                 — append asset; validates name, description, acquired_cycle
 *   DELETE /:id/assets/:idx          — remove by index
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;
const seededIds = [];

async function seedChar(overrides = {}) {
  const col = getCollection('characters');
  const doc = {
    name: 'EQ Test Char', retired: false, pending_approval: false,
    clan: 'Mekhet', covenant: 'Invictus',
    status: { city: 1, clan: 1, covenant: {} },
    attributes: {}, skills: {}, disciplines: {}, merits: [], powers: [], ordeals: {},
    ...overrides,
  };
  const result = await col.insertOne(doc);
  seededIds.push(result.insertedId);
  return { ...doc, _id: result.insertedId, id: result.insertedId.toString() };
}

let char;

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
  char = await seedChar({ name: 'Equipment Test' });
});

afterAll(async () => {
  const col = getCollection('characters');
  for (const id of seededIds) await col.deleteOne({ _id: id });
  await teardownDb();
});

// ── GET /api/equipment/catalogue ─────────────────────────────────────────────

describe('GET /api/equipment/catalogue', () => {
  it('returns 200 with the full catalogue array (no auth required)', async () => {
    const res = await request(app).get('/api/equipment/catalogue');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('every entry has the required universal fields', async () => {
    const res = await request(app).get('/api/equipment/catalogue');
    for (const entry of res.body) {
      expect(typeof entry.id).toBe('string');
      expect(['weapon', 'armour', 'equipment', 'asset']).toContain(entry.bucket);
      expect(typeof entry.name).toBe('string');
      expect(typeof entry.description).toBe('string');
      expect(typeof entry.availability).toBe('number');
      expect(Array.isArray(entry.tags)).toBe(true);
    }
  });

  it('contains at least one entry per bucket', async () => {
    const res = await request(app).get('/api/equipment/catalogue');
    const buckets = new Set(res.body.map(e => e.bucket));
    expect(buckets.has('weapon')).toBe(true);
    expect(buckets.has('armour')).toBe(true);
    expect(buckets.has('equipment')).toBe(true);
    expect(buckets.has('asset')).toBe(true);
  });
});

// ── GET /:id/equipment ───────────────────────────────────────────────────────

describe('GET /api/characters/:id/equipment', () => {
  it('returns 200 with empty arrays for a fresh character', async () => {
    const res = await request(app)
      .get(`/api/characters/${char.id}/equipment`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(res.body.equipment).toEqual([]);
    expect(res.body.assets).toEqual([]);
  });

  it('returns 404 for a non-existent character id', async () => {
    const res = await request(app)
      .get('/api/characters/000000000000000000000000/equipment')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(404);
  });

  it('returns 403 for a player (ST only)', async () => {
    const res = await request(app)
      .get(`/api/characters/${char.id}/equipment`)
      .set('X-Test-User', playerUser([char.id]));
    expect(res.status).toBe(403);
  });
});

// ── POST /:id/equipment ──────────────────────────────────────────────────────

describe('POST /api/characters/:id/equipment', () => {
  const validItem = {
    catalogue_id: 'knife',
    state: 'carried',
    acquired_cycle: 1,
    notes: 'A trusty blade',
  };

  it('appends a valid item and returns it in the response (200)', async () => {
    const res = await request(app)
      .post(`/api/characters/${char.id}/equipment`)
      .set('X-Test-User', stUser())
      .send(validItem);
    expect(res.status).toBe(200);
    expect(res.body.equipment).toHaveLength(1);
    expect(res.body.equipment[0].catalogue_id).toBe('knife');
    expect(res.body.equipment[0].state).toBe('carried');
    expect(res.body.equipment[0].acquired_cycle).toBe(1);
    expect(res.body.equipment[0].notes).toBe('A trusty blade');
  });

  it('400 when state is not a valid enum value', async () => {
    const res = await request(app)
      .post(`/api/characters/${char.id}/equipment`)
      .set('X-Test-User', stUser())
      .send({ catalogue_id: 'knife', state: 'flying', acquired_cycle: 1 });
    expect(res.status).toBe(400);
  });

  it('400 when catalogue_id is missing', async () => {
    const res = await request(app)
      .post(`/api/characters/${char.id}/equipment`)
      .set('X-Test-User', stUser())
      .send({ state: 'carried', acquired_cycle: 1 });
    expect(res.status).toBe(400);
  });

  it('400 when acquired_cycle is missing', async () => {
    const res = await request(app)
      .post(`/api/characters/${char.id}/equipment`)
      .set('X-Test-User', stUser())
      .send({ catalogue_id: 'knife', state: 'carried' });
    expect(res.status).toBe(400);
  });

  it('400 when acquired_cycle is a float', async () => {
    const res = await request(app)
      .post(`/api/characters/${char.id}/equipment`)
      .set('X-Test-User', stUser())
      .send({ catalogue_id: 'knife', state: 'carried', acquired_cycle: 1.5 });
    expect(res.status).toBe(400);
  });

  it('notes defaults to null when omitted', async () => {
    const char2 = await seedChar({ name: 'EQ Nullnotes' });
    const res = await request(app)
      .post(`/api/characters/${char2.id}/equipment`)
      .set('X-Test-User', stUser())
      .send({ catalogue_id: 'flashlight', state: 'stashed', acquired_cycle: 0 });
    expect(res.status).toBe(200);
    expect(res.body.equipment[0].notes).toBeNull();
  });

  it('accepts acquired_cycle 0 (chargen item)', async () => {
    const char3 = await seedChar({ name: 'EQ Chargen' });
    const res = await request(app)
      .post(`/api/characters/${char3.id}/equipment`)
      .set('X-Test-User', stUser())
      .send({ catalogue_id: 'rope', state: 'carried', acquired_cycle: 0 });
    expect(res.status).toBe(200);
    expect(res.body.equipment[0].acquired_cycle).toBe(0);
  });

  // #753 — catalogue_id existence check
  it('400 with VALIDATION_ERROR when catalogue_id is not in the catalogue', async () => {
    const char4 = await seedChar({ name: 'EQ BadCat' });
    const res = await request(app)
      .post(`/api/characters/${char4.id}/equipment`)
      .set('X-Test-User', stUser())
      .send({ catalogue_id: 'definitely-not-a-real-item-slug', state: 'carried', acquired_cycle: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(res.body.message).toMatch(/Unknown catalogue_id/);
    // No write occurred — the equipment array stays empty.
    const fresh = await getCollection('characters').findOne({ _id: char4._id }, { projection: { equipment: 1 } });
    expect(fresh.equipment || []).toHaveLength(0);
  });
});

// ── DELETE /:id/equipment/:itemIndex ─────────────────────────────────────────

describe('DELETE /api/characters/:id/equipment/:itemIndex', () => {
  it('removes the item at the given index and returns updated arrays', async () => {
    const char4 = await seedChar({ name: 'EQ Delete Test' });
    // Add two items
    await request(app).post(`/api/characters/${char4.id}/equipment`)
      .set('X-Test-User', stUser())
      .send({ catalogue_id: 'knife', state: 'carried', acquired_cycle: 1 });
    await request(app).post(`/api/characters/${char4.id}/equipment`)
      .set('X-Test-User', stUser())
      .send({ catalogue_id: 'flashlight', state: 'stashed', acquired_cycle: 2 });

    // Delete first (index 0)
    const res = await request(app)
      .delete(`/api/characters/${char4.id}/equipment/0`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(res.body.equipment).toHaveLength(1);
    expect(res.body.equipment[0].catalogue_id).toBe('flashlight');
  });

  it('404 when index is out of range', async () => {
    const char5 = await seedChar({ name: 'EQ OOB' });
    const res = await request(app)
      .delete(`/api/characters/${char5.id}/equipment/99`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(404);
  });
});

// ── POST /:id/assets ─────────────────────────────────────────────────────────

describe('POST /api/characters/:id/assets', () => {
  const validAsset = {
    name: 'Marrickville Safehouse',
    description: 'A discreet warehouse in the inner west.',
    location: 'Marrickville',
    mechanical_effect: null,
    acquired_cycle: 2,
    notes: 'Used for storing contraband',
  };

  it('appends a valid asset and returns it in the response (200)', async () => {
    const char6 = await seedChar({ name: 'Asset Test' });
    const res = await request(app)
      .post(`/api/characters/${char6.id}/assets`)
      .set('X-Test-User', stUser())
      .send(validAsset);
    expect(res.status).toBe(200);
    expect(res.body.assets).toHaveLength(1);
    expect(res.body.assets[0].name).toBe('Marrickville Safehouse');
    expect(res.body.assets[0].location).toBe('Marrickville');
    expect(res.body.assets[0].mechanical_effect).toBeNull();
  });

  it('400 when name is missing', async () => {
    const char7 = await seedChar({ name: 'Asset Missing Name' });
    const res = await request(app)
      .post(`/api/characters/${char7.id}/assets`)
      .set('X-Test-User', stUser())
      .send({ description: 'No name given', acquired_cycle: 1 });
    expect(res.status).toBe(400);
  });

  it('400 when description is missing', async () => {
    const char8 = await seedChar({ name: 'Asset Missing Desc' });
    const res = await request(app)
      .post(`/api/characters/${char8.id}/assets`)
      .set('X-Test-User', stUser())
      .send({ name: 'Something', acquired_cycle: 1 });
    expect(res.status).toBe(400);
  });

  it('400 when acquired_cycle is missing', async () => {
    const char9 = await seedChar({ name: 'Asset Missing Cycle' });
    const res = await request(app)
      .post(`/api/characters/${char9.id}/assets`)
      .set('X-Test-User', stUser())
      .send({ name: 'Something', description: 'A thing' });
    expect(res.status).toBe(400);
  });
});

// ── DELETE /:id/assets/:itemIndex ─────────────────────────────────────────────

describe('DELETE /api/characters/:id/assets/:itemIndex', () => {
  it('removes the asset at the given index and returns updated arrays', async () => {
    const char10 = await seedChar({ name: 'Asset Delete Test' });
    await request(app).post(`/api/characters/${char10.id}/assets`)
      .set('X-Test-User', stUser())
      .send({ name: 'First Asset', description: 'First', acquired_cycle: 1 });
    await request(app).post(`/api/characters/${char10.id}/assets`)
      .set('X-Test-User', stUser())
      .send({ name: 'Second Asset', description: 'Second', acquired_cycle: 2 });

    const res = await request(app)
      .delete(`/api/characters/${char10.id}/assets/0`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(res.body.assets).toHaveLength(1);
    expect(res.body.assets[0].name).toBe('Second Asset');
  });

  it('404 when index is out of range', async () => {
    const char11 = await seedChar({ name: 'Asset OOB' });
    const res = await request(app)
      .delete(`/api/characters/${char11.id}/assets/99`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(404);
  });
});
