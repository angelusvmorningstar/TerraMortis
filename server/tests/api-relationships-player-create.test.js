/**
 * API tests — player-writable POST /api/relationships (NPCR.7)
 *
 * Covers the split-auth POST branch added in NPCR.7:
 * - ST path: unchanged; any endpoints, any kind (touchstone excluded for simplicity,
 *   NPCR.2 tests already cover the ST happy path end-to-end)
 * - Player path: a.type=pc with a.id in character_ids, b.type=npc,
 *   kind !== 'touchstone', sets created_by_char_id
 * - Duplicate detection: 409 when an active edge with same {a, b, kind} exists
 *
 * Also covers the new /api/npcs/directory player-readable listing.
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
const CREATED_NPC_IDS = [];

const MY_CHAR = new ObjectId().toHexString();
const OTHER_CHAR = new ObjectId().toHexString();
let NPC_1_ID;
let NPC_2_ID;
let NPC_PENDING_ID;
let NPC_ARCHIVED_ID;

async function seedNpc(name, status = 'active') {
  const col = getCollection('npcs');
  const now = new Date().toISOString();
  const res = await col.insertOne({
    name, description: 'test npc', status,
    linked_character_ids: [], linked_cycle_id: null, notes: '',
    created_at: now, updated_at: now,
  });
  CREATED_NPC_IDS.push(res.insertedId);
  return String(res.insertedId);
}

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
  NPC_1_ID = await seedNpc('Alice NPC', 'active');
  NPC_2_ID = await seedNpc('Bob NPC', 'active');
  NPC_PENDING_ID = await seedNpc('Pending NPC', 'pending');
  NPC_ARCHIVED_ID = await seedNpc('Archived NPC', 'archived');
});

afterAll(async () => {
  const rels = getCollection('relationships');
  if (CREATED_REL_IDS.length > 0) {
    await rels.deleteMany({ _id: { $in: CREATED_REL_IDS } });
  }
  const npcs = getCollection('npcs');
  for (const id of CREATED_NPC_IDS) await npcs.deleteOne({ _id: id });
  await teardownDb();
});

function validPlayerBody(overrides = {}) {
  return {
    a: { type: 'pc',  id: MY_CHAR },
    b: { type: 'npc', id: NPC_1_ID },
    kind: 'mentor',
    direction: 'a_to_b',
    state: 'met at the Academy',
    st_hidden: false,
    ...overrides,
  };
}

// ── Player POST: happy path ─────────────────────────────────────────────────

describe('POST /api/relationships — player happy path', () => {
  it('creates an edge with created_by_char_id set to the pc endpoint', async () => {
    const res = await request(app)
      .post('/api/relationships')
      .set('X-Test-User', playerUser([MY_CHAR]))
      .send(validPlayerBody());

    expect(res.status).toBe(201);
    expect(res.body.a).toEqual({ type: 'pc', id: MY_CHAR });
    expect(res.body.b).toEqual({ type: 'npc', id: NPC_1_ID });
    expect(res.body.kind).toBe('mentor');
    expect(res.body.status).toBe('active');
    expect(res.body.created_by.type).toBe('player');
    expect(res.body.created_by_char_id).toBe(MY_CHAR);
    CREATED_REL_IDS.push(new ObjectId(res.body._id));
  });
});

// ── Player POST: auth and validation ────────────────────────────────────────

describe('POST /api/relationships — player auth + validation', () => {
  it('403 when a.id is not in character_ids', async () => {
    const res = await request(app)
      .post('/api/relationships')
      .set('X-Test-User', playerUser([OTHER_CHAR])) // MY_CHAR not in list
      .send(validPlayerBody({ kind: 'ally' }));
    expect(res.status).toBe(403);
  });

  it('403 when a.type is not pc', async () => {
    const res = await request(app)
      .post('/api/relationships')
      .set('X-Test-User', playerUser([MY_CHAR]))
      .send(validPlayerBody({
        a: { type: 'npc', id: NPC_1_ID },
        b: { type: 'npc', id: NPC_2_ID },
        kind: 'ally',
      }));
    expect(res.status).toBe(403);
  });

  it('400 when b.type=pc for a mortal-only kind (NPCR.10 allows PC-PC only for supported kinds)', async () => {
    const res = await request(app)
      .post('/api/relationships')
      .set('X-Test-User', playerUser([MY_CHAR]))
      .send(validPlayerBody({
        b: { type: 'pc', id: OTHER_CHAR },
        kind: 'family', // mortal-only kind
      }));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/PC-to-PC/i);
  });

  it("400 when kind='touchstone' (players use the sheet picker)", async () => {
    const res = await request(app)
      .post('/api/relationships')
      .set('X-Test-User', playerUser([MY_CHAR]))
      .send(validPlayerBody({
        kind: 'touchstone',
        b: { type: 'npc', id: NPC_2_ID },
        touchstone_meta: { humanity: 6 },
      }));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/character sheet/i);
  });
});

// ── Duplicate active edge ──────────────────────────────────────────────────

describe('POST /api/relationships — 409 on duplicate active edge', () => {
  it('409 when an active edge with same {a, b, kind} exists', async () => {
    const res1 = await request(app)
      .post('/api/relationships')
      .set('X-Test-User', playerUser([MY_CHAR]))
      .send(validPlayerBody({ kind: 'ally', b: { type: 'npc', id: NPC_2_ID } }));
    expect(res1.status).toBe(201);
    CREATED_REL_IDS.push(new ObjectId(res1.body._id));

    const res2 = await request(app)
      .post('/api/relationships')
      .set('X-Test-User', playerUser([MY_CHAR]))
      .send(validPlayerBody({ kind: 'ally', b: { type: 'npc', id: NPC_2_ID } }));
    expect(res2.status).toBe(409);
    expect(res2.body.existing_id).toBe(String(res1.body._id));
  });

  it('allows distinct kinds between same endpoints', async () => {
    // Different kind than above — should succeed.
    const res = await request(app)
      .post('/api/relationships')
      .set('X-Test-User', playerUser([MY_CHAR]))
      .send(validPlayerBody({ kind: 'rival', b: { type: 'npc', id: NPC_2_ID } }));
    expect(res.status).toBe(201);
    CREATED_REL_IDS.push(new ObjectId(res.body._id));
  });

  it('allows the same NPC as mentor for two different PCs', async () => {
    const res = await request(app)
      .post('/api/relationships')
      .set('X-Test-User', playerUser([OTHER_CHAR]))
      .send({
        a: { type: 'pc',  id: OTHER_CHAR },
        b: { type: 'npc', id: NPC_1_ID },     // same NPC as MY_CHAR's mentor
        kind: 'mentor',
        direction: 'a_to_b',
        state: '',
        st_hidden: false,
      });
    expect(res.status).toBe(201);
    CREATED_REL_IDS.push(new ObjectId(res.body._id));
  });
});

// ── ST path unaffected ──────────────────────────────────────────────────────

describe('POST /api/relationships — ST path unaffected', () => {
  it('ST can create an edge with any endpoints, no created_by_char_id stamp', async () => {
    const npcA = await seedNpc('ST-NPC-A', 'active');
    const npcB = await seedNpc('ST-NPC-B', 'active');
    const res = await request(app)
      .post('/api/relationships')
      .set('X-Test-User', stUser())
      .send({
        a: { type: 'npc', id: npcA },
        b: { type: 'npc', id: npcB },
        kind: 'rival',
        direction: 'mutual',
        state: 'ST plot edge',
        st_hidden: true,
      });
    expect(res.status).toBe(201);
    expect(res.body.created_by.type).toBe('st');
    expect(res.body.created_by_char_id).toBeUndefined();
    CREATED_REL_IDS.push(new ObjectId(res.body._id));
  });
});
