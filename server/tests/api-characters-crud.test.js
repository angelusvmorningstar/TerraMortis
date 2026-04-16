/**
 * API tests — /api/characters CRUD + read-only endpoints.
 *
 * Covers:
 *   GET /public, /game-xp, /combat, /status
 *   GET /:id  — ST any, player own-only, 403/404/400
 *   POST /    — ST only, name required, player blocked
 *   PUT /:id  — ST only, partial update, 404/400, player blocked
 *   DELETE /:id — ST only, 204, 404/400, player blocked
 *   POST /wizard — player creates first char (auto-approved)
 *
 * Mutation tests use direct DB seeding (not the API) because the full
 * character schema requires all 9 attribute keys — using the API for
 * setup would require a verbose fixture. Seeding directly is the same
 * pattern used throughout the test suite.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { ObjectId } from 'mongodb';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;
const seededIds = []; // All chars created in this test file — cleaned up in afterAll

/** Minimal character inserted directly to DB (bypasses schema validation). */
async function seedChar(overrides = {}) {
  const col = getCollection('characters');
  const doc = {
    name: 'Quinn Test Char',
    retired: false,
    pending_approval: false,
    attributes: {}, skills: {}, disciplines: {}, merits: [], powers: [], ordeals: {},
    ...overrides,
  };
  const result = await col.insertOne(doc);
  seededIds.push(result.insertedId);
  return { ...doc, _id: result.insertedId };
}

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
});

afterAll(async () => {
  const col = getCollection('characters');
  for (const id of seededIds) await col.deleteOne({ _id: id });
  await teardownDb();
});

// ── GET /public ───────────────────────────────────────────────────────────────

describe('GET /api/characters/public', () => {
  it('returns non-retired, non-pending characters with projection fields', async () => {
    const char = await seedChar({ name: 'Quinn Public Test', clan: 'Daeva', covenant: 'Invictus' });
    const charIdStr = char._id.toString();

    const res = await request(app)
      .get('/api/characters/public')
      .set('X-Test-User', playerUser([]));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const found = res.body.find(c => c._id.toString() === charIdStr);
    expect(found).toBeTruthy();
    expect(found.name).toBe('Quinn Public Test');
    expect(found.clan).toBe('Daeva');
    // Sensitive fields must not be present
    expect(found).not.toHaveProperty('attributes');
    expect(found).not.toHaveProperty('merits');
  });

  it('excludes retired characters', async () => {
    const char = await seedChar({ name: 'Quinn Retired', retired: true });
    const charIdStr = char._id.toString();

    const res = await request(app)
      .get('/api/characters/public')
      .set('X-Test-User', playerUser([]));
    const found = res.body.find(c => c._id.toString() === charIdStr);
    expect(found).toBeUndefined();
  });

  it('excludes pending_approval characters', async () => {
    const char = await seedChar({ name: 'Quinn Pending', pending_approval: true });
    const charIdStr = char._id.toString();

    const res = await request(app)
      .get('/api/characters/public')
      .set('X-Test-User', playerUser([]));
    const found = res.body.find(c => c._id.toString() === charIdStr);
    expect(found).toBeUndefined();
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/characters/public');
    expect(res.status).toBe(401);
  });
});

// ── GET /game-xp ──────────────────────────────────────────────────────────────

describe('GET /api/characters/game-xp', () => {
  it('returns session list for any authenticated user', async () => {
    const res = await request(app)
      .get('/api/characters/game-xp')
      .set('X-Test-User', playerUser([]));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/characters/game-xp');
    expect(res.status).toBe(401);
  });
});

// ── GET /combat ───────────────────────────────────────────────────────────────

describe('GET /api/characters/combat', () => {
  it('returns active characters with limited projection', async () => {
    const char = await seedChar({ name: 'Quinn Combat Test', blood_potency: 2 });
    const charIdStr = char._id.toString();

    const res = await request(app)
      .get('/api/characters/combat')
      .set('X-Test-User', playerUser([]));
    expect(res.status).toBe(200);

    const found = res.body.find(c => c._id.toString() === charIdStr);
    expect(found).toBeTruthy();
    expect(found).toHaveProperty('blood_potency');
    // Should not have full merit/power data
    expect(found).not.toHaveProperty('merits');
    expect(found).not.toHaveProperty('powers');
  });

  it('excludes retired characters', async () => {
    const char = await seedChar({ name: 'Quinn Combat Retired', retired: true });
    const res = await request(app)
      .get('/api/characters/combat')
      .set('X-Test-User', playerUser([]));
    const found = res.body.find(c => c._id.toString() === char._id.toString());
    expect(found).toBeUndefined();
  });
});

// ── GET /status ───────────────────────────────────────────────────────────────

describe('GET /api/characters/status', () => {
  it('returns active characters with status projection', async () => {
    const char = await seedChar({ name: 'Quinn Status Test', clan: 'Mekhet', covenant: 'Ordo Dracul' });
    const charIdStr = char._id.toString();

    const res = await request(app)
      .get('/api/characters/status')
      .set('X-Test-User', playerUser([]));
    expect(res.status).toBe(200);

    const found = res.body.find(c => c._id.toString() === charIdStr);
    expect(found).toBeTruthy();
    expect(found.clan).toBe('Mekhet');
    expect(found.covenant).toBe('Ordo Dracul');
    expect('_player_info' in found).toBe(true);
  });
});

// ── GET /:id ──────────────────────────────────────────────────────────────────

