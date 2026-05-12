/**
 * API tests — GET /api/downtime_submissions/hold-flags (issue #257 perf batch).
 *
 * The endpoint collapses the prior N-character client-side loop into a
 * single round-trip. Validates auth-scoped cohorts (ST sees all, player
 * sees own), the two derivation paths (`_has_minimum` boolean vs
 * `status` fallback), and edge cases (missing submission, invalid cycle).
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { ObjectId } from 'mongodb';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;

const CHAR_A = new ObjectId().toHexString();
const CHAR_B = new ObjectId().toHexString();
const CHAR_C = new ObjectId().toHexString();
const OTHER_PLAYER_CHAR = new ObjectId().toHexString();

let insertedCycleIds = [];
let insertedSubmissionIds = [];

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
});

afterEach(async () => {
  const cycleCol = getCollection('downtime_cycles');
  const subCol   = getCollection('downtime_submissions');
  for (const id of insertedCycleIds) await cycleCol.deleteOne({ _id: id });
  for (const id of insertedSubmissionIds) await subCol.deleteOne({ _id: id });
  insertedCycleIds = [];
  insertedSubmissionIds = [];
});

afterAll(async () => {
  await teardownDb();
});

async function insertCycle(overrides = {}) {
  const col = getCollection('downtime_cycles');
  const doc = { label: 'Test Cycle', status: 'active', ...overrides };
  const result = await col.insertOne(doc);
  insertedCycleIds.push(result.insertedId);
  return { ...doc, _id: result.insertedId };
}

async function insertSubmission(cycleId, characterId, overrides = {}) {
  const col = getCollection('downtime_submissions');
  const doc = {
    cycle_id: cycleId,
    character_id: characterId,
    status: 'draft',
    responses: {},
    ...overrides,
  };
  const result = await col.insertOne(doc);
  insertedSubmissionIds.push(result.insertedId);
  return { ...doc, _id: result.insertedId };
}

describe('GET /api/downtime_submissions/hold-flags', () => {
  it('returns 400 when cycle_id is missing', async () => {
    const res = await request(app)
      .get('/api/downtime_submissions/hold-flags')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when cycle_id is malformed', async () => {
    const res = await request(app)
      .get('/api/downtime_submissions/hold-flags?cycle_id=not-an-objectid')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('returns an empty map when no submissions exist for the cycle', async () => {
    const cycle = await insertCycle();
    const res = await request(app)
      .get(`/api/downtime_submissions/hold-flags?cycle_id=${cycle._id}`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });

  it('ST sees all characters; honours _has_minimum boolean when present', async () => {
    const cycle = await insertCycle();
    await insertSubmission(cycle._id, CHAR_A, {
      responses: { _has_minimum: true },
      status: 'draft',
    });
    await insertSubmission(cycle._id, CHAR_B, {
      responses: { _has_minimum: false },
      status: 'draft',
    });
    const res = await request(app)
      .get(`/api/downtime_submissions/hold-flags?cycle_id=${cycle._id}`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(res.body[CHAR_A]).toBe(false); // _has_minimum=true → NOT on hold
    expect(res.body[CHAR_B]).toBe(true);  // _has_minimum=false → on hold
  });

  it('falls back to status when _has_minimum is absent: submitted → not on hold, draft → on hold', async () => {
    const cycle = await insertCycle();
    await insertSubmission(cycle._id, CHAR_A, { responses: {}, status: 'submitted' });
    await insertSubmission(cycle._id, CHAR_B, { responses: {}, status: 'draft' });
    const res = await request(app)
      .get(`/api/downtime_submissions/hold-flags?cycle_id=${cycle._id}`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(res.body[CHAR_A]).toBe(false);
    expect(res.body[CHAR_B]).toBe(true);
  });

  it('player sees only entries for their own characters', async () => {
    const cycle = await insertCycle();
    await insertSubmission(cycle._id, CHAR_A, { responses: { _has_minimum: true } });
    await insertSubmission(cycle._id, CHAR_B, { responses: { _has_minimum: false } });
    await insertSubmission(cycle._id, OTHER_PLAYER_CHAR, { responses: { _has_minimum: false } });

    const res = await request(app)
      .get(`/api/downtime_submissions/hold-flags?cycle_id=${cycle._id}`)
      .set('X-Test-User', playerUser([CHAR_A, CHAR_B]));
    expect(res.status).toBe(200);
    expect(res.body[CHAR_A]).toBe(false);
    expect(res.body[CHAR_B]).toBe(true);
    expect(res.body[OTHER_PLAYER_CHAR]).toBeUndefined();
  });

  it('omits characters that have no submission for the cycle (client defaults absent → true)', async () => {
    const cycle = await insertCycle();
    await insertSubmission(cycle._id, CHAR_A, { responses: { _has_minimum: true } });
    // CHAR_B intentionally has no submission

    const res = await request(app)
      .get(`/api/downtime_submissions/hold-flags?cycle_id=${cycle._id}`)
      .set('X-Test-User', playerUser([CHAR_A, CHAR_B]));
    expect(res.status).toBe(200);
    expect(res.body[CHAR_A]).toBe(false);
    expect(CHAR_B in res.body).toBe(false);
  });

  it('honours legacy string-stored cycle_id (CSV-imported submissions)', async () => {
    const cycle = await insertCycle();
    // Submission stored with cycle_id as string (CSV-import shape)
    await insertSubmission(String(cycle._id), CHAR_A, { responses: { _has_minimum: false } });

    const res = await request(app)
      .get(`/api/downtime_submissions/hold-flags?cycle_id=${cycle._id}`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(res.body[CHAR_A]).toBe(true);
  });

  it('returns 401 when no auth header is supplied', async () => {
    const cycle = await insertCycle();
    const res = await request(app)
      .get(`/api/downtime_submissions/hold-flags?cycle_id=${cycle._id}`);
    expect(res.status).toBe(401);
  });
});
