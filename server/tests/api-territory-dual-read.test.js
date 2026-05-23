/**
 * API tests — submission territory key dual-read tolerance (issue #496, story 496.1).
 *
 * Verifies that the server accepts BOTH ObjectId-keyed and legacy-slug-keyed
 * submission territory fields end-to-end:
 *
 *   (a) POST submission with OID-keyed feeding_territories → persists & reads back
 *   (b) POST submission with legacy-slug-keyed feeding_territories → persists & reads back
 *   (c) POST submission with mixed OID + slug keys in the same payload → both work
 *   (d) Feeding-rights lock check honours OID-keyed submission territory
 *       (companion to the slug-keyed lock test in api-territories-regent-write.test.js)
 *
 * Story 496.4 will tighten the schema and delete this test file once the
 * migration has rekeyed all submissions to OID and the tolerance window closes.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { ObjectId } from 'mongodb';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;
const CREATED_SUBMISSIONS = [];
const CREATED_TERRITORIES = [];
const CREATED_CYCLES = [];
const CHAR_ID = new ObjectId().toHexString();
let CYCLE_ID;
let HARBOUR_OID;
let NORTHSHORE_OID;

beforeAll(async () => {
  await setupDb();
  app = createTestApp();

  // Seed a non-active cycle for the round-trip tests' payload context. The
  // lock-test describe block below creates its OWN active cycle — using
  // status: 'closed' here prevents `findOne({ status: 'active' })` from
  // picking up this one and pointing the lock check at the wrong submissions.
  const cycle = await getCollection('downtime_cycles').insertOne({
    status: 'closed',
    label: 'Test cycle 496.1 (payload-only context)',
    created_at: new Date().toISOString(),
  });
  CYCLE_ID = String(cycle.insertedId);
  CREATED_CYCLES.push(cycle.insertedId);

  // Seed a player character so playerUser([CHAR_ID]) ownership works.
  await getCollection('characters').insertOne({
    _id: new ObjectId(CHAR_ID),
    name: '496.1 Test Char',
    retired: false,
    pending_approval: false,
    attributes: {}, skills: {}, disciplines: {}, merits: [], powers: [], ordeals: {},
  });

  // Seed two real territories. We use the actual TERRITORY_DATA slugs so the
  // resolver's bySlug path is exercised; the OIDs are fresh (won't collide
  // with live tm_suite data — we're on tm_suite_test per the isolation setup).
  const harbour = await getCollection('territories').insertOne({
    slug: 'harbour',
    name: 'The Harbour',
    ambience: 'Tended',
    regent_id: 'test-regent-harbour',
    lieutenant_id: null,
    feeding_rights: [],
  });
  HARBOUR_OID = String(harbour.insertedId);
  CREATED_TERRITORIES.push(harbour.insertedId);

  const northshore = await getCollection('territories').insertOne({
    slug: 'northshore',
    name: 'The North Shore',
    ambience: 'Tended',
    regent_id: 'test-regent-northshore',
    lieutenant_id: null,
    feeding_rights: [],
  });
  NORTHSHORE_OID = String(northshore.insertedId);
  CREATED_TERRITORIES.push(northshore.insertedId);
});

afterEach(async () => {
  if (CREATED_SUBMISSIONS.length > 0) {
    await getCollection('downtime_submissions').deleteMany({ _id: { $in: CREATED_SUBMISSIONS } });
    CREATED_SUBMISSIONS.length = 0;
  }
});

afterAll(async () => {
  if (CREATED_TERRITORIES.length > 0) {
    await getCollection('territories').deleteMany({ _id: { $in: CREATED_TERRITORIES } });
  }
  if (CREATED_CYCLES.length > 0) {
    await getCollection('downtime_cycles').deleteMany({ _id: { $in: CREATED_CYCLES } });
  }
  await getCollection('characters').deleteOne({ _id: new ObjectId(CHAR_ID) });
  await teardownDb();
});

describe('POST /api/downtime_submissions — feeding_territories format tolerance (AC 6 a/b/c)', () => {
  it('(b) accepts legacy long-slug keys and round-trips them unchanged', async () => {
    const payload = {
      cycle_id: CYCLE_ID,
      character_id: CHAR_ID,
      status: 'draft',
      responses: {
        feeding_territories: JSON.stringify({
          the_academy: 'none',
          the_harbour: 'resident',
          the_north_shore: 'feeding_rights',
          the_barrens_no_territory_: 'none',
        }),
      },
    };
    const res = await request(app)
      .post('/api/downtime_submissions')
      .set('X-Test-User', playerUser([CHAR_ID]))
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.responses.feeding_territories).toBe(payload.responses.feeding_territories);
    CREATED_SUBMISSIONS.push(new ObjectId(res.body._id));
  });

  it('(a) accepts ObjectId-keyed feeding_territories and round-trips them unchanged', async () => {
    const payload = {
      cycle_id: CYCLE_ID,
      character_id: CHAR_ID,
      status: 'draft',
      responses: {
        feeding_territories: JSON.stringify({
          [HARBOUR_OID]: 'resident',
          [NORTHSHORE_OID]: 'feeding_rights',
        }),
      },
    };
    const res = await request(app)
      .post('/api/downtime_submissions')
      .set('X-Test-User', playerUser([CHAR_ID]))
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.responses.feeding_territories).toBe(payload.responses.feeding_territories);
    CREATED_SUBMISSIONS.push(new ObjectId(res.body._id));
  });

  it('(c) accepts mixed OID + legacy-slug keys in the same payload', async () => {
    const payload = {
      cycle_id: CYCLE_ID,
      character_id: CHAR_ID,
      status: 'draft',
      responses: {
        feeding_territories: JSON.stringify({
          [HARBOUR_OID]: 'resident',         // OID key
          the_north_shore: 'feeding_rights', // long-slug key
        }),
        project_1_territory:        HARBOUR_OID, // enum: OID format
        sphere_1_territory:         'academy',   // enum: short-slug format
        project_1_ambience_target:  NORTHSHORE_OID,
      },
    };
    const res = await request(app)
      .post('/api/downtime_submissions')
      .set('X-Test-User', playerUser([CHAR_ID]))
      .send(payload);

    expect(res.status).toBe(201);
    const r = res.body.responses;
    expect(r.feeding_territories).toBe(payload.responses.feeding_territories);
    expect(r.project_1_territory).toBe(HARBOUR_OID);
    expect(r.sphere_1_territory).toBe('academy');
    expect(r.project_1_ambience_target).toBe(NORTHSHORE_OID);
    CREATED_SUBMISSIONS.push(new ObjectId(res.body._id));
  });

  it('still rejects garbage values in the enum fields', async () => {
    const res = await request(app)
      .post('/api/downtime_submissions')
      .set('X-Test-User', playerUser([CHAR_ID]))
      .send({
        cycle_id: CYCLE_ID,
        character_id: CHAR_ID,
        status: 'draft',
        responses: {
          project_1_territory: 'garbage-not-an-oid-or-slug',
        },
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });
});

describe('PATCH /api/territories/:id/feeding-rights — OID-keyed submission lock (AC 6 d)', () => {
  // Companion to the slug-keyed lock test in api-territories-regent-write.test.js:183.
  // Verifies that the new resolver path correctly identifies feeders whose
  // submission used the OID format.

  let testRegentTerritory;
  let testCycle;

  beforeAll(async () => {
    // Seed a separate territory for this test so the global afterAll
    // territory list doesn't pollute the lock check on other tests.
    const result = await getCollection('territories').insertOne({
      slug: 'rfr_test_oid',
      name: 'Lock Test Territory (OID path)',
      ambience: 'Tended',
      regent_id: 'oid-lock-regent',
      lieutenant_id: null,
      feeding_rights: ['oid-fed-char', 'oid-safe-char'],
    });
    testRegentTerritory = result.insertedId;
    CREATED_TERRITORIES.push(result.insertedId);

    const cycle = await getCollection('downtime_cycles').insertOne({
      status: 'active',
      label: 'Lock-test cycle (OID)',
    });
    testCycle = cycle.insertedId;
    CREATED_CYCLES.push(cycle.insertedId);
  });

  it('(d) regent cannot remove a character whose OID-keyed submission marked this territory resident', async () => {
    // Submission uses the territory's _id directly as the feeding_territories key.
    const subResult = await getCollection('downtime_submissions').insertOne({
      character_id: 'oid-fed-char',
      character_name: 'OID Fed Char',
      cycle_id: testCycle,
      status: 'submitted',
      responses: {
        feeding_territories: JSON.stringify({
          [String(testRegentTerritory)]: 'resident',
        }),
      },
    });
    CREATED_SUBMISSIONS.push(subResult.insertedId);

    const res = await request(app)
      .patch(`/api/territories/${String(testRegentTerritory)}/feeding-rights`)
      .set('X-Test-User', playerUser(['oid-lock-regent']))
      .send({ feeding_rights: ['oid-safe-char'] });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('CONFLICT');
    expect(res.body.locked).toEqual(['oid-fed-char']);
  });

  it('(d, negative) OID-keyed submission for a DIFFERENT territory does NOT lock removal from this one', async () => {
    // Submission's feeding key is HARBOUR_OID (a different territory's _id).
    // The lock check builds a single-territory lookup map for testRegentTerritory,
    // so HARBOUR_OID correctly resolves to null and is skipped. The removal
    // should succeed.
    //
    // Regression guard: if a future refactor changes the lock check to use a
    // multi-territory map without re-filtering by the target's _id, this test
    // catches the resulting over-lock.
    const subResult = await getCollection('downtime_submissions').insertOne({
      character_id: 'oid-fed-char',
      character_name: 'OID Fed Elsewhere',
      cycle_id: testCycle,
      status: 'submitted',
      responses: {
        feeding_territories: JSON.stringify({
          [HARBOUR_OID]: 'resident', // fed on Harbour, not on testRegentTerritory
        }),
      },
    });
    CREATED_SUBMISSIONS.push(subResult.insertedId);

    const res = await request(app)
      .patch(`/api/territories/${String(testRegentTerritory)}/feeding-rights`)
      .set('X-Test-User', playerUser(['oid-lock-regent']))
      .send({ feeding_rights: ['oid-safe-char'] });

    expect(res.status).toBe(200);
    expect(res.body.feeding_rights).toEqual(['oid-safe-char']);
  });
});
