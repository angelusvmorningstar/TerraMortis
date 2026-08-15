/**
 * xpl.1 — live HTTP round-trip: PUT /api/characters/:id writes xp_ledger
 * rows for real trait-object XP deltas, GET /:id/xp_ledger reads them back,
 * and a name-only PUT produces no regression (zero rows, unchanged shape).
 *
 * DB-backed: skips wholesale when MongoDB is unreachable (isDbAvailable()),
 * matching this project's established pattern (db-setup.js). Runs against
 * tm_suite_test only.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb, isDbAvailable } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

const dbAvailable = await isDbAvailable();

describe.skipIf(!dbAvailable)('xpl.1 — xp_ledger write hook + read route', () => {
  let app;
  const CHAR_NAME = 'XPL-1 Round Trip Probe';
  let charId;

  beforeAll(async () => {
    await setupDb();
    app = createTestApp();
    await getCollection('characters').deleteMany({ name: { $regex: '^XPL-1 ' } });
    const res = await request(app).post('/api/characters').set('X-Test-User', stUser())
      .send({ name: CHAR_NAME });
    charId = res.body._id;
  });

  afterAll(async () => {
    await getCollection('characters').deleteMany({ name: { $regex: '^XPL-1 ' } });
    await getCollection('xp_ledger').deleteMany({ character_id: { $exists: true } });
    await teardownDb();
  });

  it('a real attribute-xp purchase produces exactly one ledger row with the correct delta', async () => {
    const res = await request(app).put('/api/characters/' + charId).set('X-Test-User', stUser())
      .send({ attributes: { Strength: { dots: 3, xp: 4, bonus: 0 } } });
    expect(res.status).toBe(200);

    const charDoc = await getCollection('characters').findOne({ name: CHAR_NAME });
    const ledgerRows = await getCollection('xp_ledger').find({ character_id: charDoc._id }).toArray();
    expect(ledgerRows).toHaveLength(1);
    expect(ledgerRows[0]).toMatchObject({
      category: 'attribute', trait_name: 'Strength', delta: 4, new_total: 4, st_username: 'test_st',
    });
    expect(ledgerRows[0].reason).toBeUndefined();
  });

  it('a further xp change on the same trait produces a row for the delta only, not the new total', async () => {
    const res = await request(app).put('/api/characters/' + charId).set('X-Test-User', stUser())
      .send({ attributes: { Strength: { dots: 3, xp: 6, bonus: 0 } } });
    expect(res.status).toBe(200);

    const charDoc = await getCollection('characters').findOne({ name: CHAR_NAME });
    const ledgerRows = await getCollection('xp_ledger').find({ character_id: charDoc._id }).sort({ _id: 1 }).toArray();
    expect(ledgerRows).toHaveLength(2);
    expect(ledgerRows[1]).toMatchObject({ category: 'attribute', trait_name: 'Strength', delta: 2, new_total: 6 });
  });

  it('a real delta with a reason persists the reason on the row', async () => {
    const res = await request(app).put('/api/characters/' + charId).set('X-Test-User', stUser())
      .send({
        merits: [{ category: 'general', name: 'Majesty', cp: 0, xp: 3 }],
        xp_ledger_reason: 'ST correction — downtime write silently failed',
      });
    expect(res.status).toBe(200);
    // xp_ledger_reason must never round-trip onto the character document itself.
    expect(res.body).not.toHaveProperty('xp_ledger_reason');

    const charDoc = await getCollection('characters').findOne({ name: CHAR_NAME });
    const row = await getCollection('xp_ledger').findOne({ character_id: charDoc._id, category: 'merit', trait_name: 'Majesty' });
    expect(row.delta).toBe(3);
    expect(row.reason).toBe('ST correction — downtime write silently failed');
  });

  it('a blank xp_ledger_reason on a real delta is rejected with 400', async () => {
    const res = await request(app).put('/api/characters/' + charId).set('X-Test-User', stUser())
      .send({ attributes: { Strength: { dots: 4, xp: 8, bonus: 0 } }, xp_ledger_reason: '   ' });
    expect(res.status).toBe(400);

    // Confirm the character document was NOT written either (validation runs before the write).
    const charDoc = await getCollection('characters').findOne({ name: CHAR_NAME });
    expect(charDoc.attributes.Strength.xp).toBe(6);
  });

  it('GET /:id/xp_ledger returns this character\'s rows, newest first', async () => {
    const res = await request(app).get('/api/characters/' + charId + '/xp_ledger').set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(3);
    const times = res.body.map(r => r.at);
    const sorted = [...times].sort().reverse();
    expect(times).toEqual(sorted);
  });

  it('GET /:id/xp_ledger is ST-only', async () => {
    const res = await request(app).get('/api/characters/' + charId + '/xp_ledger').set('X-Test-User', playerUser());
    expect(res.status).toBe(403);
  });

  it('AC7 — a name-only PUT produces zero ledger rows and no regression', async () => {
    const before = await getCollection('xp_ledger').countDocuments({});
    const res = await request(app).put('/api/characters/' + charId).set('X-Test-User', stUser())
      .send({ name: CHAR_NAME + ' Renamed' });
    expect(res.status).toBe(200);
    const after = await getCollection('xp_ledger').countDocuments({});
    expect(after).toBe(before);
    // restore the name for cleanup regex to keep matching
    await getCollection('characters').updateOne({ _id: (await getCollection('characters').findOne({ name: CHAR_NAME + ' Renamed' }))._id }, { $set: { name: CHAR_NAME } });
  });
});
