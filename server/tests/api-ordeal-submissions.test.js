/**
 * API tests — /api/ordeal_submissions endpoint.
 * Covers role gating, player stripping, and mark-complete cascade.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';
import { ObjectId } from 'mongodb';

let app;
let createdSubId;
let testCharId;

beforeAll(async () => {
  await setupDb();
  app = createTestApp();

  // Seed a character to attach submissions to
  const chars = getCollection('characters');
  const char = await chars.findOne({ retired: { $ne: true } }, { projection: { _id: 1 } });
  testCharId = char._id;
});

afterAll(async () => {
  await teardownDb();
});

afterEach(async () => {
  // Clean up any submissions created during tests
  if (createdSubId) {
    await getCollection('ordeal_submissions').deleteOne({ _id: new ObjectId(createdSubId) });
    createdSubId = null;
  }
});

// ── Auth ──────────────────────────────────────────────────────────────────────

describe('GET /api/ordeal_submissions — Auth', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/ordeal_submissions');
    expect(res.status).toBe(401);
  });

  it('blocks player from listing all submissions', async () => {
    const res = await request(app)
      .get('/api/ordeal_submissions')
      .set('X-Test-User', playerUser([testCharId.toString()]));
    expect(res.status).toBe(403);
  });

  it('ST can list all submissions', async () => {
    const res = await request(app)
      .get('/api/ordeal_submissions')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ── GET /mine ─────────────────────────────────────────────────────────────────

describe('GET /api/ordeal_submissions/mine', () => {
  it('player gets their own submissions (stripped)', async () => {
    const res = await request(app)
      .get('/api/ordeal_submissions/mine')
      .set('X-Test-User', playerUser([testCharId.toString()]));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Marking details stripped unless complete
    res.body.forEach(sub => {
      if (sub.marking && sub.marking.status !== 'complete') {
        expect(sub.marking.answers).toEqual([]);
        expect(sub.marking.overall_feedback).toBeNull();
      }
    });
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/ordeal_submissions/mine');
    expect(res.status).toBe(401);
  });
});

// ── PUT /:id — Mark Complete ──────────────────────────────────────────────────

describe('PUT /api/ordeal_submissions/:id — Mark Complete', () => {
  it('ST can mark a submission complete', async () => {
    // Seed a submission
    const col = getCollection('ordeal_submissions');
    const inserted = await col.insertOne({
      character_id: testCharId,
      player_id:    null,
      ordeal_type:  'lore_mastery',
      covenant:     null,
      submitted_at: new Date().toISOString(),
      source:       'google_form',
      responses:    [{ question: 'Q1', answer: 'A1' }],
      marking:      { status: 'unmarked', answers: [], overall_feedback: '', xp_awarded: null, marked_at: null },
    });
    createdSubId = inserted.insertedId.toString();

    const res = await request(app)
      .put(`/api/ordeal_submissions/${createdSubId}`)
      .set('X-Test-User', stUser())
      .send({ marking: { status: 'complete', answers: [], overall_feedback: 'Good work.' } });

    expect(res.status).toBe(200);
    expect(res.body.marking.status).toBe('complete');
    expect(res.body.marking.xp_awarded).toBe(3);
    expect(res.body.marking.marked_at).toBeTruthy();
  });

  it('marks complete cascades ordeal to character (player_id null fallback)', async () => {
    const col = getCollection('ordeal_submissions');
    const chars = getCollection('characters');

    // Ensure character has no existing lore ordeal
    await chars.updateOne({ _id: testCharId }, { $pull: { ordeals: { name: 'lore' } } });

    const inserted = await col.insertOne({
      character_id: testCharId,
      player_id:    null,
      ordeal_type:  'lore_mastery',
      submitted_at: new Date().toISOString(),
      source:       'google_form',
      responses:    [],
      marking:      { status: 'unmarked', answers: [], overall_feedback: '', xp_awarded: null, marked_at: null },
    });
    createdSubId = inserted.insertedId.toString();

    await request(app)
      .put(`/api/ordeal_submissions/${createdSubId}`)
      .set('X-Test-User', stUser())
      .send({ marking: { status: 'complete', answers: [], overall_feedback: '' } });

    const char = await chars.findOne({ _id: testCharId });
    const ordeal = (char.ordeals || []).find(o => o.name === 'lore');
    expect(ordeal).toBeTruthy();
    expect(ordeal.complete).toBe(true);
  });

  it('returns 404 for non-existent submission', async () => {
    const fakeId = new ObjectId().toString();
    const res = await request(app)
      .put(`/api/ordeal_submissions/${fakeId}`)
      .set('X-Test-User', stUser())
      .send({ marking: { status: 'in_progress' } });
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid ID', async () => {
    const res = await request(app)
      .put('/api/ordeal_submissions/not-an-id')
      .set('X-Test-User', stUser())
      .send({ marking: { status: 'complete' } });
    expect(res.status).toBe(400);
  });

  it('blocks player from updating submissions', async () => {
    const col = getCollection('ordeal_submissions');
    const inserted = await col.insertOne({
      character_id: testCharId,
      player_id:    null,
      ordeal_type:  'rules_mastery',
      submitted_at: new Date().toISOString(),
      source:       'google_form',
      responses:    [],
      marking:      { status: 'unmarked', answers: [] },
    });
    createdSubId = inserted.insertedId.toString();

    const res = await request(app)
      .put(`/api/ordeal_submissions/${createdSubId}`)
      .set('X-Test-User', playerUser([testCharId.toString()]))
      .send({ marking: { status: 'complete' } });
    expect(res.status).toBe(403);
  });
});
