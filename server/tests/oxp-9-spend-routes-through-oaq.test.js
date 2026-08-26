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
});
