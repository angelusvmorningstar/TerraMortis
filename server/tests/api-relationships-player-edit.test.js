/**
 * API tests — player PUT /api/relationships/:id  (NPCR.9)
 *
 * Covers the player-writable PUT branch:
 * - Happy path: player edits own edge (created_by_char_id in character_ids),
 *   state/disposition/custom_label updated, history row appended
 * - 403: edge not owned (created_by_char_id missing or not caller's char)
 * - 403: edge status != active
 * - Whitelist: non-whitelist fields silently dropped with console.warn
 * - 400: state > 2000 chars
 * - ST PUT remains unrestricted (regression guard)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { ObjectId } from 'mongodb';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;
const CREATED_IDS = [];
const MY_CHAR = new ObjectId().toHexString();
const OTHER_CHAR = new ObjectId().toHexString();
const NPC_1 = new ObjectId().toHexString();

async function seedEdge(overrides = {}) {
  const col = getCollection('relationships');
  const now = new Date().toISOString();
  const doc = {
    a: { type: 'pc',  id: MY_CHAR },
    b: { type: 'npc', id: NPC_1 },
    kind: 'mentor',
    direction: 'a_to_b',
    state: 'initial state',
    st_hidden: false,
    status: 'active',
    created_by: { type: 'player', id: 'test-player-001' },
    created_by_char_id: MY_CHAR,
    history: [{ at: now, by: { type: 'player', id: 'test-player-001' }, change: 'created' }],
    created_at: now,
    updated_at: now,
    ...overrides,
  };
  const result = await col.insertOne(doc);
  CREATED_IDS.push(result.insertedId);
  return { ...doc, _id: result.insertedId };
}

function fullBody(edge, overrides = {}) {
  // Schema validation requires a, b, kind. Echo from edge + apply overrides.
  return {
    a: edge.a,
    b: edge.b,
    kind: edge.kind,
    direction: edge.direction,
    state: edge.state,
    st_hidden: !!edge.st_hidden,
    status: edge.status,
    ...overrides,
  };
}

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
});

afterAll(async () => {
  const col = getCollection('relationships');
  if (CREATED_IDS.length > 0) {
    await col.deleteMany({ _id: { $in: CREATED_IDS } });
  }
  await teardownDb();
});

// ── Happy path ──────────────────────────────────────────────────────────────

describe('PUT /api/relationships/:id — player happy path', () => {
  it('owner player can change state; history row appended with delta', async () => {
    const edge = await seedEdge();
    const res = await request(app)
      .put(`/api/relationships/${edge._id}`)
      .set('X-Test-User', playerUser([MY_CHAR]))
      .send(fullBody(edge, { state: 'updated by player' }));

    expect(res.status).toBe(200);
    expect(res.body.state).toBe('updated by player');
    // Original history had 1 entry; PUT should append one more.
    expect(res.body.history).toHaveLength(2);
    const last = res.body.history[1];
    expect(last.change).toBe('updated');
    const stateField = last.fields.find(f => f.name === 'state');
    expect(stateField).toBeDefined();
    expect(stateField.before).toBe('initial state');
    expect(stateField.after).toBe('updated by player');
  });

  it('owner player can set disposition', async () => {
    const edge = await seedEdge();
    const res = await request(app)
      .put(`/api/relationships/${edge._id}`)
      .set('X-Test-User', playerUser([MY_CHAR]))
      .send(fullBody(edge, { disposition: 'positive' }));

    expect(res.status).toBe(200);
    expect(res.body.disposition).toBe('positive');
  });

  it('owner player can edit custom_label when kind=other', async () => {
    const edge = await seedEdge({ kind: 'other', custom_label: 'original label' });
    const res = await request(app)
      .put(`/api/relationships/${edge._id}`)
      .set('X-Test-User', playerUser([MY_CHAR]))
      .send(fullBody(edge, { custom_label: 'renamed label' }));
    expect(res.status).toBe(200);
    expect(res.body.custom_label).toBe('renamed label');
  });
});

// ── 403 on not-owned ────────────────────────────────────────────────────────

describe('PUT /api/relationships/:id — player 403 on not-owned', () => {
  it('403 on edge with no created_by_char_id (ST-created)', async () => {
    const edge = await seedEdge({
      created_by: { type: 'st', id: 'test-st-001' },
      created_by_char_id: undefined,
    });
    // Undefined fields aren't inserted by Mongo — simulate properly
    await getCollection('relationships').updateOne(
      { _id: edge._id },
      { $unset: { created_by_char_id: '' } }
    );

    const res = await request(app)
      .put(`/api/relationships/${edge._id}`)
      .set('X-Test-User', playerUser([MY_CHAR]))
      .send(fullBody(edge, { state: 'attempted edit' }));
    expect(res.status).toBe(403);
  });

  it("403 on edge owned by another player's character", async () => {
    const edge = await seedEdge({
      a: { type: 'pc', id: OTHER_CHAR },
      created_by_char_id: OTHER_CHAR,
    });
    const res = await request(app)
      .put(`/api/relationships/${edge._id}`)
      .set('X-Test-User', playerUser([MY_CHAR])) // owns MY_CHAR not OTHER
      .send(fullBody(edge, { state: 'attempted edit' }));
    expect(res.status).toBe(403);
  });

  it('403 on edge with status != active', async () => {
    const edge = await seedEdge({ status: 'retired' });
    const res = await request(app)
      .put(`/api/relationships/${edge._id}`)
      .set('X-Test-User', playerUser([MY_CHAR]))
      .send(fullBody(edge, { state: 'edit retired' }));
    // Owned but not active → player-gate returns 403
    expect(res.status).toBe(403);
  });
});

// ── Whitelist ───────────────────────────────────────────────────────────────

describe('PUT /api/relationships/:id — player whitelist', () => {
  it('drops non-whitelist fields silently; whitelist fields still apply', async () => {
    const edge = await seedEdge({ st_hidden: false });
    const res = await request(app)
      .put(`/api/relationships/${edge._id}`)
      .set('X-Test-User', playerUser([MY_CHAR]))
      .send(fullBody(edge, {
        state: 'legit state change',
        st_hidden: true,   // should be ignored
        status: 'retired', // should be ignored
      }));

    expect(res.status).toBe(200);
    expect(res.body.state).toBe('legit state change');
    expect(res.body.st_hidden).toBe(false);   // unchanged
    expect(res.body.status).toBe('active');   // unchanged
    // History should only record the state field change.
    const last = res.body.history[res.body.history.length - 1];
    const fieldNames = (last.fields || []).map(f => f.name);
    expect(fieldNames).toContain('state');
    expect(fieldNames).not.toContain('st_hidden');
    expect(fieldNames).not.toContain('status');
  });

  it('drops attempts to change kind silently', async () => {
    const edge = await seedEdge({ kind: 'mentor' });
    const res = await request(app)
      .put(`/api/relationships/${edge._id}`)
      .set('X-Test-User', playerUser([MY_CHAR]))
      .send(fullBody(edge, { kind: 'enemy' }));
    expect(res.status).toBe(200);
    expect(res.body.kind).toBe('mentor');
  });
});

// ── State cap ───────────────────────────────────────────────────────────────

describe('PUT /api/relationships/:id — player state cap', () => {
  it('400 when state > 2000 chars', async () => {
    const edge = await seedEdge();
    const res = await request(app)
      .put(`/api/relationships/${edge._id}`)
      .set('X-Test-User', playerUser([MY_CHAR]))
      .send(fullBody(edge, { state: 'x'.repeat(2001) }));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/2000/);
  });

  it('accepts state at exactly 2000 chars', async () => {
    const edge = await seedEdge();
    const res = await request(app)
      .put(`/api/relationships/${edge._id}`)
      .set('X-Test-User', playerUser([MY_CHAR]))
      .send(fullBody(edge, { state: 'x'.repeat(2000) }));
    expect(res.status).toBe(200);
    expect(res.body.state).toHaveLength(2000);
  });
});

// ── ST unaffected ───────────────────────────────────────────────────────────

describe('PUT /api/relationships/:id — ST path unrestricted', () => {
  it('ST can change any field including on player-created edge', async () => {
    const edge = await seedEdge();
    const res = await request(app)
      .put(`/api/relationships/${edge._id}`)
      .set('X-Test-User', stUser())
      .send(fullBody(edge, {
        state: 'ST change',
        st_hidden: true,
        kind: 'enemy',
      }));
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('ST change');
    expect(res.body.st_hidden).toBe(true);
    expect(res.body.kind).toBe('enemy');
  });
});
