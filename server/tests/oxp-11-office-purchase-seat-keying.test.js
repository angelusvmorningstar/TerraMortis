/**
 * oxp.11 — office purchase collections, migrated to seat-keying.
 *
 * `office_merit_dots` and `office_manoeuvre_ranks` used to be keyed by office
 * category, ONE document per office. Two offices carry two concurrent seats
 * each (Primogen: Yusuf Kalusicj and Rene St. Dominique; Socialite: Brandy
 * LaRoux "Harpy" and Carver "People's Harpy"), so there was no way to record
 * that one seat had bought something and the other had not. This suite proves
 * the re-keying actually closed that, and that it did not cost oxp.4 its
 * handover guarantee on the way.
 *
 * Three parts:
 *
 *   1. AC8, the independence proof, and the point of the whole story: two seats
 *      of the SAME office hold two separate purchase documents that do not
 *      disturb one another. Primogen is the harder case and is covered
 *      explicitly, because both its seats carry an identical `court_title` and
 *      a null `seat_label` — nothing but the document identity separates them.
 *   2. AC9: oxp.4's "merits survive a handover" guarantee, re-proved under the
 *      new keying rather than assumed to have survived it.
 *   3. AC4: the one-time migration script, exercised through its exported
 *      functions against `tm_suite_test` only, never by shelling out.
 *
 * DB-backed: real MongoDB required. See db-setup.js. A skipped suite is not a
 * passing suite — read the summary line, not the exit code.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { ObjectId } from 'mongodb';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb, isDbAvailable } from './helpers/db-setup.js';
import { getCollection } from '../db.js';
import {
  planMigration,
  applyMigration,
  PURCHASE_COLLECTIONS,
} from '../scripts/migrate-office-purchases-to-seats.mjs';

const dbAvailable = await isDbAvailable();

// Explicit, known seat _ids so this suite deletes exactly its own fixtures.
// `office_seats` is shared with oxp.1's and oxp.2's suites, so a
// deleteMany({}) here would silently reach into theirs.
const seatId = n => new ObjectId(`0f11${'0'.repeat(16)}${String(n).padStart(4, '0')}`);

const SEAT_PRIMOGEN_A  = seatId(101);
const SEAT_PRIMOGEN_B  = seatId(102);
const SEAT_SOCIALITE_A = seatId(103);
const SEAT_SOCIALITE_B = seatId(104);
const SEAT_ENFORCER    = seatId(105);
const SEAT_HOS         = seatId(106);
const SEAT_IDS = [
  SEAT_PRIMOGEN_A, SEAT_PRIMOGEN_B,
  SEAT_SOCIALITE_A, SEAT_SOCIALITE_B,
  SEAT_ENFORCER, SEAT_HOS,
];

const P_A = String(SEAT_PRIMOGEN_A);
const P_B = String(SEAT_PRIMOGEN_B);
const S_A = String(SEAT_SOCIALITE_A);
const S_B = String(SEAT_SOCIALITE_B);
const ENF = String(SEAT_ENFORCER);

/**
 * Primogen's two seats mirror the live pair deliberately: identical
 * `office_category`, identical (null) `seat_label`, same `created_at`. Nothing
 * but the `_id` tells them apart, which is exactly the case category-keying
 * could not express.
 */
const SEAT_FIXTURES = [
  { _id: SEAT_PRIMOGEN_A,  office_category: 'Primogen',      holder_id: null, created_at: '2026-02-21', seat_label: null,             notes: null },
  { _id: SEAT_PRIMOGEN_B,  office_category: 'Primogen',      holder_id: null, created_at: '2026-02-21', seat_label: null,             notes: null },
  { _id: SEAT_SOCIALITE_A, office_category: 'Socialite',     holder_id: null, created_at: '2026-02-21', seat_label: 'Harpy',          notes: null },
  { _id: SEAT_SOCIALITE_B, office_category: 'Socialite',     holder_id: null, created_at: '2026-07-18', seat_label: "People's Harpy", notes: null },
  { _id: SEAT_ENFORCER,    office_category: 'Enforcer',      holder_id: null, created_at: '2026-02-21', seat_label: null,             notes: null },
  { _id: SEAT_HOS,         office_category: 'Head of State', holder_id: null, created_at: '2026-02-21', seat_label: null,             notes: null },
];

