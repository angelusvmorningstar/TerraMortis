/**
 * API tests — /api/players
 *
 * Covers:
 *   GET  /me        — any authenticated user, returns own player doc
 *   PUT  /me        — self-update contact fields only, strips non-editable fields
 *   GET  /          — ST only, lists all players
 *   GET  /:id       — ST only, 404/400/403
 *   POST /          — ST only, requires display_name, deduplicates discord_id/username
 *   PUT  /:id       — ST only, partial update, 404/400
 *   DELETE /:id     — ST only, 204, 404/400
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';
import { ObjectId } from 'mongodb';

let app;
let testPlayerId;      // ObjectId of a seeded player for /me tests
let testPlayerIdStr;   // string version

beforeAll(async () => {
  await setupDb();
  app = createTestApp();

  // Seed one player record so /me and /:id tests have a real document to hit
  const col = getCollection('players');
  const result = await col.insertOne({
    display_name: 'Quinn Test Player',
    discord_id: null,
    discord_username: 'quinn_test_player',
    role: 'player',
    character_ids: [],
    ordeals: {},
    created_at: new Date().toISOString(),
    last_login: null,
  });
  testPlayerId    = result.insertedId;
  testPlayerIdStr = testPlayerId.toString();
});

afterEach(async () => {
  // Clean up discord_id/username collision docs from conflict tests
  const col = getCollection('players');
  await col.deleteMany({ discord_id: 'dup_discord_999' });
  await col.deleteMany({ discord_username: { $in: ['dup_username_quinn', 'dup_a', 'dup_b', 'quinn_new_001', 'quinn_default_role', 'quinn_update_target', 'quinn_delete_target'] } });
});

afterAll(async () => {
  const col = getCollection('players');
  // Remove seeded test player and any stragglers from individual tests
  await col.deleteOne({ _id: testPlayerId });
  await col.deleteMany({ display_name: { $regex: /^(New Quinn|Default Role Quinn|Quinn Update|Quinn Delete)/ } });
  await teardownDb();
});

// ── GET /me ───────────────────────────────────────────────────────────────────

describe('GET /api/players/me', () => {
  it('returns the player doc for the current user', async () => {
    const res = await request(app)
      .get('/api/players/me')
      .set('X-Test-User', playerUser([], { player_id: testPlayerIdStr }));
    expect(res.status).toBe(200);
    expect(res.body.display_name).toBe('Quinn Test Player');
  });

  it('returns 404 when player_id does not match any record', async () => {
    const res = await request(app)
      .get('/api/players/me')
      .set('X-Test-User', playerUser([], { player_id: '000000000000000000000000' }));
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/players/me');
    expect(res.status).toBe(401);
  });
});

// ── PUT /me ───────────────────────────────────────────────────────────────────

describe('PUT /api/players/me', () => {
  it('player can update their own contact fields', async () => {
    const res = await request(app)
      .put('/api/players/me')
      .set('X-Test-User', playerUser([], { player_id: testPlayerIdStr }))
      .send({ email: 'quinn@test.com', mobile: '0400000000' });
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('quinn@test.com');
    expect(res.body.mobile).toBe('0400000000');
  });

  it('non-editable fields are stripped silently', async () => {
    const res = await request(app)
      .put('/api/players/me')
      .set('X-Test-User', playerUser([], { player_id: testPlayerIdStr }))
      .send({ email: 'safe@test.com', role: 'st', discord_id: '999' });
    expect(res.status).toBe(200);
    // role must not have been changed
    expect(res.body.role).toBe('player');
    expect(res.body.discord_id).toBeNull();
  });

  it('returns 400 when no editable fields are provided', async () => {
    const res = await request(app)
      .put('/api/players/me')
      .set('X-Test-User', playerUser([], { player_id: testPlayerIdStr }))
      .send({ role: 'st' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when player_id is not a valid ObjectId', async () => {
    const res = await request(app)
      .put('/api/players/me')
      .set('X-Test-User', playerUser([], { player_id: 'bad-id' }))
      .send({ email: 'x@x.com' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });
});

// ── GET / ─────────────────────────────────────────────────────────────────────

describe('GET /api/players', () => {
  it('ST can list all players', async () => {
    const res = await request(app)
      .get('/api/players')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('player is blocked', async () => {
    const res = await request(app)
      .get('/api/players')
      .set('X-Test-User', playerUser([]));
    expect(res.status).toBe(403);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/players');
    expect(res.status).toBe(401);
  });
});

// ── GET /:id ──────────────────────────────────────────────────────────────────

describe('GET /api/players/:id', () => {
  it('ST can fetch a player by ID', async () => {
    const res = await request(app)
      .get(`/api/players/${testPlayerIdStr}`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(res.body.display_name).toBe('Quinn Test Player');
  });

  it('returns 404 for non-existent player', async () => {
    const res = await request(app)
      .get('/api/players/000000000000000000000000')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('returns 400 for malformed ID', async () => {
    const res = await request(app)
      .get('/api/players/not-an-id')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('player is blocked from fetching by ID', async () => {
    const res = await request(app)
      .get(`/api/players/${testPlayerIdStr}`)
      .set('X-Test-User', playerUser([]));
    expect(res.status).toBe(403);
  });
});

// ── POST / ────────────────────────────────────────────────────────────────────

describe('POST /api/players', () => {
  it('ST can create a player', async () => {
    const res = await request(app)
      .post('/api/players')
      .set('X-Test-User', stUser())
      .send({ display_name: 'New Quinn Player', discord_username: 'quinn_new_001' });
    expect(res.status).toBe(201);
    expect(res.body.display_name).toBe('New Quinn Player');
    expect(res.body._id).toBeTruthy();
  });

  it('created player defaults to player role', async () => {
    const res = await request(app)
      .post('/api/players')
      .set('X-Test-User', stUser())
      .send({ display_name: 'Default Role Quinn', discord_username: 'quinn_default_role' });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('player');
  });

  it('returns 400 when display_name is missing', async () => {
    const res = await request(app)
      .post('/api/players')
      .set('X-Test-User', stUser())
      .send({ discord_id: '12345' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('returns 409 when discord_id already exists', async () => {
    // First player
    await request(app)
      .post('/api/players')
      .set('X-Test-User', stUser())
      .send({ display_name: 'Dup Discord A', discord_id: 'dup_discord_999', discord_username: 'dup_a' });

    // Second player with same discord_id
    const res = await request(app)
      .post('/api/players')
      .set('X-Test-User', stUser())
      .send({ display_name: 'Dup Discord B', discord_id: 'dup_discord_999', discord_username: 'dup_b' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('CONFLICT');
  });

  it('returns 409 when discord_username already exists', async () => {
    await request(app)
      .post('/api/players')
      .set('X-Test-User', stUser())
      .send({ display_name: 'Dup Username A', discord_username: 'dup_username_quinn' });

    const res = await request(app)
      .post('/api/players')
      .set('X-Test-User', stUser())
      .send({ display_name: 'Dup Username B', discord_username: 'dup_username_quinn' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('CONFLICT');
  });

  it('player cannot create another player', async () => {
    const res = await request(app)
      .post('/api/players')
      .set('X-Test-User', playerUser([]))
      .send({ display_name: 'Player Sneak' });
    expect(res.status).toBe(403);
  });
});

// ── PUT /:id ──────────────────────────────────────────────────────────────────

describe('PUT /api/players/:id', () => {
  it('ST can update a player', async () => {
    const create = await request(app)
      .post('/api/players')
      .set('X-Test-User', stUser())
      .send({ display_name: 'Quinn Update Target', discord_username: 'quinn_update_target' });
    const id = create.body._id;

    const update = await request(app)
      .put(`/api/players/${id}`)
      .set('X-Test-User', stUser())
      .send({ display_name: 'Quinn Updated Name' });
    expect(update.status).toBe(200);
    expect(update.body.display_name).toBe('Quinn Updated Name');
  });

  it('returns 404 for non-existent player', async () => {
    const res = await request(app)
      .put('/api/players/000000000000000000000000')
      .set('X-Test-User', stUser())
      .send({ display_name: 'Ghost' });
    expect(res.status).toBe(404);
  });

  it('returns 400 for malformed ID', async () => {
    const res = await request(app)
      .put('/api/players/bad-id')
      .set('X-Test-User', stUser())
      .send({ display_name: 'Bad ID' });
    expect(res.status).toBe(400);
  });

  it('player is blocked from updating another player', async () => {
    const res = await request(app)
      .put(`/api/players/${testPlayerIdStr}`)
      .set('X-Test-User', playerUser([]))
      .send({ display_name: 'Hijacked' });
    expect(res.status).toBe(403);
  });
});

// ── DELETE /:id ───────────────────────────────────────────────────────────────

describe('DELETE /api/players/:id', () => {
  it('ST can delete a player', async () => {
    const create = await request(app)
      .post('/api/players')
      .set('X-Test-User', stUser())
      .send({ display_name: 'Quinn Delete Target', discord_username: 'quinn_delete_target' });
    const id = create.body._id;

    const del = await request(app)
      .delete(`/api/players/${id}`)
      .set('X-Test-User', stUser());
    expect(del.status).toBe(204);

    const fetch = await request(app)
      .get(`/api/players/${id}`)
      .set('X-Test-User', stUser());
    expect(fetch.status).toBe(404);
  });

  it('returns 404 for non-existent player', async () => {
    const res = await request(app)
      .delete('/api/players/000000000000000000000000')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(404);
  });

  it('returns 400 for malformed ID', async () => {
    const res = await request(app)
      .delete('/api/players/bad-id')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(400);
  });

  it('player is blocked from deleting', async () => {
    const res = await request(app)
      .delete(`/api/players/${testPlayerIdStr}`)
      .set('X-Test-User', playerUser([]));
    expect(res.status).toBe(403);
  });
});
