/**
 * API tests — submission territory key OID format (issue #496, story 496.4).
 *
 * After 496.4 cleanup:
 *   (a) POST submission with OID-keyed feeding_territories → persists & reads back
 *   (b) POST submission with legacy slug in sphere/project enum fields → 400
 *   (c) POST submission with OID-keyed enum fields → persists & reads back
 *   (d) Feeding-rights lock check honours OID-keyed submission territory
 *       (uses direct key comparison after resolver deletion)
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
  const cycle = await getCollection('chapters').insertOne({
    status: 'closed',
    label: 'Test cycle 496.1 (payload-only context)',
    created_at: new Date().toISOString(),
  });
  CYCLE_ID = String(cycle.insertedId);
  CREATED_CYCLES.push(cycle.insertedId);

  // Seed a character for the submission fixtures' character_id field.
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
    await getCollection('chapters').deleteMany({ _id: { $in: CREATED_CYCLES } });
  }
  await getCollection('characters').deleteOne({ _id: new ObjectId(CHAR_ID) });
  await teardownDb();
});

describe('POST /api/downtime_submissions — territory field format (AC 6 a/b/c)', () => {
  it('(a) accepts ObjectId-keyed feeding_territories and round-trips unchanged', async () => {
    const payload = {
      chapter_id: CYCLE_ID,
      character_id: CHAR_ID,
      status: 'draft',
      responses: {
        feeding_territories: JSON.stringify({
          [HARBOUR_OID]: 'resident',
          [NORTHSHORE_OID]: 'feeding_rights',
          the_barrens_no_territory_: 'none',
        }),
      },
    };
    const res = await request(app)
      .post('/api/downtime_submissions')
      // 2026-08-25 (D6): player POST creation is now gated (form-retirement.js);
      // ST here is just the test's actor — this describe block is about
      // territory-field validation, not player-vs-ST authorization.
      .set('X-Test-User', stUser())
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.responses.feeding_territories).toBe(payload.responses.feeding_territories);
    CREATED_SUBMISSIONS.push(new ObjectId(res.body._id));
  });

  it('(b) rejects legacy short-slug values in the validated enum fields', async () => {
    // After 496.4 schema tightening, sphere/project territory enums are OID-only.
    const res = await request(app)
      .post('/api/downtime_submissions')
      // 2026-08-25 (D6): player POST creation is now gated (form-retirement.js);
      // ST here is just the test's actor — this describe block is about
      // territory-field validation, not player-vs-ST authorization.
      .set('X-Test-User', stUser())
      .send({
        chapter_id: CYCLE_ID,
        character_id: CHAR_ID,
        status: 'draft',
        responses: {
          sphere_1_territory: 'academy', // short-slug: no longer valid
        },
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('(c) accepts OID values in the validated enum fields', async () => {
    const payload = {
      chapter_id: CYCLE_ID,
      character_id: CHAR_ID,
      status: 'draft',
      responses: {
        feeding_territories: JSON.stringify({ [HARBOUR_OID]: 'resident' }),
        project_1_territory:       HARBOUR_OID,
        sphere_1_territory:        NORTHSHORE_OID,
        project_1_ambience_target: HARBOUR_OID,
      },
    };
    const res = await request(app)
      .post('/api/downtime_submissions')
      // 2026-08-25 (D6): player POST creation is now gated (form-retirement.js);
      // ST here is just the test's actor — this describe block is about
      // territory-field validation, not player-vs-ST authorization.
      .set('X-Test-User', stUser())
      .send(payload);

    expect(res.status).toBe(201);
    const r = res.body.responses;
    expect(r.project_1_territory).toBe(HARBOUR_OID);
    expect(r.sphere_1_territory).toBe(NORTHSHORE_OID);
    CREATED_SUBMISSIONS.push(new ObjectId(res.body._id));
  });

  it('still rejects garbage values in the enum fields', async () => {
    const res = await request(app)
      .post('/api/downtime_submissions')
      // 2026-08-25 (D6): player POST creation is now gated (form-retirement.js);
      // ST here is just the test's actor — this describe block is about
      // territory-field validation, not player-vs-ST authorization.
      .set('X-Test-User', stUser())
      .send({
        chapter_id: CYCLE_ID,
        character_id: CHAR_ID,
        status: 'draft',
        responses: {
          project_1_territory: 'garbage-not-an-oid',
        },
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });
});

describe('PATCH /api/territories/:id/feeding-rights — OID-keyed submission lock (AC 6 d)', () => {
  // Verifies that the feeding-rights lock check correctly identifies feeders
  // via direct OID key comparison (post-496.4: no resolver involved).

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

    const cycle = await getCollection('chapters').insertOne({
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
      chapter_id: testCycle,
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
    // Direct key comparison: HARBOUR_OID !== testRegentTerritory, so the
    // character is not counted as a feeder here and removal succeeds.
    const subResult = await getCollection('downtime_submissions').insertOne({
      character_id: 'oid-fed-char',
      character_name: 'OID Fed Elsewhere',
      chapter_id: testCycle,
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
