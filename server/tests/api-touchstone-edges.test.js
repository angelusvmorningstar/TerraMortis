/**
 * API tests — touchstone edges (NPCR.4)
 *
 * Covers the Shape B bridge:
 * - relationships POST/PUT enforce touchstone_meta.humanity and pc+npc endpoints
 *   when kind='touchstone'
 * - characters POST/PUT validate touchstone_edge_ids[] against the relationships
 *   collection (exists, kind='touchstone', not retired, has this char on one endpoint)
 * - wizard + ST POST force touchstone_edge_ids to [] at creation time
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

// Stable ids used across tests — we don't need real records for the
// relationship schema, only for character-save validation.
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
    touchstone_meta: { humanity: 7 },
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
    touchstone_edge_ids: [],
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
  await teardownDb();
});

// ── Relationships route: touchstone_meta + endpoint shape ───────────────────

describe("POST /api/relationships kind='touchstone'", () => {
  it('creates a touchstone edge with touchstone_meta.humanity persisted', async () => {
    const res = await request(app)
      .post('/api/relationships')
      .set('X-Test-User', stUser())
      .send(baseTouchstoneBody());

    expect(res.status).toBe(201);
    expect(res.body.kind).toBe('touchstone');
    expect(res.body.touchstone_meta).toEqual({ humanity: 7 });
    expect(res.body.status).toBe('active');
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
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(res.body.message).toMatch(/touchstone_meta\.humanity/);
  });

  it('rejects humanity=0 (schema minimum)', async () => {
    const res = await request(app)
      .post('/api/relationships')
      .set('X-Test-User', stUser())
      .send(baseTouchstoneBody({ touchstone_meta: { humanity: 0 } }));

    expect(res.status).toBe(400);
  });

  it('rejects humanity=11 (schema maximum)', async () => {
    const res = await request(app)
      .post('/api/relationships')
      .set('X-Test-User', stUser())
      .send(baseTouchstoneBody({ touchstone_meta: { humanity: 11 } }));

    expect(res.status).toBe(400);
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

  it('rejects npc+npc endpoints on a touchstone edge', async () => {
    const res = await request(app)
      .post('/api/relationships')
      .set('X-Test-User', stUser())
      .send(baseTouchstoneBody({
        a: { type: 'npc', id: NPC_ID },
        b: { type: 'npc', id: NPC_ID_2 },
      }));

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/one pc and one npc/);
  });
});

describe("POST /api/relationships with non-touchstone kind", () => {
  it("does not persist touchstone_meta when kind !== 'touchstone'", async () => {
    const res = await request(app)
      .post('/api/relationships')
      .set('X-Test-User', stUser())
      .send({
        a: { type: 'pc',  id: OTHER_PC_ID },
        b: { type: 'npc', id: NPC_ID },
        kind: 'mentor',
        direction: 'a_to_b',
        state: '',
        st_hidden: false,
        // Client sends touchstone_meta by mistake; server must strip it.
        touchstone_meta: { humanity: 5 },
      });

    expect(res.status).toBe(201);
    expect(res.body.touchstone_meta).toBeUndefined();
    CREATED_REL_IDS.push(new ObjectId(res.body._id));
  });
});

describe("PUT /api/relationships kind change", () => {
  it("clears touchstone_meta when kind changes away from 'touchstone'", async () => {
    const created = await seedRelationship({
      kind: 'touchstone',
      touchstone_meta: { humanity: 3 },
    });

    const res = await request(app)
      .put(`/api/relationships/${created._id}`)
      .set('X-Test-User', stUser())
      .send({
        a: created.a,
        b: created.b,
        kind: 'mentor',
        direction: 'a_to_b',
        state: '',
        st_hidden: false,
        status: 'active',
      });

    expect(res.status).toBe(200);
    expect(res.body.kind).toBe('mentor');
    expect(res.body.touchstone_meta).toBeUndefined();
  });
});

// ── Characters route: touchstone_edge_ids validation ────────────────────────

describe('PUT /api/characters/:id touchstone_edge_ids validation', () => {
  it('accepts empty touchstone_edge_ids []', async () => {
    const char = await seedChar();
    const res = await request(app)
      .put(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser())
      .send({ touchstone_edge_ids: [] });

    expect(res.status).toBe(200);
    expect(res.body.touchstone_edge_ids).toEqual([]);
  });

  it('rejects touchstone_edge_ids containing a non-ObjectId string', async () => {
    const char = await seedChar();
    const res = await request(app)
      .put(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser())
      .send({ touchstone_edge_ids: ['not-a-valid-id'] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(res.body.message).toMatch(/invalid id/i);
  });

  it('rejects a non-existent edge id', async () => {
    const char = await seedChar();
    const missing = new ObjectId().toHexString();
    const res = await request(app)
      .put(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser())
      .send({ touchstone_edge_ids: [missing] });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not found/i);
  });

  it("rejects an edge whose kind !== 'touchstone'", async () => {
    const char = await seedChar();
    const charIdStr = String(char._id);
    const wrongKind = await seedRelationship({
      a: { type: 'pc', id: charIdStr },
      b: { type: 'npc', id: NPC_ID },
      kind: 'mentor',
      touchstone_meta: undefined,
    });
    // Remove undefined key so the seed doc is clean.
    delete wrongKind.touchstone_meta;
    await getCollection('relationships').updateOne(
      { _id: wrongKind._id },
      { $unset: { touchstone_meta: '' } }
    );

    const res = await request(app)
      .put(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser())
      .send({ touchstone_edge_ids: [String(wrongKind._id)] });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/kind/i);
  });

  it('rejects a retired touchstone edge', async () => {
    const char = await seedChar();
    const charIdStr = String(char._id);
    const retired = await seedRelationship({
      a: { type: 'pc', id: charIdStr },
      b: { type: 'npc', id: NPC_ID },
      status: 'retired',
    });

    const res = await request(app)
      .put(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser())
      .send({ touchstone_edge_ids: [String(retired._id)] });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/retired/i);
  });

  it('rejects an edge that does not involve this character', async () => {
    const char = await seedChar();
    const foreign = await seedRelationship({
      a: { type: 'pc', id: OTHER_PC_ID },
      b: { type: 'npc', id: NPC_ID },
    });

    const res = await request(app)
      .put(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser())
      .send({ touchstone_edge_ids: [String(foreign._id)] });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/endpoint/i);
  });

  it('accepts a valid touchstone edge (char on side a)', async () => {
    const char = await seedChar();
    const charIdStr = String(char._id);
    const good = await seedRelationship({
      a: { type: 'pc', id: charIdStr },
      b: { type: 'npc', id: NPC_ID },
    });

    const res = await request(app)
      .put(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser())
      .send({ touchstone_edge_ids: [String(good._id)] });

    expect(res.status).toBe(200);
    expect(res.body.touchstone_edge_ids).toEqual([String(good._id)]);
  });

  it('accepts a valid touchstone edge (char on side b)', async () => {
    const char = await seedChar();
    const charIdStr = String(char._id);
    const good = await seedRelationship({
      a: { type: 'npc', id: NPC_ID },
      b: { type: 'pc', id: charIdStr },
    });

    const res = await request(app)
      .put(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser())
      .send({ touchstone_edge_ids: [String(good._id)] });

    expect(res.status).toBe(200);
    expect(res.body.touchstone_edge_ids).toEqual([String(good._id)]);
  });
});

// ── Character creation: touchstone_edge_ids forced to [] ────────────────────

describe('POST /api/characters touchstone_edge_ids default', () => {
  it('ST POST forces touchstone_edge_ids to [] even when client supplies ids', async () => {
    const seededEdge = await seedRelationship({
      a: { type: 'pc', id: OTHER_PC_ID },
      b: { type: 'npc', id: NPC_ID },
    });

    const res = await request(app)
      .post('/api/characters')
      .set('X-Test-User', stUser())
      .send({
        name: 'Quinn Fresh ST Char',
        attributes: {
          Intelligence: { dots: 1, bonus: 0 }, Wits: { dots: 1, bonus: 0 }, Resolve: { dots: 1, bonus: 0 },
          Strength: { dots: 1, bonus: 0 },     Dexterity: { dots: 1, bonus: 0 }, Stamina: { dots: 1, bonus: 0 },
          Presence: { dots: 1, bonus: 0 },     Manipulation: { dots: 1, bonus: 0 }, Composure: { dots: 1, bonus: 0 },
        },
        touchstone_edge_ids: [String(seededEdge._id)],
      });

    expect(res.status).toBe(201);
    expect(res.body.touchstone_edge_ids).toEqual([]);
    CREATED_CHAR_IDS.push(new ObjectId(res.body._id));
  });
});
