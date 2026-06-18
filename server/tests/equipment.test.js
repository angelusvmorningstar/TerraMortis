/**
 * API tests — character-scoped equipment + asset CRUD routes (EQ-1, issue #654).
 *
 * The catalogue surface (GET / POST / PATCH / DELETE on
 * /api/equipment_catalogue) is covered separately in
 * tests/issue-868-ecm-1-equipment-catalogue-api.test.js. The legacy
 * /api/equipment/catalogue alias from EQ-1 was removed in ECM-7 (#874).
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
import { ObjectId } from 'mongodb';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;
const seededIds = [];
const seededCatIds = [];

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

// ECM-3 (#870): POST /api/characters/:id/equipment now requires the
// `catalogue_id` to be a 24-hex ObjectId string that resolves to a doc
// in the equipment_catalogue collection (not the static slug set).
// Seed three catalogue items here for the tests below to reference.
async function seedCatalogueItem(overrides = {}) {
  const now = new Date().toISOString();
  const doc = {
    bucket: 'weapon', name: `Test Cat Item ${Math.random().toString(36).slice(2, 8)}`,
    description: 'fixture', availability: 1, tags: [],
    damage_mod: 1, damage_type: 'lethal', weapon_type: 'melee',
    armour_value: null, defence_penalty: null,
    skill_domain: null, bonus_dice: null, mechanical_effect: null,
    created_at: now, updated_at: now,
    ...overrides,
  };
  const result = await getCollection('equipment_catalogue').insertOne(doc);
  seededCatIds.push(result.insertedId);
  return { _id: result.insertedId, ...doc };
}

let char;
let catKnife;
let catFlashlight;
let catRope;

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
  char = await seedChar({ name: 'Equipment Test' });
  catKnife      = await seedCatalogueItem({ name: 'Knife (test)',      bucket: 'weapon' });
  catFlashlight = await seedCatalogueItem({ name: 'Flashlight (test)', bucket: 'equipment' });
  catRope       = await seedCatalogueItem({ name: 'Rope (test)',       bucket: 'equipment' });
});

afterAll(async () => {
  const col = getCollection('characters');
  for (const id of seededIds) await col.deleteOne({ _id: id });
  for (const id of seededCatIds) await getCollection('equipment_catalogue').deleteOne({ _id: id });
  await teardownDb();
});

// ── GET /:id/equipment ───────────────────────────────────────────────────────
// (ECM-7 #874 removed the legacy /api/equipment/catalogue alias and its
// smoke test that lived here. The canonical bulk read lives at
// /api/equipment_catalogue; see issue-868-ecm-1-equipment-catalogue-api.test.js.)

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

describe('POST /api/characters/:id/equipment (ECM-3: ObjectId catalogue_id)', () => {
  it('appends a valid item and stores catalogue_id as ObjectId', async () => {
    const charA = await seedChar({ name: 'EQ POST Test' });
    const res = await request(app)
      .post(`/api/characters/${charA.id}/equipment`)
      .set('X-Test-User', stUser())
      .send({
        catalogue_id: String(catKnife._id),
        state: 'carried',
        acquired_cycle: 1,
        notes: 'A trusty blade',
      });
    expect(res.status).toBe(200);
    expect(res.body.equipment).toHaveLength(1);
    expect(String(res.body.equipment[0].catalogue_id)).toBe(String(catKnife._id));
    expect(res.body.equipment[0].state).toBe('carried');
    expect(res.body.equipment[0].acquired_cycle).toBe(1);
    expect(res.body.equipment[0].notes).toBe('A trusty blade');
    // Storage type assertion — must be ObjectId, not string.
    const stored = await getCollection('characters').findOne({ _id: charA._id });
    expect(stored.equipment[0].catalogue_id).toBeInstanceOf(ObjectId);
  });

  it('400 when state is not a valid enum value', async () => {
    const res = await request(app)
      .post(`/api/characters/${char.id}/equipment`)
      .set('X-Test-User', stUser())
      .send({ catalogue_id: String(catKnife._id), state: 'flying', acquired_cycle: 1 });
    expect(res.status).toBe(400);
  });

  it('400 when catalogue_id is missing', async () => {
    const res = await request(app)
      .post(`/api/characters/${char.id}/equipment`)
      .set('X-Test-User', stUser())
      .send({ state: 'carried', acquired_cycle: 1 });
    expect(res.status).toBe(400);
  });

  it('400 when catalogue_id is not a 24-hex string', async () => {
    const res = await request(app)
      .post(`/api/characters/${char.id}/equipment`)
      .set('X-Test-User', stUser())
      .send({ catalogue_id: 'knife', state: 'carried', acquired_cycle: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(res.body.message).toMatch(/24-hex ObjectId/);
  });

  it('400 when acquired_cycle is missing', async () => {
    const res = await request(app)
      .post(`/api/characters/${char.id}/equipment`)
      .set('X-Test-User', stUser())
      .send({ catalogue_id: String(catKnife._id), state: 'carried' });
    expect(res.status).toBe(400);
  });

  it('400 when acquired_cycle is a float', async () => {
    const res = await request(app)
      .post(`/api/characters/${char.id}/equipment`)
      .set('X-Test-User', stUser())
      .send({ catalogue_id: String(catKnife._id), state: 'carried', acquired_cycle: 1.5 });
    expect(res.status).toBe(400);
  });

  it('notes defaults to null when omitted', async () => {
    const char2 = await seedChar({ name: 'EQ Nullnotes' });
    const res = await request(app)
      .post(`/api/characters/${char2.id}/equipment`)
      .set('X-Test-User', stUser())
      .send({ catalogue_id: String(catFlashlight._id), state: 'stashed', acquired_cycle: 0 });
    expect(res.status).toBe(200);
    expect(res.body.equipment[0].notes).toBeNull();
  });

  it('accepts acquired_cycle 0 (chargen item)', async () => {
    const char3 = await seedChar({ name: 'EQ Chargen' });
    const res = await request(app)
      .post(`/api/characters/${char3.id}/equipment`)
      .set('X-Test-User', stUser())
      .send({ catalogue_id: String(catRope._id), state: 'carried', acquired_cycle: 0 });
    expect(res.status).toBe(200);
    expect(res.body.equipment[0].acquired_cycle).toBe(0);
  });

  it('404 with NOT_FOUND when catalogue_id is 24-hex but absent from the collection', async () => {
    const char4 = await seedChar({ name: 'EQ BadCat' });
    const ghost = new ObjectId();
    const res = await request(app)
      .post(`/api/characters/${char4.id}/equipment`)
      .set('X-Test-User', stUser())
      .send({ catalogue_id: String(ghost), state: 'carried', acquired_cycle: 1 });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
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
      .send({ catalogue_id: String(catKnife._id), state: 'carried', acquired_cycle: 1 });
    await request(app).post(`/api/characters/${char4.id}/equipment`)
      .set('X-Test-User', stUser())
      .send({ catalogue_id: String(catFlashlight._id), state: 'stashed', acquired_cycle: 2 });

    // Delete first (index 0)
    const res = await request(app)
      .delete(`/api/characters/${char4.id}/equipment/0`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(res.body.equipment).toHaveLength(1);
    expect(String(res.body.equipment[0].catalogue_id)).toBe(String(catFlashlight._id));
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
