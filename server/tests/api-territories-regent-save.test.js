/**
 * AC-1 data-contract guard for issue #224: saveTerritory writes regent_id
 * and lieutenant_id via POST /api/territories, and GET /api/territories
 * returns the updated values so renderDowntimeTab's fresh-fetch sees them.
 *
 * The existing api-territories.test.js covers POST update-by-_id for
 * ambience only. This file fills the gap for the regent/lieutenant fields
 * that saveTerritory in city-views.js actually writes.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { createTestApp, stUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;
const createdIds = [];

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
});

afterEach(async () => {
  const col = getCollection('territories');
  for (const id of createdIds) await col.deleteOne({ _id: id });
  createdIds.length = 0;
});

afterAll(async () => {
  await teardownDb();
});

async function seedTerritory(slug = 'regent_save_test') {
  const res = await request(app)
    .post('/api/territories')
    .set('X-Test-User', stUser())
    .send({ slug, name: 'Regent Save Test', ambience: 'Tended', regent_id: null, lieutenant_id: null, feeding_rights: [] });
  expect(res.status).toBe(201);
  createdIds.push(res.body._id);
  return res.body;
}

// ── saveTerritory write path ──────────────────────────────────────────────────

describe('POST /api/territories — regent_id and lieutenant_id persistence (issue #224)', () => {
  it('POST update persists regent_id', async () => {
    const terr = await seedTerritory('regent_save_regent_id');
    const res = await request(app)
      .post('/api/territories')
      .set('X-Test-User', stUser())
      .send({ _id: terr._id, name: terr.name, regent_id: 'alice-char-id', lieutenant_id: null });
    expect(res.status).toBe(200);
    expect(res.body.regent_id).toBe('alice-char-id');
    expect(res.body.lieutenant_id).toBeNull();
  });

  it('POST update persists lieutenant_id', async () => {
    const terr = await seedTerritory('regent_save_lt_id');
    const res = await request(app)
      .post('/api/territories')
      .set('X-Test-User', stUser())
      .send({ _id: terr._id, name: terr.name, regent_id: 'alice-char-id', lieutenant_id: 'bob-char-id' });
    expect(res.status).toBe(200);
    expect(res.body.regent_id).toBe('alice-char-id');
    expect(res.body.lieutenant_id).toBe('bob-char-id');
  });

  it('POST update can clear regent_id to null', async () => {
    const terr = await seedTerritory('regent_save_clear');
    // Set a regent first
    await request(app)
      .post('/api/territories')
      .set('X-Test-User', stUser())
      .send({ _id: terr._id, name: terr.name, regent_id: 'alice-char-id', lieutenant_id: null });

    // Clear it
    const res = await request(app)
      .post('/api/territories')
      .set('X-Test-User', stUser())
      .send({ _id: terr._id, name: terr.name, regent_id: null, lieutenant_id: null });
    expect(res.status).toBe(200);
    expect(res.body.regent_id).toBeNull();
  });
});

// ── fresh-fetch data contract (renderDowntimeTab reads GET after saveTerritory writes) ──

describe('GET /api/territories — returns updated regent_id after POST (issue #224 fresh-fetch)', () => {
  it('GET list reflects regent_id set by a preceding POST', async () => {
    const terr = await seedTerritory('regent_save_get_roundtrip');
    await request(app)
      .post('/api/territories')
      .set('X-Test-User', stUser())
      .send({ _id: terr._id, name: terr.name, regent_id: 'alice-char-id', lieutenant_id: null });

    const listRes = await request(app)
      .get('/api/territories')
      .set('X-Test-User', stUser());
    expect(listRes.status).toBe(200);
    const updated = listRes.body.find(t => String(t._id) === String(terr._id));
    expect(updated).toBeDefined();
    expect(updated.regent_id).toBe('alice-char-id');
  });
});
