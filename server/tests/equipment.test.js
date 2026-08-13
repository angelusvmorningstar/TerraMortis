/**
 * API tests — character-scoped equipment + asset CRUD routes (EQ-1, issue #654).
 *
 * The catalogue surface (GET / POST / PATCH / DELETE on
 * /api/equipment_catalogue) is covered separately in
 * tests/issue-868-ecm-1-equipment-catalogue-api.test.js. The legacy
 * /api/equipment/catalogue alias from EQ-1 was removed in ECM-7 (#874).
 *
 * Character-scoped (ST auth required):
 *   GET  /:id/equipment              — returns { equipment }
 *   POST /:id/equipment              — append item; validates catalogue_id, state, acquired_cycle
 *   DELETE /:id/equipment/:idx       — remove by index
 *
 *   /:id/assets routes retired 2026-06-19 — character.assets[] consolidated
 *   into equipment[] via catalogue bucket: 'asset' items.
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
let catHaven;
let catSafe;

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
  char = await seedChar({ name: 'Equipment Test' });
  catKnife      = await seedCatalogueItem({ name: 'Knife (test)',      bucket: 'weapon' });
  catFlashlight = await seedCatalogueItem({ name: 'Flashlight (test)', bucket: 'equipment' });
  catRope       = await seedCatalogueItem({ name: 'Rope (test)',       bucket: 'equipment' });
  // EQC-3 (#1154): two container-bucket catalogue fixtures for container_id tests.
  catHaven = await seedCatalogueItem({
    name: 'Haven (test)', bucket: 'container',
    damage_mod: null, damage_type: null, weapon_type: null,
    armour_value: null, defence_penalty: null, skill_domain: null, bonus_dice: null,
    mechanical_effect: 'A place to store things.',
  });
  catSafe = await seedCatalogueItem({
    name: 'Safe (test)', bucket: 'container',
    damage_mod: null, damage_type: null, weapon_type: null,
    armour_value: null, defence_penalty: null, skill_domain: null, bonus_dice: null,
    mechanical_effect: null,
  });
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

// ── POST /:id/equipment — container_id (EQC-3, issue #1154) ─────────────────
//
// container_id was introduced by EQC-1 (#1152) but never validated or even
// accepted by this route until now — this is the first real consumer.

describe('POST /api/characters/:id/equipment — container_id validation (EQC-3, #1154)', () => {
  it('null/absent container_id — unchanged behaviour, stored as null', async () => {
    const c = await seedChar({ name: 'EQC-3 no container' });
    const res = await request(app)
      .post(`/api/characters/${c.id}/equipment`)
      .set('X-Test-User', stUser())
      .send({ catalogue_id: String(catKnife._id), state: 'carried', acquired_cycle: 1 });
    expect(res.status).toBe(200);
    expect(res.body.equipment[0].container_id).toBeNull();
  });

  it('valid container_id — accepted and stored as a string, referencing an already-owned container row', async () => {
    const c = await seedChar({ name: 'EQC-3 with container' });
    // First, the character must already own the container itself.
    await request(app).post(`/api/characters/${c.id}/equipment`)
      .set('X-Test-User', stUser())
      .send({ catalogue_id: String(catHaven._id), state: 'active', acquired_cycle: 0 });
    // Now place a second item inside it.
    const res = await request(app)
      .post(`/api/characters/${c.id}/equipment`)
      .set('X-Test-User', stUser())
      .send({ catalogue_id: String(catKnife._id), state: 'stashed', acquired_cycle: 1, container_id: String(catHaven._id) });
    expect(res.status).toBe(200);
    const placed = res.body.equipment.find(e => String(e.catalogue_id) === String(catKnife._id));
    expect(placed.container_id).toBe(String(catHaven._id));
    // Stored as a plain string, not coerced to an ObjectId (unlike catalogue_id).
    const stored = await getCollection('characters').findOne({ _id: c._id }, { projection: { equipment: 1 } });
    const storedItem = stored.equipment.find(e => String(e.catalogue_id) === String(catKnife._id));
    expect(typeof storedItem.container_id).toBe('string');
  });

  it('400 when container_id is not a 24-hex string — and no write occurs', async () => {
    const c = await seedChar({ name: 'EQC-3 malformed container' });
    const res = await request(app)
      .post(`/api/characters/${c.id}/equipment`)
      .set('X-Test-User', stUser())
      .send({ catalogue_id: String(catKnife._id), state: 'carried', acquired_cycle: 1, container_id: 'not-a-valid-id' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(res.body.message).toMatch(/container_id must be a 24-hex ObjectId string/);
    // EQC-3 review patch (#1154, Codex external review Low finding): prove
    // the rejection is genuinely PRE-write, not merely status/message-shaped.
    const fresh = await getCollection('characters').findOne({ _id: c._id }, { projection: { equipment: 1 } });
    expect(fresh.equipment || []).toHaveLength(0);
  });

  it('400 when container_id references an item this character does NOT already own (dangling) — and no write occurs', async () => {
    const c = await seedChar({ name: 'EQC-3 dangling container' });
    // Character owns nothing yet — catHaven is a real catalogue item, but this
    // character never added it to their own equipment[].
    const res = await request(app)
      .post(`/api/characters/${c.id}/equipment`)
      .set('X-Test-User', stUser())
      .send({ catalogue_id: String(catKnife._id), state: 'carried', acquired_cycle: 1, container_id: String(catHaven._id) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(res.body.message).toMatch(/does not reference an item this character already owns/);
    const fresh = await getCollection('characters').findOne({ _id: c._id }, { projection: { equipment: 1 } });
    expect(fresh.equipment || []).toHaveLength(0);
  });

  it('400 when container_id references an owned item whose catalogue bucket is NOT container — and no write occurs', async () => {
    const c = await seedChar({ name: 'EQC-3 non-container target' });
    // Character owns a knife (combat_gear, not a container).
    await request(app).post(`/api/characters/${c.id}/equipment`)
      .set('X-Test-User', stUser())
      .send({ catalogue_id: String(catKnife._id), state: 'carried', acquired_cycle: 0 });
    const res = await request(app)
      .post(`/api/characters/${c.id}/equipment`)
      .set('X-Test-User', stUser())
      .send({ catalogue_id: String(catRope._id), state: 'carried', acquired_cycle: 1, container_id: String(catKnife._id) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(res.body.message).toMatch(/must reference a container-bucket catalogue item/);
    // Only the knife (added before the failed request) should be present.
    const fresh = await getCollection('characters').findOne({ _id: c._id }, { projection: { equipment: 1 } });
    expect(fresh.equipment || []).toHaveLength(1);
  });

  it('400 when container_id references a container that is itself already contained (single-level containment only) — and no write occurs', async () => {
    const c = await seedChar({ name: 'EQC-3 nested container rejection' });
    // Haven and Safe, with Safe placed inside Haven.
    await request(app).post(`/api/characters/${c.id}/equipment`)
      .set('X-Test-User', stUser())
      .send({ catalogue_id: String(catHaven._id), state: 'active', acquired_cycle: 0 });
    await request(app).post(`/api/characters/${c.id}/equipment`)
      .set('X-Test-User', stUser())
      .send({ catalogue_id: String(catSafe._id), state: 'active', acquired_cycle: 0, container_id: String(catHaven._id) });
    // Attempting to place a third item inside the ALREADY-CONTAINED Safe must fail.
    const res = await request(app)
      .post(`/api/characters/${c.id}/equipment`)
      .set('X-Test-User', stUser())
      .send({ catalogue_id: String(catKnife._id), state: 'stashed', acquired_cycle: 1, container_id: String(catSafe._id) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(res.body.message).toMatch(/single-level containment only/);
    const fresh = await getCollection('characters').findOne({ _id: c._id }, { projection: { equipment: 1 } });
    expect(fresh.equipment || []).toHaveLength(2); // Haven + Safe only, knife rejected.
  });

  it('a character can own TWO different containers and place items in each independently', async () => {
    const c = await seedChar({ name: 'EQC-3 two containers' });
    await request(app).post(`/api/characters/${c.id}/equipment`)
      .set('X-Test-User', stUser())
      .send({ catalogue_id: String(catHaven._id), state: 'active', acquired_cycle: 0 });
    await request(app).post(`/api/characters/${c.id}/equipment`)
      .set('X-Test-User', stUser())
      .send({ catalogue_id: String(catSafe._id), state: 'active', acquired_cycle: 0 });
    const inHaven = await request(app).post(`/api/characters/${c.id}/equipment`)
      .set('X-Test-User', stUser())
      .send({ catalogue_id: String(catKnife._id), state: 'stashed', acquired_cycle: 1, container_id: String(catHaven._id) });
    const inSafe = await request(app).post(`/api/characters/${c.id}/equipment`)
      .set('X-Test-User', stUser())
      .send({ catalogue_id: String(catRope._id), state: 'stashed', acquired_cycle: 1, container_id: String(catSafe._id) });
    expect(inHaven.status).toBe(200);
    expect(inSafe.status).toBe(200);
    const knifeRow = inSafe.body.equipment.find(e => String(e.catalogue_id) === String(catKnife._id));
    const ropeRow  = inSafe.body.equipment.find(e => String(e.catalogue_id) === String(catRope._id));
    expect(knifeRow.container_id).toBe(String(catHaven._id));
    expect(ropeRow.container_id).toBe(String(catSafe._id));
  });
});

// ── PUT /:id and character-create — container_id validation (EQC-3 review
// patch, #1154, Codex external review Medium finding) ───────────────────────
//
// The single-item POST /:id/equipment endpoint's container_id checks did
// NOT originally run for PUT /:id (the main admin Save-to-DB path,
// public/js/admin.js's buildSaveBody()) or the two character-create routes —
// enforcement depended entirely on which endpoint a caller used. All three
// now call the SAME shared validator.

describe('PUT /api/characters/:id — container_id validation (EQC-3 review patch, #1154)', () => {
  it('400 when the submitted equipment[] contains a container_id referencing an item NOT in the same array', async () => {
    const c = await seedChar({ name: 'EQC-3 PUT dangling container' });
    const res = await request(app)
      .put(`/api/characters/${c.id}`)
      .set('X-Test-User', stUser())
      .send({
        equipment: [
          { catalogue_id: String(catKnife._id), state: 'carried', acquired_cycle: 1, container_id: String(catHaven._id) },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(res.body.message).toMatch(/does not reference an item this character already owns/);
  });

  it('400 when the submitted equipment[] contains a container_id targeting a non-container catalogue item', async () => {
    const c = await seedChar({ name: 'EQC-3 PUT non-container target' });
    const res = await request(app)
      .put(`/api/characters/${c.id}`)
      .set('X-Test-User', stUser())
      .send({
        equipment: [
          { catalogue_id: String(catKnife._id), state: 'carried', acquired_cycle: 0 },
          { catalogue_id: String(catRope._id), state: 'carried', acquired_cycle: 1, container_id: String(catKnife._id) },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(res.body.message).toMatch(/must reference a container-bucket catalogue item/);
  });

  it('200 when the submitted equipment[] contains a valid, internally-consistent container relationship', async () => {
    const c = await seedChar({ name: 'EQC-3 PUT valid container' });
    const res = await request(app)
      .put(`/api/characters/${c.id}`)
      .set('X-Test-User', stUser())
      .send({
        equipment: [
          { catalogue_id: String(catHaven._id), state: 'active', acquired_cycle: 0 },
          { catalogue_id: String(catKnife._id), state: 'stashed', acquired_cycle: 1, container_id: String(catHaven._id) },
        ],
      });
    expect(res.status).toBe(200);
    const row = res.body.equipment.find(e => String(e.catalogue_id) === String(catKnife._id));
    expect(row.container_id).toBe(String(catHaven._id));
  });

  it('200 unaffected when the submitted equipment[] has no container_id at all (unchanged behaviour)', async () => {
    const c = await seedChar({ name: 'EQC-3 PUT no container' });
    const res = await request(app)
      .put(`/api/characters/${c.id}`)
      .set('X-Test-User', stUser())
      .send({ equipment: [{ catalogue_id: String(catKnife._id), state: 'carried', acquired_cycle: 1 }] });
    expect(res.status).toBe(200);
  });
});

describe('POST /api/characters — container_id validation on ST character creation (EQC-3 review patch, #1154)', () => {
  it('400 when the created character\'s equipment[] contains an invalid container_id', async () => {
    const res = await request(app)
      .post('/api/characters')
      .set('X-Test-User', stUser())
      .send({
        name: 'EQC-3 Create Dangling',
        equipment: [
          { catalogue_id: String(catKnife._id), state: 'carried', acquired_cycle: 1, container_id: String(catHaven._id) },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(res.body.message).toMatch(/does not reference an item this character already owns/);
    if (res.body._id) seededIds.push(new ObjectId(res.body._id));
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

// /:id/assets test slices REMOVED 2026-06-19 — character.assets[] retired
// and the corresponding endpoints removed. Asset-bucket catalogue items now
// flow through the equipment routes above.
