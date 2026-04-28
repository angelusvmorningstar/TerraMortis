/**
 * API tests — POST /api/npcs/quick-add  (NPCR.8)
 *
 * Covers:
 * - Happy path: 201 with status='pending' and player-typed created_by
 * - 400: missing name / missing character_id
 * - 403: character_id not in caller's character_ids
 * - 429: rate limit (two quick-adds within 30s)
 * - 429: cap (21st open pending NPC)
 * - Test-reset hook clears rate-limit state between test blocks
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { ObjectId } from 'mongodb';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';
import { _resetQuickAddRateLimit } from '../routes/npcs.js';

let app;
const CREATED_NPC_IDS = [];
const MY_CHAR = new ObjectId().toHexString();
const OTHER_CHAR = new ObjectId().toHexString();

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
});

beforeEach(async () => {
  _resetQuickAddRateLimit();
  // Clear player-created NPCs between tests so cap / rate-limit tests don't
  // poison each other. Only test data: the p-player-* player_ids are from
  // the test helper, not live accounts.
  await getCollection('npcs').deleteMany({
    'created_by.player_id': { $in: ['p-player-001', 'p-player-A', 'p-player-B'] },
  });
});

afterAll(async () => {
  const npcs = getCollection('npcs');
  for (const id of CREATED_NPC_IDS) await npcs.deleteOne({ _id: id });
  // Extra: clean up any that slipped through via direct inserts below
  await npcs.deleteMany({ 'created_by.player_id': 'p-player-001' });
  await teardownDb();
});

function body(overrides = {}) {
  return {
    name: 'Mrs Pemberton',
    relationship_note: 'Suspects me of something',
    general_note: 'Cranky old neighbour',
    character_id: MY_CHAR,
    ...overrides,
  };
}

// ── Happy path ──────────────────────────────────────────────────────────────

describe('POST /api/npcs/quick-add — happy path', () => {
  it('creates a pending NPC with player-typed created_by', async () => {
    const res = await request(app)
      .post('/api/npcs/quick-add')
      .set('X-Test-User', playerUser([MY_CHAR]))
      .send(body());

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Mrs Pemberton');
    expect(res.body.status).toBe('pending');
    expect(res.body.description).toBe('Cranky old neighbour');
    expect(res.body.notes).toBe('Suspects me of something');
    expect(res.body.created_by.type).toBe('player');
    expect(res.body.created_by.character_id).toBe(MY_CHAR);
    expect(res.body.linked_character_ids).toEqual([MY_CHAR]);
    CREATED_NPC_IDS.push(new ObjectId(res.body._id));
  });
});

// ── Validation ──────────────────────────────────────────────────────────────

describe('POST /api/npcs/quick-add — validation', () => {
  it('400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/npcs/quick-add')
      .set('X-Test-User', playerUser([MY_CHAR]))
      .send(body({ name: '' }));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/name/i);
  });

  it('400 when character_id is missing', async () => {
    const res = await request(app)
      .post('/api/npcs/quick-add')
      .set('X-Test-User', playerUser([MY_CHAR]))
      .send(body({ character_id: '' }));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/character_id/i);
  });
});

// ── Auth ────────────────────────────────────────────────────────────────────

describe('POST /api/npcs/quick-add — auth', () => {
  it('403 when character_id is not in character_ids', async () => {
    const res = await request(app)
      .post('/api/npcs/quick-add')
      .set('X-Test-User', playerUser([OTHER_CHAR])) // MY_CHAR missing
      .send(body());
    expect(res.status).toBe(403);
  });

  it('401 without auth', async () => {
    const res = await request(app).post('/api/npcs/quick-add').send(body());
    expect(res.status).toBe(401);
  });
});

// ── Rate limit ──────────────────────────────────────────────────────────────

describe('POST /api/npcs/quick-add — rate limit', () => {
  it('429 when two quick-adds happen within 30s', async () => {
    const r1 = await request(app)
      .post('/api/npcs/quick-add')
      .set('X-Test-User', playerUser([MY_CHAR]))
      .send(body({ name: 'Throttle A' }));
    expect(r1.status).toBe(201);
    CREATED_NPC_IDS.push(new ObjectId(r1.body._id));

    const r2 = await request(app)
      .post('/api/npcs/quick-add')
      .set('X-Test-User', playerUser([MY_CHAR]))
      .send(body({ name: 'Throttle B' }));
    expect(r2.status).toBe(429);
    expect(r2.body.error).toBe('RATE_LIMIT');
    expect(r2.body.retry_after_ms).toBeGreaterThan(0);
  });

  it('different players do not throttle each other', async () => {
    const r1 = await request(app)
      .post('/api/npcs/quick-add')
      .set('X-Test-User', playerUser([MY_CHAR], { player_id: 'p-player-A', id: 'dA' }))
      .send(body({ name: 'Player A NPC' }));
    expect(r1.status).toBe(201);
    CREATED_NPC_IDS.push(new ObjectId(r1.body._id));

    const r2 = await request(app)
      .post('/api/npcs/quick-add')
      .set('X-Test-User', playerUser([MY_CHAR], { player_id: 'p-player-B', id: 'dB' }))
      .send(body({ name: 'Player B NPC' }));
    // MY_CHAR is in both player's character_ids via the override — so auth passes.
    // Different player_id means independent rate limits.
    expect(r2.status).toBe(201);
    CREATED_NPC_IDS.push(new ObjectId(r2.body._id));
  });
});

// ── Cap ─────────────────────────────────────────────────────────────────────

describe('POST /api/npcs/quick-add — 20-cap', () => {
  it('429 when player already has 20 open pending NPCs', async () => {
    const npcs = getCollection('npcs');
    // Seed 20 pending NPCs for this player directly.
    const now = new Date().toISOString();
    const seedDocs = [];
    for (let i = 0; i < 20; i++) {
      seedDocs.push({
        name: `Cap Test ${i}`,
        description: '',
        notes: '',
        status: 'pending',
        linked_character_ids: [MY_CHAR],
        created_by: {
          type: 'player',
          player_id: 'p-player-001',
          character_id: MY_CHAR,
        },
        created_at: now,
        updated_at: now,
      });
    }
    const seedResult = await npcs.insertMany(seedDocs);
    Object.values(seedResult.insertedIds).forEach(id => CREATED_NPC_IDS.push(id));

    const res = await request(app)
      .post('/api/npcs/quick-add')
      .set('X-Test-User', playerUser([MY_CHAR]))
      .send(body({ name: 'Twenty-first' }));
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('RATE_LIMIT');
    expect(res.body.cap).toBe(20);
  });

  it('counts only pending NPCs toward the cap (active ones do not count)', async () => {
    const npcs = getCollection('npcs');
    const now = new Date().toISOString();
    // 15 pending + 30 active for this player
    const pendingDocs = Array.from({ length: 15 }, (_, i) => ({
      name: `Mixed Pending ${i}`, description: '', notes: '',
      status: 'pending', linked_character_ids: [MY_CHAR],
      created_by: { type: 'player', player_id: 'p-player-001', character_id: MY_CHAR },
      created_at: now, updated_at: now,
    }));
    const activeDocs = Array.from({ length: 30 }, (_, i) => ({
      name: `Mixed Active ${i}`, description: '', notes: '',
      status: 'active', linked_character_ids: [MY_CHAR],
      created_by: { type: 'player', player_id: 'p-player-001', character_id: MY_CHAR },
      created_at: now, updated_at: now,
    }));
    const r1 = await npcs.insertMany(pendingDocs);
    const r2 = await npcs.insertMany(activeDocs);
    Object.values(r1.insertedIds).forEach(id => CREATED_NPC_IDS.push(id));
    Object.values(r2.insertedIds).forEach(id => CREATED_NPC_IDS.push(id));

    const res = await request(app)
      .post('/api/npcs/quick-add')
      .set('X-Test-User', playerUser([MY_CHAR]))
      .send(body({ name: '16th Pending (allowed)' }));
    expect(res.status).toBe(201);
    CREATED_NPC_IDS.push(new ObjectId(res.body._id));
  });
});
