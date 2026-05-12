/**
 * API tests — /api/downtime_submissions and /api/downtime_cycles.
 * Tests role-based filtering, ownership, st_review stripping, CRUD lifecycle.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb, getTestCharacterIds } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;
let testChars;
let createdSubIds = [];

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
  testChars = await getTestCharacterIds(3);
});

afterEach(async () => {
  // Clean up any submissions created during tests
  const col = getCollection('downtime_submissions');
  for (const id of createdSubIds) {
    await col.deleteOne({ _id: id });
  }
  createdSubIds = [];
});

afterAll(async () => {
  await teardownDb();
});

// ── Helper: create a submission directly in DB ──

async function insertSub(charId, overrides = {}) {
  const { ObjectId } = await import('mongodb');
  const col = getCollection('downtime_submissions');
  const doc = {
    character_id: new ObjectId(charId),
    cycle_id: null,
    status: 'draft',
    responses: { travel: 'Test travel response' },
    ...overrides,
  };
  const result = await col.insertOne(doc);
  createdSubIds.push(result.insertedId);
  return { ...doc, _id: result.insertedId };
}

// ══════════════════════════════════════
//  CYCLES
// ══════════════════════════════════════

describe('GET /api/downtime_cycles', () => {
  it('returns cycles for any authenticated user', async () => {
    const res = await request(app)
      .get('/api/downtime_cycles')
      .set('X-Test-User', playerUser([]));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/downtime_cycles');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/downtime_cycles', () => {
  it('allows ST to create a cycle', async () => {
    const res = await request(app)
      .post('/api/downtime_cycles')
      .set('X-Test-User', stUser())
      .send({ game_number: 99, label: 'Test Cycle' });
    expect(res.status).toBe(201);
    expect(res.body.game_number).toBe(99);
    // Clean up
    await getCollection('downtime_cycles').deleteOne({ _id: res.body._id });
  });

  it('blocks player from creating a cycle', async () => {
    const res = await request(app)
      .post('/api/downtime_cycles')
      .set('X-Test-User', playerUser([]))
      .send({ game_number: 99 });
    expect(res.status).toBe(403);
  });
});

// ══════════════════════════════════════
//  SUBMISSIONS — READ
// ══════════════════════════════════════

describe('GET /api/downtime_submissions — ST', () => {
  it('returns all submissions for ST', async () => {
    const res = await request(app)
      .get('/api/downtime_submissions')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('ST can see st_review fields', async () => {
    const sub = await insertSub(testChars[0].id, {
      st_review: { outcome_text: 'ST notes', outcome_visibility: 'draft' },
    });
    const res = await request(app)
      .get('/api/downtime_submissions')
      .set('X-Test-User', stUser());
    const found = res.body.find(s => s._id.toString() === sub._id.toString());
    expect(found).toBeTruthy();
    expect(found.st_review).toBeTruthy();
    expect(found.st_review.outcome_text).toBe('ST notes');
  });
});

describe('GET /api/downtime_submissions — Player', () => {
  it('returns only submissions for player\'s characters', async () => {
    // Create submissions for two different characters
    await insertSub(testChars[0].id);
    await insertSub(testChars[1].id);

    // Player only owns char 0
    const res = await request(app)
      .get('/api/downtime_submissions')
      .set('X-Test-User', playerUser([testChars[0].id]));
    expect(res.status).toBe(200);

    const charIds = res.body.map(s => s.character_id?.toString());
    for (const id of charIds) {
      expect(id).toBe(testChars[0].id);
    }
  });

  it('strips st_review from player responses', async () => {
    await insertSub(testChars[0].id, {
      st_review: { outcome_text: 'Secret ST notes', outcome_visibility: 'draft' },
    });
    const res = await request(app)
      .get('/api/downtime_submissions')
      .set('X-Test-User', playerUser([testChars[0].id]));
    const subs = res.body.filter(s => s.character_id?.toString() === testChars[0].id);
    for (const sub of subs) {
      expect(sub.st_review).toBeUndefined();
    }
  });

  it('promotes published outcome to top-level field', async () => {
    await insertSub(testChars[0].id, {
      st_review: { outcome_text: 'Published result', outcome_visibility: 'published' },
    });
    const res = await request(app)
      .get('/api/downtime_submissions')
      .set('X-Test-User', playerUser([testChars[0].id]));
    const withOutcome = res.body.find(s => s.published_outcome);
    expect(withOutcome).toBeTruthy();
    expect(withOutcome.published_outcome).toBe('Published result');
    expect(withOutcome.st_review).toBeUndefined();
  });

  it('returns empty for player with no characters', async () => {
    const res = await request(app)
      .get('/api/downtime_submissions')
      .set('X-Test-User', playerUser([]));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ══════════════════════════════════════
//  SUBMISSIONS — CREATE
// ══════════════════════════════════════

describe('POST /api/downtime_submissions', () => {
  it('player can create a submission', async () => {
    const res = await request(app)
      .post('/api/downtime_submissions')
      .set('X-Test-User', playerUser([testChars[0].id]))
      .send({
        character_id: testChars[0].id,
        cycle_id: null,
        status: 'draft',
        responses: { travel: 'Took the bus' },
      });
    expect(res.status).toBe(201);
    expect(res.body.responses.travel).toBe('Took the bus');
    createdSubIds.push(res.body._id);
  });

  it('ST can create a submission', async () => {
    const res = await request(app)
      .post('/api/downtime_submissions')
      .set('X-Test-User', stUser())
      .send({
        character_id: testChars[0].id,
        status: 'submitted',
        responses: { travel: 'ST-created' },
      });
    expect(res.status).toBe(201);
    createdSubIds.push(res.body._id);
  });
});

// ══════════════════════════════════════
//  SUBMISSIONS — UPDATE
// ══════════════════════════════════════

describe('PUT /api/downtime_submissions/:id', () => {
  it('player can update their own submission', async () => {
    const sub = await insertSub(testChars[0].id);
    const res = await request(app)
      .put(`/api/downtime_submissions/${sub._id}`)
      .set('X-Test-User', playerUser([testChars[0].id]))
      .send({ responses: { travel: 'Updated travel' }, status: 'submitted' });
    expect(res.status).toBe(200);
    expect(res.body.responses.travel).toBe('Updated travel');
    expect(res.body.status).toBe('submitted');
  });

  it('player cannot update another player\'s submission', async () => {
    const sub = await insertSub(testChars[1].id); // char 1
    const res = await request(app)
      .put(`/api/downtime_submissions/${sub._id}`)
      .set('X-Test-User', playerUser([testChars[0].id])) // owns char 0
      .send({ responses: { travel: 'Hacked' } });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  it('player cannot set st_review fields', async () => {
    const sub = await insertSub(testChars[0].id);
    const res = await request(app)
      .put(`/api/downtime_submissions/${sub._id}`)
      .set('X-Test-User', playerUser([testChars[0].id]))
      .send({ st_review: { outcome_text: 'Injected' } });
    expect(res.status).toBe(200);
    // Verify st_review was not set
    const col = getCollection('downtime_submissions');
    const doc = await col.findOne({ _id: sub._id });
    expect(doc.st_review).toBeUndefined();
  });

  it('ST can update any submission including st_review', async () => {
    const sub = await insertSub(testChars[0].id);
    const res = await request(app)
      .put(`/api/downtime_submissions/${sub._id}`)
      .set('X-Test-User', stUser())
      .send({ st_review: { outcome_text: 'ST verdict', outcome_visibility: 'draft' } });
    expect(res.status).toBe(200);
    expect(res.body.st_review.outcome_text).toBe('ST verdict');
  });

  it('returns 404 for non-existent submission', async () => {
    const res = await request(app)
      .put('/api/downtime_submissions/000000000000000000000000')
      .set('X-Test-User', stUser())
      .send({ status: 'submitted' });
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid ID format', async () => {
    const res = await request(app)
      .put('/api/downtime_submissions/not-an-id')
      .set('X-Test-User', stUser())
      .send({ status: 'submitted' });
    expect(res.status).toBe(400);
  });

  // dt-form.17 (ADR-003 §Q11): cycle-close gate
  it('returns 423 CYCLE_CLOSED when the submission’s cycle is closed', async () => {
    const cycleCol = getCollection('downtime_cycles');
    const cycleRes = await cycleCol.insertOne({
      game_number: 9001,
      label: 'Closed Test Cycle',
      status: 'closed',
      created_at: new Date().toISOString(),
    });
    try {
      const sub = await insertSub(testChars[0].id, { cycle_id: cycleRes.insertedId });
      const res = await request(app)
        .put(`/api/downtime_submissions/${sub._id}`)
        .set('X-Test-User', playerUser([testChars[0].id]))
        .send({ responses: { travel: 'Trying to edit a closed cycle' } });
      expect(res.status).toBe(423);
      expect(res.body.error).toBe('CYCLE_CLOSED');
      expect(res.body.message).toMatch(/locked/i);
    } finally {
      await cycleCol.deleteOne({ _id: cycleRes.insertedId });
    }
  });

  it('allows edits when the cycle is active (gate passes)', async () => {
    const cycleCol = getCollection('downtime_cycles');
    const cycleRes = await cycleCol.insertOne({
      game_number: 9002,
      label: 'Active Test Cycle',
      status: 'active',
      created_at: new Date().toISOString(),
    });
    try {
      const sub = await insertSub(testChars[0].id, { cycle_id: cycleRes.insertedId });
      const res = await request(app)
        .put(`/api/downtime_submissions/${sub._id}`)
        .set('X-Test-User', playerUser([testChars[0].id]))
        .send({ responses: { travel: 'Edit on active cycle' } });
      expect(res.status).toBe(200);
      expect(res.body.responses.travel).toBe('Edit on active cycle');
    } finally {
      await cycleCol.deleteOne({ _id: cycleRes.insertedId });
    }
  });
});
