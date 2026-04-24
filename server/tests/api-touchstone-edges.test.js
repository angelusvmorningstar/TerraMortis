/**
 * API tests — touchstones + relationship edges (NPCR.4, post-rework)
 *
 * Model:
 * - character.touchstones[] is authoritative (cap 6, humanity descends from anchor)
 * - anchor = 7 if clan='Ventrue', else 6
 * - each touchstones[] entry may carry optional edge_id linking to a
 *   relationships doc (kind='touchstone') with touchstone_meta.humanity matching
 *
 * Covers:
 * - relationships POST/PUT enforce touchstone_meta.humanity + one pc/one npc
 *   endpoint when kind='touchstone' (unchanged from Phase A)
 * - characters PUT validates touchstones[]: cap, humanity-in-anchor-range,
 *   and embedded edge_id (when present) is active/correct-kind/char-on-endpoint
 * - GET enriches _npc_name per touchstone item that has an edge_id
 * - st_hidden excluded for player callers
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { ObjectId } from 'mongodb';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;
const CREATED_REL_IDS = [];
const CREATED_CHAR_IDS = [];
const CREATED_NPC_IDS = [];

const NPC_ID = new ObjectId().toHexString();
const NPC_ID_2 = new ObjectId().toHexString();
const OTHER_PC_ID = new ObjectId().toHexString();

function baseTouchstoneBody(overrides = {}) {
  return {
    a: { type: 'pc',  id: OTHER_PC_ID },
    b: { type: 'npc', id: NPC_ID },
    kind: 'touchstone',
    direction: 'a_to_b',
    state: 'Priscilla, the sister he failed to save',
    st_hidden: false,
    touchstone_meta: { humanity: 6 },
    ...overrides,
  };
}

async function seedChar(overrides = {}) {
  const col = getCollection('characters');
  const doc = {
    name: 'Quinn Touchstone Test',
    retired: false,
    pending_approval: false,
    attributes: {}, skills: {}, disciplines: {}, merits: [], powers: [], ordeals: {},
    touchstones: [],
    ...overrides,
  };
  const result = await col.insertOne(doc);
  CREATED_CHAR_IDS.push(result.insertedId);
  return { ...doc, _id: result.insertedId };
}

async function seedRelationship(overrides = {}) {
  const col = getCollection('relationships');
  const now = new Date().toISOString();
  const doc = {
    a: { type: 'pc',  id: OTHER_PC_ID },
    b: { type: 'npc', id: NPC_ID },
    kind: 'touchstone',
    direction: 'a_to_b',
    state: '',
    st_hidden: false,
    status: 'active',
    created_by: { type: 'st', id: 'test-st-001' },
    history: [{ at: now, by: { type: 'st', id: 'test-st-001' }, change: 'created' }],
    touchstone_meta: { humanity: 5 },
    created_at: now,
    updated_at: now,
    ...overrides,
  };
  const result = await col.insertOne(doc);
  CREATED_REL_IDS.push(result.insertedId);
  return { ...doc, _id: result.insertedId };
}

async function seedNpc(name) {
  const col = getCollection('npcs');
  const now = new Date().toISOString();
  const res = await col.insertOne({
    name, description: '', status: 'active',
    linked_character_ids: [], linked_cycle_id: null, notes: '',
    created_at: now, updated_at: now,
  });
  CREATED_NPC_IDS.push(res.insertedId);
  return { _id: res.insertedId, name };
}

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
});

afterAll(async () => {
  const rels = getCollection('relationships');
  if (CREATED_REL_IDS.length > 0) {
    await rels.deleteMany({ _id: { $in: CREATED_REL_IDS } });
  }
  const chars = getCollection('characters');
  for (const id of CREATED_CHAR_IDS) await chars.deleteOne({ _id: id });
  const npcs = getCollection('npcs');
  for (const id of CREATED_NPC_IDS) await npcs.deleteOne({ _id: id });
  await teardownDb();
});

// ── Relationships route: touchstone_meta + endpoint shape (unchanged) ────────

describe("POST /api/relationships kind='touchstone'", () => {
  it('creates a touchstone edge with touchstone_meta.humanity persisted', async () => {
    const res = await request(app)
      .post('/api/relationships')
      .set('X-Test-User', stUser())
      .send(baseTouchstoneBody({ touchstone_meta: { humanity: 7 } }));

    expect(res.status).toBe(201);
    expect(res.body.kind).toBe('touchstone');
    expect(res.body.touchstone_meta).toEqual({ humanity: 7 });
    CREATED_REL_IDS.push(new ObjectId(res.body._id));
  });

  it('rejects when touchstone_meta.humanity is missing', async () => {
    const body = baseTouchstoneBody();
    delete body.touchstone_meta;
    const res = await request(app)
      .post('/api/relationships')
      .set('X-Test-User', stUser())
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/touchstone_meta\.humanity/);
  });

  it('rejects pc+pc endpoints on a touchstone edge', async () => {
    const res = await request(app)
      .post('/api/relationships')
      .set('X-Test-User', stUser())
      .send(baseTouchstoneBody({
        a: { type: 'pc', id: OTHER_PC_ID },
        b: { type: 'pc', id: new ObjectId().toHexString() },
      }));

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/one pc and one npc/);
  });

  it('rejects humanity=0 and humanity=11', async () => {
    const low = await request(app).post('/api/relationships').set('X-Test-User', stUser())
      .send(baseTouchstoneBody({ touchstone_meta: { humanity: 0 } }));
    expect(low.status).toBe(400);
    const high = await request(app).post('/api/relationships').set('X-Test-User', stUser())
      .send(baseTouchstoneBody({ touchstone_meta: { humanity: 11 } }));
    expect(high.status).toBe(400);
  });
});

describe("PUT /api/relationships kind change clears touchstone_meta", () => {
  it("$unsets touchstone_meta when kind changes away from 'touchstone'", async () => {
    const created = await seedRelationship({
      kind: 'touchstone',
      touchstone_meta: { humanity: 3 },
    });

    const res = await request(app)
      .put(`/api/relationships/${created._id}`)
      .set('X-Test-User', stUser())
      .send({
        a: created.a, b: created.b,
        kind: 'mentor', direction: 'a_to_b',
        state: '', st_hidden: false, status: 'active',
      });

    expect(res.status).toBe(200);
    expect(res.body.kind).toBe('mentor');
    expect(res.body.touchstone_meta).toBeUndefined();
  });
});

// ── Characters route: touchstones[] validation ──────────────────────────────

describe('PUT /api/characters/:id touchstones[] validation', () => {
  it('accepts an empty touchstones[]', async () => {
    const char = await seedChar();
    const res = await request(app)
      .put(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser())
      .send({ touchstones: [] });

    expect(res.status).toBe(200);
    expect(res.body.touchstones).toEqual([]);
  });

  it('accepts up to 6 touchstones (cap)', async () => {
    const char = await seedChar({ clan: 'Ventrue' }); // anchor 7 → ratings 7..2
    const six = [
      { humanity: 7, name: 'T1' },
      { humanity: 6, name: 'T2' },
      { humanity: 5, name: 'T3' },
      { humanity: 4, name: 'T4' },
      { humanity: 3, name: 'T5' },
      { humanity: 2, name: 'T6' },
    ];
    const res = await request(app)
      .put(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser())
      .send({ touchstones: six });
    expect(res.status).toBe(200);
    expect(res.body.touchstones).toHaveLength(6);
  });

  it('rejects more than 6 touchstones', async () => {
    const char = await seedChar({ clan: 'Ventrue' });
    const seven = Array.from({ length: 7 }, (_, i) => ({ humanity: 7 - i, name: `T${i + 1}` }));
    const res = await request(app)
      .put(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser())
      .send({ touchstones: seven });
    // Fails at the Ajv layer (maxItems) before the custom validator.
    expect(res.status).toBe(400);
  });

  it('rejects humanity above the clan anchor (non-Ventrue anchor=6)', async () => {
    const char = await seedChar({ clan: 'Daeva' });
    const res = await request(app)
      .put(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser())
      .send({ touchstones: [{ humanity: 7, name: 'Too high' }] });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/out of range/i);
  });

  it('accepts humanity 7 when clan is Ventrue (anchor=7)', async () => {
    const char = await seedChar({ clan: 'Ventrue' });
    const res = await request(app)
      .put(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser())
      .send({ touchstones: [{ humanity: 7, name: 'Ventrue anchor' }] });
    expect(res.status).toBe(200);
  });

  it('rejects humanity below the 6-slot range (anchor-5)', async () => {
    const char = await seedChar({ clan: 'Daeva' }); // anchor 6, min 1
    // anchor=6, anchor-5=1, so humanity=0 is out of range
    const res = await request(app)
      .put(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser())
      .send({ touchstones: [{ humanity: 0, name: 'Too low' }] });
    expect(res.status).toBe(400);
  });

  it('accepts a touchstones[] entry with a valid edge_id', async () => {
    const char = await seedChar({ clan: 'Daeva' });
    const charIdStr = String(char._id);
    const edge = await seedRelationship({
      a: { type: 'pc', id: charIdStr },
      b: { type: 'npc', id: NPC_ID },
      touchstone_meta: { humanity: 6 },
    });

    const res = await request(app)
      .put(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser())
      .send({
        touchstones: [{ humanity: 6, name: 'Edge-linked', edge_id: String(edge._id) }],
      });

    expect(res.status).toBe(200);
    expect(res.body.touchstones[0].edge_id).toBe(String(edge._id));
  });

  it('rejects a touchstones[] entry with a non-existent edge_id', async () => {
    const char = await seedChar({ clan: 'Daeva' });
    const res = await request(app)
      .put(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser())
      .send({
        touchstones: [{ humanity: 6, name: 'Bad link', edge_id: new ObjectId().toHexString() }],
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not found/i);
  });

  it('rejects a touchstones[] entry pointing to a retired edge', async () => {
    const char = await seedChar({ clan: 'Daeva' });
    const charIdStr = String(char._id);
    const retired = await seedRelationship({
      a: { type: 'pc', id: charIdStr },
      b: { type: 'npc', id: NPC_ID },
      status: 'retired',
    });
    const res = await request(app)
      .put(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser())
      .send({
        touchstones: [{ humanity: 6, name: 'Retired link', edge_id: String(retired._id) }],
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/retired/i);
  });

  it('rejects an edge not involving the character', async () => {
    const char = await seedChar({ clan: 'Daeva' });
    const foreign = await seedRelationship({
      a: { type: 'pc', id: OTHER_PC_ID },
      b: { type: 'npc', id: NPC_ID },
    });
    const res = await request(app)
      .put(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser())
      .send({
        touchstones: [{ humanity: 6, name: 'Foreign link', edge_id: String(foreign._id) }],
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/endpoint/i);
  });
});

// ── GET enrichment: _npc_name per touchstone item ───────────────────────────

describe('GET /api/characters/:id touchstone enrichment', () => {
  it('attaches _npc_name on touchstone items that link to an NPC edge (ST)', async () => {
    const char = await seedChar({ clan: 'Daeva' });
    const charIdStr = String(char._id);
    const npc = await seedNpc('Resolved-Test Sister');

    const edge = await seedRelationship({
      a: { type: 'pc', id: charIdStr },
      b: { type: 'npc', id: String(npc._id) },
      kind: 'touchstone',
      touchstone_meta: { humanity: 6 },
    });

    await getCollection('characters').updateOne(
      { _id: char._id },
      { $set: { touchstones: [{ humanity: 6, name: 'ignored', edge_id: String(edge._id) }] } }
    );

    const res = await request(app)
      .get(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser());

    expect(res.status).toBe(200);
    expect(res.body.touchstones).toHaveLength(1);
    expect(res.body.touchstones[0]._npc_name).toBe('Resolved-Test Sister');
  });

  it('does not attach _npc_name for object touchstones (no edge_id)', async () => {
    const char = await seedChar({
      clan: 'Daeva',
      touchstones: [{ humanity: 6, name: "Grandfather's watch", desc: 'Object touchstone' }],
    });

    const res = await request(app)
      .get(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser());

    expect(res.status).toBe(200);
    expect(res.body.touchstones[0]._npc_name).toBeUndefined();
    expect(res.body.touchstones[0].name).toBe("Grandfather's watch");
  });

  it('excludes _npc_name for st_hidden edges on the player path', async () => {
    const char = await seedChar({ clan: 'Daeva' });
    const charIdStr = String(char._id);
    const npc = await seedNpc('Hidden NPC');

    const edge = await seedRelationship({
      a: { type: 'pc', id: charIdStr },
      b: { type: 'npc', id: String(npc._id) },
      kind: 'touchstone',
      touchstone_meta: { humanity: 6 },
      st_hidden: true,
    });

    await getCollection('characters').updateOne(
      { _id: char._id },
      { $set: { touchstones: [{ humanity: 6, name: 'inline-fallback', edge_id: String(edge._id) }] } }
    );

    const playerRes = await request(app)
      .get(`/api/characters/${char._id}`)
      .set('X-Test-User', playerUser([String(char._id)]));

    expect(playerRes.status).toBe(200);
    expect(playerRes.body.touchstones[0]._npc_name).toBeUndefined();

    const stRes = await request(app)
      .get(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser());
    expect(stRes.body.touchstones[0]._npc_name).toBe('Hidden NPC');
  });

  it('excludes retired edges from enrichment', async () => {
    const char = await seedChar({ clan: 'Daeva' });
    const charIdStr = String(char._id);
    const npc = await seedNpc('Retired NPC');

    const edge = await seedRelationship({
      a: { type: 'pc', id: charIdStr },
      b: { type: 'npc', id: String(npc._id) },
      kind: 'touchstone',
      touchstone_meta: { humanity: 6 },
      status: 'retired',
    });

    await getCollection('characters').updateOne(
      { _id: char._id },
      { $set: { touchstones: [{ humanity: 6, name: 'inline-only', edge_id: String(edge._id) }] } }
    );

    const res = await request(app)
      .get(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser());

    expect(res.body.touchstones[0]._npc_name).toBeUndefined();
  });
});
