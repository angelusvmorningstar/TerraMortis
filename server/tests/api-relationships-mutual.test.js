/**
 * API tests — PC-to-PC mutual confirmation flow (NPCR.10)
 *
 * Covers:
 * - POST /api/relationships with b.type='pc' for a supported kind lands in
 *   status='pending_confirmation'
 * - POST /:id/confirm: endpoint b accepts → status='active', history row
 * - POST /:id/decline: endpoint b declines → status='rejected', history row
 * - 403 on confirm/decline from a PC who is not endpoint b
 * - 409 on confirm/decline of an edge not in pending_confirmation
 * - Duplicate proposal rejected (409 across active + pending_confirmation)
 * - Asymmetric kind (sire) preserves a → b direction regardless of initiator
 * - Mortal-only kind (family) rejected for PC-PC
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
const PC_A = new ObjectId().toHexString();
const PC_B = new ObjectId().toHexString();
const PC_C = new ObjectId().toHexString(); // uninvolved third party

function alice(extra = {}) {
  return playerUser([PC_A], { player_id: 'p-alice', id: 'd-alice', ...extra });
}
function bob(extra = {}) {
  return playerUser([PC_B], { player_id: 'p-bob', id: 'd-bob', ...extra });
}
function carol(extra = {}) {
  return playerUser([PC_C], { player_id: 'p-carol', id: 'd-carol', ...extra });
}

function proposalBody(overrides = {}) {
  return {
    a: { type: 'pc', id: PC_A },
    b: { type: 'pc', id: PC_B },
    kind: 'coterie',
    direction: 'mutual',
    state: 'Shared a coterie last season',
    st_hidden: false,
    ...overrides,
  };
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

// ── POST creates pending_confirmation for PC-PC ─────────────────────────────

describe('POST /api/relationships — PC-to-PC creates pending_confirmation', () => {
  it('player posts PC-PC coterie → status=pending_confirmation', async () => {
    const res = await request(app)
      .post('/api/relationships')
      .set('X-Test-User', alice())
      .send(proposalBody());
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending_confirmation');
    expect(res.body.a).toEqual({ type: 'pc', id: PC_A });
    expect(res.body.b).toEqual({ type: 'pc', id: PC_B });
    expect(res.body.history).toHaveLength(1);
    expect(res.body.history[0].change).toBe('proposed');
    CREATED_IDS.push(new ObjectId(res.body._id));
  });

  it('rejects PC-PC for mortal-only kind (family)', async () => {
    const res = await request(app)
      .post('/api/relationships')
      .set('X-Test-User', alice())
      .send(proposalBody({ kind: 'family' }));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/does not support PC-to-PC/);
  });

  it('409 when a pending proposal with same endpoints+kind exists', async () => {
    const r1 = await request(app)
      .post('/api/relationships')
      .set('X-Test-User', alice())
      .send(proposalBody({ kind: 'ally' }));
    expect(r1.status).toBe(201);
    CREATED_IDS.push(new ObjectId(r1.body._id));

    const r2 = await request(app)
      .post('/api/relationships')
      .set('X-Test-User', alice())
      .send(proposalBody({ kind: 'ally' }));
    expect(r2.status).toBe(409);
    expect(r2.body.message).toMatch(/pending|awaiting/i);
  });
});

// ── Confirm flow ────────────────────────────────────────────────────────────

describe('POST /api/relationships/:id/confirm', () => {
  async function seedProposal(overrides = {}) {
    const col = getCollection('relationships');
    const now = new Date().toISOString();
    const doc = {
      a: { type: 'pc', id: PC_A },
      b: { type: 'pc', id: PC_B },
      kind: 'rival',
      direction: 'mutual',
      state: '',
      st_hidden: false,
      status: 'pending_confirmation',
      created_by: { type: 'player', id: 'd-alice' },
      created_by_char_id: PC_A,
      history: [{ at: now, by: { type: 'player', id: 'd-alice' }, change: 'proposed' }],
      created_at: now,
      updated_at: now,
      ...overrides,
    };
    const result = await col.insertOne(doc);
    CREATED_IDS.push(result.insertedId);
    return { ...doc, _id: result.insertedId };
  }

  it('endpoint-b player confirms → status=active, history row appended', async () => {
    const edge = await seedProposal();
    const res = await request(app)
      .post(`/api/relationships/${edge._id}/confirm`)
      .set('X-Test-User', bob());
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');
    expect(res.body.history).toHaveLength(2);
    const last = res.body.history[1];
    expect(last.change).toBe('confirmed');
    expect(last.fields[0]).toMatchObject({
      name: 'status', before: 'pending_confirmation', after: 'active',
    });
  });

  it('403 from a PC who is not endpoint b', async () => {
    const edge = await seedProposal();
    const res = await request(app)
      .post(`/api/relationships/${edge._id}/confirm`)
      .set('X-Test-User', carol());
    expect(res.status).toBe(403);
  });

  it('403 from the initiator (endpoint a)', async () => {
    const edge = await seedProposal();
    const res = await request(app)
      .post(`/api/relationships/${edge._id}/confirm`)
      .set('X-Test-User', alice());
    expect(res.status).toBe(403);
  });

  it('409 when edge is not in pending_confirmation', async () => {
    const edge = await seedProposal({ status: 'active' });
    const res = await request(app)
      .post(`/api/relationships/${edge._id}/confirm`)
      .set('X-Test-User', bob());
    expect(res.status).toBe(409);
  });

  it('ST can confirm even though they are not endpoint b', async () => {
    const edge = await seedProposal();
    const res = await request(app)
      .post(`/api/relationships/${edge._id}/confirm`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');
  });
});

// ── Decline flow ────────────────────────────────────────────────────────────

describe('POST /api/relationships/:id/decline', () => {
  async function seedProposal() {
    const col = getCollection('relationships');
    const now = new Date().toISOString();
    const doc = {
      a: { type: 'pc', id: PC_A },
      b: { type: 'pc', id: PC_B },
      kind: 'enemy',
      direction: 'mutual',
      state: '',
      st_hidden: false,
      status: 'pending_confirmation',
      created_by: { type: 'player', id: 'd-alice' },
      created_by_char_id: PC_A,
      history: [{ at: now, by: { type: 'player', id: 'd-alice' }, change: 'proposed' }],
      created_at: now,
      updated_at: now,
    };
    const result = await col.insertOne(doc);
    CREATED_IDS.push(result.insertedId);
    return { ...doc, _id: result.insertedId };
  }

  it('endpoint-b player declines → status=rejected, history row appended', async () => {
    const edge = await seedProposal();
    const res = await request(app)
      .post(`/api/relationships/${edge._id}/decline`)
      .set('X-Test-User', bob());
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('rejected');
    const last = res.body.history[res.body.history.length - 1];
    expect(last.change).toBe('declined');
  });

  it('403 from a PC who is not endpoint b', async () => {
    const edge = await seedProposal();
    const res = await request(app)
      .post(`/api/relationships/${edge._id}/decline`)
      .set('X-Test-User', carol());
    expect(res.status).toBe(403);
  });
});

// ── Directionality preserved for asymmetric kinds ───────────────────────────

describe('POST /api/relationships — asymmetric kind direction preserved', () => {
  it("sire: a remains the sire, b the childe, regardless of who initiated", async () => {
    // Alice proposes Bob is her sire — so she'd post kind='childe' with a=Alice.
    // Per the kind metadata, 'childe' means "a is the childe of b" — so a=Alice
    // childe, b=Bob sire. Direction is preserved on the record.
    const res = await request(app)
      .post('/api/relationships')
      .set('X-Test-User', alice())
      .send(proposalBody({ kind: 'childe', state: 'Alice is the childe of Bob' }));
    expect(res.status).toBe(201);
    expect(res.body.kind).toBe('childe');
    expect(res.body.a).toEqual({ type: 'pc', id: PC_A });
    expect(res.body.b).toEqual({ type: 'pc', id: PC_B });
    CREATED_IDS.push(new ObjectId(res.body._id));

    // Bob confirms (he's endpoint b, the sire).
    const confirm = await request(app)
      .post(`/api/relationships/${res.body._id}/confirm`)
      .set('X-Test-User', bob());
    expect(confirm.status).toBe(200);
    expect(confirm.body.status).toBe('active');
    // a/b unchanged.
    expect(confirm.body.a).toEqual({ type: 'pc', id: PC_A });
    expect(confirm.body.b).toEqual({ type: 'pc', id: PC_B });
  });
});
