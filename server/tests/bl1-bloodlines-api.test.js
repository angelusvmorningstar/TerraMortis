/**
 * BL-1 (issue #1008) — read-only /api/bloodlines.
 *
 * AC 7, 8, 9. Reads are public in the ECM manner: BL-2 needs them in the
 * player app without a token.
 *
 * BL-4 (2026-08-11) converted the last describe block. It used to assert that
 * POST / PATCH / DELETE all 404, guarding against writes arriving early; BL-4
 * is when they arrive, so it now asserts the auth boundary those same three
 * endpoints sit behind. Their behaviour is covered in
 * `bl4-bloodlines-write-api.test.js`.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { ObjectId } from 'mongodb';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
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

  it('never publishes `notes` — these reads are unauthenticated and notes are ST-only', async () => {
    const made = await seedBloodline({
      name: 'Zzz Fixture Golf', slug: 'zzz-fixture-golf',
      notes: 'ST ONLY: extinct in Sydney since 1998.',
    });

    const list = await request(app).get('/api/bloodlines');
    const fromList = list.body.find(b => b.name === 'Zzz Fixture Golf');
    expect(fromList).toBeTruthy();
    expect(fromList).not.toHaveProperty('notes');

    const single = await request(app).get(`/api/bloodlines/${made._id}`);
    expect(single.status).toBe(200);
    expect(single.body).not.toHaveProperty('notes');

    // Stored, just not served. BL-4's ST-gated read is what surfaces it.
    const stored = await getCollection('bloodlines').findOne({ _id: made._id });
    expect(stored.notes).toBe('ST ONLY: extinct in Sydney since 1998.');
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

/**
 * CONVERTED by BL-4, not deleted. This block was titled "BL-1 is read-only —
 * writes belong to BL-4" and asserted that POST, PATCH and DELETE all 404. BL-4
 * is now here and those three endpoints exist, so the assertions flip; the
 * block stays because it is the only regression cover on the auth BOUNDARY
 * living alongside the public reads. Deleting it would leave the two public
 * GETs and the three ST-gated writes described in separate files, which is
 * exactly how a route quietly loses its gate.
 *
 * The behaviour of the writes themselves lives in
 * `bl4-bloodlines-write-api.test.js`. This is the boundary only.
 */
describe('BL-4 — writes exist and are ST-gated (was: BL-1 is read-only)', () => {
  it('POST requires auth and the ST role, and creates for an ST', async () => {
    const payload = { name: 'Zzz Fixture Hotel', clan: 'Mekhet', disciplines: ['Auspex', 'Celerity', 'Obfuscate', 'Vigour'] };

    expect((await request(app).post('/api/bloodlines').send(payload)).status).toBe(401);
    expect((await request(app).post('/api/bloodlines').set('X-Test-User', playerUser()).send(payload)).status).toBe(403);

    const ok = await request(app).post('/api/bloodlines').set('X-Test-User', stUser()).send(payload);
    expect(ok.status).toBe(201);
    seeded.push(new ObjectId(ok.body._id));
    expect(ok.body.slug).toBe('zzz-fixture-hotel');
  });

  it('PATCH requires auth and the ST role, and edits for an ST', async () => {
    const made = await seedBloodline({ name: 'Zzz Fixture Delta', slug: 'zzz-fixture-delta', clan: 'Ventrue' });

    expect((await request(app).patch(`/api/bloodlines/${made._id}`).send({ notes: 'edited' })).status).toBe(401);
    expect((await request(app).patch(`/api/bloodlines/${made._id}`).set('X-Test-User', playerUser()).send({ notes: 'edited' })).status).toBe(403);
    expect((await getCollection('bloodlines').findOne({ _id: made._id })).notes).toBeNull();

    const ok = await request(app)
      .patch(`/api/bloodlines/${made._id}`)
      .set('X-Test-User', stUser())
      .send({ notes: 'edited' });
    expect(ok.status).toBe(200);
    expect((await getCollection('bloodlines').findOne({ _id: made._id })).notes).toBe('edited');
  });

  it('DELETE requires auth and the ST role, and removes an unreferenced bloodline for an ST', async () => {
    const made = await seedBloodline({ name: 'Zzz Fixture Echo', slug: 'zzz-fixture-echo', clan: 'Ventrue' });

    expect((await request(app).delete(`/api/bloodlines/${made._id}`)).status).toBe(401);
    expect((await request(app).delete(`/api/bloodlines/${made._id}`).set('X-Test-User', playerUser())).status).toBe(403);
    expect(await getCollection('bloodlines').countDocuments({ _id: made._id })).toBe(1);

    const ok = await request(app).delete(`/api/bloodlines/${made._id}`).set('X-Test-User', stUser());
    expect(ok.status).toBe(204);
    expect(await getCollection('bloodlines').countDocuments({ _id: made._id })).toBe(0);
  });
});