// Name prefix so this suite only ever removes its own character fixtures,
// escaped once so an edit to the prefix cannot change $regex semantics.
const FIXTURE_PREFIX = 'OXP11 Seat ';
const FIXTURE_PREFIX_RE = `^${FIXTURE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`;

let app;

beforeAll(async () => {
  if (!dbAvailable) return;
  await setupDb();
  app = createTestApp();
});

beforeEach(async () => {
  if (!dbAvailable) return;
  await getCollection('office_merit_dots').deleteMany({});
  await getCollection('office_manoeuvre_ranks').deleteMany({});
  await getCollection('office_seats').deleteMany({ _id: { $in: SEAT_IDS } });
  await getCollection('office_seats').insertMany(SEAT_FIXTURES.map(s => ({ ...s })));
  await getCollection('characters').deleteMany({ name: { $regex: FIXTURE_PREFIX_RE } });
});

afterAll(async () => {
  if (!dbAvailable) return;
  await getCollection('office_merit_dots').deleteMany({});
  await getCollection('office_manoeuvre_ranks').deleteMany({});
  await getCollection('office_seats').deleteMany({ _id: { $in: SEAT_IDS } });
  await getCollection('characters').deleteMany({ name: { $regex: FIXTURE_PREFIX_RE } });
  await teardownDb();
});

/** Two writes in the same millisecond would share an `updated_at`, which would
 *  quietly weaken every "the other seat's document did not change" assertion
 *  below. A few milliseconds apart is enough, and the tests assert the two
 *  timestamps really do differ rather than assuming it. */
const tick = () => new Promise(r => setTimeout(r, 5));

