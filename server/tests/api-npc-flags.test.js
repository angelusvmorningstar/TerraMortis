/**
 * API tests — /api/npc-flags (NPCR.3)
 *
 * Covers:
 * - Auth: 401 unauth; ST-only GET + resolve; player-only POST
 * - POST: relationship-gate, ownership, reason-required, uniqueness
 * - PUT /:id/resolve: resolved_by/resolved_at/resolution_note; 409 on already-resolved
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { ObjectId } from 'mongodb';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;
const CREATED_FLAG_IDS = [];
const CREATED_EDGE_IDS = [];
const PC_ID    = new ObjectId().toHexString();
const PC_OTHER = new ObjectId().toHexString();
const NPC_LINKED   = new ObjectId().toHexString();
const NPC_UNLINKED = new ObjectId().toHexString();

async function seedActiveEdge(pcId, npcId) {
  const rel = {
    a: { type: 'pc',  id: pcId },
    b: { type: 'npc', id: npcId },
    kind: 'contact',
    direction: 'a_to_b',
    state: '',
    st_hidden: false,
    status: 'active',
    created_by: { type: 'st', id: 'seed' },
    history: [{ at: new Date().toISOString(), by: { type: 'st', id: 'seed' }, change: 'created' }],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const res = await getCollection('relationships').insertOne(rel);
  CREATED_EDGE_IDS.push(res.insertedId);
  return res.insertedId;
}

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
  await seedActiveEdge(PC_ID, NPC_LINKED);
});

afterAll(async () => {
  if (CREATED_FLAG_IDS.length > 0) {
    await getCollection('npc_flags').deleteMany({
      _id: { $in: CREATED_FLAG_IDS.map(id => new ObjectId(id)) },
    });
  }
  if (CREATED_EDGE_IDS.length > 0) {
    await getCollection('relationships').deleteMany({
      _id: { $in: CREATED_EDGE_IDS },
    });
  }
  await teardownDb();
});

// ── Auth ─────────────────────────────────────────────────────────────────────

describe('Auth', () => {
  it('401 without auth on GET', async () => {
    const res = await request(app).get('/api/npc-flags');
    expect(res.status).toBe(401);
  });

  it('403 as player on GET', async () => {
    const res = await request(app)
      .get('/api/npc-flags')
      .set('X-Test-User', playerUser([PC_ID]));
    expect(res.status).toBe(403);
  });

  it('403 as ST on POST (STs cannot flag)', async () => {
    const res = await request(app)
      .post('/api/npc-flags')
      .set('X-Test-User', stUser())
      .send({ npc_id: NPC_LINKED, character_id: PC_ID, reason: 'ST trying to flag' });
    expect(res.status).toBe(403);
  });

  it('403 as coordinator on POST (not a player)', async () => {
    const res = await request(app)
      .post('/api/npc-flags')
      .set('X-Test-User', JSON.stringify({
        id: 'c1', role: 'coordinator', player_id: 'p1', character_ids: [],
      }))
      .send({ npc_id: NPC_LINKED, character_id: PC_ID, reason: 'coord flag' });
    expect(res.status).toBe(403);
  });

  it('403 as player on PUT /:id/resolve', async () => {
    const res = await request(app)
      .put(`/api/npc-flags/${new ObjectId().toHexString()}/resolve`)
      .set('X-Test-User', playerUser([PC_ID]))
      .send({});
    expect(res.status).toBe(403);
  });
});

// ── POST ─────────────────────────────────────────────────────────────────────

describe('POST /api/npc-flags', () => {
  it('creates an open flag when player has an active edge to the NPC', async () => {
    const res = await request(app)
      .post('/api/npc-flags')
      .set('X-Test-User', playerUser([PC_ID]))
      .send({ npc_id: NPC_LINKED, character_id: PC_ID, reason: 'something feels off' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('open');
    expect(res.body.npc_id).toBe(NPC_LINKED);
    expect(res.body.flagged_by).toEqual({
      player_id: 'test-player-001',
      character_id: PC_ID,
    });
    expect(res.body.reason).toBe('something feels off');
    expect(typeof res.body.created_at).toBe('string');
    CREATED_FLAG_IDS.push(res.body._id);
  });

  it('400 when reason is missing', async () => {
    const res = await request(app)
      .post('/api/npc-flags')
      .set('X-Test-User', playerUser([PC_ID]))
      .send({ npc_id: NPC_LINKED, character_id: PC_ID });
    expect(res.status).toBe(400);
  });

  it('400 when reason is whitespace-only', async () => {
    const res = await request(app)
      .post('/api/npc-flags')
      .set('X-Test-User', playerUser([PC_ID]))
      .send({ npc_id: NPC_LINKED, character_id: PC_ID, reason: '   ' });
    expect(res.status).toBe(400);
  });

  it('400 when npc_id is missing', async () => {
    const res = await request(app)
      .post('/api/npc-flags')
      .set('X-Test-User', playerUser([PC_ID]))
      .send({ character_id: PC_ID, reason: 'no npc_id' });
    expect(res.status).toBe(400);
  });

  it('403 when player does not own the character_id', async () => {
    const res = await request(app)
      .post('/api/npc-flags')
      .set('X-Test-User', playerUser([PC_OTHER]))
      .send({ npc_id: NPC_LINKED, character_id: PC_ID, reason: 'foreign pc' });
    expect(res.status).toBe(403);
  });

  it('403 when player has no active relationship edge to the NPC', async () => {
    const res = await request(app)
      .post('/api/npc-flags')
      .set('X-Test-User', playerUser([PC_ID]))
      .send({ npc_id: NPC_UNLINKED, character_id: PC_ID, reason: 'not linked' });
    expect(res.status).toBe(403);
  });

  it('409 when the same (character, npc) already has an open flag', async () => {
    const res = await request(app)
      .post('/api/npc-flags')
      .set('X-Test-User', playerUser([PC_ID]))
      .send({ npc_id: NPC_LINKED, character_id: PC_ID, reason: 'duplicate open flag' });
    expect(res.status).toBe(409);
  });

  it('accepts a new flag from a different character even if same player', async () => {
    // seed an edge for PC_OTHER → NPC_LINKED
    await seedActiveEdge(PC_OTHER, NPC_LINKED);
    const res = await request(app)
      .post('/api/npc-flags')
      .set('X-Test-User', playerUser([PC_OTHER]))
      .send({ npc_id: NPC_LINKED, character_id: PC_OTHER, reason: 'second pc' });
    expect(res.status).toBe(201);
    CREATED_FLAG_IDS.push(res.body._id);
  });
});

// ── GET ──────────────────────────────────────────────────────────────────────

describe('GET /api/npc-flags', () => {
  it('ST sees all open flags by default filter', async () => {
    const res = await request(app)
      .get('/api/npc-flags?status=open')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    for (const flag of res.body) expect(flag.status).toBe('open');
  });

  it('ST can filter by npc_id', async () => {
    const res = await request(app)
      .get(`/api/npc-flags?npc_id=${NPC_LINKED}`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    for (const flag of res.body) expect(flag.npc_id).toBe(NPC_LINKED);
  });

  it('400 on unknown status', async () => {
    const res = await request(app)
      .get('/api/npc-flags?status=bogus')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(400);
  });

  it('400 on malformed npc_id', async () => {
    const res = await request(app)
      .get('/api/npc-flags?npc_id=not-an-oid')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(400);
  });
});

// ── PUT /:id/resolve ─────────────────────────────────────────────────────────

describe('PUT /api/npc-flags/:id/resolve', () => {
  it('resolves the flag with note + resolved_by + resolved_at', async () => {
    const flagId = CREATED_FLAG_IDS[0];
    const res = await request(app)
      .put(`/api/npc-flags/${flagId}/resolve`)
      .set('X-Test-User', stUser())
      .send({ resolution_note: 'spoke with player, adjusted NPC' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('resolved');
    expect(res.body.resolved_by).toEqual({ type: 'st', id: 'test-st-001' });
    expect(typeof res.body.resolved_at).toBe('string');
    expect(res.body.resolution_note).toBe('spoke with player, adjusted NPC');
  });

  it('resolves without a note (note is optional)', async () => {
    const flagId = CREATED_FLAG_IDS[1];
    const res = await request(app)
      .put(`/api/npc-flags/${flagId}/resolve`)
      .set('X-Test-User', stUser())
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('resolved');
    expect(res.body.resolution_note).toBeUndefined();
  });

  it('409 when already resolved', async () => {
    const flagId = CREATED_FLAG_IDS[0];
    const res = await request(app)
      .put(`/api/npc-flags/${flagId}/resolve`)
      .set('X-Test-User', stUser())
      .send({});
    expect(res.status).toBe(409);
  });

  it('404 on unknown id', async () => {
    const res = await request(app)
      .put(`/api/npc-flags/${new ObjectId().toHexString()}/resolve`)
      .set('X-Test-User', stUser())
      .send({});
    expect(res.status).toBe(404);
  });

  it('400 on invalid id', async () => {
    const res = await request(app)
      .put('/api/npc-flags/not-an-oid/resolve')
      .set('X-Test-User', stUser())
      .send({});
    expect(res.status).toBe(400);
  });
});
