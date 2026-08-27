/**
 * oxp.9 — Office XP spend routes through the ST Approval Queue.
 *
 * See specs/stories/oxp-9-spend-routes-through-oaq.md for the full grounding.
 *
 * This file covers:
 *   - server/schemas/office_purchase_request.schema.js (AC1, including the
 *     load-bearing `title` — validate.js caches compiled Ajv validators by
 *     schema.title, and a title-less schema collides on cache key `undefined`
 *     with office_action.schema.js, which is still title-less; gdx.12 lost
 *     real debugging time to exactly that)
 *   - server/routes/office-purchase.js POST / GET / accept / decline
 *     (AC2-AC6), DB-backed via Supertest, mirroring
 *     oaq-2-pending-status-actions.test.js's pattern
 *   - the three widened guards (AC7): office-actions.js's GET /pending $in
 *     and contested-rolls.js's two $nin deny lists
 *   - office-approvals.js's new row renderer and _resolve() branch (AC8),
 *     by static analysis — this project's own established pattern for this
 *     module (see oaq-3-approval-queue.test.js's own "file shape" block)
 *   - office-tab.js's holder request affordance (AC9), by static analysis
 *     plus the render-level technique issue-1141-office-tab-render.test.js
 *     established
 *
 * DB-backed: real MongoDB required. See db-setup.js — the suite SKIPS rather
 * than fails without one, so read the summary line, not the exit code.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { ObjectId } from 'mongodb';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb, isDbAvailable } from './helpers/db-setup.js';
import { getCollection } from '../db.js';
import { officePurchaseRequestSchema } from '../schemas/office_purchase_request.schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
function readFile(rel) { return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'); }

const dbAvailable = await isDbAvailable();

// Explicit, known ids so this suite deletes exactly its own fixtures —
// office_seats is shared with oxp.1/oxp.2/oxp.3's suites, so a bare
// deleteMany({}) here would silently reach into theirs.
const oid = (prefix, n) => new ObjectId(`${prefix}${'0'.repeat(20 - prefix.length)}${String(n).padStart(4, '0')}`);

const SEAT_HOS       = oid('0f99', 1);   // rich seat: created long ago, plenty of XP
const SEAT_PRIMOGEN  = oid('0f99', 2);   // poor seat: created this month, 1 XP earned
const SEAT_ADMIN     = oid('0f99', 3);   // Administrator — no OFFICE_DATA entry (oxp.8)
const SEAT_VACANT    = oid('0f99', 4);   // Enforcer, holder_id null
const SEAT_IDS = [SEAT_HOS, SEAT_PRIMOGEN, SEAT_ADMIN, SEAT_VACANT];

const CHAR_HOLDER = oid('0f9a', 1);      // holds SEAT_HOS and SEAT_PRIMOGEN
const CHAR_OTHER  = oid('0f9a', 2);      // holds nothing
const CHAR_IDS = [CHAR_HOLDER, CHAR_OTHER];

const HOS      = String(SEAT_HOS);
const PRIMOGEN = String(SEAT_PRIMOGEN);
const ADMIN    = String(SEAT_ADMIN);
const VACANT   = String(SEAT_VACANT);
const HOLDER   = String(CHAR_HOLDER);
const OTHER    = String(CHAR_OTHER);

// A well-formed 24-hex id matching no seat document.
const SEAT_ABSENT = '0f99000000000000000000ff';

/** The first day of the CURRENT calendar month, so officeMonthsAccrued()
 *  returns exactly 1 (inclusive of the creation month) whatever day the suite
 *  runs on — the deterministic "this seat has earned 1 XP" fixture the budget
 *  tests need. */
function thisMonthStart() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

const seatFixtures = () => ([
  { _id: SEAT_HOS,      office_category: 'Head of State', holder_id: HOLDER, created_at: '2026-02-01', seat_label: null,     notes: null },
  { _id: SEAT_PRIMOGEN, office_category: 'Primogen',      holder_id: HOLDER, created_at: thisMonthStart(), seat_label: 'Elder', notes: null },
  { _id: SEAT_ADMIN,    office_category: 'Administrator', holder_id: HOLDER, created_at: '2026-06-20', seat_label: null,     notes: null },
  { _id: SEAT_VACANT,   office_category: 'Enforcer',      holder_id: null,   created_at: '2026-02-01', seat_label: null,     notes: null },
]);

const charFixtures = () => ([
  { _id: CHAR_HOLDER, name: 'Test Holder', moniker: 'The Holder', _test_seeded: true },
  { _id: CHAR_OTHER,  name: 'Test Other',  _test_seeded: true },
]);

let app;
const holderUser = () => playerUser([HOLDER]);
const otherUser  = () => playerUser([OTHER]);

beforeAll(async () => {
  if (!dbAvailable) return;
  await setupDb();
  app = createTestApp();
  // The one-pending-per-seat partial unique index server/index.js builds at
  // boot. The test app has no boot path, so the suite declares it here —
  // exactly what oaq-2-pending-status-actions.test.js and
  // issue-1143-office-actions-auth-safety.test.js already do for their own
  // indexes. createIndex is idempotent, so this is safe on every run.
  // Without it the concurrency test below cannot prove anything.
  await getCollection('contested_roll_requests').createIndex(
    { seat_id: 1 },
    { unique: true, partialFilterExpression: { request_type: 'office_purchase', status: 'pending' } },
  );
});

beforeEach(async () => {
  if (!dbAvailable) return;
  await getCollection('office_merit_dots').deleteMany({ _id: { $in: SEAT_IDS.map(String) } });
  await getCollection('office_manoeuvre_ranks').deleteMany({ _id: { $in: SEAT_IDS.map(String) } });
  await getCollection('contested_roll_requests').deleteMany({ request_type: 'office_purchase' });
  await getCollection('office_seats').deleteMany({ _id: { $in: SEAT_IDS } });
  await getCollection('office_seats').insertMany(seatFixtures());
  await getCollection('characters').deleteMany({ _id: { $in: CHAR_IDS } });
  await getCollection('characters').insertMany(charFixtures());
});

afterAll(async () => {
  if (!dbAvailable) return;
  await getCollection('office_merit_dots').deleteMany({ _id: { $in: SEAT_IDS.map(String) } });
  await getCollection('office_manoeuvre_ranks').deleteMany({ _id: { $in: SEAT_IDS.map(String) } });
  await getCollection('contested_roll_requests').deleteMany({ request_type: 'office_purchase' });
  await getCollection('office_seats').deleteMany({ _id: { $in: SEAT_IDS } });
  await getCollection('characters').deleteMany({ _id: { $in: CHAR_IDS } });
  await teardownDb();
});

// ─────────────────────────────────────────────────────────────────────────────
// AC1 — the request-body schema
// ─────────────────────────────────────────────────────────────────────────────