// ─────────────────────────────────────────────────────────────────────────────
// AC8: the independence proof. This is the point of the whole story.
//
// Two seats of the SAME office hold two separate purchase documents that do not
// disturb one another. Primogen is the harder of the two multi-seat offices and
// is covered explicitly: both its seats carry an identical court title and a
// null seat_label, so nothing but the document identity separates them — which
// is exactly what a category-keyed implementation could not express.
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!dbAvailable)('oxp.11 AC8 — two seats of one office are independent', () => {
  it('office_merit_dots: Primogen\'s two seats hold separate documents', async () => {
    await request(app).put(`/api/office_merit_dots/${P_A}`).set('X-Test-User', stUser())
      .send({ merit: 'Contacts', dots: 3 }).expect(200);
    const storedA = await getCollection('office_merit_dots').findOne({ _id: P_A });

    await tick();
    await request(app).put(`/api/office_merit_dots/${P_B}`).set('X-Test-User', stUser())
      .send({ merit: 'Resources', dots: 1 }).expect(200);

    // Two documents, distinct ids, each with its own value.
    const all = await getCollection('office_merit_dots').find({}).toArray();
    expect(all).toHaveLength(2);
    expect(all.map(d => d._id).sort()).toEqual([P_A, P_B].sort());

    // Both present in ONE GET response, under their own seat ids.
    const res = await request(app).get('/api/office_merit_dots').set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(res.body[P_A]).toEqual({ Contacts: 3 });
    expect(res.body[P_B]).toEqual({ Resources: 1 });

    // Seat B's write did not touch seat A's stored document at all — not its
    // values and not its updated_at, so a write that rewrote identical numbers
    // back would still be caught here.
    const reReadA = await getCollection('office_merit_dots').findOne({ _id: P_A });
    expect(reReadA).toEqual(storedA);
    const storedB = await getCollection('office_merit_dots').findOne({ _id: P_B });
    expect(storedB.updated_at).not.toBe(storedA.updated_at);
  });

  it('office_merit_dots: the SAME merit at different ratings on each Primogen seat', async () => {
    // The sharpest form of the bug this story exists to fix. Under
    // category-keying the second write would simply overwrite the first.
    await request(app).put(`/api/office_merit_dots/${P_A}`).set('X-Test-User', stUser())
      .send({ merit: 'Contacts', dots: 4 }).expect(200);
    await tick();
    await request(app).put(`/api/office_merit_dots/${P_B}`).set('X-Test-User', stUser())
      .send({ merit: 'Contacts', dots: 1 }).expect(200);

    const res = await request(app).get('/api/office_merit_dots').set('X-Test-User', stUser());
    expect(res.body[P_A].Contacts).toBe(4);
    expect(res.body[P_B].Contacts).toBe(1);
  });

  it('office_manoeuvre_ranks: Primogen\'s two seats climb the ladder independently', async () => {
    await request(app).put(`/api/office_manoeuvre_rank/${P_A}`).set('X-Test-User', stUser())
      .send({ rank: 4 }).expect(200);
    const storedA = await getCollection('office_manoeuvre_ranks').findOne({ _id: P_A });

    await tick();
    await request(app).put(`/api/office_manoeuvre_rank/${P_B}/step`).set('X-Test-User', stUser())
      .send({ delta: 1 }).expect(200);

    const res = await request(app).get('/api/office_manoeuvre_rank').set('X-Test-User', stUser());
    expect(res.body[P_A]).toBe(4);
    expect(res.body[P_B]).toBe(1);

    const reReadA = await getCollection('office_manoeuvre_ranks').findOne({ _id: P_A });
    expect(reReadA).toEqual(storedA);
    const storedB = await getCollection('office_manoeuvre_ranks').findOne({ _id: P_B });
    expect(storedB.updated_at).not.toBe(storedA.updated_at);
  });

  it('office_manoeuvre_ranks: stepping one Primogen seat to zero leaves the other\'s rank alone', async () => {
    // The direct shape of what oxp.5 will need: one seat's progress wiped, the
    // other's untouched. Under category-keying this was impossible.
    await request(app).put(`/api/office_manoeuvre_rank/${P_A}`).set('X-Test-User', stUser())
      .send({ rank: 3 }).expect(200);
    await request(app).put(`/api/office_manoeuvre_rank/${P_B}`).set('X-Test-User', stUser())
      .send({ rank: 5 }).expect(200);
    const storedB = await getCollection('office_manoeuvre_ranks').findOne({ _id: P_B });

    await tick();
    await request(app).put(`/api/office_manoeuvre_rank/${P_A}`).set('X-Test-User', stUser())
      .send({ rank: 0 }).expect(200);

    const res = await request(app).get('/api/office_manoeuvre_rank').set('X-Test-User', stUser());
    expect(res.body[P_A]).toBe(0);
    expect(res.body[P_B]).toBe(5);
    expect(await getCollection('office_manoeuvre_ranks').findOne({ _id: P_B })).toEqual(storedB);
  });

  it('Socialite\'s two seats are equally independent, in both collections', async () => {
    await request(app).put(`/api/office_merit_dots/${S_A}`).set('X-Test-User', stUser())
      .send({ merit: 'Cacophony Savvy', dots: 3 }).expect(200);
    await request(app).put(`/api/office_manoeuvre_rank/${S_A}`).set('X-Test-User', stUser())
      .send({ rank: 2 }).expect(200);
    const dotsA = await getCollection('office_merit_dots').findOne({ _id: S_A });
    const rankA = await getCollection('office_manoeuvre_ranks').findOne({ _id: S_A });

    await tick();
    await request(app).put(`/api/office_merit_dots/${S_B}`).set('X-Test-User', stUser())
      .send({ merit: 'Cacophony Savvy', dots: 1 }).expect(200);
    await request(app).put(`/api/office_manoeuvre_rank/${S_B}`).set('X-Test-User', stUser())
      .send({ rank: 5 }).expect(200);

    const dots = await request(app).get('/api/office_merit_dots').set('X-Test-User', stUser());
    const ranks = await request(app).get('/api/office_manoeuvre_rank').set('X-Test-User', stUser());
    expect(dots.body[S_A]['Cacophony Savvy']).toBe(3);
    expect(dots.body[S_B]['Cacophony Savvy']).toBe(1);
    expect(ranks.body[S_A]).toBe(2);
    expect(ranks.body[S_B]).toBe(5);

    expect(await getCollection('office_merit_dots').findOne({ _id: S_A })).toEqual(dotsA);
    expect(await getCollection('office_manoeuvre_ranks').findOne({ _id: S_A })).toEqual(rankA);
  });

  it('both seats of one office carry the SAME denormalised office_category, which is therefore useless as a key', () => {
    // Stated as a test rather than a comment because it is the reason AC1
    // insists the category is never authoritative: it cannot tell the two
    // seats apart, and only the seat id can.
    const primogenSeats = SEAT_FIXTURES.filter(s => s.office_category === 'Primogen');
    expect(primogenSeats).toHaveLength(2);
    expect(primogenSeats[0].seat_label).toBeNull();
    expect(primogenSeats[1].seat_label).toBeNull();
    expect(String(primogenSeats[0]._id)).not.toBe(String(primogenSeats[1]._id));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC9: oxp.4's handover guarantee under multi-seat keying.
//
// oxp-4-merit-persistence-handover.test.js proves the single-seat case end to
// end. What that file cannot express, and this one can, is the case that only
// exists because of oxp.11: a handover on ONE of an office's two seats.
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!dbAvailable)('oxp.11 AC9 — a handover on one seat of a two-seat office', () => {
  async function createChar(name, courtCategory) {
    const body = { name: FIXTURE_PREFIX + name };
    if (courtCategory !== undefined) body.court_category = courtCategory;
    const res = await request(app).post('/api/characters').set('X-Test-User', stUser()).send(body);
    expect(res.status).toBe(201);
    return String(res.body._id);
  }

  async function repointSeat(seatObjectId, holderId) {
    await getCollection('office_seats').updateOne(
      { _id: seatObjectId },
      { $set: { holder_id: holderId === null ? null : new ObjectId(holderId) } },
    );
  }

  it('leaves BOTH seats\' purchase documents byte-identical, the other seat included', async () => {
    const yusuf = await createChar('Yusuf', 'Primogen');
    const rene  = await createChar('Rene', 'Primogen');
    const heir  = await createChar('Heir', null);
    await repointSeat(SEAT_PRIMOGEN_A, yusuf);
    await repointSeat(SEAT_PRIMOGEN_B, rene);

    await request(app).put(`/api/office_merit_dots/${P_A}`).set('X-Test-User', stUser())
      .send({ merit: 'Contacts', dots: 3 }).expect(200);
    await request(app).put(`/api/office_merit_dots/${P_B}`).set('X-Test-User', stUser())
      .send({ merit: 'Resources', dots: 2 }).expect(200);
    const beforeA = await getCollection('office_merit_dots').findOne({ _id: P_A });
    const beforeB = await getCollection('office_merit_dots').findOne({ _id: P_B });

    // A real handover of seat A only: the old holder's court_category moves
    // away through the real route, and the seat is repointed at the heir.
    await request(app).put(`/api/characters/${yusuf}`).set('X-Test-User', stUser())
      .send({ court_category: null }).expect(200);
    await request(app).put(`/api/characters/${heir}`).set('X-Test-User', stUser())
      .send({ court_category: 'Primogen' }).expect(200);
    await repointSeat(SEAT_PRIMOGEN_A, heir);

    expect(await getCollection('office_merit_dots').findOne({ _id: P_A })).toEqual(beforeA);
    expect(await getCollection('office_merit_dots').findOne({ _id: P_B })).toEqual(beforeB);

    // The heir sees seat A's merits from their own auth context, and Rene's
    // seat is still separately visible and still Rene's.
    const asHeir = await request(app).get('/api/office_merit_dots')
      .set('X-Test-User', playerUser([heir]));
    expect(asHeir.status).toBe(200);
    expect(asHeir.body[P_A]).toEqual({ Contacts: 3 });
    expect(asHeir.body[P_B]).toEqual({ Resources: 2 });
  });

  it('the seat id is a seat\'s identity, not a person\'s — no character id appears in either document', async () => {
    const yusuf = await createChar('Yusuf', 'Primogen');
    await repointSeat(SEAT_PRIMOGEN_A, yusuf);
    await request(app).put(`/api/office_merit_dots/${P_A}`).set('X-Test-User', stUser())
      .send({ merit: 'Contacts', dots: 1 }).expect(200);
    await request(app).put(`/api/office_manoeuvre_rank/${P_A}`).set('X-Test-User', stUser())
      .send({ rank: 1 }).expect(200);

    for (const name of ['office_merit_dots', 'office_manoeuvre_ranks']) {
      const stored = await getCollection(name).findOne({ _id: P_A });
      const serialised = JSON.stringify(stored);
      expect(serialised, name).not.toContain(yusuf);
      expect(serialised, name).not.toMatch(/holder/i);
      expect(serialised, name).not.toMatch(/character/i);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC4: the one-time migration script.
//
// Exercised through its exported functions against `tm_suite_test`, never by
// shelling out. The script's `main()` is never called here: it connects to
// whatever `MONGODB_DB` points at, and running it for real is Angelus's action,
// not a test's and not an agent's.
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!dbAvailable)('oxp.11 AC4 — migrate-office-purchases-to-seats', () => {
  const merits = () => getCollection('office_merit_dots');
  const ranks = () => getCollection('office_manoeuvre_ranks');
  const seats = () => getCollection('office_seats');

  it('names both purchase collections and nothing else', () => {
    expect(PURCHASE_COLLECTIONS).toEqual(['office_merit_dots', 'office_manoeuvre_ranks']);
  });

  it('plans a single-seat category as will-migrate, naming the seat it resolved', async () => {
    await merits().insertOne({ _id: 'Enforcer', dots: { 'Safe Place': 0 }, updated_at: '2026-08-12T00:00:00.000Z' });

    const rows = await planMigration(merits(), seats());
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('will-migrate');
    expect(rows[0].key).toBe('Enforcer');
    expect(rows[0].seatId).toBe(ENF);
  });

  it('the plan phase is pure — a dry run writes nothing at all', async () => {
    await merits().insertOne({ _id: 'Enforcer', dots: { 'Safe Place': 0 }, updated_at: '2026-08-12T00:00:00.000Z' });

    const rows = await planMigration(merits(), seats());
    const summary = await applyMigration(merits(), rows, { apply: false });

    expect(summary.migrated).toBe(0);
    expect(await merits().countDocuments({ _id: 'Enforcer' })).toBe(1);
    expect(await merits().countDocuments({ _id: ENF })).toBe(0);
  });

  it('rewrites a single-seat document under its seat id, preserving its content VERBATIM', async () => {
    const original = {
      _id: 'Enforcer',
      dots: { 'Safe Place': 0, 'Trained Observer': 2 },
      updated_at: '2026-08-12T09:15:00.000Z',
    };
    await merits().insertOne({ ...original });

    const rows = await planMigration(merits(), seats());
    const summary = await applyMigration(merits(), rows, { apply: true });

    expect(summary.migrated).toBe(1);
    expect(summary.deleted).toBe(1);

    const moved = await merits().findOne({ _id: ENF });
    expect(moved.dots).toEqual(original.dots);
    // updated_at is carried across untouched: the migration moves a document,
    // it does not re-write it, so a reader can still tell when an ST last
    // actually changed the purchase.
    expect(moved.updated_at).toBe(original.updated_at);
    expect(moved.office_category).toBe('Enforcer');
    // The stale category-keyed document is gone.
    expect(await merits().findOne({ _id: 'Enforcer' })).toBeNull();
  });

  it('REFUSES an ambiguous multi-seat category, leaving it untouched — never picks one', async () => {
    await merits().insertOne({ _id: 'Primogen', dots: { Resources: 3 }, updated_at: '2026-08-12T00:00:00.000Z' });

    const rows = await planMigration(merits(), seats());
    expect(rows[0].action).toBe('refused-ambiguous');
    // The refusal reports both candidates so a human can decide.
    expect(rows[0].seatIds.sort()).toEqual([P_A, P_B].sort());

    const summary = await applyMigration(merits(), rows, { apply: true });
    expect(summary.migrated).toBe(0);
    expect(summary.refused).toBe(1);

    const untouched = await merits().findOne({ _id: 'Primogen' });
    expect(untouched.dots).toEqual({ Resources: 3 });
    expect(await merits().countDocuments({ _id: P_A })).toBe(0);
    expect(await merits().countDocuments({ _id: P_B })).toBe(0);
  });

  it('REFUSES a category with no seat at all, leaving it untouched', async () => {
    // No 'Administrator' seat exists in this suite's fixtures.
    await merits().insertOne({ _id: 'Administrator', dots: { Staff: 1 }, updated_at: '2026-08-12T00:00:00.000Z' });

    const rows = await planMigration(merits(), seats());
    expect(rows[0].action).toBe('refused-no-seat');

    const summary = await applyMigration(merits(), rows, { apply: true });
    expect(summary.migrated).toBe(0);
    expect(summary.refused).toBe(1);
    expect(await merits().findOne({ _id: 'Administrator' })).toBeTruthy();
  });

  it('recognises an already seat-keyed document and skips it', async () => {
    await merits().insertOne({ _id: ENF, dots: { 'Safe Place': 1 }, office_category: 'Enforcer', updated_at: 'x' });

    const rows = await planMigration(merits(), seats());
    expect(rows[0].action).toBe('already-seat-keyed');

    const summary = await applyMigration(merits(), rows, { apply: true });
    expect(summary.migrated).toBe(0);
    expect(summary.alreadySeatKeyed).toBe(1);
    expect((await merits().findOne({ _id: ENF })).dots).toEqual({ 'Safe Place': 1 });
  });

  it('Codex review, oxp.11 (Low): REFUSES a seat-shaped key with no real seat behind it, rather than calling it migrated', async () => {
    // 24 hex characters, exactly a real ObjectId's shape, but no office_seats
    // document has this id — the seat was deleted, or the record is
    // hand-malformed. Either way it must not be silently waved through.
    const orphan = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    await merits().insertOne({ _id: orphan, dots: { 'Safe Place': 1 }, updated_at: 'x' });

    const rows = await planMigration(merits(), seats());
    expect(rows[0].action).toBe('refused-orphaned-seat-key');
    expect(rows[0].key).toBe(orphan);

    const summary = await applyMigration(merits(), rows, { apply: true });
    expect(summary.migrated).toBe(0);
    expect(summary.alreadySeatKeyed).toBe(0);
    expect(summary.refused).toBe(1);
    // Untouched — still exactly where and what it was.
    expect((await merits().findOne({ _id: orphan })).dots).toEqual({ 'Safe Place': 1 });
  });

  it('is idempotent: a second --apply run reports zero migrated and changes nothing', async () => {
    await merits().insertOne({ _id: 'Enforcer', dots: { 'Safe Place': 2 }, updated_at: 'first' });

    await applyMigration(merits(), await planMigration(merits(), seats()), { apply: true });
    const afterFirst = await merits().find({}).toArray();

    const second = await applyMigration(merits(), await planMigration(merits(), seats()), { apply: true });
    expect(second.migrated).toBe(0);
    expect(second.deleted).toBe(0);
    expect(await merits().find({}).toArray()).toEqual(afterFirst);
  });

  it('recovers from a TRUE interrupted run: identical seat-keyed document present, stale category copy cleared', async () => {
    // Insert-then-delete, in that order, means an interruption leaves BOTH
    // rather than neither — but only when the seat-keyed document really IS
    // the same content the category-keyed one held, is it safe to treat the
    // category-keyed copy as redundant and clear it.
    await merits().insertOne({ _id: ENF, dots: { 'Safe Place': 1 }, office_category: 'Enforcer', updated_at: 'new' });
    await merits().insertOne({ _id: 'Enforcer', dots: { 'Safe Place': 1 }, updated_at: 'stale' });

    const summary = await applyMigration(merits(), await planMigration(merits(), seats()), { apply: true });

    expect(summary.migrated).toBe(0);
    expect(summary.recovered).toBe(1);
    expect(summary.deleted).toBe(1);
    expect(summary.refused).toBe(0);

    const survivor = await merits().findOne({ _id: ENF });
    expect(survivor.dots).toEqual({ 'Safe Place': 1 });
    expect(survivor.updated_at).toBe('new');
    expect(await merits().findOne({ _id: 'Enforcer' })).toBeNull();
  });

  it('Codex review, DBO-4 (High): REFUSES to delete a category-keyed document when the seat-keyed one already present genuinely differs from it, rather than silently discarding whatever the old one alone held', async () => {
    // This shape is NOT unique to an interrupted migration - the live
    // seat-keyed routes (office-merit-dots.js's own PUT) can create it
    // through completely ordinary use, any time before this migration runs.
    // Blind-deleting the old document here would destroy real purchase data
    // (any merit dot the old document held that the new one never touched).
    await merits().insertOne({ _id: ENF, dots: { 'Safe Place': 5 }, office_category: 'Enforcer', updated_at: 'new' });
    await merits().insertOne({ _id: 'Enforcer', dots: { 'Safe Place': 1 }, updated_at: 'stale' });

    const summary = await applyMigration(merits(), await planMigration(merits(), seats()), { apply: true });

    expect(summary.migrated).toBe(0);
    expect(summary.recovered).toBe(0);
    expect(summary.deleted).toBe(0);
    expect(summary.refused).toBe(1);

    // BOTH documents survive, byte-for-byte untouched - nothing was guessed.
    const seatDoc = await merits().findOne({ _id: ENF });
    expect(seatDoc.dots).toEqual({ 'Safe Place': 5 });
    const categoryDoc = await merits().findOne({ _id: 'Enforcer' });
    expect(categoryDoc.dots).toEqual({ 'Safe Place': 1 });
  });

  it('Codex review, DBO-4 (High): key-order alone does not cause a false REFUSE on a genuinely identical recovery', async () => {
    // dots is built one merit at a time by the live PUT route, so a document
    // seeded with keys in a different order than the migration's own insert
    // must still compare equal - a canonical (sorted) comparison, not a raw
    // JSON string compare, is what makes that true.
    await merits().insertOne({ _id: ENF, dots: { 'Trained Observer': 2, 'Safe Place': 1 }, office_category: 'Enforcer', updated_at: 'new' });
    await merits().insertOne({ _id: 'Enforcer', dots: { 'Safe Place': 1, 'Trained Observer': 2 }, updated_at: 'stale' });

    const summary = await applyMigration(merits(), await planMigration(merits(), seats()), { apply: true });

    expect(summary.recovered).toBe(1);
    expect(summary.refused).toBe(0);
    expect(await merits().findOne({ _id: 'Enforcer' })).toBeNull();
  });

  // ───────────────────────────────────────────────────────────────────────
  // Codex review, oxp.11 (High): planMigration and applyMigration are
  // separate round-trips. A write landing on the SAME category-keyed
  // document between them must never be silently discarded.
  // ───────────────────────────────────────────────────────────────────────

  it('refuses to migrate a document that changed after planning, rather than embedding the stale snapshot', async () => {
    await merits().insertOne({ _id: 'Enforcer', dots: { 'Safe Place': 0 }, updated_at: 'plan-time' });

    const rows = await planMigration(merits(), seats());
    expect(rows[0].action).toBe('will-migrate');

    // A concurrent write lands after planning captured its snapshot — the
    // real app's own PUT route would do exactly this to the old category
    // key, since the migration has not run yet.
    await merits().updateOne({ _id: 'Enforcer' }, { $set: { dots: { 'Safe Place': 3 }, updated_at: 'concurrent-write' } });

    const summary = await applyMigration(merits(), rows, { apply: true });

    expect(summary.migrated).toBe(0);
    expect(summary.deleted).toBe(0);
    expect(summary.changedSincePlan).toBe(1);

    // The newer value survives, under its ORIGINAL key — not silently
    // dropped, and not moved with the stale dots count that would have lost
    // the concurrent write.
    const stillThere = await merits().findOne({ _id: 'Enforcer' });
    expect(stillThere.dots).toEqual({ 'Safe Place': 3 });
    expect(stillThere.updated_at).toBe('concurrent-write');
    // Nothing was created under the seat id — a stale snapshot must never
    // reach the new location at all.
    expect(await merits().findOne({ _id: ENF })).toBeNull();
  });

  it('a document that changed since planning is reported via the log, distinctly from a refusal', async () => {
    await merits().insertOne({ _id: 'Enforcer', dots: {}, updated_at: 'plan-time' });
    const rows = await planMigration(merits(), seats());
    await merits().updateOne({ _id: 'Enforcer' }, { $set: { updated_at: 'concurrent-write' } });

    const lines = [];
    await applyMigration(merits(), rows, { apply: true, log: msg => lines.push(msg) });

    expect(lines.some(l => l.includes('CHANGED') && l.includes('Enforcer'))).toBe(true);
    expect(lines.some(l => l.includes('REFUSED'))).toBe(false);
  });

  it('re-running after a changed-since-plan refusal migrates the NOW-current value', async () => {
    await merits().insertOne({ _id: 'Enforcer', dots: { 'Safe Place': 0 }, updated_at: 'plan-time' });
    const staleRows = await planMigration(merits(), seats());
    await merits().updateOne({ _id: 'Enforcer' }, { $set: { dots: { 'Safe Place': 4 }, updated_at: 'concurrent-write' } });
    await applyMigration(merits(), staleRows, { apply: true });

    // A fresh plan/apply pass, exactly what re-running the script does.
    const freshRows = await planMigration(merits(), seats());
    const summary = await applyMigration(merits(), freshRows, { apply: true });

    expect(summary.migrated).toBe(1);
    const moved = await merits().findOne({ _id: ENF });
    expect(moved.dots).toEqual({ 'Safe Place': 4 });
    expect(moved.updated_at).toBe('concurrent-write');
  });

  it('handles an empty collection as a clean, reported outcome — office_manoeuvre_ranks is empty live', async () => {
    const rows = await planMigration(ranks(), seats());
    expect(rows).toEqual([]);
    const summary = await applyMigration(ranks(), rows, { apply: true });
    expect(summary).toMatchObject({ migrated: 0, recovered: 0, deleted: 0, refused: 0, alreadySeatKeyed: 0 });
  });

  it('migrates office_manoeuvre_ranks by the same rules, rank preserved verbatim', async () => {
    await ranks().insertOne({ _id: 'Enforcer', rank: 3, updated_at: '2026-08-13T01:00:00.000Z' });

    const summary = await applyMigration(ranks(), await planMigration(ranks(), seats()), { apply: true });
    expect(summary.migrated).toBe(1);

    const moved = await ranks().findOne({ _id: ENF });
    expect(moved.rank).toBe(3);
    expect(moved.updated_at).toBe('2026-08-13T01:00:00.000Z');
    expect(moved.office_category).toBe('Enforcer');
  });

  it('reports every action through the supplied log, so a human can see what moved', async () => {
    await merits().insertOne({ _id: 'Enforcer', dots: { 'Safe Place': 0 }, updated_at: 'x' });
    await merits().insertOne({ _id: 'Primogen', dots: { Resources: 1 }, updated_at: 'x' });

    const lines = [];
    await applyMigration(merits(), await planMigration(merits(), seats()), {
      apply: true, log: msg => lines.push(msg),
    });

    const joined = lines.join('\n');
    expect(joined).toContain('Enforcer');
    expect(joined).toContain('Primogen');
    expect(joined).toContain(ENF);
  });
});
