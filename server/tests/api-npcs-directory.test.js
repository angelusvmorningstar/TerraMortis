/**
 * API tests — GET /api/npcs/directory  (NPCR.7 + NPCR.14 privacy scoping)
 *
 * Covers:
 * - Player sees only NPCs they have personally quick-added
 *   (created_by.type='player' AND created_by.player_id matches).
 * - ST / dev sees all active + pending NPCs, unfiltered.
 * - Player with zero quick-adds gets an empty array (not a 403 or error).
 * - Archived NPCs never appear (for either role).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;

const PLAYER_ONE = 'p-player-001';
const PLAYER_TWO = 'p-player-002';
const ST_PLAYER  = 'p-st-001';

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
});

beforeEach(async () => {
  // Clean slate for each test. Only touch seeded test NPCs.
  await getCollection('npcs').deleteMany({
    'created_by.player_id': { $in: [PLAYER_ONE, PLAYER_TWO, ST_PLAYER] },
  });
  await getCollection('npcs').deleteMany({ _test_marker: 'npcr-14' });
});

afterAll(async () => {
  await getCollection('npcs').deleteMany({
    'created_by.player_id': { $in: [PLAYER_ONE, PLAYER_TWO, ST_PLAYER] },
  });
  await getCollection('npcs').deleteMany({ _test_marker: 'npcr-14' });
  await teardownDb();
});

async function seed() {
  const col = getCollection('npcs');
  await col.insertMany([
    {
      _test_marker: 'npcr-14',
      name: 'Odeliese (ST-owned secret)',
      status: 'active',
      linked_character_ids: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      // ST-created NPC: no created_by, or created_by.type='st'
    },
    {
      _test_marker: 'npcr-14',
      name: 'Player One NPC A',
      status: 'pending',
      linked_character_ids: [],
      created_by: { type: 'player', player_id: PLAYER_ONE, character_id: 'char-A' },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      _test_marker: 'npcr-14',
      name: 'Player One NPC B',
      status: 'active',
      linked_character_ids: [],
      created_by: { type: 'player', player_id: PLAYER_ONE, character_id: 'char-A' },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      _test_marker: 'npcr-14',
      name: 'Player Two NPC',
      status: 'pending',
      linked_character_ids: [],
      created_by: { type: 'player', player_id: PLAYER_TWO, character_id: 'char-B' },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      _test_marker: 'npcr-14',
      name: 'Archived ST NPC (must never appear)',
      status: 'archived',
      linked_character_ids: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ]);
}

describe('GET /api/npcs/directory — NPCR-14 privacy scoping', () => {
  it('player sees only NPCs they personally quick-added', async () => {
    await seed();
    const res = await request(app)
      .get('/api/npcs/directory')
      .set('X-Test-User', playerUser([], { player_id: PLAYER_ONE }));
    expect(res.status).toBe(200);
    const names = res.body.map(n => n.name).sort();
    expect(names).toEqual(['Player One NPC A', 'Player One NPC B']);
    expect(names).not.toContain('Odeliese (ST-owned secret)');
    expect(names).not.toContain('Player Two NPC');
    expect(names).not.toContain('Archived ST NPC (must never appear)');
  });

  it('ST sees all active + pending NPCs, unfiltered', async () => {
    await seed();
    const res = await request(app)
      .get('/api/npcs/directory')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    const names = res.body.map(n => n.name);
    expect(names).toContain('Odeliese (ST-owned secret)');
    expect(names).toContain('Player One NPC A');
    expect(names).toContain('Player One NPC B');
    expect(names).toContain('Player Two NPC');
    // Archived NPCs are never returned regardless of role
    expect(names).not.toContain('Archived ST NPC (must never appear)');
  });

  it('returns an empty array for a player with no quick-adds', async () => {
    await seed();
    // Use a fresh player id that has no seeded NPCs
    const res = await request(app)
      .get('/api/npcs/directory')
      .set('X-Test-User', playerUser([], { player_id: 'p-player-fresh' }));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toEqual([]);
  });
});
