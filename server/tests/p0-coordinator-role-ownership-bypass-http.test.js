/**
 * P0 (High severity) — 2026-09-01 general audit, security-auth dimension.
 * Real HTTP-level regression coverage (companion to the static source-scan
 * suite, p0-coordinator-role-ownership-bypass.test.js) proving a live
 * coordinator-role account can no longer read/write another player's
 * private data across the five originally-flagged routes, plus two more
 * found while implementing the fix (characters.js's GET /:id, and the
 * shared requireOrdealNotRetiredForPlayers middleware used by
 * history.js/questionnaire.js/ordeal-responses.js).
 *
 * Where a route wires BOTH a retirement gate and an ownership check (the
 * Downtime form and the Ordeals-adjacent routes are both globally retired
 * for non-ST writes), the now-fixed retirement gate fires first and the
 * coordinator never reaches the ownership check at all — that's still a
 * correct, complete block, just via a different one of this session's own
 * fixes. Each test below asserts whichever gate actually fires, and says
 * so in its own name.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { ObjectId } from 'mongodb';
import { createTestApp, stUser, playerUser, coordinatorUser } from './helpers/test-app.js';
import { setupDb, teardownDb, getTestCharacterIds } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;
let testChars; // two real (or seeded) test characters — [0] is "the coordinator's own", [1] is "someone else's"
const cleanup = { downtime: [], history: [], questionnaire: [], ordeal: [], session: null };

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
  testChars = await getTestCharacterIds(2);
});

afterEach(async () => {
  for (const id of cleanup.downtime) await getCollection('downtime_submissions').deleteOne({ _id: id });
  for (const id of cleanup.history) await getCollection('history_responses').deleteOne({ _id: id });
  for (const id of cleanup.questionnaire) await getCollection('questionnaire_responses').deleteOne({ _id: id });
  for (const id of cleanup.ordeal) await getCollection('ordeal_responses').deleteOne({ _id: id });
  cleanup.downtime = []; cleanup.history = []; cleanup.questionnaire = []; cleanup.ordeal = [];
});

afterAll(async () => {
  if (cleanup.session) await getCollection('game_sessions').deleteOne({ _id: cleanup.session });
  await teardownDb();
});

// A coordinator with no characters of their own — the default shape a real
// coordinator account has (character_ids: [] per test-app.js's factory).
const COORD = coordinatorUser();
const OTHER_CHAR = () => testChars[1].id;

describe('P0 — GET /api/downtime_submissions: coordinator is scoped to their own character_ids, not the full unfiltered collection', () => {
  it('a coordinator sees no submissions belonging to someone else\'s character', async () => {
    const col = getCollection('downtime_submissions');
    const { insertedId } = await col.insertOne({
      character_id: new ObjectId(OTHER_CHAR()),
      chapter_id: null,
      status: 'draft',
      responses: {},
      st_review: { outcome_text: 'PRIVATE ST NOTES' },
    });
    cleanup.downtime.push(insertedId);

    const res = await request(app).get('/api/downtime_submissions').set('X-Test-User', COORD);
    expect(res.status).toBe(200);
    const leaked = res.body.find(s => String(s._id) === String(insertedId));
    expect(leaked).toBeUndefined();
  });
});

describe('P0 — PUT /api/downtime_submissions/:id: a coordinator is blocked (via the now-fixed FORM_RETIRED gate, since Downtime is globally retired)', () => {
  it('403 FORM_RETIRED, not a silent pass-through to the ownership check', async () => {
    const col = getCollection('downtime_submissions');
    const { insertedId } = await col.insertOne({
      character_id: new ObjectId(OTHER_CHAR()), chapter_id: null, status: 'draft', responses: {},
    });
    cleanup.downtime.push(insertedId);

    const res = await request(app)
      .put(`/api/downtime_submissions/${insertedId}`)
      .set('X-Test-User', COORD)
      .send({ responses: { travel: 'coordinator should not be able to write this' } });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORM_RETIRED');
  });
});

describe('P0 — GET /api/history: coordinator ownership scoping', () => {
  it('a coordinator cannot read another character\'s history response', async () => {
    const created = await request(app)
      .post('/api/history')
      .set('X-Test-User', stUser({ player_id: 'p-other-001' }))
      .send({ character_id: OTHER_CHAR(), responses: { q1: 'private history answer' } });
    expect(created.status).toBe(201);
    cleanup.history.push(new ObjectId(created.body._id));

    const res = await request(app)
      .get(`/api/history?character_id=${OTHER_CHAR()}`)
      .set('X-Test-User', COORD);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });
});

describe('P0 — PUT /api/history/:id: a coordinator is blocked (via the now-fixed ORDEAL_RETIRED gate, shared middleware)', () => {
  it('403 ORDEAL_RETIRED, not a silent pass-through to the ownership check', async () => {
    const created = await request(app)
      .post('/api/history')
      .set('X-Test-User', stUser({ player_id: 'p-other-002' }))
      .send({ character_id: OTHER_CHAR(), responses: {} });
    expect(created.status).toBe(201);
    cleanup.history.push(new ObjectId(created.body._id));

    const res = await request(app)
      .put(`/api/history/${created.body._id}`)
      .set('X-Test-User', COORD)
      .send({ responses: { q1: 'coordinator should not be able to write this' } });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('ORDEAL_RETIRED');
  });
});

describe('P0 — GET /api/questionnaire: coordinator ownership scoping', () => {
  it('a coordinator cannot read another character\'s questionnaire response', async () => {
    const created = await request(app)
      .post('/api/questionnaire')
      .set('X-Test-User', stUser({ player_id: 'p-other-003' }))
      .send({ character_id: OTHER_CHAR(), responses: { q1: 'private questionnaire answer' } });
    expect(created.status).toBe(201);
    cleanup.questionnaire.push(new ObjectId(created.body._id));

    const res = await request(app)
      .get(`/api/questionnaire?character_id=${OTHER_CHAR()}`)
      .set('X-Test-User', COORD);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });
});

describe('P0 — PUT /api/ordeal-responses/:id: a coordinator is blocked (via the now-fixed ORDEAL_RETIRED gate, shared middleware)', () => {
  it('403 ORDEAL_RETIRED, not a silent pass-through to the ownership check', async () => {
    const created = await request(app)
      .post('/api/ordeal-responses')
      .set('X-Test-User', stUser({ player_id: 'p-other-004' }))
      .send({ type: 'rules', responses: {} });
    expect(created.status).toBe(201);
    cleanup.ordeal.push(new ObjectId(created.body._id));

    const res = await request(app)
      .put(`/api/ordeal-responses/${created.body._id}`)
      .set('X-Test-User', COORD)
      .send({ responses: { q1: 'coordinator should not be able to write this' }, status: 'submitted' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('ORDEAL_RETIRED');
  });
});

describe('P0 — DELETE /api/game_sessions/:id: coordinator can no longer delete a game session', () => {
  it('403s a coordinator despite passing the router-level requireRole(\'coordinator\') mount gate', async () => {
    const col = getCollection('game_sessions');
    const { insertedId } = await col.insertOne({
      game_number: 999001, session_date: '2026-09-01', attendance: [],
    });
    cleanup.session = insertedId;

    const res = await request(app)
      .delete(`/api/game_sessions/${insertedId}`)
      .set('X-Test-User', COORD);
    expect(res.status).toBe(403);

    // Prove it wasn't actually deleted (belt and braces, not just trusting the status code).
    const stillThere = await col.findOne({ _id: insertedId });
    expect(stillThere).not.toBeNull();
  });

  it('an ST can still delete (regression guard — the fix must not have broken the legitimate path)', async () => {
    const col = getCollection('game_sessions');
    const { insertedId } = await col.insertOne({
      game_number: 999002, session_date: '2026-09-01', attendance: [],
    });
    const res = await request(app)
      .delete(`/api/game_sessions/${insertedId}`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    const gone = await col.findOne({ _id: insertedId });
    expect(gone).toBeNull();
  });
});

describe('P0 — GET /api/characters/:id: coordinator ownership scoping', () => {
  it('a coordinator cannot read a character sheet that isn\'t their own', async () => {
    const res = await request(app)
      .get(`/api/characters/${OTHER_CHAR()}`)
      .set('X-Test-User', COORD);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  it('a coordinator CAN still read their own character (regression guard)', async () => {
    const ownChar = testChars[0].id;
    const ownCoord = coordinatorUser({ character_ids: [ownChar] });
    const res = await request(app)
      .get(`/api/characters/${ownChar}`)
      .set('X-Test-User', ownCoord);
    expect(res.status).toBe(200);
    expect(String(res.body._id)).toBe(String(ownChar));
  });

  it('an ST can still read any character (regression guard)', async () => {
    const res = await request(app)
      .get(`/api/characters/${OTHER_CHAR()}`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
  });
});
