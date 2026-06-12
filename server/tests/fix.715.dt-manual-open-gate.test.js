/**
 * Server tests for fix #715 — manual_open override ignored by PUT deadline gate.
 *
 * Root cause: PUT /api/downtime_submissions/:id checks deadline_at < now
 * without consulting cycle.manual_open, returning 403 DEADLINE_PASSED even
 * when the ST has manually opened the cycle.
 *
 * Fix: !cycle?.manual_open && prefix on the deadline condition (downtime.js:755).
 *
 * AC-2: player PUT succeeds when manual_open=true and deadline has passed
 * AC-3: player PUT blocked (403) when manual_open=false and deadline has passed
 * AC-4: player PUT succeeds when deadline is in the future (regression)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { ObjectId } from 'mongodb';
import { createTestApp, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;
const cycleIds = [];
const subIds   = [];

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
});

afterAll(async () => {
  if (cycleIds.length) await getCollection('downtime_cycles').deleteMany({ _id: { $in: cycleIds } });
  if (subIds.length)   await getCollection('downtime_submissions').deleteMany({ _id: { $in: subIds } });
  await teardownDb();
});

async function insertCycle(overrides = {}) {
  const col = getCollection('downtime_cycles');
  const doc = { game_number: 715, label: 'Fix 715 Test Cycle', status: 'active', ...overrides };
  const { insertedId } = await col.insertOne(doc);
  cycleIds.push(insertedId);
  return insertedId;
}

async function insertSub(cycleId, charId, overrides = {}) {
  const col = getCollection('downtime_submissions');
  const doc = {
    cycle_id: cycleId,
    character_id: charId,
    character_name: 'Fix715 Char',
    status: 'draft',
    responses: {},
    ...overrides,
  };
  const { insertedId } = await col.insertOne(doc);
  subIds.push(insertedId);
  return insertedId;
}

const PAST_DEADLINE   = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
const FUTURE_DEADLINE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('fix.715: manual_open bypass on PUT deadline gate', () => {

  it('AC-2: player PUT succeeds when manual_open=true and deadline has passed', async () => {
    const charId  = new ObjectId();
    const cycleId = await insertCycle({ manual_open: true, deadline_at: PAST_DEADLINE });
    const subId   = await insertSub(cycleId, charId);

    const res = await request(app)
      .put(`/api/downtime_submissions/${subId}`)
      .set('X-Test-User', playerUser([charId.toString()]))
      .send({ responses: { travel: 'Updated via override' } });

    expect(res.status).toBe(200);
  });

  it('AC-3: player PUT blocked with 403 when manual_open=false and deadline has passed', async () => {
    const charId  = new ObjectId();
    const cycleId = await insertCycle({ manual_open: false, deadline_at: PAST_DEADLINE });
    const subId   = await insertSub(cycleId, charId);

    const res = await request(app)
      .put(`/api/downtime_submissions/${subId}`)
      .set('X-Test-User', playerUser([charId.toString()]))
      .send({ responses: { travel: 'Should be blocked' } });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('DEADLINE_PASSED');
  });

  it('AC-4 regression: player PUT succeeds when deadline is in the future (no manual_open needed)', async () => {
    const charId  = new ObjectId();
    const cycleId = await insertCycle({ manual_open: false, deadline_at: FUTURE_DEADLINE });
    const subId   = await insertSub(cycleId, charId);

    const res = await request(app)
      .put(`/api/downtime_submissions/${subId}`)
      .set('X-Test-User', playerUser([charId.toString()]))
      .send({ responses: { travel: 'Still open' } });

    expect(res.status).toBe(200);
  });

  it('manual_open=true with no deadline_at set — PUT succeeds (no regression)', async () => {
    const charId  = new ObjectId();
    const cycleId = await insertCycle({ manual_open: true, deadline_at: null });
    const subId   = await insertSub(cycleId, charId);

    const res = await request(app)
      .put(`/api/downtime_submissions/${subId}`)
      .set('X-Test-User', playerUser([charId.toString()]))
      .send({ responses: { travel: 'No deadline set' } });

    expect(res.status).toBe(200);
  });

  it('ST can always PUT regardless of manual_open or deadline', async () => {
    const charId  = new ObjectId();
    const cycleId = await insertCycle({ manual_open: false, deadline_at: PAST_DEADLINE });
    const subId   = await insertSub(cycleId, charId);

    const { stUser } = await import('./helpers/test-app.js');
    const res = await request(app)
      .put(`/api/downtime_submissions/${subId}`)
      .set('X-Test-User', stUser())
      .send({ responses: { travel: 'ST override' } });

    expect(res.status).toBe(200);
  });

});
