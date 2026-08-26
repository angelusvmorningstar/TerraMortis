/**
 * BL-1 (issue #1008) — read-only /api/bloodlines.
 *
 * AC 7, 8, 9. Reads are public in the ECM manner: BL-2 needs them in the
 * player app without a token.
 *
 * ADMR-1 (2026-08-26) retired every route this file used to cover except the
 * plain list below: `GET /:id` had zero caller anywhere in this repo and is
 * gone with the rest; `POST`/`PATCH`/`DELETE`/`GET /admin`/`GET /:id/impact`
 * (BL-4's own admin CRUD, added 2026-08-11) are also gone, ST authoring now
 * lives in TM Admin. The final describe block below is the INVERSE of what
 * BL-4 converted it to: it used to assert the writes existed and sat behind
 * an ST-role gate; now it asserts none of the six removed routes exist at
 * all, the same shape this file had before BL-4 ever shipped, restored
 * rather than reinvented because the underlying question - "does a request
 * to a since-removed route surface as 404, not some other status" - is the
 * same one.
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

  it('never publishes `notes` — this read is unauthenticated and notes are ST-only', async () => {
    const made = await seedBloodline({
      name: 'Zzz Fixture Golf', slug: 'zzz-fixture-golf',
      notes: 'ST ONLY: extinct in Sydney since 1998.',
    });

    const list = await request(app).get('/api/bloodlines');
    const fromList = list.body.find(b => b.name === 'Zzz Fixture Golf');
    expect(fromList).toBeTruthy();
    expect(fromList).not.toHaveProperty('notes');

    // Stored, just not served. Nothing in this repo reads it back with
    // `notes` any more (TM Admin's own admin screen does that now).
    const stored = await getCollection('bloodlines').findOne({ _id: made._id });
    expect(stored.notes).toBe('ST ONLY: extinct in Sydney since 1998.');
  });
});

describe('ADMR-1 — every retired route 404s, not some other status', () => {
  it('GET /:id (dead even before ADMR-1 — zero caller in this repo) 404s', async () => {
    const made = await seedBloodline({ name: 'Zzz Fixture Charlie', slug: 'zzz-fixture-charlie' });
    const res = await request(app).get(`/api/bloodlines/${made._id}`);
    expect(res.status).toBe(404);
  });

  it('GET /admin 404s', async () => {
    const res = await request(app).get('/api/bloodlines/admin').set('X-Test-User', stUser());
    expect(res.status).toBe(404);
  });

  it('GET /:id/impact 404s', async () => {
    const res = await request(app).get(`/api/bloodlines/${new ObjectId()}/impact`).set('X-Test-User', stUser());
    expect(res.status).toBe(404);
  });

  it('POST 404s, for an ST and for an unauthenticated caller alike', async () => {
    const payload = { name: 'Zzz Fixture Hotel', clan: 'Mekhet', disciplines: ['Auspex', 'Celerity', 'Obfuscate', 'Vigour'] };
    expect((await request(app).post('/api/bloodlines').send(payload)).status).toBe(404);
    expect((await request(app).post('/api/bloodlines').set('X-Test-User', stUser()).send(payload)).status).toBe(404);
  });

  it('PATCH 404s', async () => {
    const made = await seedBloodline({ name: 'Zzz Fixture Delta', slug: 'zzz-fixture-delta', clan: 'Ventrue' });
    const res = await request(app).patch(`/api/bloodlines/${made._id}`).set('X-Test-User', stUser()).send({ notes: 'x' });
    expect(res.status).toBe(404);
    expect((await getCollection('bloodlines').findOne({ _id: made._id })).notes).toBeNull();
  });

  it('DELETE 404s, and the document survives', async () => {
    const made = await seedBloodline({ name: 'Zzz Fixture Echo', slug: 'zzz-fixture-echo', clan: 'Ventrue' });
    const res = await request(app).delete(`/api/bloodlines/${made._id}`).set('X-Test-User', stUser());
    expect(res.status).toBe(404);
    expect(await getCollection('bloodlines').countDocuments({ _id: made._id })).toBe(1);
  });
});
