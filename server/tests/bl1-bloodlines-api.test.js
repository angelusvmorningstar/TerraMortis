/**
 * BL-1 (issue #1008) — read-only /api/bloodlines.
 *
 * AC 7, 8, 9. Reads are public in the ECM manner: BL-2 will need them in the
 * player app without a token. Writes are BL-4 and must NOT exist yet — the
 * last describe block is the guard on that, because an endpoint quietly
 * arriving early is how scope leaks between stories.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { ObjectId } from 'mongodb';
import { createTestApp, stUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;

// Cleanup tracks inserted ids rather than tagging fixtures with a marker
// field. A marker would be an additional property the collection's own schema
// forbids, so every assertion here would be made against documents that can
// never exist in production — and would break the moment BL-4 or BL-5 turns
// on collection-level validation.
const seeded = [];

// Fixture names are deliberately NOT real bloodlines. The seed suite creates a
// unique index on `name` and inserts the real 23; sharing a name with it would
// make these tests fail with E11000 for a reason unrelated to what they test.
async function seedBloodline(overrides = {}) {
  const now = new Date().toISOString();
  const doc = {
    name: 'Zzz Test Bloodline',
    slug: 'zzz-test-bloodline',
    clan: 'Mekhet',
    disciplines: ['Auspex', 'Celerity', 'Obfuscate', 'Vigour'],
    active: true,
    notes: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
  const result = await getCollection('bloodlines').insertOne(doc);
  seeded.push(result.insertedId);
  return { _id: result.insertedId, ...doc };
}

async function clearSeeded() {
  if (!seeded.length) return;
  await getCollection('bloodlines').deleteMany({ _id: { $in: seeded } });
  seeded.length = 0;
}

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
});

afterAll(async () => {
  await clearSeeded();
  await teardownDb();
});

describe('GET /api/bloodlines', () => {
  it('returns 200 with the list, no auth required', async () => {
    await seedBloodline({ name: 'Zzz Fixture Alpha', slug: 'zzz-fixture-alpha', clan: 'Daeva' });
    await seedBloodline({ name: 'Zzz Fixture Bravo', slug: 'zzz-fixture-bravo', clan: 'Mekhet' });

    const res = await request(app).get('/api/bloodlines');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const names = res.body.map(b => b.name);
    expect(names).toContain('Zzz Fixture Alpha');
    expect(names).toContain('Zzz Fixture Bravo');
  });

  it('sorts by name', async () => {
    // Scoped to our own ASCII fixtures on purpose. Asserting over the whole
    // collection would compare Mongo's binary collation against a JS
    // comparator, which agree for ASCII and need not for a name like Lidérc.
    const res = await request(app).get('/api/bloodlines');
    const names = res.body.map(b => b.name).filter(n => n.startsWith('Zzz Fixture'));
    expect(names.length).toBeGreaterThanOrEqual(2);
    expect(names).toEqual([...names].sort());
  });

  it('returns the four disciplines with each entry', async () => {
    const res = await request(app).get('/api/bloodlines');
    const alpha = res.body.find(b => b.name === 'Zzz Fixture Alpha');
    expect(alpha.disciplines).toHaveLength(4);
    expect(alpha.clan).toBe('Daeva');
  });
});

describe('GET /api/bloodlines/:id', () => {
  it('returns a single bloodline by id, no auth required', async () => {
    const made = await seedBloodline({ name: 'Zzz Fixture Charlie', slug: 'zzz-fixture-charlie' });
    const res = await request(app).get(`/api/bloodlines/${made._id}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Zzz Fixture Charlie');
    expect(res.body.clan).toBe('Mekhet');
  });

  it('404s on a well-formed id that does not exist', async () => {
    const res = await request(app).get(`/api/bloodlines/${new ObjectId()}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('404s (not 400) on a malformed id, so a prober cannot tell the two apart', async () => {
    // An empty id is deliberately absent: /api/bloodlines/ is the list route.
    for (const bad of ['not-an-objectid', 'abcdefghijkl', '12345', 'zzzzzzzzzzzzzzzzzzzzzzzz']) {
      const res = await request(app).get(`/api/bloodlines/${bad}`);
      expect(res.status, `expected 404 for id "${bad}"`).toBe(404);
      expect(res.body.error).toBe('NOT_FOUND');
    }
  });

  it('resolves an UPPERCASE hex id — it is a valid ObjectId for a real document', async () => {
    const made = await seedBloodline({ name: 'Zzz Fixture Foxtrot', slug: 'zzz-fixture-foxtrot' });
    const res = await request(app).get(`/api/bloodlines/${String(made._id).toUpperCase()}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Zzz Fixture Foxtrot');
  });
});

describe('BL-1 is read-only — writes belong to BL-4', () => {
  it('has no POST handler', async () => {
    const res = await request(app)
      .post('/api/bloodlines')
      .set('X-Test-User', stUser())
      .send({ name: 'Nope', slug: 'nope', clan: 'Mekhet', disciplines: ['a', 'b', 'c', 'd'] });
    expect(res.status).toBe(404);
  });

  it('has no PATCH handler', async () => {
    const made = await seedBloodline({ name: 'Zzz Fixture Delta', slug: 'zzz-fixture-delta', clan: 'Ventrue' });
    const res = await request(app)
      .patch(`/api/bloodlines/${made._id}`)
      .set('X-Test-User', stUser())
      .send({ notes: 'edited' });
    expect(res.status).toBe(404);

    const after = await getCollection('bloodlines').findOne({ _id: made._id });
    expect(after.notes).toBeNull();
  });

  it('has no DELETE handler', async () => {
    const made = await seedBloodline({ name: 'Zzz Fixture Echo', slug: 'zzz-fixture-echo', clan: 'Ventrue' });
    const res = await request(app)
      .delete(`/api/bloodlines/${made._id}`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(404);

    expect(await getCollection('bloodlines').countDocuments({ _id: made._id })).toBe(1);
  });
});