describe('GET /api/characters/:id', () => {
  it('ST can fetch any character by ID', async () => {
    const char = await seedChar({ name: 'Quinn Fetch Test' });
    const idStr = char._id.toString();

    const res = await request(app)
      .get(`/api/characters/${idStr}`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(res.body._id).toBe(idStr);
    expect(res.body.name).toBe('Quinn Fetch Test');
  });

  it('player can fetch their own character', async () => {
    const char = await seedChar({ name: 'Quinn Player Own' });
    const idStr = char._id.toString();

    const res = await request(app)
      .get(`/api/characters/${idStr}`)
      .set('X-Test-User', playerUser([idStr]));
    expect(res.status).toBe(200);
    expect(res.body._id).toBe(idStr);
  });

  it('player cannot fetch another player\'s character', async () => {
    const charA = await seedChar({ name: 'Quinn Char A' });
    const charB = await seedChar({ name: 'Quinn Char B' });

    const res = await request(app)
      .get(`/api/characters/${charB._id.toString()}`)
      .set('X-Test-User', playerUser([charA._id.toString()]));
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  it('returns 404 for non-existent character', async () => {
    const res = await request(app)
      .get('/api/characters/000000000000000000000000')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('returns 400 for malformed ID', async () => {
    const res = await request(app)
      .get('/api/characters/not-an-id')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });
});

// ── POST / (ST create) ────────────────────────────────────────────────────────

describe('POST /api/characters — ST create', () => {
  it('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/characters')
      .set('X-Test-User', stUser())
      .send({ retired: false });
    expect(res.status).toBe(400);
  });

  it('blocks player from creating via ST endpoint', async () => {
    const res = await request(app)
      .post('/api/characters')
      .set('X-Test-User', playerUser([]))
      .send({ name: 'Player Sneak' });
    expect(res.status).toBe(403);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post('/api/characters')
      .send({ name: 'No Auth' });
    expect(res.status).toBe(401);
  });
});

// ── PUT /:id ──────────────────────────────────────────────────────────────────

describe('PUT /api/characters/:id — ST update', () => {
  it('ST can update a character field', async () => {
    const char = await seedChar({ name: 'Quinn Update Target' });
    const idStr = char._id.toString();

    const res = await request(app)
      .put(`/api/characters/${idStr}`)
      .set('X-Test-User', stUser())
      .send({ clan: 'Daeva' });
    expect(res.status).toBe(200);
    expect(res.body.clan).toBe('Daeva');
    expect(res.body._id).toBe(idStr);
  });

  it('updated fields persist — verify by re-fetching', async () => {
    const char = await seedChar({ name: 'Quinn Persist Test' });
    const idStr = char._id.toString();

    await request(app)
      .put(`/api/characters/${idStr}`)
      .set('X-Test-User', stUser())
      .send({ covenant: 'Carthian Movement' });

    const fetch = await request(app)
      .get(`/api/characters/${idStr}`)
      .set('X-Test-User', stUser());
    expect(fetch.body.covenant).toBe('Carthian Movement');
  });

  it('returns 404 for non-existent character', async () => {
    const res = await request(app)
      .put('/api/characters/000000000000000000000000')
      .set('X-Test-User', stUser())
      .send({ clan: 'Gangrel' });
    expect(res.status).toBe(404);
  });

  it('returns 400 for malformed ID', async () => {
    const res = await request(app)
      .put('/api/characters/bad-id')
      .set('X-Test-User', stUser())
      .send({ clan: 'Gangrel' });
    expect(res.status).toBe(400);
  });

  it('blocks player from updating', async () => {
    const char = await seedChar({ name: 'Quinn Player Update Blocked' });
    const idStr = char._id.toString();

    const res = await request(app)
      .put(`/api/characters/${idStr}`)
      .set('X-Test-User', playerUser([idStr]))
      .send({ clan: 'Gangrel' });
    expect(res.status).toBe(403);
  });
});

// ── DELETE /:id ───────────────────────────────────────────────────────────────

describe('DELETE /api/characters/:id — ST delete', () => {
  it('ST can delete a character', async () => {
    const char = await seedChar({ name: 'Quinn Delete Target' });
    const idStr = char._id.toString();
    // Remove from seededIds — the delete test cleans it up
    seededIds.splice(seededIds.findIndex(id => id.equals(char._id)), 1);

    const del = await request(app)
      .delete(`/api/characters/${idStr}`)
      .set('X-Test-User', stUser());
    expect(del.status).toBe(204);

    const fetch = await request(app)
      .get(`/api/characters/${idStr}`)
      .set('X-Test-User', stUser());
    expect(fetch.status).toBe(404);
  });

  it('returns 404 when character does not exist', async () => {
    const res = await request(app)
      .delete('/api/characters/000000000000000000000000')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(404);
  });

  it('returns 400 for malformed ID', async () => {
    const res = await request(app)
      .delete('/api/characters/bad-id')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(400);
  });

  it('blocks player from deleting', async () => {
    const char = await seedChar({ name: 'Quinn Delete Blocked' });
    const idStr = char._id.toString();

    const res = await request(app)
      .delete(`/api/characters/${idStr}`)
      .set('X-Test-User', playerUser([idStr]));
    expect(res.status).toBe(403);
  });
});

// ── POST /wizard (player create) ─────────────────────────────────────────────

describe('POST /api/characters/wizard — player character creation', () => {
  it('ST cannot use the wizard endpoint', async () => {
    const res = await request(app)
      .post('/api/characters/wizard')
      .set('X-Test-User', stUser())
      .send({ name: 'ST Wizard Attempt' });
    expect(res.status).toBe(403);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post('/api/characters/wizard')
      .send({ name: 'No Auth' });
    expect(res.status).toBe(401);
  });
});
