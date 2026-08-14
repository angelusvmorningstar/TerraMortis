/**
 * oxp.5 — handover logic: seat holder change, manoeuvre reset, destroyed XP.
 *
 * `PUT /api/office_seats/:seatId/holder` is the one place a court office
 * changes hands. It exists because who holds an office is currently TWO
 * independent facts — `characters.court_category` (which gates behaviour) and
 * `office_seats.holder_id` (which resolves WHICH seat's purchase state to
 * show) — that agree only by luck, with nothing linking them.
 *
 * This suite proves the three things that are easy to get wrong:
 *
 *   1. The two facts move together or not at all (one transaction, three
 *      collections), and a genuine concurrent race produces exactly one winner.
 *   2. The manoeuvre reset RECORDS what it destroyed. Office spend is derived
 *      from the current rank (oxp.2), so zeroing the rank without a counter
 *      REFUNDS the XP the ruling says is destroyed — the precise opposite of
 *      content/rules/office-powers.md. The counter cannot be recomputed later
 *      by any means, so if it is not captured at reset time it is gone.
 *   3. Merits are untouched while manoeuvres are reset, in the SAME operation.
 *      oxp.4 proved merits persist when nothing could reset anything; this is
 *      the first code that can, so the guarantee is re-proved against it.
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
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
function readFile(rel) { return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'); }

const dbAvailable = await isDbAvailable();

// Explicit, known seat _ids so this suite deletes exactly its own fixtures.
// `office_seats` is shared with oxp.1's, oxp.2's, oxp.4's and oxp.11's suites,
// so a deleteMany({}) here would silently reach into theirs. oxp-3 claimed the
// 31-34 range and oxp-4 the 41-43 range; this suite claims 51+.
const seatId = n => new ObjectId(`0f11${'0'.repeat(16)}${String(n).padStart(4, '0')}`);

const SEAT_ENFORCER    = seatId(51);
const SEAT_PRIMOGEN_A  = seatId(52);
const SEAT_PRIMOGEN_B  = seatId(53);
const SEAT_SOCIALITE_A = seatId(54);
const SEAT_SOCIALITE_B = seatId(55);
const SEAT_ADMIN       = seatId(56);
const SEAT_IDS = [
  SEAT_ENFORCER, SEAT_PRIMOGEN_A, SEAT_PRIMOGEN_B,
  SEAT_SOCIALITE_A, SEAT_SOCIALITE_B, SEAT_ADMIN,
];
// The same seats as the 24-hex STRING keys `office_merit_dots` and
// `office_manoeuvre_ranks` use for their own `_id` (oxp.11's keying).
const SEAT_KEYS = SEAT_IDS.map(String);

const ENF   = String(SEAT_ENFORCER);
const P_A   = String(SEAT_PRIMOGEN_A);
const P_B   = String(SEAT_PRIMOGEN_B);
const S_A   = String(SEAT_SOCIALITE_A);
const S_B   = String(SEAT_SOCIALITE_B);
const ADMIN = String(SEAT_ADMIN);

// A well-formed 24-hex id that is neither a seat nor a character in this suite.
const UNKNOWN_ID = '0f110000000000000000ffff';

/**
 * Mirrors the live shape deliberately. Primogen's two seats carry an identical
 * office_category, an identical (null) seat_label and the same created_at, so
 * nothing but the _id separates them — that is the case the disambiguation and
 * the per-seat reset have to survive. Socialite's two carry real labels, which
 * is what AC8 pins as never-written. Administrator has no OFFICE_DATA entry
 * until oxp.8 and is here to prove the handover route does not inherit
 * resolveOfficeSeat's refusal.
 */
const SEAT_FIXTURES = [
  { _id: SEAT_ENFORCER,    office_category: 'Enforcer',      holder_id: null, created_at: '2026-02-21', seat_label: null,             notes: null },
  { _id: SEAT_PRIMOGEN_A,  office_category: 'Primogen',      holder_id: null, created_at: '2026-02-21', seat_label: null,             notes: null },
  { _id: SEAT_PRIMOGEN_B,  office_category: 'Primogen',      holder_id: null, created_at: '2026-02-21', seat_label: null,             notes: null },
  { _id: SEAT_SOCIALITE_A, office_category: 'Socialite',     holder_id: null, created_at: '2026-02-21', seat_label: 'Harpy',          notes: null },
  { _id: SEAT_SOCIALITE_B, office_category: 'Socialite',     holder_id: null, created_at: '2026-07-18', seat_label: "People's Harpy", notes: null },
  { _id: SEAT_ADMIN,       office_category: 'Administrator', holder_id: null, created_at: '2026-06-20', seat_label: null,             notes: null },
];

// Name prefix so this suite only ever removes its own character fixtures,
// escaped once at module scope so an edit to the prefix cannot change $regex
// semantics by accident (oxp-4's own review finding).
const FIXTURE_PREFIX = 'OXP5 Handover ';
const FIXTURE_PREFIX_RE = `^${FIXTURE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`;

let app;

/** Create a character through the real ST create route and return its id. */
async function createChar(name, fields = {}) {
  const res = await request(app).post('/api/characters').set('X-Test-User', stUser())
    .send({ name: FIXTURE_PREFIX + name, ...fields });
  expect(res.status).toBe(201);
  return String(res.body._id);
}

