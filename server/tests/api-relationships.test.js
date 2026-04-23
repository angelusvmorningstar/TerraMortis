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
