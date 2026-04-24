/**
 * API tests — GET /api/relationships/for-character/:characterId  (NPCR.6)
 *
 * Covers:
 * - Auth: 401 unauth, 403 player without character ownership, 200 owner, 200 ST
 * - Filter: player sees active + pending_confirmation with st_hidden !== true
 * - ST sees every edge including retired and st_hidden
 * - Edge involvement on either side (a or b)
 * - Validation: 400 on non-ObjectId characterId
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { ObjectId } from 'mongodb';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;
const CREATED_IDS = [];
const CHAR_A = new ObjectId().toHexString();
const CHAR_B = new ObjectId().toHexString();
const NPC_1 = new ObjectId().toHexString();
const NPC_2 = new ObjectId().toHexString();

async function seedEdge(overrides = {}) {
  const col = getCollection('relationships');
  const now = new Date().toISOString();
  const doc = {
    a: { type: 'pc',  id: CHAR_A },
    b: { type: 'npc', id: NPC_1 },
    kind: 'mentor',
    direction: 'a_to_b',
    state: '',
    st_hidden: false,
    status: 'active',
    created_by: { type: 'st', id: 'test-st-001' },
    history: [{ at: now, by: { type: 'st', id: 'test-st-001' }, change: 'created' }],
    created_at: now,
    updated_at: now,
    ...overrides,
  };
  const result = await col.insertOne(doc);
  CREATED_IDS.push(result.insertedId);
  return { ...doc, _id: result.insertedId };
}

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
});

afterAll(async () => {
  const col = getCollection('relationships');
  if (CREATED_IDS.length > 0) {
    await col.deleteMany({ _id: { $in: CREATED_IDS } });
  }
  await teardownDb();
});

describe('GET /api/relationships/for-character/:id — auth', () => {
  it('401 without auth', async () => {
    const res = await request(app).get(`/api/relationships/for-character/${CHAR_A}`);
    expect(res.status).toBe(401);
  });

  it('403 player who does not own the character', async () => {
    const res = await request(app)
      .get(`/api/relationships/for-character/${CHAR_A}`)
      .set('X-Test-User', playerUser([CHAR_B])); // owns B, not A
    expect(res.status).toBe(403);
  });

  it('200 player who owns the character', async () => {
    await seedEdge({ a: { type: 'pc', id: CHAR_A }, b: { type: 'npc', id: NPC_1 } });
    const res = await request(app)
      .get(`/api/relationships/for-character/${CHAR_A}`)
      .set('X-Test-User', playerUser([CHAR_A]));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('200 ST (no ownership check)', async () => {
    const res = await request(app)
      .get(`/api/relationships/for-character/${CHAR_A}`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
  });

  it('400 on invalid characterId', async () => {
    const res = await request(app)
      .get('/api/relationships/for-character/not-an-objectid')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(400);
  });
});

describe('GET /api/relationships/for-character/:id — player filter', () => {
  it('excludes retired edges for players', async () => {
    const retired = await seedEdge({
      a: { type: 'pc', id: CHAR_A },
      b: { type: 'npc', id: NPC_2 },
      kind: 'ally',
      status: 'retired',
    });
    const res = await request(app)
      .get(`/api/relationships/for-character/${CHAR_A}`)
      .set('X-Test-User', playerUser([CHAR_A]));
    expect(res.status).toBe(200);
    expect(res.body.find(e => String(e._id) === String(retired._id))).toBeUndefined();
  });

  it('excludes st_hidden edges for players', async () => {
    const hidden = await seedEdge({
      a: { type: 'pc', id: CHAR_A },
      b: { type: 'npc', id: NPC_2 },
      kind: 'ally',
      st_hidden: true,
    });
    const res = await request(app)
      .get(`/api/relationships/for-character/${CHAR_A}`)
      .set('X-Test-User', playerUser([CHAR_A]));
    expect(res.body.find(e => String(e._id) === String(hidden._id))).toBeUndefined();
  });

  it('includes active edges for players', async () => {
    const active = await seedEdge({
      a: { type: 'pc', id: CHAR_A },
      b: { type: 'npc', id: NPC_2 },
      kind: 'coterie',
      status: 'active',
    });
    const res = await request(app)
      .get(`/api/relationships/for-character/${CHAR_A}`)
      .set('X-Test-User', playerUser([CHAR_A]));
    expect(res.body.find(e => String(e._id) === String(active._id))).toBeDefined();
  });

  it('includes pending_confirmation edges for players', async () => {
    const pending = await seedEdge({
      a: { type: 'pc', id: CHAR_A },
      b: { type: 'pc', id: CHAR_B },
      kind: 'coterie',
      status: 'pending_confirmation',
    });
    const res = await request(app)
      .get(`/api/relationships/for-character/${CHAR_A}`)
      .set('X-Test-User', playerUser([CHAR_A]));
    expect(res.body.find(e => String(e._id) === String(pending._id))).toBeDefined();
  });

  it('finds edges where char is on side b (not just a)', async () => {
    const bSide = await seedEdge({
      a: { type: 'npc', id: NPC_1 },
      b: { type: 'pc', id: CHAR_A },
      kind: 'ally',
    });
    const res = await request(app)
      .get(`/api/relationships/for-character/${CHAR_A}`)
      .set('X-Test-User', playerUser([CHAR_A]));
    expect(res.body.find(e => String(e._id) === String(bSide._id))).toBeDefined();
  });
});

describe('GET /api/relationships/for-character/:id — _other_name enrichment', () => {
  it('attaches _other_name from the NPC on the other side', async () => {
    const npcs = getCollection('npcs');
    const npcDoc = await npcs.insertOne({
      name: 'Sir Reginald the Other',
      status: 'active',
      created_at: new Date().toISOString(),
    });
    const edge = await seedEdge({
      a: { type: 'pc', id: CHAR_A },
      b: { type: 'npc', id: String(npcDoc.insertedId) },
      kind: 'mentor',
    });

    const res = await request(app)
      .get(`/api/relationships/for-character/${CHAR_A}`)
      .set('X-Test-User', playerUser([CHAR_A]));

    const found = res.body.find(e => String(e._id) === String(edge._id));
    expect(found).toBeDefined();
    expect(found._other_name).toBe('Sir Reginald the Other');

    await npcs.deleteOne({ _id: npcDoc.insertedId });
  });

  it('attaches _other_name from the PC on the other side (using honorific + moniker)', async () => {
    const chars = getCollection('characters');
    const charDoc = await chars.insertOne({
      name: 'Peter Testcase',
      moniker: 'Keeper',
      honorific: 'Lord',
      retired: false,
      pending_approval: false,
      attributes: {}, skills: {}, disciplines: {}, merits: [], powers: [], ordeals: {},
    });
    const edge = await seedEdge({
      a: { type: 'pc', id: CHAR_A },
      b: { type: 'pc', id: String(charDoc.insertedId) },
      kind: 'coterie',
    });

    const res = await request(app)
      .get(`/api/relationships/for-character/${CHAR_A}`)
      .set('X-Test-User', playerUser([CHAR_A]));

    const found = res.body.find(e => String(e._id) === String(edge._id));
    expect(found._other_name).toBe('Lord Keeper');

    await chars.deleteOne({ _id: charDoc.insertedId });
  });

  it('returns _other_name: null when the NPC/PC record does not exist', async () => {
    const edge = await seedEdge({
      a: { type: 'pc', id: CHAR_A },
      b: { type: 'npc', id: new ObjectId().toHexString() },
      kind: 'contact',
    });
    const res = await request(app)
      .get(`/api/relationships/for-character/${CHAR_A}`)
      .set('X-Test-User', playerUser([CHAR_A]));
    const found = res.body.find(e => String(e._id) === String(edge._id));
    expect(found._other_name).toBeNull();
  });
});

describe('GET /api/relationships/for-character/:id — ST sees everything', () => {
  it('ST receives retired edges too', async () => {
    const retired = await seedEdge({
      a: { type: 'pc', id: CHAR_A },
      b: { type: 'npc', id: NPC_2 },
      kind: 'enemy',
      status: 'retired',
    });
    const res = await request(app)
      .get(`/api/relationships/for-character/${CHAR_A}`)
      .set('X-Test-User', stUser());
    expect(res.body.find(e => String(e._id) === String(retired._id))).toBeDefined();
  });

  it('ST receives st_hidden edges too', async () => {
    const hidden = await seedEdge({
      a: { type: 'pc', id: CHAR_A },
      b: { type: 'npc', id: NPC_2 },
      kind: 'enemy',
      st_hidden: true,
    });
    const res = await request(app)
      .get(`/api/relationships/for-character/${CHAR_A}`)
      .set('X-Test-User', stUser());
    expect(res.body.find(e => String(e._id) === String(hidden._id))).toBeDefined();
  });
});