/** The handover route, as an ST. */
function handover(seat, body, user = stUser()) {
  return request(app).put(`/api/office_seats/${seat}/holder`).set('X-Test-User', user).send(body);
}

/** Seed a manoeuvre-rank document directly. `_id` is the seat id as a 24-hex
 *  string, which is how oxp.11 keys the collection. */
async function seedRank(seat, rank, extra = {}) {
  await getCollection('office_manoeuvre_ranks').insertOne({
    _id: seat, rank, office_category: 'seeded', updated_at: '2026-01-01T00:00:00.000Z', ...extra,
  });
}

const rankDoc = seat => getCollection('office_manoeuvre_ranks').findOne({ _id: seat });
const seatDoc = oid => getCollection('office_seats').findOne({ _id: oid });
const charDoc = id => getCollection('characters').findOne({ _id: new ObjectId(id) });

beforeAll(async () => {
  if (!dbAvailable) return;
  await setupDb();
  app = createTestApp();
});

/**
 * Remove exactly this suite's fixtures and nothing else.
 *
 * All three office collections are shared with oxp-1's, oxp-2's, oxp-3's,
 * oxp-4's and oxp-11's suites. The story text spells this out for
 * `office_seats`, and the SAME reasoning applies without restatement to the two
 * purchase collections: they are keyed by SEAT id, so an unfiltered
 * `deleteMany({})` here reaches straight into another suite's fixtures. Every
 * delete is therefore scoped to this suite's own seat ids.
 *
 * `office_seats` is deleted with `SEAT_IDS` (real ObjectIds); the two purchase
 * collections are keyed by the same seats' 24-hex STRING form, hence
 * `SEAT_KEYS`.
 */
async function removeFixtures() {
  await getCollection('office_merit_dots').deleteMany({ _id: { $in: SEAT_KEYS } });
  await getCollection('office_manoeuvre_ranks').deleteMany({ _id: { $in: SEAT_KEYS } });
  await getCollection('office_seats').deleteMany({ _id: { $in: SEAT_IDS } });
  await getCollection('characters').deleteMany({ name: { $regex: FIXTURE_PREFIX_RE } });
}

beforeEach(async () => {
  if (!dbAvailable) return;
  await removeFixtures();
  await getCollection('office_seats').insertMany(SEAT_FIXTURES.map(s => ({ ...s })));
});

afterAll(async () => {
  if (!dbAvailable) return;
  await removeFixtures();
  await teardownDb();
});