describe('oxp.9 — office_purchase_request schema (AC1)', () => {
  it('declares a title (validate.js caches compiled validators by schema.title; a title-less schema silently collides with office_action.schema.js)', () => {
    expect(officePurchaseRequestSchema.title).toBe('TM Office Purchase Request');
  });

  it('is a closed object requiring seat_id and purchase_kind', () => {
    expect(officePurchaseRequestSchema.type).toBe('object');
    expect(officePurchaseRequestSchema.additionalProperties).toBe(false);
    expect(officePurchaseRequestSchema.required).toEqual(['seat_id', 'purchase_kind']);
  });

  it('constrains seat_id to a 24-hex string and purchase_kind to merit|manoeuvre', () => {
    expect(officePurchaseRequestSchema.properties.seat_id).toEqual({ type: 'string', pattern: '^[0-9a-fA-F]{24}$' });
    expect(officePurchaseRequestSchema.properties.purchase_kind).toEqual({ type: 'string', enum: ['merit', 'manoeuvre'] });
    expect(officePurchaseRequestSchema.properties.merit).toEqual({ type: ['string', 'null'] });
  });

  it('does not collide with any other schema title in server/schemas', () => {
    const dir = path.join(REPO_ROOT, 'server', 'schemas');
    const titles = fs.readdirSync(dir)
      .filter(f => f.endsWith('.schema.js'))
      .map(f => (fs.readFileSync(path.join(dir, f), 'utf8').match(/title:\s*'([^']+)'/) || [])[1])
      .filter(Boolean);
    const mine = titles.filter(t => t === 'TM Office Purchase Request');
    expect(mine.length).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC2/AC3 — POST /api/office_purchase_requests
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!dbAvailable)('oxp.9 — POST /api/office_purchase_requests (AC3)', () => {
  it('a confirmed seat holder may submit a merit purchase request', async () => {
    const res = await request(app)
      .post('/api/office_purchase_requests')
      .set('X-Test-User', holderUser())
      .send({ seat_id: HOS, purchase_kind: 'merit', merit: 'Haven' });

    expect(res.status).toBe(201);
    expect(res.body.request_type).toBe('office_purchase');
    expect(res.body.status).toBe('pending');
    expect(res.body.outcome).toBeNull();
    expect(res.body.seat_id).toBe(HOS.toLowerCase());
    expect(res.body.office_category).toBe('Head of State');
    expect(res.body.purchase_kind).toBe('merit');
    expect(res.body.merit).toBe('Haven');
    expect(res.body.requested_by_character_id).toBe(HOLDER);
    expect(res.body.requested_by_character_name).toBe('The Holder');
    expect(res.body.created_at).toBeTruthy();
  });

  it('a manoeuvre request stores merit as null and carries the seat label', async () => {
    const res = await request(app)
      .post('/api/office_purchase_requests')
      .set('X-Test-User', holderUser())
      .send({ seat_id: PRIMOGEN, purchase_kind: 'manoeuvre' });

    expect(res.status).toBe(201);
    expect(res.body.purchase_kind).toBe('manoeuvre');
    expect(res.body.merit).toBeNull();
    expect(res.body.seat_label).toBe('Elder');
  });

  it('an ST may submit on a seat they do not hold, and is recorded with a null requester', async () => {
    const res = await request(app)
      .post('/api/office_purchase_requests')
      .set('X-Test-User', stUser())
      .send({ seat_id: HOS, purchase_kind: 'merit', merit: 'Haven' });

    expect(res.status).toBe(201);
    expect(res.body.requested_by_character_id).toBeNull();
    expect(res.body.requested_by_character_name).toBeNull();
  });

  it('a non-holder player is refused 403', async () => {
    const res = await request(app)
      .post('/api/office_purchase_requests')
      .set('X-Test-User', otherUser())
      .send({ seat_id: HOS, purchase_kind: 'merit', merit: 'Haven' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  it('a vacant seat has no holder who can submit — a player is refused 403', async () => {
    const res = await request(app)
      .post('/api/office_purchase_requests')
      .set('X-Test-User', holderUser())
      .send({ seat_id: VACANT, purchase_kind: 'manoeuvre' });

    expect(res.status).toBe(403);
  });

  it('an Administrator seat is refused at submission with resolveOfficeSeat\'s existing message (oxp.8 not authored)', async () => {
    const res = await request(app)
      .post('/api/office_purchase_requests')
      .set('X-Test-User', stUser())
      .send({ seat_id: ADMIN, purchase_kind: 'manoeuvre' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/has no rules entry yet/);
  });

  it('a well-formed id matching no seat is 404', async () => {
    const res = await request(app)
      .post('/api/office_purchase_requests')
      .set('X-Test-User', stUser())
      .send({ seat_id: SEAT_ABSENT, purchase_kind: 'manoeuvre' });

    expect(res.status).toBe(404);
  });

  it('rejects a malformed seat_id at the schema layer (proving the new schema, not office_action.schema.js, is what validated it)', async () => {
    const res = await request(app)
      .post('/api/office_purchase_requests')
      .set('X-Test-User', stUser())
      .send({ seat_id: 'not-a-seat', purchase_kind: 'merit', merit: 'Haven' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(res.body.errors)).toMatch(/seat_id/);
  });

  it('rejects a merit that does not belong to this office', async () => {
    const res = await request(app)
      .post('/api/office_purchase_requests')
      .set('X-Test-User', holderUser())
      .send({ seat_id: HOS, purchase_kind: 'merit', merit: 'Contacts' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/does not belong to this office/);
  });

  it('rejects a merit purchase with no merit named', async () => {
    const res = await request(app)
      .post('/api/office_purchase_requests')
      .set('X-Test-User', holderUser())
      .send({ seat_id: HOS, purchase_kind: 'merit' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/merit/i);
  });

  it('rejects a merit supplied on a manoeuvre request', async () => {
    const res = await request(app)
      .post('/api/office_purchase_requests')
      .set('X-Test-User', holderUser())
      .send({ seat_id: HOS, purchase_kind: 'manoeuvre', merit: 'Haven' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/manoeuvre/i);
  });

  it('rejects a merit already at its cap', async () => {
    await getCollection('office_merit_dots').insertOne({ _id: HOS, dots: { Haven: 5 }, office_category: 'Head of State' });
    const res = await request(app)
      .post('/api/office_purchase_requests')
      .set('X-Test-User', holderUser())
      .send({ seat_id: HOS, purchase_kind: 'merit', merit: 'Haven' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/cap/i);
  });

  it('rejects a manoeuvre request when the whole ladder is already purchased', async () => {
    await getCollection('office_manoeuvre_ranks').insertOne({ _id: HOS, rank: 5, office_category: 'Head of State' });
    const res = await request(app)
      .post('/api/office_purchase_requests')
      .set('X-Test-User', holderUser())
      .send({ seat_id: HOS, purchase_kind: 'manoeuvre' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/manoeuvre/i);
  });

  it('courtesy affordability pre-check: refuses 403 when the seat has nothing left', async () => {
    // SEAT_PRIMOGEN was created this calendar month, so it has earned exactly
    // 1 XP; one merit dot already spent leaves 0.
    await getCollection('office_merit_dots').insertOne({ _id: PRIMOGEN, dots: { Contacts: 1 }, office_category: 'Primogen' });
    const res = await request(app)
      .post('/api/office_purchase_requests')
      .set('X-Test-User', holderUser())
      .send({ seat_id: PRIMOGEN, purchase_kind: 'merit', merit: 'Contacts' });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/Not enough office XP/);
  });

  it('one pending request per seat — a second submission is 409 regardless of kind', async () => {
    const first = await request(app)
      .post('/api/office_purchase_requests')
      .set('X-Test-User', holderUser())
      .send({ seat_id: HOS, purchase_kind: 'merit', merit: 'Haven' });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/office_purchase_requests')
      .set('X-Test-User', holderUser())
      .send({ seat_id: HOS, purchase_kind: 'manoeuvre' });

    expect(second.status).toBe(409);
    expect(second.body.error).toBe('CONFLICT');
  });

  it('writes nothing to either purchase collection at submission time', async () => {
    await request(app)
      .post('/api/office_purchase_requests')
      .set('X-Test-User', holderUser())
      .send({ seat_id: HOS, purchase_kind: 'merit', merit: 'Haven' });

    expect(await getCollection('office_merit_dots').findOne({ _id: HOS })).toBeNull();
    expect(await getCollection('office_manoeuvre_ranks').findOne({ _id: HOS })).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC4 — GET /api/office_purchase_requests?seat_id=
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!dbAvailable)('oxp.9 — GET /api/office_purchase_requests (AC4)', () => {
  it('returns the pending request(s) for one seat', async () => {
    await request(app).post('/api/office_purchase_requests').set('X-Test-User', holderUser())
      .send({ seat_id: HOS, purchase_kind: 'merit', merit: 'Haven' });

    const res = await request(app)
      .get(`/api/office_purchase_requests?seat_id=${HOS}`)
      .set('X-Test-User', holderUser());

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
    expect(res.body[0].seat_id).toBe(HOS.toLowerCase());
  });

  it('returns an empty array for a seat with nothing pending', async () => {
    const res = await request(app)
      .get(`/api/office_purchase_requests?seat_id=${HOS}`)
      .set('X-Test-User', holderUser());

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('requires seat_id', async () => {
    const res = await request(app)
      .get('/api/office_purchase_requests')
      .set('X-Test-User', holderUser());

    expect(res.status).toBe(400);
  });

  it('rejects a repeated seat_id query key (Express 5 simple parser turns it into an array)', async () => {
    const res = await request(app)
      .get(`/api/office_purchase_requests?seat_id=${HOS}&seat_id=${PRIMOGEN}`)
      .set('X-Test-User', holderUser());

    expect(res.status).toBe(400);
  });

  it('a non-holder player is refused 403', async () => {
    const res = await request(app)
      .get(`/api/office_purchase_requests?seat_id=${HOS}`)
      .set('X-Test-User', otherUser());

    expect(res.status).toBe(403);
  });

  it('an ST may read any seat', async () => {
    const res = await request(app)
      .get(`/api/office_purchase_requests?seat_id=${HOS}`)
      .set('X-Test-User', stUser());

    expect(res.status).toBe(200);
  });

  it('never returns resolved or declined records', async () => {
    const created = await request(app).post('/api/office_purchase_requests').set('X-Test-User', holderUser())
      .send({ seat_id: HOS, purchase_kind: 'merit', merit: 'Haven' });
    await getCollection('contested_roll_requests').updateOne(
      { _id: new ObjectId(created.body._id) },
      { $set: { status: 'declined' } },
    );

    const res = await request(app)
      .get(`/api/office_purchase_requests?seat_id=${HOS}`)
      .set('X-Test-User', holderUser());

    expect(res.body).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC5/AC6 — PUT /:id/accept and PUT /:id/decline
// ─────────────────────────────────────────────────────────────────────────────

/** Submit as the given user and return the created pending record. */
async function submitAs(user, payload) {
  const res = await request(app)
    .post('/api/office_purchase_requests')
    .set('X-Test-User', user)
    .send(payload);
  expect(res.status).toBe(201);
  return res.body;
}

describe.skipIf(!dbAvailable)('oxp.9 — PUT /:id/accept (AC5)', () => {
  it('applies exactly one merit dot to the right seat document and records the outcome', async () => {
    const pending = await submitAs(holderUser(), { seat_id: HOS, purchase_kind: 'merit', merit: 'Haven' });

    const res = await request(app)
      .put(`/api/office_purchase_requests/${pending._id}/accept`)
      .set('X-Test-User', stUser())
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('resolved');
    expect(res.body.outcome).toMatchObject({ purchase_kind: 'merit', merit: 'Haven', from: 0, to: 1, xp_cost: 1 });
    expect(res.body.outcome.left_after).toBe(res.body.outcome.earned - res.body.outcome.spent_before - 1);
    expect(res.body.resolved_by).toBe('test_st');

    const doc = await getCollection('office_merit_dots').findOne({ _id: HOS.toLowerCase() });
    expect(doc.dots.Haven).toBe(1);
    expect(doc.office_category).toBe('Head of State');
    // Nothing leaked into the OTHER purchase collection.
    expect(await getCollection('office_manoeuvre_ranks').findOne({ _id: HOS.toLowerCase() })).toBeNull();
  });

  it('increments an existing merit dot rather than resetting it', async () => {
    await getCollection('office_merit_dots').insertOne({ _id: HOS.toLowerCase(), dots: { Haven: 2, Staff: 1 }, office_category: 'Head of State' });
    const pending = await submitAs(holderUser(), { seat_id: HOS, purchase_kind: 'merit', merit: 'Haven' });

    await request(app).put(`/api/office_purchase_requests/${pending._id}/accept`).set('X-Test-User', stUser()).send({});

    const doc = await getCollection('office_merit_dots').findOne({ _id: HOS.toLowerCase() });
    expect(doc.dots).toEqual({ Haven: 3, Staff: 1 });
  });

  it('applies exactly one manoeuvre rank through the clamped pipeline', async () => {
    const pending = await submitAs(holderUser(), { seat_id: HOS, purchase_kind: 'manoeuvre' });

    const res = await request(app)
      .put(`/api/office_purchase_requests/${pending._id}/accept`)
      .set('X-Test-User', stUser())
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.outcome).toMatchObject({ purchase_kind: 'manoeuvre', merit: null, from: 0, to: 1, xp_cost: 1 });

    const doc = await getCollection('office_manoeuvre_ranks').findOne({ _id: HOS.toLowerCase() });
    expect(doc.rank).toBe(1);
    expect(doc.office_category).toBe('Head of State');
  });

  it('preserves manoeuvre_xp_destroyed on the existing rank document (oxp.5 handover state is not clobbered)', async () => {
    await getCollection('office_manoeuvre_ranks').insertOne({ _id: HOS.toLowerCase(), rank: 2, manoeuvre_xp_destroyed: 3, office_category: 'Head of State' });
    const pending = await submitAs(holderUser(), { seat_id: HOS, purchase_kind: 'manoeuvre' });

    await request(app).put(`/api/office_purchase_requests/${pending._id}/accept`).set('X-Test-User', stUser()).send({});

    const doc = await getCollection('office_manoeuvre_ranks').findOne({ _id: HOS.toLowerCase() });
    expect(doc.rank).toBe(3);
    expect(doc.manoeuvre_xp_destroyed).toBe(3);
  });

  it('is ST-only, and a player accepting their own request writes nothing', async () => {
    const pending = await submitAs(holderUser(), { seat_id: HOS, purchase_kind: 'merit', merit: 'Haven' });

    const res = await request(app)
      .put(`/api/office_purchase_requests/${pending._id}/accept`)
      .set('X-Test-User', holderUser())
      .send({});

    expect(res.status).toBe(403);
    expect(await getCollection('office_merit_dots').findOne({ _id: HOS.toLowerCase() })).toBeNull();
  });

  it('409s on an already-resolved record, and applies nothing a second time', async () => {
    const pending = await submitAs(holderUser(), { seat_id: HOS, purchase_kind: 'merit', merit: 'Haven' });
    await request(app).put(`/api/office_purchase_requests/${pending._id}/accept`).set('X-Test-User', stUser()).send({});

    const again = await request(app)
      .put(`/api/office_purchase_requests/${pending._id}/accept`)
      .set('X-Test-User', stUser())
      .send({});

    expect(again.status).toBe(409);
    expect(again.body.resolved_by).toBe('test_st');
    const doc = await getCollection('office_merit_dots').findOne({ _id: HOS.toLowerCase() });
    expect(doc.dots.Haven).toBe(1);
  });

  it("409s when an ST's own stepper pushed the merit to its cap between submission and approval", async () => {
    const pending = await submitAs(holderUser(), { seat_id: HOS, purchase_kind: 'merit', merit: 'Haven' });
    await getCollection('office_merit_dots').insertOne({ _id: HOS.toLowerCase(), dots: { Haven: 5 }, office_category: 'Head of State' });

    const res = await request(app)
      .put(`/api/office_purchase_requests/${pending._id}/accept`)
      .set('X-Test-User', stUser())
      .send({});

    expect(res.status).toBe(409);
    const doc = await getCollection('office_merit_dots').findOne({ _id: HOS.toLowerCase() });
    expect(doc.dots.Haven).toBe(5);
    // The claim was rolled back with the transaction, so the record is still
    // actionable rather than stranded as resolved-but-unapplied.
    const fresh = await getCollection('contested_roll_requests').findOne({ _id: new ObjectId(pending._id) });
    expect(fresh.status).toBe('pending');
  });

  it("409s when the ST's own stepper filled the manoeuvre ladder between submission and approval", async () => {
    const pending = await submitAs(holderUser(), { seat_id: HOS, purchase_kind: 'manoeuvre' });
    await getCollection('office_manoeuvre_ranks').insertOne({ _id: HOS.toLowerCase(), rank: 5, office_category: 'Head of State' });

    const res = await request(app)
      .put(`/api/office_purchase_requests/${pending._id}/accept`)
      .set('X-Test-User', stUser())
      .send({});

    expect(res.status).toBe(409);
    const doc = await getCollection('office_manoeuvre_ranks').findOne({ _id: HOS.toLowerCase() });
    expect(doc.rank).toBe(5);
  });

  it('authoritative budget check: refuses 403 and writes nothing when the seat ran out of XP after submission', async () => {
    // SEAT_PRIMOGEN earns exactly 1 XP (created this calendar month), so a
    // request submitted while it was affordable becomes unaffordable the
    // moment an ST spends that point directly.
    const pending = await submitAs(holderUser(), { seat_id: PRIMOGEN, purchase_kind: 'merit', merit: 'Contacts' });
    await getCollection('office_merit_dots').insertOne({ _id: PRIMOGEN.toLowerCase(), dots: { Resources: 1 }, office_category: 'Primogen' });

    const res = await request(app)
      .put(`/api/office_purchase_requests/${pending._id}/accept`)
      .set('X-Test-User', stUser())
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/Not enough office XP/);
    const doc = await getCollection('office_merit_dots').findOne({ _id: PRIMOGEN.toLowerCase() });
    expect(doc.dots).toEqual({ Resources: 1 });
    const fresh = await getCollection('contested_roll_requests').findOne({ _id: new ObjectId(pending._id) });
    expect(fresh.status).toBe('pending');
  });

  it('refuses 403 when the requester no longer holds the seat', async () => {
    const pending = await submitAs(holderUser(), { seat_id: HOS, purchase_kind: 'merit', merit: 'Haven' });
    await getCollection('office_seats').updateOne({ _id: SEAT_HOS }, { $set: { holder_id: OTHER } });

    const res = await request(app)
      .put(`/api/office_purchase_requests/${pending._id}/accept`)
      .set('X-Test-User', stUser())
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/no longer holds/);
    expect(await getCollection('office_merit_dots').findOne({ _id: HOS.toLowerCase() })).toBeNull();
  });

  it('skips the requester re-check for an ST-submitted request (no requester to have lost the seat)', async () => {
    const pending = await submitAs(stUser(), { seat_id: HOS, purchase_kind: 'merit', merit: 'Haven' });
    await getCollection('office_seats').updateOne({ _id: SEAT_HOS }, { $set: { holder_id: null } });

    const res = await request(app)
      .put(`/api/office_purchase_requests/${pending._id}/accept`)
      .set('X-Test-User', stUser())
      .send({});

    expect(res.status).toBe(200);
  });

  it('404s for an id that is not an office_purchase record', async () => {
    const other = await getCollection('contested_roll_requests').insertOne({
      request_type: 'humanity_check', status: 'pending', outcome: null, character_id: HOLDER,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    });
    const res = await request(app)
      .put(`/api/office_purchase_requests/${other.insertedId}/accept`)
      .set('X-Test-User', stUser())
      .send({});
    await getCollection('contested_roll_requests').deleteOne({ _id: other.insertedId });

    expect(res.status).toBe(404);
  });
});

describe.skipIf(!dbAvailable)('oxp.9 — PUT /:id/decline (AC6)', () => {
  it('marks the record declined and writes nothing to either purchase collection', async () => {
    const pending = await submitAs(holderUser(), { seat_id: HOS, purchase_kind: 'merit', merit: 'Haven' });

    const res = await request(app)
      .put(`/api/office_purchase_requests/${pending._id}/decline`)
      .set('X-Test-User', stUser())
      .send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ declined: true, declined_by: 'test_st' });
    expect(await getCollection('office_merit_dots').findOne({ _id: HOS.toLowerCase() })).toBeNull();
    expect(await getCollection('office_manoeuvre_ranks').findOne({ _id: HOS.toLowerCase() })).toBeNull();

    const fresh = await getCollection('contested_roll_requests').findOne({ _id: new ObjectId(pending._id) });
    expect(fresh.status).toBe('declined');
    expect(fresh.outcome).toBeNull();
  });

  it('is ST-only', async () => {
    const pending = await submitAs(holderUser(), { seat_id: HOS, purchase_kind: 'merit', merit: 'Haven' });
    const res = await request(app)
      .put(`/api/office_purchase_requests/${pending._id}/decline`)
      .set('X-Test-User', holderUser())
      .send({});
    expect(res.status).toBe(403);
  });

  it('409s on an already-declined record', async () => {
    const pending = await submitAs(holderUser(), { seat_id: HOS, purchase_kind: 'merit', merit: 'Haven' });
    await request(app).put(`/api/office_purchase_requests/${pending._id}/decline`).set('X-Test-User', stUser()).send({});

    const again = await request(app)
      .put(`/api/office_purchase_requests/${pending._id}/decline`)
      .set('X-Test-User', stUser())
      .send({});

    expect(again.status).toBe(409);
    expect(again.body.declined_by).toBe('test_st');
  });

  it('frees the seat for a fresh request (one-pending-per-seat is scoped to pending only)', async () => {
    const pending = await submitAs(holderUser(), { seat_id: HOS, purchase_kind: 'merit', merit: 'Haven' });
    await request(app).put(`/api/office_purchase_requests/${pending._id}/decline`).set('X-Test-User', stUser()).send({});

    const second = await request(app)
      .post('/api/office_purchase_requests')
      .set('X-Test-User', holderUser())
      .send({ seat_id: HOS, purchase_kind: 'manoeuvre' });

    expect(second.status).toBe(201);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC7 — the shared pending feed and the two deny-list guards
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!dbAvailable)('oxp.9 — shared pending feed and cross-type guards (AC7)', () => {
  it("office-actions.js's GET /pending surfaces an office_purchase row alongside the other two types", async () => {
    const purchase = await submitAs(holderUser(), { seat_id: HOS, purchase_kind: 'merit', merit: 'Haven' });

    const res = await request(app)
      .get('/api/office_actions/pending')
      .set('X-Test-User', stUser());

    expect(res.status).toBe(200);
    const ids = res.body.map(r => String(r._id));
    expect(ids).toContain(String(purchase._id));
  });

  it('GET /pending is still ST-only', async () => {
    const res = await request(app)
      .get('/api/office_actions/pending')
      .set('X-Test-User', holderUser());
    expect(res.status).toBe(403);
  });

  it("contested-rolls.js's PUT /:id/void must not reach an office_purchase record (voiding one would orphan it: neither route family recognises 'voided')", async () => {
    const purchase = await submitAs(holderUser(), { seat_id: HOS, purchase_kind: 'merit', merit: 'Haven' });

    const res = await request(app)
      .put(`/api/contested_roll_requests/${purchase._id}/void`)
      .set('X-Test-User', stUser())
      .send({});

    expect(res.status).toBe(404);
    const fresh = await getCollection('contested_roll_requests').findOne({ _id: new ObjectId(purchase._id) });
    expect(fresh.status).toBe('pending');
  });

  it("contested-rolls.js's _findChallenge must not reach an office_purchase record (accept)", async () => {
    const purchase = await submitAs(holderUser(), { seat_id: HOS, purchase_kind: 'merit', merit: 'Haven' });

    const res = await request(app)
      .put(`/api/contested_roll_requests/${purchase._id}/accept`)
      .set('X-Test-User', stUser())
      .send({});

    expect(res.status).toBe(404);
  });

  it("contested-rolls.js's _findChallenge must not reach an office_purchase record (decline)", async () => {
    const purchase = await submitAs(holderUser(), { seat_id: HOS, purchase_kind: 'merit', merit: 'Haven' });

    const res = await request(app)
      .put(`/api/contested_roll_requests/${purchase._id}/decline`)
      .set('X-Test-User', stUser())
      .send({});

    expect(res.status).toBe(404);
  });

  it("GET /mine needs no change — crd.1's positive allow-list excludes any new request_type automatically", async () => {
    // Verified rather than assumed (the story asked for this explicitly): the
    // filter is $in: [null, 'contested_roll'], so a fourth discriminator is
    // excluded by construction. Proven behaviourally too, with a deliberately
    // hostile fixture carrying the very field GET /mine keys off.
    const src = readFile('server/routes/contested-rolls.js');
    expect(src).toMatch(/request_type: \{ \$in: \[null, 'contested_roll'\] \}/);

    const hostile = await getCollection('contested_roll_requests').insertOne({
      request_type: 'office_purchase',
      status: 'pending',
      outcome: null,
      seat_id: HOS.toLowerCase(),
      target_character_id: HOLDER,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const res = await request(app)
      .get('/api/contested_roll_requests/mine')
      .set('X-Test-User', holderUser());

    expect(res.status).toBe(200);
    expect(res.body.map(r => String(r._id))).not.toContain(String(hostile.insertedId));
  });

  it('a plain player-vs-player challenge is still voidable (the deny lists did not become an allow-all)', async () => {
    const challenge = await getCollection('contested_roll_requests').insertOne({
      request_type: 'contested_roll',
      status: 'pending',
      outcome: null,
      challenger_character_id: HOLDER,
      target_character_id: OTHER,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const res = await request(app)
      .put(`/api/contested_roll_requests/${challenge.insertedId}/void`)
      .set('X-Test-User', stUser())
      .send({});
    await getCollection('contested_roll_requests').deleteOne({ _id: challenge.insertedId });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('voided');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC8 — Approval Queue rendering (static analysis: this project's own
// established pattern for this module, see oaq-3-approval-queue.test.js)
// ─────────────────────────────────────────────────────────────────────────────

describe('oxp.9 — office-approvals.js office_purchase row (AC8, static analysis)', () => {
  const src = readFile('public/js/suite/office-approvals.js');

  it('dispatches office_purchase rows to their own renderer', () => {
    expect(src).toMatch(/function _renderOfficePurchaseRow\(r\)/);
    expect(src).toMatch(/r\.request_type === 'office_purchase'\s*\r?\n?\s*\? _renderOfficePurchaseRow\(r\)/);
  });

  it("leaves gdx.12's own dispatch expression intact (its suite asserts on this literal)", () => {
    expect(src).toMatch(/r\.request_type === 'humanity_check' \? _renderHumanityCheckRow\(r\) : _renderRow\(r\)/);
  });

  it('_resolve() gains a third endpoint branch for /api/office_purchase_requests', () => {
    expect(src).toMatch(/'\/api\/office_purchase_requests'/);
    expect(src).toMatch(/'\/api\/humanity_check_requests'/);
    expect(src).toMatch(/'\/api\/office_actions'/);
    expect(src).toMatch(/apiRaw\('PUT',\s*`\$\{endpoint\}\/\$\{requestId\}\/\$\{action\}`/);
  });

  it('keeps the stale-row guard that resyncs rather than guessing an endpoint (a prior review finding — do not regress)', () => {
    const guardBlock = src.match(/if \(!row\) \{[\s\S]*?\r?\n {2}\}/)[0];
    expect(guardBlock).toMatch(/_refetchAndRender\(\)/);
  });

  it('the purchase row reads the seat, the requester and the purchase, through the existing redaction helper', () => {
    const body = src.match(/function _renderOfficePurchaseRow\(r\) \{[\s\S]*?\r?\n\}\r?\n/)[0];
    expect(body).toMatch(/office_category/);
    expect(body).toMatch(/seat_label/);
    expect(body).toMatch(/redactCharName/);
    expect(body).toMatch(/dtl-badge/);
    expect(body).toMatch(/data-oaq-action="accept"/);
    expect(body).toMatch(/data-oaq-action="decline"/);
  });

  it('adds no new event listener — the existing delegated pair still covers this row type', () => {
    const handlerBody = src.slice(src.indexOf('function _attachDelegatedHandlers'), src.indexOf('function _refetchAndRender'));
    const addListenerCalls = handlerBody.match(/addEventListener\(/g) || [];
    expect(addListenerCalls.length).toBe(2);
    expect(src.replace(handlerBody, '')).not.toMatch(/addEventListener\(/);
  });

  it('names the third pending type in the module header and the scaffold sub-line', () => {
    const header = src.slice(0, src.indexOf('import '));
    expect(header).toMatch(/office_purchase|Office Purchase|XP spend/i);
    const scaffold = src.match(/function renderScaffold\(\) \{[\s\S]*?\r?\n\}\r?\n/)[0];
    expect(scaffold).toMatch(/Office Purchases|Purchases/);
  });

  // AC11 / the same static-analysis technique gdx.12's AC8 patch established:
  // prove the SHARED status_action renderer was not touched by this diff.
  it("_renderRow's own body carries none of this story's new vocabulary (status_action rows unaffected)", () => {
    const match = src.match(/function _renderRow\(r\) \{[\s\S]*?\r?\n\}\r?\n/);
    expect(match, '_renderRow function body not found in source').toBeTruthy();
    const body = match[0];
    expect(body).not.toMatch(/_renderOfficePurchaseRow/);
    expect(body).not.toMatch(/office_purchase/);
    expect(body).not.toMatch(/purchase_kind/);
    expect(body).not.toMatch(/seat_label/);
  });

  it("_renderHumanityCheckRow's own body is likewise untouched by this story (humanity_check rows unaffected)", () => {
    const body = src.match(/function _renderHumanityCheckRow\(r\) \{[\s\S]*?\r?\n\}\r?\n/)[0];
    expect(body).not.toMatch(/_renderOfficePurchaseRow/);
    expect(body).not.toMatch(/office_purchase/);
    expect(body).not.toMatch(/purchase_kind/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC9 — Office tab holder request affordance
// ─────────────────────────────────────────────────────────────────────────────

describe('oxp.9 — office-tab.js holder request affordance (AC9, static analysis)', () => {
  const src = readFile('public/js/tabs/office-tab.js');

  it('submits through the already-imported apiPost and reports through the canonical toast()', () => {
    expect(src).toMatch(/import \{ toast \} from '\.\.\/suite\/toast\.js'/);
    expect(src).toMatch(/apiPost\('\/api\/office_purchase_requests'/);
  });

  it('does not reuse the Head-of-State Status Action message element for purchase feedback', () => {
    const submit = src.match(/async function _submitPurchaseRequest\([\s\S]*?\r?\n\}\r?\n/)[0];
    expect(submit).not.toMatch(/office-action-msg/);
  });

  it('honours the render-generation guard around its own post-await refresh', () => {
    const submit = src.match(/async function _submitPurchaseRequest\([\s\S]*?\r?\n\}\r?\n/)[0];
    expect(submit).toMatch(/const gen = el\._officeManoeuvreGen;/);
    expect(submit).toMatch(/if \(gen !== el\._officeManoeuvreGen\) return;/);
  });

  it("the pending-request read joins _refreshPurchaseState's allSettled as a third entry with its own failure flag", () => {
    const fn = src.match(/async function _refreshPurchaseState\([\s\S]*?\r?\n\}\r?\n/)[0];
    expect(fn).toMatch(/Promise\.allSettled\(\[/);
    expect(fn).toMatch(/dotsResult, ranksResult, pendingResult/);
    expect(fn).toMatch(/\/api\/office_purchase_requests\?seat_id=/);
    expect(fn).toMatch(/pendingFailed = true/);
    // A failed pending-request fetch must not blank the merit or manoeuvre
    // sections — it only feeds its own flag, never meritFailed/rankFailed.
    expect(fn).toMatch(/meritFailed/);
    expect(fn).toMatch(/rankFailed/);
  });

  it('gates the whole affordance on a CONFIRMED own-office holder view', () => {
    expect(src).toMatch(/const canRequest = isOwnOffice && outcome\.confirmed === true;/);
  });

  it('reuses oxp.6\'s existing shortfall reasons as the disabled control\'s title rather than recomputing them', () => {
    const fn = src.match(/function _requestControlHtml\([\s\S]*?\r?\n\}\r?\n/)[0];
    expect(fn).toMatch(/reason/);
    expect(fn).toMatch(/Awaiting ST approval/);
  });

  it('uses a token-based CSS class, never an inline style attribute, for the new control', () => {
    expect(src).toMatch(/office-request-btn/);
    const css = readFile('public/css/suite.css');
    expect(css).toMatch(/\.office-request-btn/);
    // Project convention (specs/project-context.md): no bare hex, no rgba(),
    // in the new rules this story adds.
    const block = css.slice(css.indexOf('/* oxp.9'), css.indexOf('/* oxp.9') + 1200);
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(block).not.toMatch(/rgba\(/);
  });

  it('leaves the ST stepper block untouched (the existing _isST() controls are a separate affordance)', () => {
    expect(src).toMatch(/data-merit-up="\$\{esc\(merit\)\}"/);
    expect(src).toMatch(/data-manoeuvre-rank-up/);
    expect(src).toMatch(/apiPut\(`\/api\/office_manoeuvre_rank\/\$\{encodeURIComponent\(outcome\.seatId\)\}\/step`/);
  });

  it('corrects the stale "oxp.9 would add one" budget-check comments (AC10)', () => {
    expect(src).not.toMatch(/oxp\.9 would add/);
    expect(readFile('public/js/data/office-xp.js')).not.toMatch(/oxp\.9 would add/);
  });
});

describe('oxp.9 — office-tab.js render-level: no purchase state leaks to a reference viewer (AC9)', () => {
  // The stub-then-import technique issue-1141-office-tab-render.test.js
  // established: office-tab.js's import chain reads location.hostname at
  // module top level, and this project's vitest config has no jsdom.
  const hadLocation = 'location' in globalThis;
  let manoeuvreRankHtml;

  beforeAll(async () => {
    if (!hadLocation) globalThis.location = { hostname: 'test', pathname: '/', origin: 'http://test' };
    ({ manoeuvreRankHtml } = await import('../../public/js/tabs/office-tab.js'));
  });

  afterAll(() => {
    if (!hadLocation) delete globalThis.location;
  });

  it('manoeuvreRankHtml still emits the ST stepper and nothing about purchase requests', () => {
    const html = manoeuvreRankHtml(2, 5, true);
    expect(html).toMatch(/data-manoeuvre-rank-up/);
    expect(html).not.toMatch(/office-request-btn/);
  });

  it('manoeuvreRankHtml for a non-ST emits no controls at all', () => {
    const html = manoeuvreRankHtml(2, 5, false);
    expect(html).not.toMatch(/data-manoeuvre-rank-up/);
    expect(html).not.toMatch(/office-request-btn/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC5 — the race-safety precedents this codebase already paid a review round
// for, re-proved here rather than re-learned.
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!dbAvailable)('oxp.9 — accept race safety (AC5)', () => {
  it('two simultaneous accepts apply exactly one dot: one 200, one 409', async () => {
    const pending = await submitAs(holderUser(), { seat_id: HOS, purchase_kind: 'merit', merit: 'Haven' });

    const [a, b] = await Promise.all([
      request(app).put(`/api/office_purchase_requests/${pending._id}/accept`).set('X-Test-User', stUser()).send({}),
      request(app).put(`/api/office_purchase_requests/${pending._id}/accept`).set('X-Test-User', stUser()).send({}),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);

    const doc = await getCollection('office_merit_dots').findOne({ _id: HOS.toLowerCase() });
    expect(doc.dots.Haven).toBe(1);
  });

  it('two simultaneous accepts on a manoeuvre request move the rank by exactly one', async () => {
    const pending = await submitAs(holderUser(), { seat_id: HOS, purchase_kind: 'manoeuvre' });

    const [a, b] = await Promise.all([
      request(app).put(`/api/office_purchase_requests/${pending._id}/accept`).set('X-Test-User', stUser()).send({}),
      request(app).put(`/api/office_purchase_requests/${pending._id}/accept`).set('X-Test-User', stUser()).send({}),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const doc = await getCollection('office_manoeuvre_ranks').findOne({ _id: HOS.toLowerCase() });
    expect(doc.rank).toBe(1);
  });

  it('applies the manoeuvre step through the SAME clamped aggregation pipeline office-manoeuvre-rank.js/step uses, never a read-then-write absolute', () => {
    const src = readFile('server/routes/office-purchase.js');
    const accept = src.slice(src.indexOf("router.put('/:id/accept'"), src.indexOf("router.put('/:id/decline'"));
    expect(accept).toMatch(/\$min:\s*\[max,/);
    expect(accept).toMatch(/\$max:\s*\[0,/);
    expect(accept).toMatch(/\$add:\s*\[\{ \$ifNull: \['\$rank', 0\] \}, 1\]/);
    expect(accept).toMatch(/\$literal/);
    // Never a client- or route-computed absolute written straight back.
    expect(accept).not.toMatch(/\$set: \{ rank: to \}/);
  });

  it('claims the pending record BEFORE either purchase write (the ordering office-actions.js adopted after a real concurrent-accept race)', () => {
    const src = readFile('server/routes/office-purchase.js');
    const accept = src.slice(src.indexOf("router.put('/:id/accept'"), src.indexOf("router.put('/:id/decline'"));
    const claimAt = accept.indexOf('const claim = await pendingCol().updateOne(');
    const meritWriteAt = accept.indexOf('await meritDotsCol().updateOne(');
    const rankWriteAt = accept.indexOf('await manoeuvreCol().updateOne(');
    expect(claimAt).toBeGreaterThan(-1);
    expect(claimAt).toBeLessThan(meritWriteAt);
    expect(claimAt).toBeLessThan(rankWriteAt);
  });

  it('runs inside a real transaction, so a rejection after the claim leaves nothing half-applied', () => {
    const src = readFile('server/routes/office-purchase.js');
    expect(src).toMatch(/getClient\(\)/);
    expect(src).toMatch(/dbSession\.withTransaction\(/);
    expect(src).toMatch(/session: dbSession/);
  });

  // The BEHAVIOURAL counterpart to the three regex checks above. Codex review,
  // 2026-08-27 pass 1, found that the static test could not fail if a purchase
  // write were moved outside the transaction callback, because it only asserts
  // that three strings appear somewhere in the file.
  //
  // The failure is forced with DATA, not a test-only hook in production code:
  // an `office_merit_dots` document whose `dots` is a scalar rather than a
  // sub-document passes every route-level check (the dot lookup on a number
  // reads undefined, so `from` is 0 and the purchase looks perfectly legal),
  // and then makes MongoDB itself reject `$set: { 'dots.Haven': 1 }` — after
  // the claim has already been written inside the same transaction.
  it('a failure in the purchase write rolls the claim back with it (behavioural, not a source-text check)', async () => {
    await getCollection('office_merit_dots').insertOne({ _id: HOS.toLowerCase(), dots: 5, office_category: 'Head of State' });
    const pending = await submitAs(holderUser(), { seat_id: HOS, purchase_kind: 'merit', merit: 'Haven' });

    const res = await request(app)
      .put(`/api/office_purchase_requests/${pending._id}/accept`)
      .set('X-Test-User', stUser())
      .send({});

    expect(res.status, 'the purchase write must genuinely fail for this test to prove anything').toBeGreaterThanOrEqual(500);

    // The claim was written BEFORE the purchase write, inside the transaction.
    // If either write escaped it, this record would be stranded as
    // resolved-but-unapplied — approved XP spend with nothing bought.
    const fresh = await getCollection('contested_roll_requests').findOne({ _id: new ObjectId(pending._id) });
    expect(fresh.status, 'the claim must roll back with the failed purchase write').toBe('pending');
    expect(fresh.outcome).toBeNull();
    expect(fresh.resolved_by).toBeUndefined();

    const doc = await getCollection('office_merit_dots').findOne({ _id: HOS.toLowerCase() });
    expect(doc.dots, 'nothing may be half-applied to the purchase collection either').toBe(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// External code-review round, 2026-08-27 — three isolated Codex passes.
//
// Every test below covers a defect found OUTSIDE this session, by an external
// reviewer, and every one was reproduced here (red) before its fix was
// written. See specs/stories/code-review/oxp-9-spend-routes-through-oaq-codex-
// findings-pass{1,2,3}.md for the raw findings and the Senior Developer Review
// section of the story for the triage.
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!dbAvailable)('oxp.9 review — one-pending-per-seat is enforced by a partial unique index, not a racing findOne (pass 1 + pass 2)', () => {
  it('a concurrent burst for one seat creates exactly ONE pending record', async () => {
    // Pass 2's own reproduction, scaled down: it fired twelve, got ten 201s and
    // ten pending rows, then accepted two of them onto the same merit. The
    // findOne pre-check alone cannot arbitrate this — every handler completes
    // its read before any insert commits.
    const responses = await Promise.all(
      Array.from({ length: 8 }, () => request(app)
        .post('/api/office_purchase_requests')
        .set('X-Test-User', holderUser())
        .send({ seat_id: HOS, purchase_kind: 'merit', merit: 'Haven' })),
    );

    const created = responses.filter(r => r.status === 201);
    const conflicted = responses.filter(r => r.status === 409);
    expect(created.length, 'exactly one submission may win the seat').toBe(1);
    expect(conflicted.length).toBe(7);
    for (const r of conflicted) expect(r.body.error).toBe('CONFLICT');

    const pendingCount = await getCollection('contested_roll_requests')
      .countDocuments({ request_type: 'office_purchase', seat_id: HOS.toLowerCase(), status: 'pending' });
    expect(pendingCount, 'the database itself must hold exactly one pending row for this seat').toBe(1);
  });

  it('a resolved record does not block a later resubmission (the index is partial-filtered to pending)', async () => {
    const first = await submitAs(holderUser(), { seat_id: HOS, purchase_kind: 'merit', merit: 'Haven' });
    await request(app).put(`/api/office_purchase_requests/${first._id}/accept`).set('X-Test-User', stUser()).send({});

    const second = await request(app)
      .post('/api/office_purchase_requests')
      .set('X-Test-User', holderUser())
      .send({ seat_id: HOS, purchase_kind: 'manoeuvre' });

    expect(second.status).toBe(201);
  });

  it('two different seats may each hold their own pending request (the index is keyed on seat_id, not global)', async () => {
    const a = await request(app).post('/api/office_purchase_requests').set('X-Test-User', holderUser())
      .send({ seat_id: HOS, purchase_kind: 'merit', merit: 'Haven' });
    const b = await request(app).post('/api/office_purchase_requests').set('X-Test-User', holderUser())
      .send({ seat_id: PRIMOGEN, purchase_kind: 'merit', merit: 'Contacts' });

    expect([a.status, b.status]).toEqual([201, 201]);
  });

  it('server/index.js declares that index at boot, beside oaq.2\'s own', () => {
    const src = readFile('server/index.js');
    const marker = "collection('contested_roll_requests').createIndex(";
    const blocks = [];
    let at = src.indexOf(marker);
    while (at !== -1) {
      blocks.push(src.slice(at, src.indexOf('\n    );', at)).replace(/\s+/g, ' '));
      at = src.indexOf(marker, at + 1);
    }
    const mine = blocks.filter(b => b.includes("request_type: 'office_purchase'"));
    expect(mine.length, 'exactly one boot-time index for the office_purchase dedupe').toBe(1);
    expect(mine[0]).toContain('seat_id: 1');
    expect(mine[0]).toContain('unique: true');
    expect(mine[0], 'partial-filtered to pending so a resolved record never blocks a resubmission').toContain("status: 'pending'");
  });

  it('the route translates the duplicate-key error into the same 409 the pre-check returns', () => {
    const src = readFile('server/routes/office-purchase.js');
    const post = src.slice(src.indexOf("router.post('/'"), src.indexOf("router.get('/'"));
    expect(post).toMatch(/err\.code === 11000/);
    expect(post).toMatch(/A purchase request is already pending for this seat/);
  });
});

describe.skipIf(!dbAvailable)('oxp.9 review — a seat whose OFFICE changed after submission is refused, never retargeted (pass 2)', () => {
  it('409s when the seat moved to another office category between submission and approval', async () => {
    // Pass 2's exact reproduction: Resources belongs to BOTH Head of State and
    // Primogen, so the purchase stays superficially legal under the new office
    // and used to be applied under its rules, with its denormalised category.
    const pending = await submitAs(holderUser(), { seat_id: HOS, purchase_kind: 'merit', merit: 'Resources' });
    expect(pending.office_category).toBe('Head of State');
    await getCollection('office_seats').updateOne({ _id: SEAT_HOS }, { $set: { office_category: 'Primogen' } });

    const res = await request(app)
      .put(`/api/office_purchase_requests/${pending._id}/accept`)
      .set('X-Test-User', stUser())
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/office changed/i);
    expect(await getCollection('office_merit_dots').findOne({ _id: HOS.toLowerCase() })).toBeNull();
    const fresh = await getCollection('contested_roll_requests').findOne({ _id: new ObjectId(pending._id) });
    expect(fresh.status, 'the request stays actionable rather than being applied to the wrong office').toBe('pending');
  });

  it('409s for a manoeuvre request too, which would otherwise advance a different named ladder', async () => {
    const pending = await submitAs(holderUser(), { seat_id: HOS, purchase_kind: 'manoeuvre' });
    await getCollection('office_seats').updateOne({ _id: SEAT_HOS }, { $set: { office_category: 'Enforcer' } });

    const res = await request(app)
      .put(`/api/office_purchase_requests/${pending._id}/accept`)
      .set('X-Test-User', stUser())
      .send({});

    expect(res.status).toBe(409);
    expect(await getCollection('office_manoeuvre_ranks').findOne({ _id: HOS.toLowerCase() })).toBeNull();
  });
});

describe.skipIf(!dbAvailable)('oxp.9 review — STRICT re-validation: any intervening move of the target value is a 409 (pass 3)', () => {
  it('records the value observed at submission on the pending document', async () => {
    await getCollection('office_merit_dots').insertOne({ _id: HOS.toLowerCase(), dots: { Haven: 2 }, office_category: 'Head of State' });
    const merit = await submitAs(holderUser(), { seat_id: HOS, purchase_kind: 'merit', merit: 'Haven' });
    expect(merit.submitted_from).toBe(2);

    await request(app).put(`/api/office_purchase_requests/${merit._id}/decline`).set('X-Test-User', stUser()).send({});
    const manoeuvre = await submitAs(holderUser(), { seat_id: HOS, purchase_kind: 'manoeuvre' });
    expect(manoeuvre.submitted_from).toBe(0);
  });

  it('MERIT: 409s when an ST stepper moved the dot count BELOW the cap between submission and approval', async () => {
    // Pass 3's reproduction. The cap is 5, so 0 -> 1 stays perfectly legal and
    // used to return 200 and land on 2 — a different purchase from the one the
    // ST was shown.
    const pending = await submitAs(holderUser(), { seat_id: HOS, purchase_kind: 'merit', merit: 'Haven' });
    expect(pending.submitted_from).toBe(0);
    await getCollection('office_merit_dots').insertOne({ _id: HOS.toLowerCase(), dots: { Haven: 1 }, office_category: 'Head of State' });

    const res = await request(app)
      .put(`/api/office_purchase_requests/${pending._id}/accept`)
      .set('X-Test-User', stUser())
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/moved from 0 to 1/);
    const doc = await getCollection('office_merit_dots').findOne({ _id: HOS.toLowerCase() });
    expect(doc.dots.Haven, 'nothing may be applied on top of the intervening change').toBe(1);
    const fresh = await getCollection('contested_roll_requests').findOne({ _id: new ObjectId(pending._id) });
    expect(fresh.status).toBe('pending');
  });

  it('MANOEUVRE: 409s when an ST stepper moved the rank BELOW the ceiling between submission and approval', async () => {
    const pending = await submitAs(holderUser(), { seat_id: HOS, purchase_kind: 'manoeuvre' });
    expect(pending.submitted_from).toBe(0);
    await getCollection('office_manoeuvre_ranks').insertOne({ _id: HOS.toLowerCase(), rank: 1, office_category: 'Head of State' });

    const res = await request(app)
      .put(`/api/office_purchase_requests/${pending._id}/accept`)
      .set('X-Test-User', stUser())
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/moved from 0 to 1/);
    const doc = await getCollection('office_manoeuvre_ranks').findOne({ _id: HOS.toLowerCase() });
    expect(doc.rank).toBe(1);
  });

  it('a DOWN-stepper counts too — the rule is "any change", not "any increase"', async () => {
    await getCollection('office_merit_dots').insertOne({ _id: HOS.toLowerCase(), dots: { Haven: 3 }, office_category: 'Head of State' });
    const pending = await submitAs(holderUser(), { seat_id: HOS, purchase_kind: 'merit', merit: 'Haven' });
    await getCollection('office_merit_dots').updateOne({ _id: HOS.toLowerCase() }, { $set: { 'dots.Haven': 2 } });

    const res = await request(app)
      .put(`/api/office_purchase_requests/${pending._id}/accept`)
      .set('X-Test-User', stUser())
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/moved from 3 to 2/);
  });

  it('an UNCHANGED value still accepts normally (the strict check is not an accept-nothing gate)', async () => {
    await getCollection('office_merit_dots').insertOne({ _id: HOS.toLowerCase(), dots: { Haven: 2 }, office_category: 'Head of State' });
    const pending = await submitAs(holderUser(), { seat_id: HOS, purchase_kind: 'merit', merit: 'Haven' });

    const res = await request(app)
      .put(`/api/office_purchase_requests/${pending._id}/accept`)
      .set('X-Test-User', stUser())
      .send({});

    expect(res.status).toBe(200);
    const doc = await getCollection('office_merit_dots').findOne({ _id: HOS.toLowerCase() });
    expect(doc.dots.Haven).toBe(3);
  });

  it('a change to a DIFFERENT merit on the same seat does not block the request', async () => {
    const pending = await submitAs(holderUser(), { seat_id: HOS, purchase_kind: 'merit', merit: 'Haven' });
    await getCollection('office_merit_dots').insertOne({ _id: HOS.toLowerCase(), dots: { Staff: 2 }, office_category: 'Head of State' });

    const res = await request(app)
      .put(`/api/office_purchase_requests/${pending._id}/accept`)
      .set('X-Test-User', stUser())
      .send({});

    expect(res.status).toBe(200);
    const doc = await getCollection('office_merit_dots').findOne({ _id: HOS.toLowerCase() });
    expect(doc.dots).toEqual({ Staff: 2, Haven: 1 });
  });
});

describe.skipIf(!dbAvailable)('oxp.9 review — a corrupted stored manoeuvre rank is refused, never coerced (pass 1)', () => {
  it('a NEGATIVE stored rank is refused at accept rather than producing an outcome that disagrees with storage', async () => {
    // Pass 1, hand-traced but never run against a database (its session had no
    // mongod): `rank: -5` recorded `to: -4` in the audit outcome while the
    // clamped pipeline stored 0. Reproduced here for real before fixing.
    const pending = await submitAs(holderUser(), { seat_id: HOS, purchase_kind: 'manoeuvre' });
    await getCollection('office_manoeuvre_ranks').insertOne({ _id: HOS.toLowerCase(), rank: -5, office_category: 'Head of State' });

    const res = await request(app)
      .put(`/api/office_purchase_requests/${pending._id}/accept`)
      .set('X-Test-User', stUser())
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/not a valid rank/i);
    const doc = await getCollection('office_manoeuvre_ranks').findOne({ _id: HOS.toLowerCase() });
    expect(doc.rank, 'the corrupted value is left exactly as found, for an ST to correct').toBe(-5);
  });

  it('a NON-NUMERIC stored rank is a controlled 409, not an uncaught 500 from MongoDB\'s $add', async () => {
    const pending = await submitAs(holderUser(), { seat_id: HOS, purchase_kind: 'manoeuvre' });
    await getCollection('office_manoeuvre_ranks').insertOne({ _id: HOS.toLowerCase(), rank: 'bad', office_category: 'Head of State' });

    const res = await request(app)
      .put(`/api/office_purchase_requests/${pending._id}/accept`)
      .set('X-Test-User', stUser())
      .send({});

    expect(res.status).toBe(409);
    const fresh = await getCollection('contested_roll_requests').findOne({ _id: new ObjectId(pending._id) });
    expect(fresh.status, 'the request must stay actionable rather than being stranded by a 500').toBe('pending');
  });

  it('the same corruption is refused at SUBMISSION with a 400, so it never reaches the queue', async () => {
    await getCollection('office_manoeuvre_ranks').insertOne({ _id: HOS.toLowerCase(), rank: 'bad', office_category: 'Head of State' });

    const res = await request(app)
      .post('/api/office_purchase_requests')
      .set('X-Test-User', holderUser())
      .send({ seat_id: HOS, purchase_kind: 'manoeuvre' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not a valid rank/i);
  });

  it('a missing document and a legitimate rank of 0 are both still read as 0', async () => {
    const a = await submitAs(holderUser(), { seat_id: HOS, purchase_kind: 'manoeuvre' });
    expect(a.submitted_from).toBe(0);
    await request(app).put(`/api/office_purchase_requests/${a._id}/decline`).set('X-Test-User', stUser()).send({});

    await getCollection('office_manoeuvre_ranks').insertOne({ _id: HOS.toLowerCase(), rank: 0, office_category: 'Head of State' });
    const b = await submitAs(holderUser(), { seat_id: HOS, purchase_kind: 'manoeuvre' });
    expect(b.submitted_from).toBe(0);
  });
});

describe.skipIf(!dbAvailable)('oxp.9 review — a non-array character_ids denies access CLEANLY (pass 1)', () => {
  const brokenUser = () => playerUser([], { character_ids: HOLDER });

  it('POST is a controlled 403, not a 500 from calling .map on a string', async () => {
    const res = await request(app)
      .post('/api/office_purchase_requests')
      .set('X-Test-User', brokenUser())
      .send({ seat_id: HOS, purchase_kind: 'merit', merit: 'Haven' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  it('GET is a controlled 403 too', async () => {
    const res = await request(app)
      .get(`/api/office_purchase_requests?seat_id=${HOS}`)
      .set('X-Test-User', brokenUser());

    expect(res.status).toBe(403);
  });

  it('still fails CLOSED — a malformed character_ids never grants holder access', async () => {
    const res = await request(app)
      .post('/api/office_purchase_requests')
      .set('X-Test-User', brokenUser())
      .send({ seat_id: HOS, purchase_kind: 'merit', merit: 'Haven' });

    expect(res.status).not.toBe(201);
    expect(await getCollection('contested_roll_requests')
      .countDocuments({ request_type: 'office_purchase', seat_id: HOS.toLowerCase() })).toBe(0);
  });
});
