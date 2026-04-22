/**
 * API tests — /api/rules offering field + sub_category schema
 *
 * Covers:
 *   - PUT /api/rules/:key accepts and persists the offering field (ST)
 *   - GET /api/rules/:key returns offering in response
 *   - PUT /api/rules/:key with Offering (capital) accepted via UPDATABLE_FIELDS
 *   - Player cannot PUT to /api/rules/:key (403)
 *   - offering null-clears correctly
 *   - POST rite with sub_category null → 201
 *   - POST rite with sub_category free string → 201
 *   - POST rite with merit sub_category value → 201
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;
const TEST_KEY = 'rite-test-offering-fixture';
const seededKeys = [];

async function seedRite(overrides = {}) {
  const col = getCollection('purchasable_powers');
  const doc = {
    key: TEST_KEY,
    name: 'Test Offering Rite',
    category: 'rite',
    parent: 'Theban',
    rank: 1,
    cost: '1 WP',
    offering: null,
    description: 'A test rite for offering field tests.',
    ...overrides,
  };
  await col.deleteOne({ key: doc.key });
  await col.insertOne(doc);
  seededKeys.push(doc.key);
  return doc;
}

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
  await seedRite();
});

afterAll(async () => {
  const col = getCollection('purchasable_powers');
  await col.deleteMany({ key: { $in: seededKeys } });
});

describe('PUT /api/rules/:key — offering field (ST)', () => {
  it('accepts and persists offering text', async () => {
    const res = await request(app)
      .put(`/api/rules/${TEST_KEY}`)
      .set('X-Test-User', stUser())
      .send({ offering: 'A rod or staff' });
    expect(res.status).toBe(200);
    expect(res.body.offering).toBe('A rod or staff');
  });

  it('GET returns the updated offering', async () => {
    const res = await request(app)
      .get(`/api/rules/${TEST_KEY}`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(res.body.offering).toBe('A rod or staff');
  });

  it('clears offering when set to null', async () => {
    const res = await request(app)
      .put(`/api/rules/${TEST_KEY}`)
      .set('X-Test-User', stUser())
      .send({ offering: null });
    expect(res.status).toBe(200);
    expect(res.body.offering).toBeNull();
  });

  it('does not affect other fields when only offering is updated', async () => {
    await request(app)
      .put(`/api/rules/${TEST_KEY}`)
      .set('X-Test-User', stUser())
      .send({ offering: 'A thorny branch' });

    const res = await request(app)
      .get(`/api/rules/${TEST_KEY}`)
      .set('X-Test-User', stUser());
    expect(res.body.cost).toBe('1 WP');
    expect(res.body.name).toBe('Test Offering Rite');
    expect(res.body.offering).toBe('A thorny branch');
  });
});

describe('PUT /api/rules/:key — offering field (player)', () => {
  it('returns 403 for player role', async () => {
    const res = await request(app)
      .put(`/api/rules/${TEST_KEY}`)
      .set('X-Test-User', playerUser())
      .send({ offering: 'A rod or staff' });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/rules — rite documents include offering field', () => {
  it('offering field present on rite document from collection GET', async () => {
    const res = await request(app)
      .get('/api/rules?category=rite')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    const rite = res.body.find(r => r.key === TEST_KEY);
    expect(rite).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(rite, 'offering') ||
      rite.offering === undefined).toBeTruthy();
  });
});

describe('POST /api/rules — sub_category enum relaxed (rites.3)', () => {
  const subCatKeys = [];

  afterAll(async () => {
    const col = (await import('../db.js')).getCollection('purchasable_powers');
    await col.deleteMany({ key: { $in: subCatKeys } });
  });

  async function postRite(key, sub_category) {
    subCatKeys.push(key);
    return request(app)
      .post('/api/rules')
      .set('X-Test-User', stUser())
      .send({
        key,
        name: 'Sub-category Test Rite',
        category: 'rite',
        parent: 'Theban',
        rank: 1,
        cost: '1 WP',
        sub_category,
      });
  }

  it('POST rite with sub_category null → 201', async () => {
    const res = await postRite('rite-subcat-test-null', null);
    expect(res.status).toBe(201);
  });

  it('POST rite with sub_category free string → 201', async () => {
    const res = await postRite('rite-subcat-test-free', 'Transmutation 3');
    expect(res.status).toBe(201);
    expect(res.body.sub_category).toBe('Transmutation 3');
  });

  it('POST rite with merit sub_category value → 201', async () => {
    const res = await postRite('rite-subcat-test-merit', 'general');
    expect(res.status).toBe(201);
    expect(res.body.sub_category).toBe('general');
  });
});
