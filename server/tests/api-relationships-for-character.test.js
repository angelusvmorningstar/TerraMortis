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

// ── NPCR.11: _flag_state enrichment ─────────────────────────────────────────

describe('GET /api/relationships/for-character/:id — _flag_state enrichment', () => {
  async function seedNpc(name) {
    const col = getCollection('npcs');
    const now = new Date().toISOString();
    const res = await col.insertOne({
      name, description: '', status: 'active',
      linked_character_ids: [], linked_cycle_id: null, notes: '',
      created_at: now, updated_at: now,
    });
    return { _id: res.insertedId, name };
  }

  async function seedFlag(npcId, charId, overrides = {}) {
    const col = getCollection('npc_flags');
    const now = new Date().toISOString();
    const doc = {
      npc_id: String(npcId),
      flagged_by: { player_id: 'p-player-001', character_id: String(charId) },
      reason: 'default reason',
      status: 'open',
      created_at: now,
      ...overrides,
    };
    const res = await col.insertOne(doc);
    return { ...doc, _id: res.insertedId };
  }

  it('attaches _flag_state with open status when an open flag exists', async () => {
    const npc = await seedNpc('Flag Test NPC Open');
    const edge = await seedEdge({
      a: { type: 'pc', id: CHAR_A },
      b: { type: 'npc', id: String(npc._id) },
      kind: 'mentor',
    });
    const flag = await seedFlag(String(npc._id), CHAR_A, { reason: 'Behaviour feels off' });

    const res = await request(app)
      .get(`/api/relationships/for-character/${CHAR_A}`)
      .set('X-Test-User', playerUser([CHAR_A]));

    const found = res.body.find(e => String(e._id) === String(edge._id));
    expect(found._flag_state).toMatchObject({ status: 'open', reason: 'Behaviour feels off' });

    await getCollection('npc_flags').deleteOne({ _id: flag._id });
    await getCollection('npcs').deleteOne({ _id: npc._id });
  });

  it('attaches _flag_state with resolved status + note when resolved', async () => {
    const npc = await seedNpc('Flag Test NPC Resolved');
    const edge = await seedEdge({
      a: { type: 'pc', id: CHAR_A },
      b: { type: 'npc', id: String(npc._id) },
      kind: 'ally',
    });
    const flag = await seedFlag(String(npc._id), CHAR_A, {
      status: 'resolved',
      reason: 'Looked suspicious',
      resolution_note: 'Updated description; plot thread addressed',
      resolved_at: new Date().toISOString(),
    });

    const res = await request(app)
      .get(`/api/relationships/for-character/${CHAR_A}`)
      .set('X-Test-User', playerUser([CHAR_A]));

    const found = res.body.find(e => String(e._id) === String(edge._id));
    expect(found._flag_state).toMatchObject({
      status: 'resolved',
      resolution_note: 'Updated description; plot thread addressed',
    });
    expect(found._flag_state.resolved_at).toBeTruthy();

    await getCollection('npc_flags').deleteOne({ _id: flag._id });
    await getCollection('npcs').deleteOne({ _id: npc._id });
  });

  it('does not attach _flag_state when no flag exists for this char+npc', async () => {
    const npc = await seedNpc('Flag Test NPC Unflagged');
    const edge = await seedEdge({
      a: { type: 'pc', id: CHAR_A },
      b: { type: 'npc', id: String(npc._id) },
      kind: 'coterie',
    });

    const res = await request(app)
      .get(`/api/relationships/for-character/${CHAR_A}`)
      .set('X-Test-User', playerUser([CHAR_A]));

    const found = res.body.find(e => String(e._id) === String(edge._id));
    expect(found._flag_state).toBeUndefined();

    await getCollection('npcs').deleteOne({ _id: npc._id });
  });

  it('only the most recent flag per (char, npc) surfaces', async () => {
    const npc = await seedNpc('Flag Test NPC Multiple');
    const edge = await seedEdge({
      a: { type: 'pc', id: CHAR_A },
      b: { type: 'npc', id: String(npc._id) },
      kind: 'rival',
    });
    const older = await seedFlag(String(npc._id), CHAR_A, {
      status: 'resolved',
      resolution_note: 'old',
      resolved_at: new Date(Date.now() - 86400000).toISOString(),
      created_at: new Date(Date.now() - 172800000).toISOString(),
    });
    const newer = await seedFlag(String(npc._id), CHAR_A, {
      status: 'open',
      reason: 'new concern',
      created_at: new Date().toISOString(),
    });

    const res = await request(app)
      .get(`/api/relationships/for-character/${CHAR_A}`)
      .set('X-Test-User', playerUser([CHAR_A]));

    const found = res.body.find(e => String(e._id) === String(edge._id));
    expect(found._flag_state.status).toBe('open');
    expect(found._flag_state.reason).toBe('new concern');

    await getCollection('npc_flags').deleteMany({ _id: { $in: [older._id, newer._id] } });
    await getCollection('npcs').deleteOne({ _id: npc._id });
  });

  it('isolates flag state per character', async () => {
    const npc = await seedNpc('Flag Test NPC Isolation');
    const edgeA = await seedEdge({
      a: { type: 'pc', id: CHAR_A },
      b: { type: 'npc', id: String(npc._id) },
      kind: 'mentor',
    });
    const edgeB = await seedEdge({
      a: { type: 'pc', id: CHAR_B },
      b: { type: 'npc', id: String(npc._id) },
      kind: 'mentor',
    });
    // Flag only from CHAR_A
    const flag = await seedFlag(String(npc._id), CHAR_A, { reason: 'From A only' });

    const resA = await request(app)
      .get(`/api/relationships/for-character/${CHAR_A}`)
      .set('X-Test-User', stUser());
    const foundA = resA.body.find(e => String(e._id) === String(edgeA._id));
    expect(foundA._flag_state).toBeDefined();

    const resB = await request(app)
      .get(`/api/relationships/for-character/${CHAR_B}`)
      .set('X-Test-User', stUser());
    const foundB = resB.body.find(e => String(e._id) === String(edgeB._id));
    expect(foundB._flag_state).toBeUndefined();

    await getCollection('npc_flags').deleteOne({ _id: flag._id });
    await getCollection('npcs').deleteOne({ _id: npc._id });
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
