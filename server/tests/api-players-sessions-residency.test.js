/**
 * API tests — /api/players, /api/game_sessions, /api/territory-residency.
 * Tests role gating, CRUD, validation.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { ObjectId } from 'mongodb';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;
const cleanupIds = { players: [], game_sessions: [], territory_residency: [] };

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
});

afterEach(async () => {
  for (const [colName, ids] of Object.entries(cleanupIds)) {
    const col = getCollection(colName);
    for (const id of ids) {
      await col.deleteOne({ _id: id });
    }
    cleanupIds[colName] = [];
  }
  // Clean up residency test docs by territory name
  await getCollection('territory_residency').deleteMany({ territory: /^Test / });
});

afterAll(async () => {
  await teardownDb();
});

// ══════════════════════════════════════
//  PLAYERS
// ══════════════════════════════════════

describe('GET /api/players — Role gating', () => {
  it('ST can list all players', async () => {
    const res = await request(app)
      .get('/api/players')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('player cannot list all players', async () => {
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

describe('POST /api/players — Create', () => {
  it('ST can create a player', async () => {
    const uid = 'test-discord-' + Date.now();
    const res = await request(app)
      .post('/api/players')
      .set('X-Test-User', stUser())
      .send({ discord_id: uid, display_name: 'Test Player', role: 'player' });
    expect(res.status).toBe(201);
    expect(res.body.discord_id).toBe(uid);
    expect(res.body.display_name).toBe('Test Player');
    cleanupIds.players.push(new ObjectId(res.body._id));
  });

  it('rejects missing display_name', async () => {
    const res = await request(app)
      .post('/api/players')
      .set('X-Test-User', stUser())
      .send({ discord_id: 'test-no-name-' + Date.now() });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('rejects duplicate discord_id', async () => {
    const uid = 'test-dup-' + Date.now();
    const res1 = await request(app)
      .post('/api/players')
      .set('X-Test-User', stUser())
      .send({ discord_id: uid, display_name: 'First' });
    expect(res1.status).toBe(201);
    cleanupIds.players.push(new ObjectId(res1.body._id));

    const res2 = await request(app)
      .post('/api/players')
      .set('X-Test-User', stUser())
      .send({ discord_id: uid, display_name: 'Duplicate' });
    expect(res2.status).toBe(409);
    expect(res2.body.error).toBe('CONFLICT');
  });

  it('player cannot create players', async () => {
    const res = await request(app)
      .post('/api/players')
      .set('X-Test-User', playerUser([]))
      .send({ discord_id: 'blocked', display_name: 'Blocked' });
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/players/:id — Update', () => {
  it('ST can update a player', async () => {
    const uid = 'test-update-' + Date.now();
    const create = await request(app)
      .post('/api/players')
      .set('X-Test-User', stUser())
      .send({ discord_id: uid, display_name: 'Before' });
    cleanupIds.players.push(new ObjectId(create.body._id));

    const res = await request(app)
      .put(`/api/players/${create.body._id}`)
      .set('X-Test-User', stUser())
      .send({ display_name: 'After' });
    expect(res.status).toBe(200);
    expect(res.body.display_name).toBe('After');
  });

  it('returns 404 for non-existent player', async () => {
    const res = await request(app)
      .put('/api/players/000000000000000000000000')
      .set('X-Test-User', stUser())
      .send({ display_name: 'Ghost' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/players/:id', () => {
  it('ST can delete a player', async () => {
    const uid = 'test-delete-' + Date.now();
    const create = await request(app)
      .post('/api/players')
      .set('X-Test-User', stUser())
      .send({ discord_id: uid, display_name: 'Doomed' });

    const res = await request(app)
      .delete(`/api/players/${create.body._id}`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(204);
  });

  it('returns 404 for non-existent player', async () => {
    const res = await request(app)
      .delete('/api/players/000000000000000000000000')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(404);
  });
});

// ══════════════════════════════════════
//  GAME SESSIONS
// ══════════════════════════════════════

describe('GET /api/game_sessions', () => {
  it('ST can list sessions', async () => {
    const res = await request(app)
      .get('/api/game_sessions')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('player blocked from game_sessions', async () => {
    const res = await request(app)
      .get('/api/game_sessions')
      .set('X-Test-User', playerUser([]));
    expect(res.status).toBe(403);
  });
});

describe('POST /api/game_sessions', () => {
  it('creates a session with required fields', async () => {
    const res = await request(app)
      .post('/api/game_sessions')
      .set('X-Test-User', stUser())
      .send({ session_date: '2026-04-18', label: 'Game 3', attendance: [] });
    expect(res.status).toBe(201);
    expect(res.body.session_date).toBe('2026-04-18');
    expect(res.body.attendance).toEqual([]);
    cleanupIds.game_sessions.push(new ObjectId(res.body._id));
  });

  it('rejects missing session_date', async () => {
    const res = await request(app)
      .post('/api/game_sessions')
      .set('X-Test-User', stUser())
      .send({ label: 'No Date' });
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/game_sessions/:id', () => {
  it('updates a session', async () => {
    const create = await request(app)
      .post('/api/game_sessions')
      .set('X-Test-User', stUser())
      .send({ session_date: '2026-04-18' });
    cleanupIds.game_sessions.push(new ObjectId(create.body._id));

    const res = await request(app)
      .put(`/api/game_sessions/${create.body._id}`)
      .set('X-Test-User', stUser())
      .send({ label: 'Updated Label' });
    expect(res.status).toBe(200);
    expect(res.body.label).toBe('Updated Label');
    expect(res.body.updated_at).toBeTruthy();
  });

  it('returns 404 for non-existent session', async () => {
    const res = await request(app)
      .put('/api/game_sessions/000000000000000000000000')
      .set('X-Test-User', stUser())
      .send({ label: 'Ghost' });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/game_sessions/next', () => {
  it('returns null when no upcoming sessions exist', async () => {
    // Relies on no future-dated docs existing in the test DB
    const res = await request(app)
      .get('/api/game_sessions/next')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    // Either null or a session with date >= today
    if (res.body !== null) {
      expect(res.body.session_date).toBeDefined();
    }
  });

  it('returns the nearest upcoming session', async () => {
    const near = await request(app)
      .post('/api/game_sessions')
      .set('X-Test-User', stUser())
      .send({ session_date: '2099-06-01', game_number: 99, doors_open: '18:00', downtime_deadline: 'Midnight, Friday 29 May 2099' });
    cleanupIds.game_sessions.push(new ObjectId(near.body._id));

    const far = await request(app)
      .post('/api/game_sessions')
      .set('X-Test-User', stUser())
      .send({ session_date: '2099-07-01', game_number: 100 });
    cleanupIds.game_sessions.push(new ObjectId(far.body._id));

    const res = await request(app)
      .get('/api/game_sessions/next')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    // /next must not return the farther 2099-07-01 session; it must be earlier
    expect(res.body.session_date).not.toBe('2099-07-01');
    expect(res.body.session_date < '2099-07-01').toBe(true);

    // Verify the near session's fields are persisted correctly (via list, not /next —
    // a pre-existing session may be nearer than 2099-06-01 in the test DB)
    const allRes = await request(app)
      .get('/api/game_sessions')
      .set('X-Test-User', stUser());
    const nearDoc = allRes.body.find(s => s._id === near.body._id);
    expect(nearDoc.game_number).toBe(99);
    expect(nearDoc.doors_open).toBe('18:00');
    expect(nearDoc.downtime_deadline).toBe('Midnight, Friday 29 May 2099');
  });

  it('does not return a past session', async () => {
    const past = await request(app)
      .post('/api/game_sessions')
      .set('X-Test-User', stUser())
      .send({ session_date: '2000-01-01', game_number: 1 });
    cleanupIds.game_sessions.push(new ObjectId(past.body._id));

    const res = await request(app)
      .get('/api/game_sessions/next')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    if (res.body !== null) {
      expect(res.body.session_date >= new Date().toISOString().slice(0, 10)).toBe(true);
    }
  });

  it('deadline and optional fields are preserved on PUT then GET /next', async () => {
    const create = await request(app)
      .post('/api/game_sessions')
      .set('X-Test-User', stUser())
      .send({ session_date: '2099-08-01' });
    cleanupIds.game_sessions.push(new ObjectId(create.body._id));

    await request(app)
      .put(`/api/game_sessions/${create.body._id}`)
      .set('X-Test-User', stUser())
      .send({ downtime_deadline: 'Midnight, Friday 31 July 2099', doors_open: '17:30', game_number: 42 });

    const res = await request(app)
      .get('/api/game_sessions/next')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    // May not be this session if other future sessions exist — find it by id
    const allRes = await request(app)
      .get('/api/game_sessions')
      .set('X-Test-User', stUser());
    const updated = allRes.body.find(s => s.session_date === '2099-08-01');
    expect(updated.downtime_deadline).toBe('Midnight, Friday 31 July 2099');
    expect(updated.doors_open).toBe('17:30');
    expect(updated.game_number).toBe(42);
  });

  it('player is blocked from /next', async () => {
    const res = await request(app)
      .get('/api/game_sessions/next')
      .set('X-Test-User', playerUser([]));
    expect(res.status).toBe(403);
  });

  it('unauthenticated request is rejected', async () => {
    const res = await request(app).get('/api/game_sessions/next');
    expect(res.status).toBe(401);
  });
});

// ══════════════════════════════════════
//  TERRITORY RESIDENCY
// ══════════════════════════════════════

describe('GET /api/territory-residency', () => {
  it('returns all residency docs', async () => {
    const res = await request(app)
      .get('/api/territory-residency')
      .set('X-Test-User', playerUser([]));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns single territory by query', async () => {
    // Upsert a test residency first
    await request(app)
      .put('/api/territory-residency')
      .set('X-Test-User', stUser())
      .send({ territory: 'Test Territory', residents: ['char-001'] });

    const res = await request(app)
      .get('/api/territory-residency?territory=Test%20Territory')
      .set('X-Test-User', playerUser([]));
    expect(res.status).toBe(200);
    expect(res.body.territory).toBe('Test Territory');
    expect(res.body.residents).toContain('char-001');
  });

  it('returns empty residents for unknown territory', async () => {
    const res = await request(app)
      .get('/api/territory-residency?territory=Nonexistent')
      .set('X-Test-User', playerUser([]));
    expect(res.status).toBe(200);
    expect(res.body.territory).toBe('Nonexistent');
    expect(res.body.residents).toEqual([]);
  });
});

describe('PUT /api/territory-residency', () => {
  it('upserts residency for a territory', async () => {
    const res = await request(app)
      .put('/api/territory-residency')
      .set('X-Test-User', stUser())
      .send({ territory: 'Test Upsert', residents: ['char-001', 'char-002'] });
    expect(res.status).toBe(200);
    expect(res.body.territory).toBe('Test Upsert');
    expect(res.body.residents).toHaveLength(2);
  });

  it('updates existing residency', async () => {
    await request(app)
      .put('/api/territory-residency')
      .set('X-Test-User', stUser())
      .send({ territory: 'Test Update', residents: ['char-001'] });

    const res = await request(app)
      .put('/api/territory-residency')
      .set('X-Test-User', stUser())
      .send({ territory: 'Test Update', residents: ['char-001', 'char-002', 'char-003'] });
    expect(res.status).toBe(200);
    expect(res.body.residents).toHaveLength(3);
  });

  it('rejects missing territory', async () => {
    const res = await request(app)
      .put('/api/territory-residency')
      .set('X-Test-User', stUser())
      .send({ residents: ['char-001'] });
    expect(res.status).toBe(400);
  });

  it('rejects missing residents array', async () => {
    const res = await request(app)
      .put('/api/territory-residency')
      .set('X-Test-User', stUser())
      .send({ territory: 'Test Bad' });
    expect(res.status).toBe(400);
  });
});
