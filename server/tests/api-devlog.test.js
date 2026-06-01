/**
 * API tests — /api/devlog (issue #502)
 *
 * AC#1 — GET returns entries array; all authenticated users can read
 * AC#2 — POST creates an entry (ST only, 201)
 * AC#3 — PATCH updates an entry (ST only)
 * AC#4 — DELETE removes an entry (ST only)
 * AC#5 — Auth enforcement: 401 unauthenticated; 403 player on write routes
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;
const col = () => getCollection('devlog_entries');

const VALID_ENTRY = {
  type:   'rule_change',
  title:  'Test rule change',
  body:   'We are considering this change.',
  status: 'considering',
};

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
  await col().deleteMany({ title: { $regex: /^Test / } });
});

afterAll(async () => {
  await col().deleteMany({ title: { $regex: /^Test / } });
  await teardownDb();
});

// ── AC#5 — Auth ─────────────────────────────────────────────────────────

describe('AC#5 — auth enforcement', () => {
  it('401 on GET without auth', async () => {
    const res = await request(app).get('/api/devlog');
    expect(res.status).toBe(401);
  });

  it('401 on POST without auth', async () => {
    const res = await request(app).post('/api/devlog').send(VALID_ENTRY);
    expect(res.status).toBe(401);
  });

  it('403 on POST as player', async () => {
    const res = await request(app)
      .post('/api/devlog')
      .set('X-Test-User', playerUser())
      .send(VALID_ENTRY);
    expect(res.status).toBe(403);
  });

  it('403 on PATCH as player', async () => {
    // Use a structurally valid ObjectId string — 403 should fire before id check
    const fakeId = '000000000000000000000001';
    const res = await request(app)
      .patch(`/api/devlog/${fakeId}`)
      .set('X-Test-User', playerUser())
      .send({ status: 'confirmed' });
    expect(res.status).toBe(403);
  });

  it('403 on DELETE as player', async () => {
    const fakeId = '000000000000000000000001';
    const res = await request(app)
      .delete(`/api/devlog/${fakeId}`)
      .set('X-Test-User', playerUser());
    expect(res.status).toBe(403);
  });
});

// ── AC#1 — GET ──────────────────────────────────────────────────────────

describe('AC#1 — GET returns entries for authenticated users', () => {
  it('returns an array as ST', async () => {
    const res = await request(app).get('/api/devlog').set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns an array as player', async () => {
    const res = await request(app).get('/api/devlog').set('X-Test-User', playerUser());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ── AC#2 — POST ─────────────────────────────────────────────────────────

describe('AC#2 — POST creates entry (ST only)', () => {
  let createdId;

  it('201 with required fields', async () => {
    const res = await request(app)
      .post('/api/devlog')
      .set('X-Test-User', stUser())
      .send(VALID_ENTRY);
    expect(res.status).toBe(201);
    expect(res.body._id).toBeTruthy();
    expect(res.body.title).toBe(VALID_ENTRY.title);
    expect(res.body.type).toBe(VALID_ENTRY.type);
    expect(res.body.status).toBe(VALID_ENTRY.status);
    expect(typeof res.body.created_at).toBe('string');
    expect(typeof res.body.updated_at).toBe('string');
    createdId = res.body._id;
  });

  it('400 on missing required field (no title)', async () => {
    const { title: _omit, ...body } = VALID_ENTRY;
    const res = await request(app)
      .post('/api/devlog')
      .set('X-Test-User', stUser())
      .send(body);
    expect(res.status).toBe(400);
  });

  it('400 on invalid type enum', async () => {
    const res = await request(app)
      .post('/api/devlog')
      .set('X-Test-User', stUser())
      .send({ ...VALID_ENTRY, type: 'banana' });
    expect(res.status).toBe(400);
  });

  it('400 on invalid status enum', async () => {
    const res = await request(app)
      .post('/api/devlog')
      .set('X-Test-User', stUser())
      .send({ ...VALID_ENTRY, status: 'unknown' });
    expect(res.status).toBe(400);
  });

  it('accepts and round-trips the boolean highlight flag', async () => {
    const res = await request(app)
      .post('/api/devlog')
      .set('X-Test-User', stUser())
      .send({ ...VALID_ENTRY, title: 'Test highlight flag', highlight: true });
    expect(res.status).toBe(201);
    expect(res.body.highlight).toBe(true);
  });

  it('400 when highlight is not a boolean', async () => {
    const res = await request(app)
      .post('/api/devlog')
      .set('X-Test-User', stUser())
      .send({ ...VALID_ENTRY, highlight: 'yes' });
    expect(res.status).toBe(400);
  });

  // expose createdId for PATCH / DELETE suites
  afterAll(() => {
    globalThis._devlogTestId = createdId;
  });
});

// ── AC#3 — PATCH ────────────────────────────────────────────────────────

describe('AC#3 — PATCH updates entry (ST only)', () => {
  let targetId;

  beforeAll(async () => {
    // Use the id left by the POST suite, or create a fresh one
    if (globalThis._devlogTestId) {
      targetId = globalThis._devlogTestId;
    } else {
      const res = await request(app)
        .post('/api/devlog')
        .set('X-Test-User', stUser())
        .send({ ...VALID_ENTRY, title: 'Test patch target' });
      targetId = res.body._id;
    }
  });

  it('200 with updated field reflected in response', async () => {
    const res = await request(app)
      .patch(`/api/devlog/${targetId}`)
      .set('X-Test-User', stUser())
      .send({ status: 'confirmed' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('confirmed');
    expect(typeof res.body.updated_at).toBe('string');
  });

  it('400 on malformed id', async () => {
    const res = await request(app)
      .patch('/api/devlog/not-an-objectid')
      .set('X-Test-User', stUser())
      .send({ status: 'confirmed' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('BAD_ID');
  });

  it('404 on unknown id', async () => {
    const res = await request(app)
      .patch('/api/devlog/000000000000000000000099')
      .set('X-Test-User', stUser())
      .send({ status: 'confirmed' });
    expect(res.status).toBe(404);
  });
});

// ── AC#4 — DELETE ───────────────────────────────────────────────────────

describe('AC#4 — DELETE removes entry (ST only)', () => {
  let targetId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/devlog')
      .set('X-Test-User', stUser())
      .send({ ...VALID_ENTRY, title: 'Test delete target' });
    targetId = res.body._id;
  });

  it('200 ok: true on successful delete', async () => {
    const res = await request(app)
      .delete(`/api/devlog/${targetId}`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('404 on second delete of same id', async () => {
    const res = await request(app)
      .delete(`/api/devlog/${targetId}`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(404);
  });

  it('400 on malformed id', async () => {
    const res = await request(app)
      .delete('/api/devlog/not-an-objectid')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('BAD_ID');
  });
});
