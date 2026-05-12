/**
 * API test — /api/characters/public exposes blood_potency + humanity (Issue #7)
 *
 * Regression guard: verifies the two fields needed for BP/Humanity icon
 * rendering are included in the public character projection.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { ObjectId } from 'mongodb';
import { createTestApp, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;
let CHAR_ID;

beforeAll(async () => {
  await setupDb();
  app = createTestApp();

  const result = await getCollection('characters').insertOne({
    name: 'Issue-7 Test Char',
    retired: false,
    pending_approval: false,
    clan: 'Mekhet',
    covenant: 'Circle of the Crone',
    player: 'Test Player',
    blood_potency: 3,
    humanity: 2,
    court_category: null,
    attributes: {}, skills: {}, disciplines: {}, merits: [], powers: [], ordeals: {},
  });
  CHAR_ID = result.insertedId;
});

afterAll(async () => {
  await getCollection('characters').deleteOne({ _id: CHAR_ID });
  await teardownDb();
});

describe('Issue #7: /api/characters/public projection includes BP and Humanity', () => {

  it('returns 200 with an array', async () => {
    const res = await request(app)
      .get('/api/characters/public')
      .set('X-Test-User', playerUser());

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('each character includes blood_potency', async () => {
    const res = await request(app)
      .get('/api/characters/public')
      .set('X-Test-User', playerUser());

    const char = res.body.find(c => String(c._id) === String(CHAR_ID));
    expect(char).toBeDefined();
    expect(char.blood_potency).toBe(3);
  });

  it('each character includes humanity', async () => {
    const res = await request(app)
      .get('/api/characters/public')
      .set('X-Test-User', playerUser());

    const char = res.body.find(c => String(c._id) === String(CHAR_ID));
    expect(char).toBeDefined();
    expect(char.humanity).toBe(2);
  });

  it('projection still includes core identity fields', async () => {
    const res = await request(app)
      .get('/api/characters/public')
      .set('X-Test-User', playerUser());

    const char = res.body.find(c => String(c._id) === String(CHAR_ID));
    expect(char).toBeDefined();
    expect(char.name).toBe('Issue-7 Test Char');
    expect(char.clan).toBe('Mekhet');
    expect(char.covenant).toBe('Circle of the Crone');
  });

  it('retired characters are excluded from public list', async () => {
    const retiredId = (await getCollection('characters').insertOne({
      name: 'Retired Char', retired: true, pending_approval: false,
      blood_potency: 1, humanity: 5,
      attributes: {}, skills: {}, disciplines: {}, merits: [], powers: [], ordeals: {},
    })).insertedId;

    const res = await request(app)
      .get('/api/characters/public')
      .set('X-Test-User', playerUser());

    const found = res.body.find(c => String(c._id) === String(retiredId));
    expect(found).toBeUndefined();

    await getCollection('characters').deleteOne({ _id: retiredId });
  });

});