// ─────────────────────────────────────────────────────────────────────────────
// AC1 — the route, its argument validation and its auth boundary.
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!dbAvailable)('oxp.5 AC1: the handover route and its failure modes', () => {
  it('rejects a malformed seat id with 400 VALIDATION_ERROR', async () => {
    for (const bad of ['nope', '0f11', 'ZZZZZZZZZZZZZZZZZZZZZZZZ', `${ENF}0`]) {
      const res = await handover(bad, { holder_id: null });
      expect(res.status, bad).toBe(400);
      expect(res.body.error, bad).toBe('VALIDATION_ERROR');
    }
  });

  it('rejects a well-formed but unknown seat id with 404 NOT_FOUND', async () => {
    const res = await handover(UNKNOWN_ID, { holder_id: null });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('rejects every non-null, non-24-hex holder_id shape with 400', async () => {
    const bodies = [
      { holder_id: 7 },
      { holder_id: {} },
      { holder_id: [] },
      { holder_id: 'not-a-hex-id' },
      { holder_id: '' },
      { holder_id: true },
      {},                       // absent key is NOT the same request as null
    ];
    for (const body of bodies) {
      const res = await handover(ENF, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error, JSON.stringify(body)).toBe('VALIDATION_ERROR');
    }
  });

  it('rejects a non-string court_title with 400', async () => {
    const holder = await createChar('Title Shape');
    const res = await handover(ENF, { holder_id: holder, court_title: 42 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('a non-null holder_id that matches no character is a 404 naming the CHARACTER, not the seat', async () => {
    const res = await handover(ENF, { holder_id: UNKNOWN_ID });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
    expect(res.body.message).toMatch(/character/i);
    expect(res.body.message).not.toMatch(/seat/i);
    // And the seat was not touched on the way to that refusal.
    expect((await seatDoc(SEAT_ENFORCER)).holder_id).toBeNull();
  });

  it('is ST-only — a player is refused 403 and nothing is written', async () => {
    const holder = await createChar('Player Attempt');
    const res = await handover(ENF, { holder_id: holder }, playerUser([holder]));
    expect(res.status).toBe(403);
    expect((await seatDoc(SEAT_ENFORCER)).holder_id).toBeNull();
    expect((await charDoc(holder)).court_category ?? null).toBeNull();
  });

  it('requires authentication at all', async () => {
    const res = await request(app).put(`/api/office_seats/${ENF}/holder`).send({ holder_id: null });
    expect(res.status).toBe(401);
  });

  it('an ABSENT court_title on a real handover defaults to the seat\'s office_category', async () => {
    const holder = await createChar('Default Title');
    const res = await handover(ENF, { holder_id: holder });
    expect(res.status).toBe(200);
    expect((await charDoc(holder)).court_title).toBe('Enforcer');
  });

  it('court_title is trimmed, and is IGNORED when the seat is being vacated', async () => {
    const holder = await createChar('Trimmed');
    await handover(ENF, { holder_id: holder, court_title: '  Sheriff  ' }).expect(200);
    expect((await charDoc(holder)).court_title).toBe('Sheriff');

    // Vacating: a vacant seat has nobody to title, so the supplied title is
    // discarded rather than written anywhere.
    const res = await handover(ENF, { holder_id: null, court_title: 'Ghost Sheriff' });
    expect(res.status).toBe(200);
    expect((await seatDoc(SEAT_ENFORCER)).holder_id).toBeNull();
    const departed = await charDoc(holder);
    expect(departed.court_title).toBeNull();
    expect(departed.court_category).toBeNull();
  });

  it('FINDING 2: an Administrator seat is handoverable, even though its office has no OFFICE_DATA entry', async () => {
    // resolveOfficeSeat() 400s this case, correctly, for a PURCHASE route: a
    // merit or a rank cannot be validated without rules. A handover needs no
    // rules at all, and the Administrator seat is real and filled (Ivana
    // Horvat, since Game 5). If this test ever starts failing with a 400, some
    // "tidy-up" has repointed the route at the shared resolver.
    const holder = await createChar('Administrator');
    const res = await handover(ADMIN, { holder_id: holder });
    expect(res.status).toBe(200);
    expect(res.body.handover).toBe(true);
    expect((await charDoc(holder)).court_category).toBe('Administrator');
    expect(String((await seatDoc(SEAT_ADMIN)).holder_id)).toBe(holder);
  });

  it('the route imports SEAT_ID_PATTERN and does not import resolveOfficeSeat', () => {
    const src = readFile('server/routes/office-seats.js');
    // Deliberately scoped to the `import` STATEMENTS themselves: the resolver
    // is discussed at length in this file's comments, and prose about why it is
    // not used is not a use of it.
    const importLines = [...src.matchAll(/^import\s.*$/gm)].map(m => m[0]).join('\n');
    expect(importLines).toMatch(/SEAT_ID_PATTERN/);
    expect(importLines).not.toMatch(/resolveOfficeSeat/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC2 — a target who already holds a DIFFERENT seat is refused, never cascaded.
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!dbAvailable)('oxp.5 AC2: refuse-on-conflict rather than cascade', () => {
  it('409s, names the conflicting seat, and leaves all three documents untouched', async () => {
    const holder = await createChar('Double Booked');
    await handover(P_A, { holder_id: holder }).expect(200);
    await seedRank(P_A, 4);
    await seedRank(ENF, 2);

    const beforeConflict = await seatDoc(SEAT_PRIMOGEN_A);
    const res = await handover(ENF, { holder_id: holder });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('CONFLICT');
    // The message must name WHICH seat, or the ST cannot act on it.
    expect(res.body.message).toContain('Primogen');
    expect(res.body.conflicting_seat_id).toBe(P_A);
    expect(res.body.message).toMatch(/vacate/i);

    // The seat being assigned: untouched.
    expect((await seatDoc(SEAT_ENFORCER)).holder_id).toBeNull();
    // The THIRD document — the conflicting seat the caller never named — is
    // byte-identical. This is the whole point: the route refuses rather than
    // silently modifying a document nobody asked it to.
    expect(await seatDoc(SEAT_PRIMOGEN_A)).toEqual(beforeConflict);
    // The character keeps the office they actually hold.
    expect((await charDoc(holder)).court_category).toBe('Primogen');
    // And nothing was reset anywhere: a refused handover destroys no XP.
    expect((await rankDoc(P_A)).rank).toBe(4);
    expect((await rankDoc(ENF)).rank).toBe(2);
    expect((await rankDoc(P_A)).manoeuvre_xp_destroyed).toBeUndefined();
  });

  it('names a labelled conflicting seat by its label', async () => {
    const holder = await createChar('Harpy Already');
    await handover(S_A, { holder_id: holder }).expect(200);
    const res = await handover(S_B, { holder_id: holder });
    expect(res.status).toBe(409);
    expect(res.body.message).toContain('Harpy');
    expect(res.body.conflicting_seat_label).toBe('Harpy');
  });

  it('a stale court_category with NO seat behind it is NOT a conflict — the seat is authoritative', async () => {
    // The exact case the old court panel's "+ Add slot" used to create: a
    // character carrying an office with no seat behind them.
    const holder = await createChar('Stale Category', { court_category: 'Socialite', court_title: 'Harpy' });
    const res = await handover(ENF, { holder_id: holder });
    expect(res.status).toBe(200);
    const after = await charDoc(holder);
    expect(after.court_category).toBe('Enforcer');
    expect(after.court_title).toBe('Enforcer');
  });

  it('re-assigning the SAME seat to its own holder is not a self-conflict', async () => {
    const holder = await createChar('Self');
    await handover(ENF, { holder_id: holder }).expect(200);
    const res = await handover(ENF, { holder_id: holder, court_title: 'Sheriff' });
    expect(res.status).toBe(200);
    expect(res.body.handover).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC3 — one transaction, the full write sequence, and the concurrency guarantee.
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!dbAvailable)('oxp.5 AC3: the atomic write sequence', () => {
  it('a replacement moves court_category, court_title AND holder_id in one call', async () => {
    const outgoing = await createChar('Outgoing');
    const incoming = await createChar('Incoming');
    await handover(ENF, { holder_id: outgoing, court_title: 'Sheriff' }).expect(200);

    const res = await handover(ENF, { holder_id: incoming, court_title: 'Marshal' });
    expect(res.status).toBe(200);
    expect(res.body.handover).toBe(true);
    expect(res.body.previous_holder_id).toBe(outgoing);
    expect(res.body.departing_holder_cleared).toBe(true);

    const gone = await charDoc(outgoing);
    expect(gone.court_category).toBeNull();
    expect(gone.court_title).toBeNull();

    const now = await charDoc(incoming);
    expect(now.court_category).toBe('Enforcer');
    expect(now.court_title).toBe('Marshal');

    expect(String((await seatDoc(SEAT_ENFORCER)).holder_id)).toBe(incoming);
  });

  it('stores holder_id as a real ObjectId, never a string', async () => {
    const holder = await createChar('Object Id');
    await handover(ENF, { holder_id: holder }).expect(200);
    const stored = await seatDoc(SEAT_ENFORCER);
    // A string here would be data-map.md Known Drift Pattern #2 (mixed
    // string/ObjectId foreign key), which office_seat.schema.js's 24-hex
    // pattern exists specifically to prevent.
    expect(stored.holder_id).toBeInstanceOf(ObjectId);
    expect(typeof stored.holder_id).not.toBe('string');
    expect(String(stored.holder_id)).toBe(holder);
    // And vacating restores a real null, never the string 'null'.
    await handover(ENF, { holder_id: null }).expect(200);
    expect((await seatDoc(SEAT_ENFORCER)).holder_id).toBeNull();
  });

  it('serialises the returned seat the same way GET / does', async () => {
    const holder = await createChar('Serialised');
    const res = await handover(ENF, { holder_id: holder });
    expect(typeof res.body.seat._id).toBe('string');
    expect(res.body.seat._id).toBe(ENF);
    expect(res.body.seat.holder_id).toBe(holder);

    const list = await request(app).get('/api/office_seats').set('X-Test-User', stUser());
    expect(list.body.find(s => s._id === ENF)).toEqual(res.body.seat);
  });

  it('a departing holder whose court_category has already moved on is BENIGN, not an error', async () => {
    const outgoing = await createChar('Moved On');
    const incoming = await createChar('Replacement');
    await handover(ENF, { holder_id: outgoing }).expect(200);

    // Their category legitimately moved elsewhere by another route in between.
    await request(app).put(`/api/characters/${outgoing}`).set('X-Test-User', stUser())
      .send({ court_category: 'Socialite', court_title: 'Harpy' }).expect(200);

    const res = await handover(ENF, { holder_id: incoming });
    expect(res.status).toBe(200);
    expect(res.body.departing_holder_cleared).toBe(false);
    // Clearing it unconditionally would have wiped a legitimate newer
    // assignment. It must survive.
    const stillSocialite = await charDoc(outgoing);
    expect(stillSocialite.court_category).toBe('Socialite');
    expect(stillSocialite.court_title).toBe('Harpy');
  });

  it('a refused handover leaves NOTHING half-applied across all three collections', async () => {
    const conflicted = await createChar('Conflicted');
    const bystander = await createChar('Bystander');
    await handover(P_A, { holder_id: conflicted }).expect(200);
    await handover(ENF, { holder_id: bystander, court_title: 'Sheriff' }).expect(200);
    await seedRank(ENF, 5);
    await getCollection('office_merit_dots').insertOne({
      _id: ENF, dots: { 'Safe Place': 3 }, office_category: 'Enforcer', updated_at: '2026-01-01T00:00:00.000Z',
    });

    const seatBefore   = await seatDoc(SEAT_ENFORCER);
    const rankBefore   = await rankDoc(ENF);
    const meritsBefore = await getCollection('office_merit_dots').findOne({ _id: ENF });
    const charBefore   = await charDoc(bystander);

    // Refused at the conflict check, which runs BEFORE any write at all.
    expect((await handover(ENF, { holder_id: conflicted })).status).toBe(409);

    expect(await seatDoc(SEAT_ENFORCER)).toEqual(seatBefore);
    expect(await rankDoc(ENF)).toEqual(rankBefore);
    expect(await getCollection('office_merit_dots').findOne({ _id: ENF })).toEqual(meritsBefore);
    expect(await charDoc(bystander)).toEqual(charBefore);
  });

  it('AC3 CONCURRENCY: simultaneous handovers on the SAME seat never both win, and the ladder is destroyed exactly once', async () => {
    // The established convention in this codebase for proving a transactional
    // route really holds (oaq-2 AC8, issue-1143): fire real concurrent HTTP
    // requests and assert the OUTCOME, not the implementation. issue-1143 runs
    // its races in a 10-iteration loop and oxp-3's review had to widen its own
    // race from two callers to four, both for the same reason this loop exists:
    //
    //   Two requests fired through Promise.all do not RELIABLY interleave.
    //   Measured here at roughly four times in five: in the fifth, the second
    //   request's pre-transaction read lands after the first has already
    //   committed, so it is not a race at all — it is two SEQUENTIAL handovers,
    //   and two 200s is then the correct answer, not a bug. Asserting a bare
    //   "exactly one 200" would therefore be asserting the scheduler.
    //
    // What is asserted instead is the invariant that must hold either way, and
    // that a real double-win would break:
    //
    //   - No request ever crashes: every response is a 200 or a clean 409.
    //   - Two winners are only ever legitimate SEQUENTIAL handovers, provable
    //     because each reports a different `previous_holder_id`. Two winners
    //     that both saw the SAME prior holder is the actual bug (a lost update
    //     and a doubled reset), and it never happens.
    //   - The sitting holder's ladder is destroyed EXACTLY ONCE. This is the
    //     "the loser destroyed no XP" requirement in its non-flaky form: the
    //     cumulative counter lands on 3, never 6, whichever way the two
    //     requests interleaved.
    //   - Exactly one character ends up holding the seat, with a matching
    //     court_category, and the other is left with no office.
    //
    // The loop also proves the guard genuinely fires rather than never being
    // reached: at least one iteration must produce a 409.
    const sitting = await createChar('Sitting');
    const rivalA  = await createChar('Rival A');
    const rivalB  = await createChar('Rival B');

    const ITERATIONS = 10;
    let refusals = 0;
    let genuineRaces = 0;

    for (let i = 0; i < ITERATIONS; i++) {
      // Reset the fixture directly: this is setup, not the behaviour under test.
      await getCollection('office_seats').updateOne(
        { _id: SEAT_ENFORCER }, { $set: { holder_id: new ObjectId(sitting) } });
      await getCollection('characters').updateOne(
        { _id: new ObjectId(sitting) }, { $set: { court_category: 'Enforcer', court_title: 'Enforcer' } });
      for (const id of [rivalA, rivalB]) {
        await getCollection('characters').updateOne(
          { _id: new ObjectId(id) }, { $set: { court_category: null, court_title: null } });
      }
      await getCollection('office_manoeuvre_ranks').deleteMany({ _id: ENF });
      await seedRank(ENF, 3);

      const [r1, r2] = await Promise.all([
        handover(ENF, { holder_id: rivalA }),
        handover(ENF, { holder_id: rivalB }),
      ]);

      for (const r of [r1, r2]) {
        expect([200, 409], `iteration ${i}: unexpected status ${r.status} — ${JSON.stringify(r.body)}`)
          .toContain(r.status);
      }

      const winners = [r1, r2].filter(r => r.status === 200);
      expect(winners.length, `iteration ${i}: at least one handover must succeed`).toBeGreaterThanOrEqual(1);
      refusals += 2 - winners.length;

      if (winners.length === 1) {
        genuineRaces++;
      } else {
        // Two winners: legitimate only if they were sequential, which means the
        // second one saw the first one's holder. Identical prior holders would
        // mean both wrote from the same read — a lost update.
        const priors = winners.map(w => w.body.previous_holder_id);
        expect(new Set(priors).size,
          `iteration ${i}: two winners both saw prior holder ${priors[0]} — that is a lost update, not a sequential handover`)
          .toBe(2);
        expect(priors, `iteration ${i}`).toContain(sitting);
      }

      // The invariant that carries the story: 3 XP existed, 3 XP was destroyed.
      // Never 6, however the two requests interleaved.
      const rank = await rankDoc(ENF);
      expect(rank.rank, `iteration ${i}`).toBe(0);
      expect(rank.manoeuvre_xp_destroyed, `iteration ${i}: the ladder must be destroyed exactly once`).toBe(3);

      // Exactly one of the two rivals holds the seat, and the other holds nothing.
      const seat = await seatDoc(SEAT_ENFORCER);
      const heldBy = String(seat.holder_id);
      expect([rivalA, rivalB], `iteration ${i}`).toContain(heldBy);
      const other = heldBy === rivalA ? rivalB : rivalA;
      expect((await charDoc(heldBy)).court_category, `iteration ${i}`).toBe('Enforcer');
      expect((await charDoc(other)).court_category ?? null, `iteration ${i}`).toBeNull();
    }

    expect(refusals,
      `over ${ITERATIONS} iterations the compare-and-swap never once refused a loser, so the guard was never exercised`)
      .toBeGreaterThan(0);
    expect(genuineRaces).toBe(refusals);
  }, 60000);
});

// ─────────────────────────────────────────────────────────────────────────────
// AC4 — same holder is a safe, idempotent no-op for reset purposes.
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!dbAvailable)('oxp.5 AC4: re-saving an unchanged seat cannot wipe a ladder', () => {
  it('same holder: 200, handover false, no reset, no XP destroyed', async () => {
    const holder = await createChar('Unchanged');
    await handover(ENF, { holder_id: holder }).expect(200);
    await seedRank(ENF, 4);
    const rankBefore = await rankDoc(ENF);

    const res = await handover(ENF, { holder_id: holder });
    expect(res.status).toBe(200);
    expect(res.body.handover).toBe(false);
    expect(res.body.manoeuvre_reset).toBeNull();
    // Byte-identical, updated_at included: the reset did not run at all, rather
    // than running and writing the same numbers back.
    expect(await rankDoc(ENF)).toEqual(rankBefore);
  });

  it('same holder is repeat-safe — five saves in a row still destroy nothing', async () => {
    const holder = await createChar('Repeat Safe');
    await handover(ENF, { holder_id: holder }).expect(200);
    await seedRank(ENF, 2);
    const rankBefore = await rankDoc(ENF);

    for (let i = 0; i < 5; i++) {
      const res = await handover(ENF, { holder_id: holder });
      expect(res.status).toBe(200);
      expect(res.body.handover).toBe(false);
    }
    expect(await rankDoc(ENF)).toEqual(rankBefore);
  });

  it('a changed court_title IS still applied to the sitting holder, with no reset', async () => {
    const holder = await createChar('Retitled');
    await handover(ENF, { holder_id: holder, court_title: 'Sheriff' }).expect(200);
    await seedRank(ENF, 3);
    const rankBefore = await rankDoc(ENF);

    const res = await handover(ENF, { holder_id: holder, court_title: 'Hound' });
    expect(res.status).toBe(200);
    expect(res.body.handover).toBe(false);
    expect(res.body.title_updated).toBe(true);
    expect((await charDoc(holder)).court_title).toBe('Hound');
    expect(await rankDoc(ENF)).toEqual(rankBefore);
  });

  it('null to null (re-vacating an already vacant seat) is the same no-op', async () => {
    await seedRank(ENF, 6);
    const rankBefore = await rankDoc(ENF);
    const res = await handover(ENF, { holder_id: null });
    expect(res.status).toBe(200);
    expect(res.body.handover).toBe(false);
    expect(res.body.previous_holder_id).toBeNull();
    expect(await rankDoc(ENF)).toEqual(rankBefore);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC5 + AC6 — the reset, and the destroyed-XP counter.
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!dbAvailable)('oxp.5 AC5/AC6: manoeuvre reset and the destroyed-XP record', () => {
  it('AC5: VACATING a held seat destroys the ladder exactly as a replacement would', async () => {
    const holder = await createChar('Departing');
    await handover(ENF, { holder_id: holder }).expect(200);
    await seedRank(ENF, 5);

    const res = await handover(ENF, { holder_id: null });
    expect(res.status).toBe(200);
    expect(res.body.handover).toBe(true);
    expect(res.body.manoeuvre_reset).toMatchObject({ seat_id: ENF, rank_before: 5, xp_destroyed: 5 });

    const rank = await rankDoc(ENF);
    expect(rank.rank).toBe(0);
    expect(rank.manoeuvre_xp_destroyed).toBe(5);
  });

  it('AC6: the counter records the ORIGINAL rank, not the zeroed one', async () => {
    // The heart of Finding 1. If the pipeline's two stages were inverted, stage
    // 1 would read a rank of 0 and record 0 destroyed — silently, forever, with
    // no error and no visible symptom until a balance is finally rendered.
    const a = await createChar('Ladder A');
    const b = await createChar('Ladder B');
    await handover(P_A, { holder_id: a }).expect(200);
    await seedRank(P_A, 3);

    const res = await handover(P_A, { holder_id: b });
    expect(res.body.manoeuvre_reset.rank_before).toBe(3);
    expect(res.body.manoeuvre_reset.xp_destroyed).toBe(3);
    expect(res.body.manoeuvre_reset.manoeuvre_xp_destroyed_total).toBe(3);

    const rank = await rankDoc(P_A);
    expect(rank.rank).toBe(0);
    expect(rank.manoeuvre_xp_destroyed).toBe(3);
  });

  it('AC6: the counter is CUMULATIVE across successive handovers on the same seat', async () => {
    const a = await createChar('Cumulative A');
    const b = await createChar('Cumulative B');
    const c = await createChar('Cumulative C');

    await handover(ENF, { holder_id: a }).expect(200);
    await seedRank(ENF, 2);
    await handover(ENF, { holder_id: b }).expect(200);
    expect((await rankDoc(ENF)).manoeuvre_xp_destroyed).toBe(2);

    // B climbs the ladder again, then hands over too.
    await getCollection('office_manoeuvre_ranks').updateOne({ _id: ENF }, { $set: { rank: 4 } });
    const res = await handover(ENF, { holder_id: c });
    expect(res.body.manoeuvre_reset.rank_before).toBe(4);
    expect(res.body.manoeuvre_reset.manoeuvre_xp_destroyed_total).toBe(6);

    const rank = await rankDoc(ENF);
    expect(rank.rank).toBe(0);
    expect(rank.manoeuvre_xp_destroyed).toBe(6);
  });

  it('AC6: a seat with NO rank document is a silent success — no document is minted', async () => {
    const a = await createChar('Never Purchased A');
    const b = await createChar('Never Purchased B');
    await handover(P_B, { holder_id: a }).expect(200);
    expect(await rankDoc(P_B)).toBeNull();

    const res = await handover(P_B, { holder_id: b });
    expect(res.status).toBe(200);
    expect(res.body.handover).toBe(true);
    expect(res.body.manoeuvre_reset).toBeNull();
    // upsert:false, deliberately — nothing to destroy needs no rank-0 row, and
    // the collection's "no document = 0" convention stays intact.
    expect(await rankDoc(P_B)).toBeNull();
    // Scoped to this suite's own seats: the collection is shared, so a bare
    // countDocuments({}) would be asserting other suites' leftovers.
    expect(await getCollection('office_manoeuvre_ranks').countDocuments({ _id: { $in: SEAT_KEYS } })).toBe(0);
  });

  it('AC6: the reset re-writes the denormalised office_category as a literal, not a field path', async () => {
    const a = await createChar('Category Heal A');
    const b = await createChar('Category Heal B');
    await handover(S_A, { holder_id: a }).expect(200);
    await seedRank(S_A, 1); // seeded with office_category: 'seeded'
    await handover(S_A, { holder_id: b }).expect(200);
    expect((await rankDoc(S_A)).office_category).toBe('Socialite');
  });

  it('AC6: resetting ONE seat leaves the other seat of the SAME office alone', async () => {
    // The reason oxp.11 had to land first. Under category-keying these two
    // shared one document and this was impossible to express.
    const a = await createChar('Primogen A');
    const b = await createChar('Primogen B');
    const c = await createChar('Primogen C');
    await handover(P_A, { holder_id: a }).expect(200);
    await handover(P_B, { holder_id: b }).expect(200);
    await seedRank(P_A, 3);
    await seedRank(P_B, 4);
    const otherBefore = await rankDoc(P_B);

    await handover(P_A, { holder_id: c }).expect(200);

    expect((await rankDoc(P_A)).rank).toBe(0);
    // Byte-identical, updated_at included.
    expect(await rankDoc(P_B)).toEqual(otherBefore);
    expect((await rankDoc(P_B)).rank).toBe(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC7 — merits persist through the first code that could actually reset them.
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!dbAvailable)('oxp.5 AC7: office_merit_dots is untouched, proved not assumed', () => {
  it('one handover resets the rank AND leaves the merit document byte-identical', async () => {
    const a = await createChar('Merits A');
    const b = await createChar('Merits B');
    await handover(ENF, { holder_id: a }).expect(200);

    await request(app).put(`/api/office_merit_dots/${ENF}`).set('X-Test-User', stUser())
      .send({ merit: 'Safe Place', dots: 3 }).expect(200);
    await seedRank(ENF, 2);

    const meritsBefore = await getCollection('office_merit_dots').findOne({ _id: ENF });
    expect(meritsBefore.dots['Safe Place']).toBe(3);

    await handover(ENF, { holder_id: b }).expect(200);

    const meritsAfter = await getCollection('office_merit_dots').findOne({ _id: ENF });
    // Values alone would pass even if something rewrote the same numbers back;
    // updated_at unchanged is the strongest available evidence that no code
    // path wrote to the document at all.
    expect(meritsAfter).toEqual(meritsBefore);
    expect(meritsAfter.updated_at).toBe(meritsBefore.updated_at);

    // Proved in the SAME operation: the two collections genuinely diverge under
    // one event, rather than the test proving only that nothing happened.
    const rank = await rankDoc(ENF);
    expect(rank.rank).toBe(0);
    expect(rank.manoeuvre_xp_destroyed).toBe(2);
  });

  it('the route source writes to office_merit_dots nowhere at all', () => {
    const src = readFile('server/routes/office-seats.js');
    // The collection is NAMED in the explanatory comments, deliberately. What
    // must not exist is a getCollection call reaching for it.
    expect(src).not.toMatch(/getCollection\(\s*['"]office_merit_dots['"]\s*\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC8 — seat_label belongs to the SEAT and is never written here.
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!dbAvailable)('oxp.5 AC8: court_title is on the character, seat_label on the seat', () => {
  it('a handover on a labelled seat leaves the label untouched', async () => {
    const a = await createChar('Labelled A');
    const b = await createChar('Labelled B');
    await handover(S_B, { holder_id: a, court_title: 'Something Else' }).expect(200);
    await handover(S_B, { holder_id: b, court_title: 'Another Thing' }).expect(200);

    const seat = await seatDoc(SEAT_SOCIALITE_B);
    // Rewriting this during a handover would destroy the one thing that tells
    // Socialite's two seats apart.
    expect(seat.seat_label).toBe("People's Harpy");
    expect(seat.office_category).toBe('Socialite');
    expect(seat.created_at).toBe('2026-07-18');
    // The title went on the CHARACTER and only there.
    expect((await charDoc(b)).court_title).toBe('Another Thing');
  });

  it('the route source contains no write to seat_label at all', () => {
    const src = readFile('server/routes/office-seats.js');
    // READS are legitimate — the 409 body names the conflicting seat by its
    // label, and the response echoes it. What must not exist is a WRITE, so
    // every $set payload in the file is checked individually.
    const setPayloads = [...src.matchAll(/\$set:\s*\{[^{}]*\}/g)].map(m => m[0]);
    expect(setPayloads.length, 'the $set scan found nothing, so it is proving nothing').toBeGreaterThan(2);
    for (const payload of setPayloads) {
      expect(payload, payload).not.toContain('seat_label');
    }
    // And no update operator of any other kind reaches for it either.
    expect(src).not.toMatch(/\$(set|unset|setOnInsert)[^\n]*seat_label/);
  });

  it('a handover writes ONLY holder_id on the seat document', async () => {
    const a = await createChar('Only Holder');
    const before = await seatDoc(SEAT_SOCIALITE_A);
    await handover(S_A, { holder_id: a }).expect(200);
    const after = await seatDoc(SEAT_SOCIALITE_A);
    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
    for (const k of Object.keys(before)) {
      if (k === 'holder_id') continue;
      expect(after[k], k).toEqual(before[k]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC9 / AC10 — the client half, as source contracts.
//
// There is no jsdom in this project and city-views.js has no existing unit
// test; the nearest precedent is api-territories-regent-save.test.js, a
// server-side data-contract guard written specifically for what this file
// writes. These assertions pin the contract that matters: the court panel no
// longer writes characters directly, and its rows carry a real seat identity.
// ─────────────────────────────────────────────────────────────────────────────

/** Source text of saveCourt only, ending at the next function after it. */
function saveCourtBlock() {
  const src = readFile('public/js/admin/city-views.js');
  const start = src.indexOf('async function saveCourt');
  const end = src.indexOf('async function saveTerrAmbience');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

/** Source text of the court render helpers. */
function courtRenderBlock() {
  const src = readFile('public/js/admin/city-views.js');
  const start = src.indexOf('async function refreshSeats');
  const end = src.indexOf('function renderAscendancy');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe('oxp.5 AC9: the court panel is seat-backed and writes only the handover route', () => {
  it('extracts a block containing saveCourt and neither neighbour', () => {
    const block = saveCourtBlock();
    expect(block).toContain('async function saveCourt');
    expect(block).not.toContain('async function saveFeedingRights');
    expect(block).not.toContain('async function saveTerrAmbience');
  });

  it('saveCourt makes NO /api/characters/ write at all', () => {
    // Both halves of the old implementation — the clear-pass and the
    // assign-pass — are now one atomic call. If this string ever comes back,
    // an ST can bypass the reset through the familiar control again.
    expect(saveCourtBlock()).not.toContain('/api/characters/');
  });

  it('saveCourt reads data-seat-id and calls the handover route', () => {
    const block = saveCourtBlock();
    expect(block).toMatch(/row\.dataset\.seatId/);
    expect(block).toMatch(/apiPut\(`\/api\/office_seats\/\$\{encodeURIComponent\(seatId\)\}\/holder`/);
    expect(block).toMatch(/holder_id:/);
    expect(block).toMatch(/court_title:/);
  });

  it('saveCourt surfaces the server message rather than a bare status code', () => {
    expect(saveCourtBlock()).toMatch(/err\.message/);
  });

  it('saveCourt re-fetches seats before re-rendering', () => {
    const block = saveCourtBlock();
    const refresh = block.indexOf('refreshSeats');
    const render = block.indexOf('renderCity(');
    expect(refresh).toBeGreaterThan(-1);
    expect(render).toBeGreaterThan(refresh);
  });

  it('rows carry a real seat id, and the panel offers no add/remove-slot control', () => {
    const src = readFile('public/js/admin/city-views.js');
    expect(courtRenderBlock()).toMatch(/data-seat-id="/);
    // The buttons and their handlers are gone from the whole file, not just
    // hidden: they created a holding with no seat behind it.
    expect(src).not.toContain('court-add-slot-btn');
    expect(src).not.toContain('court-remove-slot-btn');
    expect(src).not.toContain('data-add-category');
  });

  it('seats are ordered the same way office-tab.js\'s _fallbackSeat orders them', () => {
    // If the two disagreed, "the first Primogen" would mean different seats in
    // the admin panel and in the office tab.
    const block = courtRenderBlock();
    expect(block).toMatch(/created_at/);
    expect(block).toMatch(/_id/);
    expect(block).toMatch(/function _seatsForCategory/);
  });

  it('a category with no seat renders an explicit statement, not an empty row', () => {
    expect(courtRenderBlock()).toMatch(/No seat exists for this office/);
  });

  it('admin-facing copy added by this story follows the no-em-dash rule', () => {
    const block = courtRenderBlock();
    const strings = [...block.matchAll(/No seat exists for this office[^`'"<]*/g)].map(m => m[0])
      .concat([...block.matchAll(/Seats are provisioned ST-side[^`'"<]*/g)].map(m => m[0]));
    expect(strings.length).toBeGreaterThan(0);
    for (const s of strings) expect(s, s).not.toContain('—');
  });

  it('seats are loaded once in initCityView, keeping renderCourt synchronous', () => {
    const src = readFile('public/js/admin/city-views.js');
    const init = src.slice(src.indexOf('export async function initCityView'), src.indexOf('function renderCity'));
    expect(init).toMatch(/refreshSeats\(\)/);
    // renderCourt itself must not be async, or renderCity would have to be.
    expect(src).toMatch(/\nfunction renderCourt\(\)/);
    expect(src).not.toMatch(/async function renderCourt/);
  });
});
