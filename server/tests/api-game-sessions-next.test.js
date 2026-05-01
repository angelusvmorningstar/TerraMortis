/**
 * API tests — /api/game_sessions/next cycle deadline merge
 *
 * Covers spec next-session-deadline-fix:
 *   - Cycle in 'game' status merges deadline_at into response
 *   - Cycle in 'prep' status merges deadline_at into response
 *   - Cycle in 'closed' status does not merge
 *   - Session with own downtime_deadline string overrides cycle
 *   - No live cycle returns session as-is with no deadline
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { createTestApp, stUser } from './helpers/test-app.js';
import { setupDb } from './helpers/db-setup.js';
import { getCollection, getDb } from '../db.js';

let app;
const sessionIds = [];
const cycleIds = [];

async function seedSession(overrides = {}) {
  const col = getCollection('game_sessions');
  const doc = {
    session_date: '2099-12-31',
    game_number: 99,
    attendance: [],
    ...overrides,
  };
  const r = await col.insertOne(doc);
  sessionIds.push(r.insertedId);
  return r.insertedId;
}

async function seedCycle(overrides = {}) {
  const col = getCollection('downtime_cycles');
  const doc = {
    game_number: 99,
    status: 'game',
    deadline_at: '2099-12-25T13:00:00.000Z',
    ...overrides,
  };
  const r = await col.insertOne(doc);
  cycleIds.push(r.insertedId);
  return r.insertedId;
}

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
});

// Defensive: /next picks the soonest session_date >= today, so any leaked
// future-dated session in tm_suite_test would silently shadow our seeded one.
// Sweep all future sessions and live cycles before each test. Vitest runs
// files serially (singleFork), so this only clears stale leaks.
//
// Hard guard: refuse to sweep if MONGODB_DB ever resolves to anything other
// than tm_suite_test. setup-env.js forces this, but a destructive deleteMany
// against a misconfigured connection would be catastrophic — defence in depth.
beforeEach(async () => {
  const dbName = getDb().databaseName;
  if (dbName !== 'tm_suite_test') {
    throw new Error(`Refusing to sweep '${dbName}' — tests must run against tm_suite_test`);
  }
  const today = new Date().toISOString().slice(0, 10);
  await getCollection('game_sessions').deleteMany({ session_date: { $gte: today } });
  await getCollection('downtime_cycles').deleteMany({
    status: { $in: ['prep', 'game', 'active', 'open'] },
  });
});

afterEach(async () => {
  if (sessionIds.length) {
    await getCollection('game_sessions').deleteMany({ _id: { $in: sessionIds } });
    sessionIds.length = 0;
  }
  if (cycleIds.length) {
    await getCollection('downtime_cycles').deleteMany({ _id: { $in: cycleIds } });
    cycleIds.length = 0;
  }
});

afterAll(async () => {
  // Belt-and-braces — afterEach should have cleared these.
  if (sessionIds.length) {
    await getCollection('game_sessions').deleteMany({ _id: { $in: sessionIds } });
  }
  if (cycleIds.length) {
    await getCollection('downtime_cycles').deleteMany({ _id: { $in: cycleIds } });
  }
});

describe('GET /api/game_sessions/next — cycle deadline merge', () => {
  it("merges cycle.deadline_at when cycle status is 'game'", async () => {
    await seedSession();
    await seedCycle({ status: 'game' });

    const res = await request(app)
      .get('/api/game_sessions/next')
      .set('X-Test-User', stUser());

    expect(res.status).toBe(200);
    expect(res.body.session_date).toBe('2099-12-31');
    expect(res.body.downtime_deadline).toBeDefined();
    expect(typeof res.body.downtime_deadline).toBe('string');
    expect(res.body.downtime_deadline).toMatch(/2099/);
  });

  it("merges cycle.deadline_at when cycle status is 'prep'", async () => {
    await seedSession();
    await seedCycle({ status: 'prep' });

    const res = await request(app)
      .get('/api/game_sessions/next')
      .set('X-Test-User', stUser());

    expect(res.status).toBe(200);
    expect(res.body.downtime_deadline).toBeDefined();
    expect(res.body.downtime_deadline).toMatch(/2099/);
  });

  it("does not merge when cycle is 'closed'", async () => {
    await seedSession();
    await seedCycle({ status: 'closed' });

    const res = await request(app)
      .get('/api/game_sessions/next')
      .set('X-Test-User', stUser());

    expect(res.status).toBe(200);
    expect(res.body.session_date).toBe('2099-12-31');
    expect(res.body.downtime_deadline).toBeUndefined();
  });

  it('session.downtime_deadline overrides cycle merge', async () => {
    const ownDeadline = 'Friday, 30 December 2099, 11:59 PM';
    await seedSession({ downtime_deadline: ownDeadline });
    await seedCycle({ status: 'game' });

    const res = await request(app)
      .get('/api/game_sessions/next')
      .set('X-Test-User', stUser());

    expect(res.status).toBe(200);
    expect(res.body.downtime_deadline).toBe(ownDeadline);
  });

  it('no cycle present — session returned without deadline', async () => {
    await seedSession();

    const res = await request(app)
      .get('/api/game_sessions/next')
      .set('X-Test-User', stUser());

    expect(res.status).toBe(200);
    expect(res.body.session_date).toBe('2099-12-31');
    expect(res.body.downtime_deadline).toBeUndefined();
  });
});
