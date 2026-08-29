/**
 * API tests — /api/history, the Ordeals retirement gate.
 *
 * 2026-08-29: requireOrdealNotRetiredForPlayers guarded POST only when the
 * Ordeals retirement flag shipped (2026-08-25) — an oversight found while
 * closing the identical gap on the sibling Downtime form. A player could
 * still edit or submit an EXISTING draft via PUT /:id (5 non-approved
 * history_responses were live and reachable this way when the gap was
 * found). This is the first HTTP-level coverage this route has ever had —
 * it was never mounted in the shared test app before this fix.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { ObjectId } from 'mongodb';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;
const PLAYER_ID = 'p-player-001'; // matches playerUser() default
const CHAR_OID = new ObjectId();
const CHAR_ID = CHAR_OID.toString();

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
});

afterEach(async () => {
  await getCollection('history_responses').deleteMany({ character_id: { $in: [CHAR_OID, CHAR_ID] } });
});

afterAll(async () => {
  await teardownDb();
});

describe('POST /api/history — Ordeals retired', () => {
  it('403s a player create — Ordeals retired, file on the sibling site', async () => {
    const res = await request(app)
      .post('/api/history')
      .set('X-Test-User', playerUser([CHAR_ID], { player_id: PLAYER_ID }))
      .send({ character_id: CHAR_ID, responses: {} });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('ORDEAL_RETIRED');
  });
});

describe('PUT /api/history/:id — Ordeals retired', () => {
  it('403s a player update — Ordeals retired, file on the sibling site', async () => {
    const created = await request(app)
      .post('/api/history')
      .set('X-Test-User', stUser({ player_id: PLAYER_ID }))
      .send({ character_id: CHAR_ID, responses: {} });
    expect(created.status).toBe(201);

    const res = await request(app)
      .put(`/api/history/${created.body._id}`)
      .set('X-Test-User', playerUser([CHAR_ID], { player_id: PLAYER_ID }))
      .send({ responses: { q1: 'still blocked' }, status: 'submitted' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('ORDEAL_RETIRED');
  });

  it('ST can still update (correcting a pre-cutover response)', async () => {
    const created = await request(app)
      .post('/api/history')
      .set('X-Test-User', stUser({ player_id: PLAYER_ID }))
      .send({ character_id: CHAR_ID, responses: {} });
    expect(created.status).toBe(201);

    const res = await request(app)
      .put(`/api/history/${created.body._id}`)
      .set('X-Test-User', stUser({ player_id: PLAYER_ID }))
      .send({ responses: { q1: 'ST correction' } });
    expect(res.status).toBe(200);
    expect(res.body.responses.q1).toBe('ST correction');
  });
});
