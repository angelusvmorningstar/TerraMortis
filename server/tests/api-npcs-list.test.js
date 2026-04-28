/**
 * API tests — GET /api/npcs  (NPCP-1 server-side scope)
 *
 * Covers:
 * - Player sees only NPCs whose `linked_character_ids` overlaps their
 *   `req.user.character_ids` (Mongo `$in` at query level, not post-fetch).
 * - Player with no characters gets an empty array (short-circuit, no error).
 * - ST sees all NPCs, unfiltered (existing behaviour preserved).
 * - dev (privacy-redacted ST) sees all NPCs, unfiltered (treated as ST).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;

const CHAR_PLAYER_ONE_A = 'char-p1-a';
const CHAR_PLAYER_ONE_B = 'char-p1-b';
const CHAR_PLAYER_TWO   = 'char-p2-a';

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
});

beforeEach(async () => {
  await getCollection('npcs').deleteMany({ _test_marker: 'npcp-1' });
});

afterAll(async () => {
  await getCollection('npcs').deleteMany({ _test_marker: 'npcp-1' });
  await teardownDb();
});

async function seed() {
  const col = getCollection('npcs');
  await col.insertMany([
    {
      _test_marker: 'npcp-1',
      name: 'NPC linked to Player One char A',
      status: 'active',
      linked_character_ids: [CHAR_PLAYER_ONE_A],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      _test_marker: 'npcp-1',
      name: 'NPC linked to Player One char B',
      status: 'pending',
      linked_character_ids: [CHAR_PLAYER_ONE_B],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      _test_marker: 'npcp-1',
      name: 'NPC linked to Player Two only',
      status: 'active',
      linked_character_ids: [CHAR_PLAYER_TWO],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      _test_marker: 'npcp-1',
      name: 'NPC with no character links (ST plot)',
      status: 'active',
      linked_character_ids: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      _test_marker: 'npcp-1',
      name: 'NPC linked to multiple players',
      status: 'active',
      linked_character_ids: [CHAR_PLAYER_ONE_A, CHAR_PLAYER_TWO],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ]);
}

describe('GET /api/npcs — NPCP-1 server-side scope', () => {
  it('player sees only NPCs whose linked_character_ids overlaps their characters', async () => {
    await seed();
    const res = await request(app)
      .get('/api/npcs')
      .set('X-Test-User', playerUser([CHAR_PLAYER_ONE_A, CHAR_PLAYER_ONE_B]));
    expect(res.status).toBe(200);
    const names = res.body.map(n => n.name).sort();
    expect(names).toEqual([
      'NPC linked to Player One char A',
      'NPC linked to Player One char B',
      'NPC linked to multiple players',
    ]);
    expect(names).not.toContain('NPC linked to Player Two only');
    expect(names).not.toContain('NPC with no character links (ST plot)');
  });

  it('player with no characters gets an empty array (no error)', async () => {
    await seed();
    const res = await request(app)
      .get('/api/npcs')
      .set('X-Test-User', playerUser([]));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toEqual([]);
  });

  it('ST sees all NPCs, unfiltered', async () => {
    await seed();
    const res = await request(app)
      .get('/api/npcs')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    const names = res.body.map(n => n.name);
    expect(names).toContain('NPC linked to Player One char A');
    expect(names).toContain('NPC linked to Player One char B');
    expect(names).toContain('NPC linked to Player Two only');
    expect(names).toContain('NPC with no character links (ST plot)');
    expect(names).toContain('NPC linked to multiple players');
  });

  it('dev (privacy-redacted ST) sees all NPCs, unfiltered', async () => {
    await seed();
    const res = await request(app)
      .get('/api/npcs')
      .set('X-Test-User', stUser({ role: 'dev' }));
    expect(res.status).toBe(200);
    const names = res.body.map(n => n.name);
    expect(names).toContain('NPC linked to Player One char A');
    expect(names).toContain('NPC linked to Player Two only');
    expect(names).toContain('NPC with no character links (ST plot)');
    expect(names).toContain('NPC linked to multiple players');
  });
});
