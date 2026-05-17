/**
 * API tests — /api/ordeal-responses endpoint.
 * Covers: auth gating, player-scoped reads, cross-player isolation,
 * draft/submit lifecycle, and ST approval cascade.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';
import { ObjectId } from 'mongodb';

let app;
let testCharId;
let testPlayerId;
const PLAYER_ID = 'p-player-001'; // must match playerUser() helper

// IDs of docs seeded in each test — cleaned up in afterEach
const cleanup = { responseId: null, playerSeeded: false };

beforeAll(async () => {
  await setupDb();
  app = createTestApp();

  // Seed a character to attach ordeal completions to
  const chars = getCollection('characters');
  const char = await chars.findOne({ retired: { $ne: true } }, { projection: { _id: 1 } });
  testCharId = char._id;
  testPlayerId = PLAYER_ID;
});

afterAll(async () => {
  // Remove any lingering player seeded by tests
  await getCollection('players').deleteMany({ _id: PLAYER_ID });
});

afterEach(async () => {
  if (cleanup.responseId) {
    await getCollection('ordeal_responses').deleteOne({ _id: new ObjectId(cleanup.responseId) });
    cleanup.responseId = null;
  }
  if (cleanup.playerSeeded) {
    await getCollection('players').deleteOne({ _id: PLAYER_ID });
    cleanup.playerSeeded = false;
    // Pull any ordeal added to character during cascade
    await getCollection('characters').updateOne(
      { _id: testCharId },
      { $pull: { ordeals: { name: { $in: ['rules', 'lore', 'covenant'] } } } }
    );
  }
});

// ── Auth ──────────────────────────────────────────────────────────────────────

describe('GET /api/ordeal-responses — Auth', () => {
  it('returns 401 without auth header', async () => {
    const res = await request(app).get('/api/ordeal-responses?type=rules');
    expect(res.status).toBe(401);
  });

  it('returns 400 for missing type param', async () => {
    const res = await request(app)
      .get('/api/ordeal-responses')
      .set('X-Test-User', playerUser([testCharId.toString()]));
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid type param', async () => {
    const res = await request(app)
      .get('/api/ordeal-responses?type=lore_mastery')
      .set('X-Test-User', playerUser([testCharId.toString()]));
    expect(res.status).toBe(400);
  });
});

// ── GET / — Player-scoped read ────────────────────────────────────────────────

describe('GET /api/ordeal-responses — player scoping', () => {
  it('returns null when player has no response', async () => {
    const res = await request(app)
      .get('/api/ordeal-responses?type=rules')
      .set('X-Test-User', playerUser([testCharId.toString()]));
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it('player cannot retrieve another player response via ?player_id=', async () => {
    // Seed a response for a different player
    const otherId = new ObjectId();
    const col = getCollection('ordeal_responses');
    await col.insertOne({
      player_id: otherId,
      ordeal_type: 'rules',
      status: 'draft',
      responses: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      submitted_at: null,
    });

    try {
      // Player passes ?player_id= of the other player — must be ignored
      const res = await request(app)
        .get(`/api/ordeal-responses?type=rules&player_id=${otherId.toString()}`)
        .set('X-Test-User', playerUser([testCharId.toString()]));

      expect(res.status).toBe(200);
      // Should return null (their own, which doesn't exist) not the other player's doc
      expect(res.body).toBeNull();
    } finally {
      await col.deleteOne({ player_id: otherId, ordeal_type: 'rules' });
    }
  });

  it('ST can retrieve another player response via ?player_id=', async () => {
    // Seed a response with a known ObjectId player_id
    const targetPlayerId = new ObjectId();
    const col = getCollection('ordeal_responses');
    const inserted = await col.insertOne({
      player_id: targetPlayerId,
      ordeal_type: 'lore',
      status: 'draft',
      responses: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      submitted_at: null,
    });

    try {
      const res = await request(app)
        .get(`/api/ordeal-responses?type=lore&player_id=${targetPlayerId.toString()}`)
        .set('X-Test-User', stUser());

      expect(res.status).toBe(200);
      expect(res.body).not.toBeNull();
      expect(res.body._id).toBe(inserted.insertedId.toString());
    } finally {
      await col.deleteOne({ _id: inserted.insertedId });
    }
  });
});

// ── GET /all — ST only ────────────────────────────────────────────────────────

describe('GET /api/ordeal-responses/all', () => {
  it('returns 403 for player', async () => {
    const res = await request(app)
      .get('/api/ordeal-responses/all')
      .set('X-Test-User', playerUser([testCharId.toString()]));
    expect(res.status).toBe(403);
  });

  it('ST can list all responses', async () => {
    const res = await request(app)
      .get('/api/ordeal-responses/all')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ── POST / — create draft ─────────────────────────────────────────────────────

describe('POST /api/ordeal-responses', () => {
  it('player can create a draft response', async () => {
    const res = await request(app)
      .post('/api/ordeal-responses')
      .set('X-Test-User', playerUser([testCharId.toString()]))
      .send({ type: 'rules', responses: { q1: 'answer one' } });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('draft');
    expect(res.body.ordeal_type).toBe('rules');
    cleanup.responseId = res.body._id;
  });

  it('returns 409 if response already exists for that type', async () => {
    // Create first
    const first = await request(app)
      .post('/api/ordeal-responses')
      .set('X-Test-User', playerUser([testCharId.toString()]))
      .send({ type: 'lore', responses: {} });
    expect(first.status).toBe(201);
    cleanup.responseId = first.body._id;

    // Try to create again
    const second = await request(app)
      .post('/api/ordeal-responses')
      .set('X-Test-User', playerUser([testCharId.toString()]))
      .send({ type: 'lore', responses: {} });
    expect(second.status).toBe(409);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post('/api/ordeal-responses')
      .send({ type: 'rules', responses: {} });
    expect(res.status).toBe(401);
  });
});

// ── PUT /:id — update and submit ──────────────────────────────────────────────

describe('PUT /api/ordeal-responses/:id', () => {
  it('player can update their own draft', async () => {
    const create = await request(app)
      .post('/api/ordeal-responses')
      .set('X-Test-User', playerUser([testCharId.toString()]))
      .send({ type: 'covenant', responses: { q1: 'old' } });
    cleanup.responseId = create.body._id;

    const res = await request(app)
      .put(`/api/ordeal-responses/${cleanup.responseId}`)
      .set('X-Test-User', playerUser([testCharId.toString()]))
      .send({ responses: { q1: 'updated' } });

    expect(res.status).toBe(200);
    expect(res.body.responses.q1).toBe('updated');
  });

  it('player can submit (status → submitted)', async () => {
    const create = await request(app)
      .post('/api/ordeal-responses')
      .set('X-Test-User', playerUser([testCharId.toString()]))
      .send({ type: 'rules', responses: { q1: 'my answer' } });
    cleanup.responseId = create.body._id;

    const res = await request(app)
      .put(`/api/ordeal-responses/${cleanup.responseId}`)
      .set('X-Test-User', playerUser([testCharId.toString()]))
      .send({ status: 'submitted' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('submitted');
    expect(res.body.submitted_at).toBeTruthy();
  });

  it('player cannot approve their own ordeal', async () => {
    const create = await request(app)
      .post('/api/ordeal-responses')
      .set('X-Test-User', playerUser([testCharId.toString()]))
      .send({ type: 'lore', responses: {} });
    cleanup.responseId = create.body._id;

    const res = await request(app)
      .put(`/api/ordeal-responses/${cleanup.responseId}`)
      .set('X-Test-User', playerUser([testCharId.toString()]))
      .send({ status: 'approved' });

    // Request succeeds (player can PUT) but approved status is not applied
    expect(res.status).toBe(200);
    expect(res.body.status).not.toBe('approved');
  });

  it('ST can approve a submitted ordeal', async () => {
    const create = await request(app)
      .post('/api/ordeal-responses')
      .set('X-Test-User', playerUser([testCharId.toString()]))
      .send({ type: 'rules', responses: {} });
    cleanup.responseId = create.body._id;

    const res = await request(app)
      .put(`/api/ordeal-responses/${cleanup.responseId}`)
      .set('X-Test-User', stUser())
      .send({ status: 'approved' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('approved');
    expect(res.body.approved_at).toBeTruthy();
  });

  it('player cannot edit another player response', async () => {
    // Seed a response owned by a different player
    const col = getCollection('ordeal_responses');
    const otherId = new ObjectId();
    const inserted = await col.insertOne({
      player_id: otherId,
      ordeal_type: 'lore',
      status: 'draft',
      responses: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      submitted_at: null,
    });

    try {
      const res = await request(app)
        .put(`/api/ordeal-responses/${inserted.insertedId.toString()}`)
        .set('X-Test-User', playerUser([testCharId.toString()]))
        .send({ responses: { q1: 'hack' } });

      expect(res.status).toBe(403);
    } finally {
      await col.deleteOne({ _id: inserted.insertedId });
    }
  });
});

// ── Approval cascade ──────────────────────────────────────────────────────────

describe('Approval cascade — ordeal XP to characters', () => {
  it('approving cascades ordeal completion to player characters', async () => {
    // Seed a player record with testCharId in character_ids
    const players = getCollection('players');
    const chars = getCollection('characters');

    // Insert player doc with _id matching playerUser's player_id
    await players.insertOne({
      _id: PLAYER_ID,
      discord_id: 'test-player-001',
      role: 'player',
      character_ids: [testCharId],
    });
    cleanup.playerSeeded = true;

    // Ensure character has no 'rules' ordeal
    await chars.updateOne({ _id: testCharId }, { $pull: { ordeals: { name: 'rules' } } });

    // Create and submit a rules response
    const create = await request(app)
      .post('/api/ordeal-responses')
      .set('X-Test-User', playerUser([testCharId.toString()]))
      .send({ type: 'rules', responses: {} });
    cleanup.responseId = create.body._id;

    // ST approves
    const approve = await request(app)
      .put(`/api/ordeal-responses/${cleanup.responseId}`)
      .set('X-Test-User', stUser())
      .send({ status: 'approved' });
    expect(approve.status).toBe(200);
    expect(approve.body.status).toBe('approved');

    // Confirm character has ordeals.rules complete
    const char = await chars.findOne({ _id: testCharId });
    const ordeal = (char.ordeals || []).find(o => o.name === 'rules');
    expect(ordeal).toBeTruthy();
    expect(ordeal.complete).toBe(true);
  });
});
