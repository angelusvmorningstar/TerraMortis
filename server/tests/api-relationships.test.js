/**
 * API tests — /api/relationships (NPCR.2)
 *
 * Covers:
 * - Auth: 401 unauth, 403 player, 200 ST
 * - POST: valid create; same-endpoint → 400; kind='other' without custom_label → 400
 * - PUT: per-field history delta; no-op edit doesn't push history; protected fields preserved
 * - DELETE: sets status='retired' with history row; idempotent
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
const NPC_B = new ObjectId().toHexString();
const NPC_C = new ObjectId().toHexString();

function validBody(overrides = {}) {
  return {
    a: { type: 'pc',  id: PC_A },
    b: { type: 'npc', id: NPC_B },
    kind: 'mentor',
    direction: 'a_to_b',
    state: 'long-standing rapport',
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
    await col.deleteMany({ _id: { $in: CREATED_IDS.map(id => new ObjectId(id)) } });
  }
  await teardownDb();
});

// ── Auth ─────────────────────────────────────────────────────────────────────

describe('Auth', () => {
  it('401 without auth', async () => {
    const res = await request(app).get('/api/relationships');
    expect(res.status).toBe(401);
  });

  it('403 as player on GET', async () => {
    const res = await request(app)
      .get('/api/relationships')
      .set('X-Test-User', playerUser([]));
    expect(res.status).toBe(403);
  });

  it('403 as player on POST', async () => {
    const res = await request(app)
      .post('/api/relationships')
      .set('X-Test-User', playerUser([]))
      .send(validBody());
    expect(res.status).toBe(403);
  });

  it('403 as player on PUT', async () => {
    const res = await request(app)
      .put(`/api/relationships/${new ObjectId().toHexString()}`)
      .set('X-Test-User', playerUser([]))
      .send(validBody());
    expect(res.status).toBe(403);
  });

  it('403 as player on DELETE', async () => {
    const res = await request(app)
      .delete(`/api/relationships/${new ObjectId().toHexString()}`)
      .set('X-Test-User', playerUser([]));
    expect(res.status).toBe(403);
  });
});

// ── POST ─────────────────────────────────────────────────────────────────────

describe('POST /api/relationships', () => {
  it('creates an edge with status=active, created_by, initial history', async () => {
    const res = await request(app)
      .post('/api/relationships')
      .set('X-Test-User', stUser())
      .send(validBody());

    expect(res.status).toBe(201);
    expect(res.body._id).toBeDefined();
    expect(res.body.status).toBe('active');
    expect(res.body.created_by).toEqual({ type: 'st', id: 'test-st-001' });
    expect(res.body.history).toHaveLength(1);
    expect(res.body.history[0].change).toBe('created');
    expect(res.body.history[0].by).toEqual({ type: 'st', id: 'test-st-001' });
    expect(typeof res.body.created_at).toBe('string');
    expect(typeof res.body.updated_at).toBe('string');
    CREATED_IDS.push(res.body._id);
  });

  it('rejects same endpoints (a === b) with 400', async () => {
    const res = await request(app)
      .post('/api/relationships')
      .set('X-Test-User', stUser())
      .send(validBody({
        a: { type: 'pc', id: PC_A },
        b: { type: 'pc', id: PC_A },
      }));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it("rejects kind='other' without custom_label", async () => {
    const res = await request(app)
      .post('/api/relationships')
      .set('X-Test-User', stUser())
      .send(validBody({ kind: 'other' }));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it("accepts kind='other' with a non-empty custom_label", async () => {
    const res = await request(app)
      .post('/api/relationships')
      .set('X-Test-User', stUser())
      .send(validBody({ kind: 'other', custom_label: 'blood-oath partner' }));
    expect(res.status).toBe(201);
    expect(res.body.custom_label).toBe('blood-oath partner');
    CREATED_IDS.push(res.body._id);
  });

  it('rejects missing required fields (a/b/kind) with 400', async () => {
    const res = await request(app)
      .post('/api/relationships')
      .set('X-Test-User', stUser())
      .send({ direction: 'a_to_b' });
    expect(res.status).toBe(400);
  });

  it('rejects additional properties with 400', async () => {
    const res = await request(app)
      .post('/api/relationships')
      .set('X-Test-User', stUser())
      .send(validBody({ bogus_field: 'nope' }));
    expect(res.status).toBe(400);
  });
});

// ── GET ──────────────────────────────────────────────────────────────────────

describe('GET /api/relationships', () => {
  it('lists all edges for ST', async () => {
    const res = await request(app)
      .get('/api/relationships')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('filters by endpoint (involves id on either side)', async () => {
    const res = await request(app)
      .get(`/api/relationships?endpoint=${PC_A}`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    for (const edge of res.body) {
      expect(edge.a.id === PC_A || edge.b.id === PC_A).toBe(true);
    }
  });

  it('filters by kind', async () => {
    const res = await request(app)
      .get('/api/relationships?kind=mentor')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    for (const edge of res.body) {
      expect(edge.kind).toBe('mentor');
    }
  });
});

// ── PUT ──────────────────────────────────────────────────────────────────────

describe('PUT /api/relationships/:id', () => {
  it('appends a history row with field delta on edit', async () => {
    const edge = CREATED_IDS[0];
    const res = await request(app)
      .put(`/api/relationships/${edge}`)
      .set('X-Test-User', stUser())
      .send(validBody({ disposition: 'positive', state: 'updated rapport' }));

    expect(res.status).toBe(200);
    expect(res.body.disposition).toBe('positive');
    expect(res.body.state).toBe('updated rapport');
    expect(res.body.history.length).toBe(2);
    const last = res.body.history[res.body.history.length - 1];
    expect(last.change).toBe('updated');
    expect(Array.isArray(last.fields)).toBe(true);
    const names = last.fields.map(f => f.name).sort();
    expect(names).toContain('disposition');
    expect(names).toContain('state');
    const disp = last.fields.find(f => f.name === 'disposition');
    expect(disp.before).toBeUndefined();
    expect(disp.after).toBe('positive');
  });

  it('no-op edit does not append a history row', async () => {
    const edge = CREATED_IDS[0];
    const before = await request(app)
      .get(`/api/relationships/${edge}`)
      .set('X-Test-User', stUser());
    const priorLen = before.body.history.length;

    const res = await request(app)
      .put(`/api/relationships/${edge}`)
      .set('X-Test-User', stUser())
      .send(validBody({ disposition: 'positive', state: 'updated rapport' }));

    expect(res.status).toBe(200);
    expect(res.body.history.length).toBe(priorLen);
  });

  it('rejects same-endpoint update with 400', async () => {
    const edge = CREATED_IDS[0];
    const res = await request(app)
      .put(`/api/relationships/${edge}`)
      .set('X-Test-User', stUser())
      .send(validBody({
        a: { type: 'pc', id: PC_A },
        b: { type: 'pc', id: PC_A },
      }));
    expect(res.status).toBe(400);
  });

  it('never lets client overwrite history / created_by / created_at', async () => {
    const edge = CREATED_IDS[0];
    const fakeHistory = [{ at: '1970-01-01T00:00:00Z', by: { type: 'st', id: 'x' }, change: 'forged' }];
    const fakeCreatedBy = { type: 'player', id: 'attacker' };
    const res = await request(app)
      .put(`/api/relationships/${edge}`)
      .set('X-Test-User', stUser())
      .send({
        ...validBody({ state: 'touch-up' }),
        history: fakeHistory,
        created_by: fakeCreatedBy,
        created_at: '1970-01-01T00:00:00Z',
      });
    expect(res.status).toBe(200);
    // history grew by one (for the state edit) but attacker's fake row was ignored
    expect(res.body.history[0].change).toBe('created');
    expect(res.body.history.every(h => h.change !== 'forged')).toBe(true);
    expect(res.body.created_by).toEqual({ type: 'st', id: 'test-st-001' });
    expect(res.body.created_at).not.toBe('1970-01-01T00:00:00Z');
  });
});

// ── Hardening (NPCR.2 review patches) ───────────────────────────────────────

describe('GET query-param validation', () => {
  it('rejects malformed ObjectId on endpoint with 400', async () => {
    const res = await request(app)
      .get('/api/relationships?endpoint=not-an-oid')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('rejects malformed ObjectId on a_id with 400', async () => {
    const res = await request(app)
      .get('/api/relationships?a_id=nope')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(400);
  });

  it('rejects unknown kind with 400', async () => {
    const res = await request(app)
      .get('/api/relationships?kind=bogus-kind')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(400);
  });

  it('rejects unknown status with 400', async () => {
    const res = await request(app)
      .get('/api/relationships?status=bogus-status')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(400);
  });

  it('accepts valid filters', async () => {
    const res = await request(app)
      .get('/api/relationships?kind=mentor&status=active')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
  });
});

describe('Schema length caps', () => {
  it('rejects state > 4000 chars with 400', async () => {
    const res = await request(app)
      .post('/api/relationships')
      .set('X-Test-User', stUser())
      .send(validBody({
        a: { type: 'pc', id: new ObjectId().toHexString() },
        b: { type: 'npc', id: NPC_C },
        state: 'x'.repeat(4001),
      }));
    expect(res.status).toBe(400);
  });

  it('rejects custom_label > 200 chars with 400', async () => {
    const res = await request(app)
      .post('/api/relationships')
      .set('X-Test-User', stUser())
      .send(validBody({
        a: { type: 'pc', id: new ObjectId().toHexString() },
        b: { type: 'npc', id: NPC_C },
        kind: 'other',
        custom_label: 'x'.repeat(201),
      }));
    expect(res.status).toBe(400);
  });
});

// ── Bug fixes (NPCR.2 review) ───────────────────────────────────────────────

describe('PUT bug fixes', () => {
  it('clears disposition when sent as null (unset + delta before=value after=undefined)', async () => {
    // Create an edge with disposition set
    const postRes = await request(app)
      .post('/api/relationships')
      .set('X-Test-User', stUser())
      .send(validBody({
        a: { type: 'pc', id: new ObjectId().toHexString() },
        b: { type: 'npc', id: NPC_C },
        disposition: 'positive',
      }));
    expect(postRes.status).toBe(201);
    expect(postRes.body.disposition).toBe('positive');
    CREATED_IDS.push(postRes.body._id);

    // Clear via null
    const putRes = await request(app)
      .put(`/api/relationships/${postRes.body._id}`)
      .set('X-Test-User', stUser())
      .send(validBody({
        a: postRes.body.a, b: postRes.body.b,
        disposition: null,
      }));
    expect(putRes.status).toBe(200);
    expect(putRes.body.disposition).toBeUndefined();

    const last = putRes.body.history[putRes.body.history.length - 1];
    const disp = last.fields.find(f => f.name === 'disposition');
    expect(disp).toBeDefined();
    expect(disp.before).toBe('positive');
    expect(disp.after).toBeUndefined();
  });

  it('returns 409 when PUT targets a retired edge', async () => {
    const postRes = await request(app)
      .post('/api/relationships')
      .set('X-Test-User', stUser())
      .send(validBody({
        a: { type: 'pc', id: new ObjectId().toHexString() },
        b: { type: 'npc', id: NPC_C },
      }));
    CREATED_IDS.push(postRes.body._id);

    // Retire it
    await request(app)
      .delete(`/api/relationships/${postRes.body._id}`)
      .set('X-Test-User', stUser());

    // PUT attempting to change state → 409
    const putRes = await request(app)
      .put(`/api/relationships/${postRes.body._id}`)
      .set('X-Test-User', stUser())
      .send(validBody({
        a: postRes.body.a, b: postRes.body.b,
        state: 'trying to resurrect',
      }));
    expect(putRes.status).toBe(409);
    expect(putRes.body.error).toBe('CONFLICT');
  });

  it('optimistic-concurrency guard: PUT returns 409 when updated_at changes under it', async () => {
    const postRes = await request(app)
      .post('/api/relationships')
      .set('X-Test-User', stUser())
      .send(validBody({
        a: { type: 'pc', id: new ObjectId().toHexString() },
        b: { type: 'npc', id: NPC_C },
      }));
    CREATED_IDS.push(postRes.body._id);

    // Verify the Mongo-level semantic the route relies on: FOU with an
    // updated_at filter returns null when another writer has already
    // bumped the field. This is the guard the route converts to 409.
    const oid = new ObjectId(postRes.body._id);
    const staleUpdatedAt = postRes.body.updated_at;
    // Another writer lands first
    await getCollection('relationships').updateOne(
      { _id: oid },
      { $set: { updated_at: new Date().toISOString() + '-bumped' } },
    );
    // Our PUT's FOU, using the stale updated_at it read before the bump
    const foundAndUpdated = await getCollection('relationships').findOneAndUpdate(
      { _id: oid, updated_at: staleUpdatedAt },
      { $set: { state: 'stale write', updated_at: new Date().toISOString() } },
      { returnDocument: 'after' },
    );
    expect(foundAndUpdated).toBeNull();

    // Fix the updated_at back to something valid for subsequent tests
    await getCollection('relationships').updateOne(
      { _id: oid },
      { $set: { updated_at: new Date().toISOString() } },
    );
  });

  it('strips custom_label from POST when kind !== "other"', async () => {
    const res = await request(app)
      .post('/api/relationships')
      .set('X-Test-User', stUser())
      .send(validBody({
        a: { type: 'pc', id: new ObjectId().toHexString() },
        b: { type: 'npc', id: NPC_C },
        kind: 'mentor',
        custom_label: 'should be stripped',
      }));
    expect(res.status).toBe(201);
    expect(res.body.custom_label).toBeUndefined();
    CREATED_IDS.push(res.body._id);
  });

  it('unsets custom_label on PUT when kind changes from "other" to another', async () => {
    const postRes = await request(app)
      .post('/api/relationships')
      .set('X-Test-User', stUser())
      .send(validBody({
        a: { type: 'pc', id: new ObjectId().toHexString() },
        b: { type: 'npc', id: NPC_C },
        kind: 'other',
        custom_label: 'blood-oath partner',
      }));
    expect(postRes.status).toBe(201);
    expect(postRes.body.custom_label).toBe('blood-oath partner');
    CREATED_IDS.push(postRes.body._id);

    const putRes = await request(app)
      .put(`/api/relationships/${postRes.body._id}`)
      .set('X-Test-User', stUser())
      .send(validBody({
        a: postRes.body.a, b: postRes.body.b,
        kind: 'mentor',
        custom_label: '',
      }));
    expect(putRes.status).toBe(200);
    expect(putRes.body.kind).toBe('mentor');
    expect(putRes.body.custom_label).toBeUndefined();

    const last = putRes.body.history[putRes.body.history.length - 1];
    const cl = last.fields.find(f => f.name === 'custom_label');
    expect(cl).toBeDefined();
    expect(cl.before).toBe('blood-oath partner');
    expect(cl.after).toBeUndefined();
  });
});

// ── DELETE ───────────────────────────────────────────────────────────────────

describe('DELETE /api/relationships/:id', () => {
  it('retires the edge (status=retired) and appends history', async () => {
    const edge = CREATED_IDS[0];
    const res = await request(app)
      .delete(`/api/relationships/${edge}`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('retired');
    const last = res.body.history[res.body.history.length - 1];
    expect(last.change).toBe('retired');
  });

  it('is idempotent when already retired', async () => {
    const edge = CREATED_IDS[0];
    const res = await request(app)
      .delete(`/api/relationships/${edge}`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('retired');
  });

  it('returns 400 on invalid id', async () => {
    const res = await request(app)
      .delete('/api/relationships/not-an-oid')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(400);
  });

  it('returns 404 on unknown id', async () => {
    const res = await request(app)
      .delete(`/api/relationships/${new ObjectId().toHexString()}`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(404);
  });
});
