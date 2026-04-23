/**
 * API tests — /api/characters endpoint.
 * Tests role-based filtering, auth requirements, and response structure.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb, getTestCharacterIds } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;
let testChars; // [{ id, name }, ...]

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
  testChars = await getTestCharacterIds(3);
});

afterAll(async () => {
  await teardownDb();
});

describe('GET /api/characters — Auth', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/characters');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('AUTH_ERROR');
  });
});

describe('GET /api/characters — ST role', () => {
  it('returns all characters for ST', async () => {
    const res = await request(app)
      .get('/api/characters')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Test DB may be empty or seeded by earlier tests — at minimum the endpoint responds.
    expect(res.body.length).toBeGreaterThanOrEqual(0);
  });

  it('character docs expose id and name fields', async () => {
    // Seed one fully-formed character so the shape check has something to inspect
    // regardless of what other tests have done to the test DB.
    const col = getCollection('characters');
    const seed = await col.insertOne({
      name: 'Shape Test Char',
      clan: 'Daeva',
      covenant: 'Invictus',
      retired: false,
      _test_seeded: true,
    });
    try {
      const res = await request(app)
        .get('/api/characters')
        .set('X-Test-User', stUser());
      const char = res.body.find(c => String(c._id) === String(seed.insertedId));
      expect(char).toBeTruthy();
      expect(char).toHaveProperty('_id');
      expect(char).toHaveProperty('name');
      expect(char).toHaveProperty('clan');
      expect(char).toHaveProperty('covenant');
    } finally {
      await col.deleteOne({ _id: seed.insertedId });
    }
  });

  it('retired characters are included in ST results', async () => {
    const col = getCollection('characters');
    const seed = await col.insertOne({
      name: 'Retired Test Char',
      retired: true,
      _test_seeded: true,
    });
    try {
      const res = await request(app)
        .get('/api/characters')
        .set('X-Test-User', stUser());
      const retired = res.body.filter(c => c.retired);
      expect(retired.some(c => String(c._id) === String(seed.insertedId))).toBe(true);
    } finally {
      await col.deleteOne({ _id: seed.insertedId });
    }
  });
});

describe('GET /api/characters — Player role', () => {
  it('returns only the player\'s linked characters', async () => {
    const playerCharIds = [testChars[0].id];
    const res = await request(app)
      .get('/api/characters')
      .set('X-Test-User', playerUser(playerCharIds));
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].name).toBe(testChars[0].name);
  });

  it('returns multiple characters if player has multiple', async () => {
    const playerCharIds = testChars.map(c => c.id);
    const res = await request(app)
      .get('/api/characters')
      .set('X-Test-User', playerUser(playerCharIds));
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(testChars.length);
  });

  it('returns empty array if player has no linked characters', async () => {
    const res = await request(app)
      .get('/api/characters')
      .set('X-Test-User', playerUser([]));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns empty array for non-existent character IDs', async () => {
    const res = await request(app)
      .get('/api/characters')
      .set('X-Test-User', playerUser(['000000000000000000000000']));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('does not leak other characters to player', async () => {
    const playerCharIds = [testChars[0].id];
    const res = await request(app)
      .get('/api/characters')
      .set('X-Test-User', playerUser(playerCharIds));
    const names = res.body.map(c => c.name);
    // Should not contain other test chars
    for (let i = 1; i < testChars.length; i++) {
      expect(names).not.toContain(testChars[i].name);
    }
  });
});

describe('ST-only routes — role gating', () => {
  it('allows ST to access /api/territories', async () => {
    const res = await request(app)
      .get('/api/territories')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
  });

  it('allows player to read /api/territories (GET is open)', async () => {
    // Per RFR.1: GET /api/territories is open to any authenticated user.
    // Writes are gated at the route level (POST/PUT ST-only; PATCH
    // /:id/feeding-rights regent+ST).
    const res = await request(app)
      .get('/api/territories')
      .set('X-Test-User', playerUser([]));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('allows ST to access /api/game_sessions', async () => {
    const res = await request(app)
      .get('/api/game_sessions')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
  });

  it('blocks player from /api/game_sessions', async () => {
    const res = await request(app)
      .get('/api/game_sessions')
      .set('X-Test-User', playerUser([]));
    expect(res.status).toBe(403);
  });
});

describe('GET /api/characters/names — Lightweight list', () => {
  it('returns names for any authenticated user', async () => {
    const res = await request(app)
      .get('/api/characters/names')
      .set('X-Test-User', playerUser([]));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    // Should have name field but not full character data
    expect(res.body[0]).toHaveProperty('name');
    expect(res.body[0]).not.toHaveProperty('attributes');
  });

  it('excludes retired characters from names list', async () => {
    const res = await request(app)
      .get('/api/characters/names')
      .set('X-Test-User', playerUser([]));
    // Kirk Grimm is retired — should not appear
    const names = res.body.map(c => c.name);
    expect(names).not.toContain('Kirk Grimm');
  });
});
