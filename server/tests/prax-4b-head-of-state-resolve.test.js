/**
 * prax.4b - resolving the Praxis claim (the Head of State mass-clear).
 *
 * `POST /api/praxis_sessions/:id/resolve-praxis` is the one place the Praxis
 * tally becomes real, and it is the largest single write in this codebase: in
 * ONE transaction it vacates every Enforcer, Administrator and City Harpy seat,
 * clears each departing holder's court fields, destroys each of those seats'
 * manoeuvre XP, optionally vacates the winner's own People's Harpy seat, writes
 * the winner's Head of State headline, and freezes the result into
 * `praxis_sessions.resolved.praxis`.
 *
 * This suite pins the eight things that are easy to get wrong:
 *
 *   1. It runs EXACTLY ONCE per board. A second call - of either kind - is a
 *      409 that writes nothing.
 *   2. The CONFIRM LIST IS THE CAS BASELINE. If the live mass-clear set has
 *      moved since the ST opened their confirmation, the whole write aborts and
 *      the 409 names the CURRENT list, never the stale one. No partial clear,
 *      ever.
 *   3. The DESTROYED-XP COUNTER, per vacated seat. Office spend is derived from
 *      the current rank, so zeroing a rank without recording what was destroyed
 *      REFUNDS the XP office-powers.md says is lost. Exact numbers are pinned,
 *      not merely that a reset happened.
 *   4. ATOMICITY ACROSS A MULTI-SEAT WRITE. A failure after one seat has already
 *      been cleared must leave NONE of it behind - a strictly stronger claim
 *      than prax.4a's single-seat suite could make.
 *   5. PRIMOGEN SURVIVES. The winner's Primogen seat keeps its `holder_id` and
 *      only the headline moves.
 *   6. The winner's own PEOPLE'S HARPY seat is vacated by its own explicit
 *      branch, never by the mass-clear query - the two Socialite seats must not
 *      be confused.
 *   6b. THE HEAD OF STATE SEAT IS HANDED OVER TOO (added at review, 2026-08-30).
 *      Office purchases are seat-keyed (oxp.11); leaving this seat's `holder_id`
 *      pointed at the outgoing holder would strand the new Head of State with
 *      no seat to purchase against. Unconditional, unlike People's Harpy - every
 *      resolve wins this seat, not just a winner who happened to already hold
 *      it.
 *   7. The FROZEN TALLY is the City Status SUM, computed against the PRE-clear
 *      world (several supporters are about to lose the office whose title bonus
 *      feeds their own City Status).
 *   8. The HARPY tally is untouched, on every path.
 *
 * ═══ SHARED-COLLECTION HAZARD (read before running this alongside others) ═══
 *
 * The route's write set is a live QUERY, not an id this suite chooses:
 * `office_category IN ('Enforcer','Administrator') OR (Socialite AND
 * seat_label='City Harpy')`, filtered to occupied seats. `office_seats` is
 * shared with oxp.1's, oxp.4's, oxp.5's, oxp.11's and prax.4a's suites, several
 * of which seed occupied Enforcer and Socialite seats of their own. So this
 * suite REMOVES every seat that could match that query (plus every People's
 * Harpy seat) before seeding its own - the only way to make the mass-clear
 * deterministic - and must therefore not be interleaved with those suites in
 * the same vitest invocation. `vitest.config.js` sets `fileParallelism: false`
 * and `maxWorkers: 1`, so a full run is serial and this is safe there; a
 * hand-rolled parallel invocation is not.
 *
 * DB-backed: real MongoDB with transaction support required. A skipped suite is
 * not a passing suite - read the summary line, not the exit code.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { ObjectId } from 'mongodb';
import Ajv from 'ajv';
import { createTestApp, stUser, playerUser, coordinatorUser } from './helpers/test-app.js';
import { setupDb, teardownDb, isDbAvailable } from './helpers/db-setup.js';
import { praxisSessionSchema } from '../schemas/praxis_session.schema.js';
import {
  planRename,
  applyRename,
  OLD_SEAT_LABEL,
  NEW_SEAT_LABEL,
  PEOPLES_HARPY_SEAT_LABEL as SCRIPT_PEOPLES_HARPY_LABEL,
} from '../scripts/rename-city-harpy-seat.mjs';
import { OFFICE_SEATS } from '../scripts/seed-office-seats.mjs';

// ── The atomicity probe ─────────────────────────────────────────────────────
//
// Same technique prax.4a used, with the one extension this story needs: a CALL
// COUNTER, so the injected failure can be placed AFTER at least one seat has
// already been fully cleared. prax.4a's single-seat route could only ever prove
// "the one write rolled back"; this route writes several seats in a loop, and
// the interesting claim is that a genuinely PARTIAL mass-clear never survives.
//
// `resetManoeuvreRank` is the last write in each loop iteration, so failing on
// the Nth call means N-1 seats have been claimed, their holders cleared and
// their ranks reset before the abort.
//
// The flag lives on globalThis because vi.mock's factory is hoisted above every
// local declaration in this file. Call ARGUMENTS are recorded as well, so a test
// can prove the failure fired on the real session path - without that, a route
// that opened no transaction at all would pass the atomicity assertions
// vacuously.
globalThis.__prax4bFailResetAfter = null;   // null = never fail
globalThis.__prax4bResetCalls = [];
vi.mock('../db.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getCollection: (name) => {
      if (name === 'office_manoeuvre_ranks' && globalThis.__prax4bFailResetAfter != null) {
        const real = actual.getCollection(name);
        return {
          findOneAndUpdate: async (...args) => {
            globalThis.__prax4bResetCalls.push(args);
            if (globalThis.__prax4bResetCalls.length > globalThis.__prax4bFailResetAfter)
              throw new Error('prax-4b injected manoeuvre-reset failure');
            return real.findOneAndUpdate(...args);
          },
        };
      }
      return actual.getCollection(name);
    },
  };
});

// Mocked at the module boundary, exactly as prax.1's and prax.4a's suites do:
// what this story owns is WHICH paths broadcast and WHAT the resolve frame
// carries, not the ST/dev fan-out itself (gdx.8's contract, covered there).
vi.mock('../ws.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, broadcastPraxisUpdate: vi.fn(), broadcastPraxisResolved: vi.fn() };
});
const { broadcastPraxisUpdate, broadcastPraxisResolved } = await import('../ws.js');

const { getCollection } = await import('../db.js');

const dbAvailable = await isDbAvailable();

// ── Fixtures ────────────────────────────────────────────────────────────────
//
// The `9ac5` prefix is this suite's own range; prax.1 claimed `9ac1`, prax.4a
// `9ac4`, oxp.5 `0f11`. Explicit ids so cleanup removes exactly these documents.
const oid = n => new ObjectId(`9ac5${'0'.repeat(16)}${String(n).padStart(4, '0')}`);

const CHAPTER = oid(1);
const SESSION = oid(11);

const PETRA   = oid(101);  // the usual winner, holds no office
const BRANDY  = oid(102);  // sitting Enforcer      -> mass-cleared
const CORVIN  = oid(103);  // sitting Administrator -> mass-cleared
const WREN    = oid(104);  // sitting City Harpy    -> mass-cleared
const DESMOND = oid(105);  // a supporter, holds no office
const MIKAEL  = oid(106);  // sitting Primogen      -> KEEPS the seat
const CARVER  = oid(107);  // sitting People's Harpy
const CHAR_IDS = [PETRA, BRANDY, CORVIN, WREN, DESMOND, MIKAEL, CARVER];

const s = id => String(id);

const SEAT_ENFORCER      = oid(201);
const SEAT_ADMIN         = oid(202);
const SEAT_CITY_HARPY    = oid(203);
const SEAT_PEOPLES_HARPY = oid(204);
const SEAT_PRIMOGEN      = oid(205);
const SEAT_HOS           = oid(206);
/** A spare id, used ONLY by the rename-script block for its ambiguous-shape
 *  fixtures. Kept out of the six-seat board fixture so the two cannot collide. */
const SEAT_SPARE         = oid(207);
const SEAT_IDS = [SEAT_ENFORCER, SEAT_ADMIN, SEAT_CITY_HARPY, SEAT_PEOPLES_HARPY, SEAT_PRIMOGEN, SEAT_HOS, SEAT_SPARE];

const CITY_HARPY_SEAT_LABEL = 'City Harpy';
const PEOPLES_HARPY_SEAT_LABEL = "People's Harpy";

/** The three seats the default fixture puts inside the mass-clear set. */
const MASS_CLEAR_IDS = [SEAT_ENFORCER, SEAT_ADMIN, SEAT_CITY_HARPY].map(s).sort();

const UNKNOWN_BOARD = '9ac50000000000000000ffff';

let app;

const boards = () => getCollection('praxis_sessions');
const seats = () => getCollection('office_seats');
const chars = () => getCollection('characters');
const ranks = () => getCollection('office_manoeuvre_ranks');

const att = id => ({ character_id: s(id), attended: true, costuming: false, downtime: false, extra: 0 });

/** `status.city` is the raw figure; the title bonus is added by the shared
 *  `calcEffectiveCityStatus`, which is exactly what the route uses. */
function buildChar(_id, name, cityStatus, courtCategory = null, courtTitle = null) {
  return {
    _id,
    name,
    moniker: null,
    honorific: null,
    court_category: courtCategory,
    court_title: courtTitle,
    status: { city: cityStatus, clan: 0, covenant: {} },
    retired: false,
    updated_at: '2026-08-01T00:00:00.000Z',
    _prax4b_probe: true,
  };
}

async function removeFixtures() {
  await boards().deleteMany({ chapter_id: CHAPTER });
  await getCollection('game_sessions').deleteMany({ _id: SESSION });
  await getCollection('chapters').deleteMany({ _id: CHAPTER });
  await chars().deleteMany({ _id: { $in: CHAR_IDS } });
  await ranks().deleteMany({ _id: { $in: SEAT_IDS.map(s) } });
  // The mass-clear sweep. See this file's header: the route's write set is a
  // QUERY, so ANY other suite's leftover occupied Enforcer / Administrator /
  // Socialite seat would silently join it and make every assertion below wrong.
  await seats().deleteMany({
    $or: [
      { _id: { $in: SEAT_IDS } },
      { office_category: { $in: ['Enforcer', 'Administrator', 'Socialite'] } },
    ],
  });
}

/**
 * Seed a board with a live Praxis tally.
 *
 *   praxis claims : PETRA, MIKAEL
 *   praxis support: DESMOND -> PETRA, WREN -> PETRA, BRANDY -> MIKAEL
 *   harpy  claims : CORVIN
 *   harpy  support: BRANDY -> CORVIN
 *
 * The Harpy side is deliberately populated and deliberately different: every
 * assertion that it survives a Praxis resolve untouched needs something there
 * to survive.
 */
async function seedBoard(overrides = {}) {
  const now = '2026-08-30T10:00:00.000Z';
  const doc = {
    chapter_id: CHAPTER,
    praxis: {
      claims: [
        { character_id: s(PETRA), opened_at: now },
        { character_id: s(MIKAEL), opened_at: now },
      ],
      support: { [s(DESMOND)]: s(PETRA), [s(WREN)]: s(PETRA), [s(BRANDY)]: s(MIKAEL) },
    },
    harpy: {
      claims: [{ character_id: s(CORVIN), opened_at: now }],
      support: { [s(BRANDY)]: s(CORVIN) },
    },
    resolved: { praxis: null, harpy: null },
    created_at: now,
    updated_at: now,
    ...overrides,
  };
  const { insertedId } = await boards().insertOne(doc);
  return String(insertedId);
}

/**
 * Seed the six seats.
 *
 * Every occupied seat is in the mass-clear set EXCEPT Primogen (survives by
 * game rule), People's Harpy (its own explicit branch) and Head of State (this
 * route never touches a seat document for the office it confers).
 */
async function seedSeats(overrides = {}) {
  const {
    enforcerHolder = BRANDY,
    adminHolder = CORVIN,
    cityHarpyHolder = WREN,
    peoplesHarpyHolder = CARVER,
    primogenHolder = MIKAEL,
    hosHolder = null,
  } = overrides;
  await seats().insertMany([
    { _id: SEAT_ENFORCER,      office_category: 'Enforcer',      seat_label: null,                     holder_id: enforcerHolder,     created_at: '2026-01-01', notes: null },
    { _id: SEAT_ADMIN,         office_category: 'Administrator', seat_label: null,                     holder_id: adminHolder,        created_at: '2026-01-02', notes: null },
    { _id: SEAT_CITY_HARPY,    office_category: 'Socialite',     seat_label: CITY_HARPY_SEAT_LABEL,    holder_id: cityHarpyHolder,    created_at: '2026-01-03', notes: null },
    { _id: SEAT_PEOPLES_HARPY, office_category: 'Socialite',     seat_label: PEOPLES_HARPY_SEAT_LABEL, holder_id: peoplesHarpyHolder, created_at: '2026-01-04', notes: null },
    { _id: SEAT_PRIMOGEN,      office_category: 'Primogen',      seat_label: null,                     holder_id: primogenHolder,     created_at: '2026-01-05', notes: null },
    { _id: SEAT_HOS,           office_category: 'Head of State', seat_label: null,                     holder_id: hosHolder,          created_at: '2026-01-06', notes: null },
  ]);
}

const seatDoc = id => seats().findOne({ _id: id });
const charDoc = id => chars().findOne({ _id: id });
const rankDoc = id => ranks().findOne({ _id: s(id) });
const rawBoard = id => boards().findOne({ _id: new ObjectId(id) });

const resolvePraxis = (boardId, body, user = stUser()) =>
  request(app).post(`/api/praxis_sessions/${boardId}/resolve-praxis`).set('X-Test-User', user).send(body);

/** The happy-path body: declare `winner` and confirm the default three seats. */
const declare = (winner, confirmed = MASS_CLEAR_IDS) => ({
  claimant_character_id: s(winner),
  confirmed_vacate_seat_ids: confirmed,
});

beforeAll(async () => {
  if (!dbAvailable) return;
  await setupDb();
  app = createTestApp();
});

beforeEach(async () => {
  if (!dbAvailable) return;
  vi.clearAllMocks();
  globalThis.__prax4bFailResetAfter = null;
  globalThis.__prax4bResetCalls = [];
  await removeFixtures();
  await getCollection('chapters').insertOne({ _id: CHAPTER, chapter_number: 915, label: 'PRAX4b Chapter' });
  await getCollection('game_sessions').insertOne({
    _id: SESSION,
    session_date: '2026-08-30',
    chapter_id: CHAPTER,
    attendance: CHAR_IDS.map(att),
  });
  await chars().insertMany([
    buildChar(PETRA, 'Petra Voss', 4),
    buildChar(BRANDY, 'Brandy LaRoux', 3, 'Enforcer', 'Enforcer'),
    buildChar(CORVIN, 'Corvin Adeyemi', 2, 'Administrator', 'Administrator'),
    buildChar(WREN, 'Wren Halloway', 1, 'Socialite', CITY_HARPY_SEAT_LABEL),
    buildChar(DESMOND, 'Desmond Okafor', 2),
    buildChar(MIKAEL, 'Mikael Thorne', 3, 'Primogen', 'Primogen'),
    buildChar(CARVER, 'Carver', 1, 'Socialite', PEOPLES_HARPY_SEAT_LABEL),
  ]);
  await seedSeats();
});

afterAll(async () => {
  if (!dbAvailable) return;
  await removeFixtures();
  await teardownDb();
});

// ─────────────────────────────────────────────────────────────────────────────
// The role boundary. Permanent, like every other route in this file.
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!dbAvailable)('prax.4b: ST-only, permanently', () => {
  it('refuses a player, a coordinator and an unauthenticated caller', async () => {
    const boardId = await seedBoard();
    const body = declare(PETRA);

    expect((await resolvePraxis(boardId, body, playerUser([s(PETRA)]))).status).toBe(403);
    expect((await resolvePraxis(boardId, body, coordinatorUser())).status).toBe(403);
    const anon = await request(app).post(`/api/praxis_sessions/${boardId}/resolve-praxis`).send(body);
    expect(anon.status).toBe(401);

    // Nothing leaked past any of the three refusals.
    expect((await rawBoard(boardId)).resolved.praxis).toBeNull();
    expect(String((await seatDoc(SEAT_ENFORCER)).holder_id)).toBe(s(BRANDY));
  });

  it('admits dev, the privacy-redacted ST login', async () => {
    const boardId = await seedBoard();
    const res = await resolvePraxis(boardId, { claimant_character_id: null }, stUser({ role: 'dev' }));
    expect(res.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC3 - request validation.
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!dbAvailable)('prax.4b AC3: the request body', () => {
  it('an ABSENT claimant_character_id is a 400, never read as a dismissal', async () => {
    const boardId = await seedBoard();
    const res = await resolvePraxis(boardId, { confirmed_vacate_seat_ids: MASS_CLEAR_IDS });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect((await rawBoard(boardId)).resolved.praxis).toBeNull();
  });

  it('an ABSENT confirmed_vacate_seat_ids is a 400 on the resolve path', async () => {
    // The dangerous direction: without this, a client that dropped the field
    // would sail through the execute-time diff whenever the live set happened to
    // be empty, and fail confusingly whenever it was not.
    const boardId = await seedBoard();
    const res = await resolvePraxis(boardId, { claimant_character_id: s(PETRA) });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/confirmed_vacate_seat_ids/);
    expect(String((await seatDoc(SEAT_ENFORCER)).holder_id)).toBe(s(BRANDY));
  });

  it('400s on a malformed claimant id and on a malformed seat id', async () => {
    const boardId = await seedBoard();
    for (const bad of ['nope', `${s(PETRA)}0`, 7, {}]) {
      const res = await resolvePraxis(boardId, { claimant_character_id: bad, confirmed_vacate_seat_ids: [] });
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
    for (const bad of ['nope', 7, null]) {
      const res = await resolvePraxis(boardId, { claimant_character_id: s(PETRA), confirmed_vacate_seat_ids: [bad] });
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
    // Not an array at all.
    expect((await resolvePraxis(boardId, {
      claimant_character_id: s(PETRA), confirmed_vacate_seat_ids: s(SEAT_ENFORCER),
    })).status).toBe(400);
    expect((await rawBoard(boardId)).resolved.praxis).toBeNull();
  });

  it('404s on an unknown board id and 400s on a malformed one', async () => {
    expect((await resolvePraxis(UNKNOWN_BOARD, { claimant_character_id: null })).status).toBe(404);
    expect((await resolvePraxis('nope', { claimant_character_id: null })).status).toBe(400);
  });

  it('400s a character who is not currently standing in the PRAXIS tally', async () => {
    const boardId = await seedBoard();
    // CORVIN stands in HARPY only. The two tallies are never coupled.
    const res = await resolvePraxis(boardId, declare(CORVIN));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/no open praxis claim/i);
    expect((await rawBoard(boardId)).resolved.praxis).toBeNull();
    expect(String((await seatDoc(SEAT_ADMIN)).holder_id)).toBe(s(CORVIN));
  });

  it('404s when the winner has no character document, before any seat moves', async () => {
    await chars().deleteMany({ _id: PETRA });
    const boardId = await seedBoard();
    const res = await resolvePraxis(boardId, declare(PETRA));
    expect(res.status).toBe(404);
    expect(String((await seatDoc(SEAT_ENFORCER)).holder_id)).toBe(s(BRANDY));
    expect(String((await seatDoc(SEAT_ADMIN)).holder_id)).toBe(s(CORVIN));
    expect((await rawBoard(boardId)).resolved.praxis).toBeNull();
  });

  it('no refusal broadcasts', async () => {
    const boardId = await seedBoard();
    await resolvePraxis(boardId, declare(CORVIN));                          // 400
    await resolvePraxis(boardId, { claimant_character_id: s(PETRA) });      // 400
    await resolvePraxis(UNKNOWN_BOARD, { claimant_character_id: null });    // 404
    expect(broadcastPraxisUpdate).not.toHaveBeenCalled();
    expect(broadcastPraxisResolved).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC5 - the dismiss path.
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!dbAvailable)('prax.4b AC5: dismissing the vote', () => {
  it('writes a dismissed snapshot and touches no seat, character or rank', async () => {
    await ranks().insertOne({ _id: s(SEAT_ENFORCER), rank: 4, office_category: 'Enforcer', updated_at: '2026-08-01T00:00:00.000Z' });
    const boardId = await seedBoard();
    const seatsBefore = await seats().find({ _id: { $in: SEAT_IDS } }).sort({ _id: 1 }).toArray();
    const charsBefore = await chars().find({ _id: { $in: CHAR_IDS } }).sort({ _id: 1 }).toArray();

    const res = await resolvePraxis(boardId, { claimant_character_id: null });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.dismissed).toBe(true);
    expect(res.body.resolved.dismissed).toBe(true);
    expect(res.body.resolved.winner_character_id).toBeUndefined();
    expect(res.body.resolved.vacated_seat_ids).toBeUndefined();
    expect(Number.isNaN(Date.parse(res.body.resolved.resolved_at))).toBe(false);

    const stored = await rawBoard(boardId);
    expect(stored.resolved.praxis).toEqual({
      dismissed: true,
      resolved_at: res.body.resolved.resolved_at,
    });

    // The mass-clear query never ran at all.
    expect(await seats().find({ _id: { $in: SEAT_IDS } }).sort({ _id: 1 }).toArray()).toEqual(seatsBefore);
    expect(await chars().find({ _id: { $in: CHAR_IDS } }).sort({ _id: 1 }).toArray()).toEqual(charsBefore);
    expect((await rankDoc(SEAT_ENFORCER)).rank).toBe(4);
    expect((await rankDoc(SEAT_ENFORCER)).manoeuvre_xp_destroyed).toBeUndefined();
  });

  it('needs no confirmed_vacate_seat_ids at all', async () => {
    const boardId = await seedBoard();
    const res = await resolvePraxis(boardId, { claimant_character_id: null });
    expect(res.status).toBe(200);
  });

  it('leaves the whole claim/support history and the Harpy tally intact', async () => {
    const boardId = await seedBoard();
    const before = await rawBoard(boardId);
    await resolvePraxis(boardId, { claimant_character_id: null });
    const after = await rawBoard(boardId);

    expect(after.praxis).toEqual(before.praxis);
    expect(after.harpy).toEqual(before.harpy);
    expect(after.resolved.harpy).toBeNull();
  });

  it('broadcasts the board frame once and the RESOLVED frame not at all', async () => {
    const boardId = await seedBoard();
    await resolvePraxis(boardId, { claimant_character_id: null });
    expect(broadcastPraxisUpdate).toHaveBeenCalledTimes(1);
    // Nothing outside the board needs to know: no seat moved, no character did.
    expect(broadcastPraxisResolved).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC6 - the resolve path: the full mass-clear.
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!dbAvailable)('prax.4b AC6: the mass-clear', () => {
  it('vacates all three offices, clears all three holders, and crowns the winner', async () => {
    const boardId = await seedBoard();
    const res = await resolvePraxis(boardId, declare(PETRA));

    expect(res.status).toBe(200);
    expect(res.body.dismissed).toBe(false);
    expect(res.body.resolved.winner_character_id).toBe(s(PETRA));
    expect(res.body.resolved.vacated_seat_ids).toEqual(MASS_CLEAR_IDS);

    // All three seats emptied.
    for (const id of [SEAT_ENFORCER, SEAT_ADMIN, SEAT_CITY_HARPY]) {
      expect((await seatDoc(id)).holder_id, String(id)).toBeNull();
    }
    // All three departing holders' headlines cleared.
    for (const id of [BRANDY, CORVIN, WREN]) {
      const c = await charDoc(id);
      expect(c.court_category, String(id)).toBeNull();
      expect(c.court_title, String(id)).toBeNull();
    }

    // The winner's headline, and nothing else about her.
    const petra = await charDoc(PETRA);
    expect(petra.court_category).toBe('Head of State');
    expect(petra.court_title).toBe('Head of State');

    // The snapshot on the document matches the response exactly.
    expect((await rawBoard(boardId)).resolved.praxis).toEqual(res.body.resolved);
  });

  it('writes ONLY holder_id on each vacated seat - every other field survives', async () => {
    const boardId = await seedBoard();
    const before = await seats().find({ _id: { $in: [SEAT_ENFORCER, SEAT_ADMIN, SEAT_CITY_HARPY] } }).sort({ _id: 1 }).toArray();
    await resolvePraxis(boardId, declare(PETRA));
    const after = await seats().find({ _id: { $in: [SEAT_ENFORCER, SEAT_ADMIN, SEAT_CITY_HARPY] } }).sort({ _id: 1 }).toArray();

    expect(after).toHaveLength(before.length);
    for (let i = 0; i < before.length; i += 1) {
      expect(Object.keys(after[i]).sort()).toEqual(Object.keys(before[i]).sort());
      for (const k of Object.keys(before[i])) {
        if (k === 'holder_id') continue;
        expect(after[i][k], k).toEqual(before[i][k]);
      }
    }
    // The one field that tells Socialite's two seats apart.
    expect(after.find(x => String(x._id) === s(SEAT_CITY_HARPY)).seat_label).toBe(CITY_HARPY_SEAT_LABEL);
  });

  it('never touches Primogen or People’s Harpy, but DOES claim the Head of State seat', async () => {
    const boardId = await seedBoard();
    const primogenBefore = await seatDoc(SEAT_PRIMOGEN);
    const peoplesBefore = await seatDoc(SEAT_PEOPLES_HARPY);

    await resolvePraxis(boardId, declare(PETRA));

    // PETRA holds neither Primogen nor People's Harpy, so both are untouched.
    expect(await seatDoc(SEAT_PRIMOGEN)).toEqual(primogenBefore);
    expect(await seatDoc(SEAT_PEOPLES_HARPY)).toEqual(peoplesBefore);
    // And their holders keep their offices.
    expect((await charDoc(MIKAEL)).court_category).toBe('Primogen');
    expect((await charDoc(CARVER)).court_category).toBe('Socialite');

    // The Head of State seat, by contrast, IS claimed - this is the office she
    // just won, and office purchases are seat-keyed (oxp.11).
    const hos = await seatDoc(SEAT_HOS);
    expect(hos.holder_id).toBeInstanceOf(ObjectId);
    expect(String(hos.holder_id)).toBe(s(PETRA));
  });

  it('resolves cleanly when nothing at all is currently held', async () => {
    await seats().deleteMany({ _id: { $in: SEAT_IDS } });
    await seedSeats({ enforcerHolder: null, adminHolder: null, cityHarpyHolder: null });
    for (const id of [BRANDY, CORVIN, WREN]) {
      await chars().updateOne({ _id: id }, { $set: { court_category: null, court_title: null } });
    }
    const boardId = await seedBoard();

    const res = await resolvePraxis(boardId, { claimant_character_id: s(PETRA), confirmed_vacate_seat_ids: [] });

    expect(res.status).toBe(200);
    expect(res.body.resolved.vacated_seat_ids).toEqual([]);
    expect((await charDoc(PETRA)).court_category).toBe('Head of State');
    // No rank documents minted for seats nothing happened to.
    expect(await rankDoc(SEAT_ENFORCER)).toBeNull();
  });

  it('a VACANT seat is never part of the set, even alongside occupied ones', async () => {
    await seats().updateOne({ _id: SEAT_ADMIN }, { $set: { holder_id: null } });
    const boardId = await seedBoard();
    const confirmed = [s(SEAT_ENFORCER), s(SEAT_CITY_HARPY)].sort();

    const res = await resolvePraxis(boardId, { claimant_character_id: s(PETRA), confirmed_vacate_seat_ids: confirmed });

    expect(res.status).toBe(200);
    expect(res.body.resolved.vacated_seat_ids).toEqual(confirmed);
  });

  it('a departing holder whose court_category has already moved is left alone, not an error', async () => {
    // The benign mismatch every handover route in this codebase documents:
    // clearing unconditionally would wipe a legitimate newer assignment.
    await chars().updateOne({ _id: BRANDY }, { $set: { court_category: 'Primogen', court_title: 'Primogen' } });
    const boardId = await seedBoard();

    const res = await resolvePraxis(boardId, declare(PETRA));

    expect(res.status).toBe(200);
    // The SEAT is still vacated - that is the authoritative fact.
    expect((await seatDoc(SEAT_ENFORCER)).holder_id).toBeNull();
    // Her newer headline survives.
    const brandy = await charDoc(BRANDY);
    expect(brandy.court_category).toBe('Primogen');
    expect(brandy.court_title).toBe('Primogen');
  });

  it('the LOSING claimant can be declared - the tally is recorded, not obeyed', async () => {
    const boardId = await seedBoard();
    const res = await resolvePraxis(boardId, declare(MIKAEL));
    expect(res.status).toBe(200);
    expect(res.body.resolved.winner_character_id).toBe(s(MIKAEL));
    expect((await charDoc(MIKAEL)).court_category).toBe('Head of State');
  });

  it('the resolved board still validates against the praxis_session schema', async () => {
    const ajv = new Ajv({ allErrors: true, coerceTypes: false });
    const validate = ajv.compile(praxisSessionSchema);
    const boardId = await seedBoard();
    await resolvePraxis(boardId, declare(PETRA));
    const stored = await rawBoard(boardId);
    const serialised = { ...stored, _id: String(stored._id), chapter_id: String(stored.chapter_id) };
    expect(validate(serialised), JSON.stringify(validate.errors)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC6 - the winner's own prior seats: the three named cases.
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!dbAvailable)('prax.4b AC6: the winner’s own prior seat', () => {
  it('PRIMOGEN is kept: holder_id untouched, only the headline moves', async () => {
    const boardId = await seedBoard();
    const before = await seatDoc(SEAT_PRIMOGEN);

    const res = await resolvePraxis(boardId, declare(MIKAEL));

    expect(res.status).toBe(200);
    // The seat itself is byte-for-byte what it was.
    expect(await seatDoc(SEAT_PRIMOGEN)).toEqual(before);
    expect(String((await seatDoc(SEAT_PRIMOGEN)).holder_id)).toBe(s(MIKAEL));
    // The headline flips to the more senior office. This is the one dual-hold
    // `mayHoldBothOffices` permits, and the reason a dual holder's headline and
    // one of their held seats permanently disagree by design (prax.0).
    const mikael = await charDoc(MIKAEL);
    expect(mikael.court_category).toBe('Head of State');
    expect(mikael.court_title).toBe('Head of State');
    // No manoeuvre reset on a seat that did not change hands.
    expect(await rankDoc(SEAT_PRIMOGEN)).toBeNull();
  });

  it('the kept Primogen seat’s manoeuvre rank survives the resolution', async () => {
    await ranks().insertOne({ _id: s(SEAT_PRIMOGEN), rank: 3, office_category: 'Primogen', updated_at: '2026-08-01T00:00:00.000Z' });
    const boardId = await seedBoard();
    await resolvePraxis(boardId, declare(MIKAEL));
    const rank = await rankDoc(SEAT_PRIMOGEN);
    expect(rank.rank).toBe(3);
    expect(rank.manoeuvre_xp_destroyed).toBeUndefined();
  });

  it('PEOPLE’S HARPY is vacated by its own explicit branch, with its own reset', async () => {
    // CARVER holds the popular seat AND stands for Praxis. That seat is never a
    // member of the mass-clear query (which matches 'City Harpy'), so if this
    // passes only because the query caught it, the confirmed-set diff below
    // would have refused the request instead.
    await ranks().insertOne({ _id: s(SEAT_PEOPLES_HARPY), rank: 2, office_category: 'Socialite', updated_at: '2026-08-01T00:00:00.000Z' });
    const boardId = await seedBoard({
      praxis: { claims: [{ character_id: s(CARVER), opened_at: '2026-08-30T10:00:00.000Z' }], support: {} },
      harpy: { claims: [], support: {} },
    });

    const res = await resolvePraxis(boardId, declare(CARVER));

    expect(res.status).toBe(200);
    expect((await seatDoc(SEAT_PEOPLES_HARPY)).holder_id).toBeNull();
    // Its own reset fired, with its own destroyed-XP figure.
    const rank = await rankDoc(SEAT_PEOPLES_HARPY);
    expect(rank.rank).toBe(0);
    expect(rank.manoeuvre_xp_destroyed).toBe(2);
    // He ends up Head of State, not stranded as a Socialite.
    expect((await charDoc(CARVER)).court_category).toBe('Head of State');
    // It is NOT part of the frozen mass-clear record - a different mechanism.
    expect(res.body.resolved.vacated_seat_ids).toEqual(MASS_CLEAR_IDS);
    expect(res.body.resolved.vacated_seat_ids).not.toContain(s(SEAT_PEOPLES_HARPY));
  });

  it('a winner who does NOT hold People’s Harpy leaves that seat and its holder alone', async () => {
    const boardId = await seedBoard();
    const before = await seatDoc(SEAT_PEOPLES_HARPY);
    await resolvePraxis(boardId, declare(PETRA));
    expect(await seatDoc(SEAT_PEOPLES_HARPY)).toEqual(before);
    expect((await charDoc(CARVER)).court_title).toBe(PEOPLES_HARPY_SEAT_LABEL);
  });

  it('the winner HOLDING one of the three cleared seats is no special case at all', async () => {
    // WREN is the sitting City Harpy and stands for Praxis. prax.0's exclusivity
    // matrix means Head of State cannot also hold Socialite, so his own seat goes
    // the same way as anybody else's - the only difference is what the confirm
    // modal displayed beforehand.
    await ranks().insertOne({ _id: s(SEAT_CITY_HARPY), rank: 5, office_category: 'Socialite', updated_at: '2026-08-01T00:00:00.000Z' });
    const boardId = await seedBoard({
      praxis: { claims: [{ character_id: s(WREN), opened_at: '2026-08-30T10:00:00.000Z' }], support: {} },
      harpy: { claims: [], support: {} },
    });

    const res = await resolvePraxis(boardId, declare(WREN));

    expect(res.status).toBe(200);
    // His own seat is emptied like everyone else's...
    expect((await seatDoc(SEAT_CITY_HARPY)).holder_id).toBeNull();
    // ...its manoeuvre rank resets like everyone else's...
    const rank = await rankDoc(SEAT_CITY_HARPY);
    expect(rank.rank).toBe(0);
    expect(rank.manoeuvre_xp_destroyed).toBe(5);
    // ...and the departing-holder clear does NOT leave him office-less: the
    // headline write runs afterwards and crowns him.
    const wren = await charDoc(WREN);
    expect(wren.court_category).toBe('Head of State');
    expect(wren.court_title).toBe('Head of State');
    // He appears in the frozen record like any other vacated seat.
    expect(res.body.resolved.vacated_seat_ids).toContain(s(SEAT_CITY_HARPY));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The Head of State seat itself - added during this story's own review
// (2026-08-30, confirmed with Angelus, not in the original spec). Office
// purchases are seat-keyed (oxp.11) and Head of State has real purchasable
// content, so leaving this seat's holder_id pointed at the outgoing holder
// would strand the new Head of State with no seat to purchase against.
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!dbAvailable)('prax.4b: the Head of State seat is handed over', () => {
  it('an OCCUPIED seat is claimed: the outgoing holder is cleared and their manoeuvre rank resets', async () => {
    await seats().updateOne({ _id: SEAT_HOS }, { $set: { holder_id: CARVER } });
    await chars().updateOne({ _id: CARVER }, { $set: { court_category: 'Head of State', court_title: 'Head of State' } });
    await ranks().insertOne({ _id: s(SEAT_HOS), rank: 4, office_category: 'Head of State', updated_at: '2026-08-01T00:00:00.000Z' });
    const boardId = await seedBoard();

    const res = await resolvePraxis(boardId, declare(PETRA));

    expect(res.status).toBe(200);
    // The seat: claimed by the winner.
    const hos = await seatDoc(SEAT_HOS);
    expect(hos.holder_id).toBeInstanceOf(ObjectId);
    expect(String(hos.holder_id)).toBe(s(PETRA));
    // The outgoing holder: cleared, exactly like a mass-cleared holder.
    const carver = await charDoc(CARVER);
    expect(carver.court_category).toBeNull();
    expect(carver.court_title).toBeNull();
    // The destroyed-XP counter: pinned, not merely "a reset happened" - same
    // rigour every other vacated seat in this suite gets.
    const rank = await rankDoc(SEAT_HOS);
    expect(rank.rank).toBe(0);
    expect(rank.manoeuvre_xp_destroyed).toBe(4);
    // The outgoing holder is named in the broadcast, alongside the mass-clear.
    const [, payload] = broadcastPraxisResolved.mock.calls[0];
    expect(payload.affected_seat_ids).toContain(s(SEAT_HOS));
    expect(payload.affected_character_ids).toContain(s(CARVER));
  });

  it('a VACANT seat is simply claimed - no departing holder to clear, no reset', async () => {
    // The default fixture's own shape (hosHolder: null).
    const boardId = await seedBoard();
    const res = await resolvePraxis(boardId, declare(PETRA));

    expect(res.status).toBe(200);
    expect(String((await seatDoc(SEAT_HOS)).holder_id)).toBe(s(PETRA));
    // Nothing was destroyed on a seat that had no rank document at all.
    expect(await rankDoc(SEAT_HOS)).toBeNull();
  });

  it('a MISSING Head of State seat document does not block the resolve', async () => {
    // A seeding gap - unlike resolve-harpy's own People's Harpy lookup, this
    // route must not refuse a Praxis resolve over the state of an office
    // seeding forgot; the headline write below still lands regardless.
    await seats().deleteMany({ _id: SEAT_HOS });
    const boardId = await seedBoard();
    const res = await resolvePraxis(boardId, declare(PETRA));

    expect(res.status).toBe(200);
    expect((await charDoc(PETRA)).court_category).toBe('Head of State');
    expect(await seatDoc(SEAT_HOS)).toBeNull();
  });

  it('the sitting Head of State re-declaring themselves is a no-op, not a self-clear-and-reset', async () => {
    await seats().updateOne({ _id: SEAT_HOS }, { $set: { holder_id: PETRA } });
    await ranks().insertOne({ _id: s(SEAT_HOS), rank: 2, office_category: 'Head of State', updated_at: '2026-08-01T00:00:00.000Z' });
    const boardId = await seedBoard();

    const res = await resolvePraxis(boardId, declare(PETRA));

    expect(res.status).toBe(200);
    expect(String((await seatDoc(SEAT_HOS)).holder_id)).toBe(s(PETRA));
    // No reset: the seat never actually changed hands.
    const rank = await rankDoc(SEAT_HOS);
    expect(rank.rank).toBe(2);
    expect(rank.manoeuvre_xp_destroyed).toBeUndefined();
    // Not named in the broadcast either - nothing about this seat changed.
    const [, payload] = broadcastPraxisResolved.mock.calls[0];
    expect(payload.affected_seat_ids).not.toContain(s(SEAT_HOS));
  });

  it('a failure during the Head of State handover itself rolls back the WHOLE mass-clear too', async () => {
    await seats().updateOne({ _id: SEAT_HOS }, { $set: { holder_id: CARVER } });
    const boardId = await seedBoard();
    const seatsBefore = await seats().find({ _id: { $in: SEAT_IDS } }).sort({ _id: 1 }).toArray();
    const charsBefore = await chars().find({ _id: { $in: CHAR_IDS } }).sort({ _id: 1 }).toArray();

    // Three mass-clear resets (Enforcer, Admin, City Harpy) succeed; the FOURTH
    // call - the Head of State seat's own reset - is the one that fails. Proves
    // atomicity extends to this new step specifically, not just the mass-clear
    // loop prax.4b's other atomicity test already covers.
    globalThis.__prax4bFailResetAfter = 3;
    let res;
    try {
      res = await resolvePraxis(boardId, declare(PETRA));
    } finally {
      globalThis.__prax4bFailResetAfter = null;
    }

    expect(res.status).toBe(500);
    expect(await seats().find({ _id: { $in: SEAT_IDS } }).sort({ _id: 1 }).toArray()).toEqual(seatsBefore);
    expect(await chars().find({ _id: { $in: CHAR_IDS } }).sort({ _id: 1 }).toArray()).toEqual(charsBefore);
    expect((await rawBoard(boardId)).resolved.praxis).toBeNull();
    expect(broadcastPraxisResolved).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC6 - the confirmed-vacate-set diff. The confirm list IS the CAS baseline.
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!dbAvailable)('prax.4b AC6: the confirmed-vacate-set diff', () => {
  it('409s when a confirmed seat has been vacated since the modal opened, naming the FRESH list', async () => {
    const boardId = await seedBoard();
    // The injected change: somebody vacated the Administrator seat through the
    // Court panel while the ST was reading their confirmation.
    await seats().updateOne({ _id: SEAT_ADMIN }, { $set: { holder_id: null } });

    const res = await resolvePraxis(boardId, declare(PETRA));   // still confirms all three

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('CONFLICT');
    // The CURRENT list, not the stale one that was sent.
    expect(res.body.current_vacate_seat_ids).toEqual([s(SEAT_ENFORCER), s(SEAT_CITY_HARPY)].sort());
    expect(res.body.current_vacate.map(r => r.office_category).sort()).toEqual(['Enforcer', 'Socialite']);
    expect(res.body.current_vacate.find(r => r.office_category === 'Socialite').seat_label)
      .toBe(CITY_HARPY_SEAT_LABEL);

    // NO PARTIAL CLEAR. Not one of the seats the ST did confirm was touched.
    expect(String((await seatDoc(SEAT_ENFORCER)).holder_id)).toBe(s(BRANDY));
    expect(String((await seatDoc(SEAT_CITY_HARPY)).holder_id)).toBe(s(WREN));
    expect((await charDoc(BRANDY)).court_category).toBe('Enforcer');
    expect((await charDoc(WREN)).court_category).toBe('Socialite');
    expect((await charDoc(PETRA)).court_category).toBeNull();
    expect((await rawBoard(boardId)).resolved.praxis).toBeNull();
  });

  it('409s when a seat has been FILLED since the modal opened', async () => {
    // The other direction: an office the ST was never shown is now occupied, and
    // silently clearing it would vacate somebody they never agreed to.
    await seats().updateOne({ _id: SEAT_ADMIN }, { $set: { holder_id: null } });
    const boardId = await seedBoard();
    const staleConfirm = [s(SEAT_ENFORCER), s(SEAT_CITY_HARPY)].sort();
    await seats().updateOne({ _id: SEAT_ADMIN }, { $set: { holder_id: DESMOND } });

    const res = await resolvePraxis(boardId, {
      claimant_character_id: s(PETRA), confirmed_vacate_seat_ids: staleConfirm,
    });

    expect(res.status).toBe(409);
    expect(res.body.current_vacate_seat_ids).toEqual(MASS_CLEAR_IDS);
    expect(String((await seatDoc(SEAT_ENFORCER)).holder_id)).toBe(s(BRANDY));
    expect((await rawBoard(boardId)).resolved.praxis).toBeNull();
  });

  it('409s on a confirmed seat id that is not in the live set at all', async () => {
    const boardId = await seedBoard();
    const res = await resolvePraxis(boardId, {
      claimant_character_id: s(PETRA),
      confirmed_vacate_seat_ids: [...MASS_CLEAR_IDS, s(SEAT_PRIMOGEN)].sort(),
    });
    expect(res.status).toBe(409);
    expect(res.body.current_vacate_seat_ids).toEqual(MASS_CLEAR_IDS);
    // The Primogen seat named in the bad request is emphatically untouched.
    expect(String((await seatDoc(SEAT_PRIMOGEN)).holder_id)).toBe(s(MIKAEL));
  });

  it('an empty confirmed list against a NON-empty live set is refused, not treated as a no-op', async () => {
    const boardId = await seedBoard();
    const res = await resolvePraxis(boardId, { claimant_character_id: s(PETRA), confirmed_vacate_seat_ids: [] });
    expect(res.status).toBe(409);
    expect(res.body.current_vacate_seat_ids).toEqual(MASS_CLEAR_IDS);
    expect((await rawBoard(boardId)).resolved.praxis).toBeNull();
  });

  it('order and duplicates in the confirmed list do not matter', async () => {
    const boardId = await seedBoard();
    const scrambled = [s(SEAT_CITY_HARPY), s(SEAT_ENFORCER), s(SEAT_ADMIN), s(SEAT_ENFORCER)];
    const res = await resolvePraxis(boardId, {
      claimant_character_id: s(PETRA), confirmed_vacate_seat_ids: scrambled,
    });
    expect(res.status).toBe(200);
    // Frozen in a stable, sorted, de-duplicated order regardless.
    expect(res.body.resolved.vacated_seat_ids).toEqual(MASS_CLEAR_IDS);
  });

  it('a refused diff broadcasts nothing', async () => {
    const boardId = await seedBoard();
    await seats().updateOne({ _id: SEAT_ADMIN }, { $set: { holder_id: null } });
    await resolvePraxis(boardId, declare(PETRA));
    expect(broadcastPraxisUpdate).not.toHaveBeenCalled();
    expect(broadcastPraxisResolved).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The manoeuvre resets and their destroyed-XP counters, per seat.
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!dbAvailable)('prax.4b: every vacated seat resets, and each records what it destroyed', () => {
  it('zeroes all three ranks and pins each EXACT destroyed-XP figure', async () => {
    await ranks().insertMany([
      { _id: s(SEAT_ENFORCER),   rank: 3, office_category: 'Enforcer',      updated_at: '2026-08-01T00:00:00.000Z' },
      { _id: s(SEAT_ADMIN),      rank: 1, office_category: 'Administrator', updated_at: '2026-08-01T00:00:00.000Z' },
      { _id: s(SEAT_CITY_HARPY), rank: 4, office_category: 'Socialite',     updated_at: '2026-08-01T00:00:00.000Z' },
    ]);
    const boardId = await seedBoard();

    await resolvePraxis(boardId, declare(PETRA));

    // The whole point of the counter. Office spend is DERIVED from the current
    // rank, so a reset with no counter would RAISE each office's balance by the
    // old rank - a refund, the precise opposite of office-powers.md's ruling.
    // If the two pipeline stages were ever swapped these would all read 0.
    for (const [id, destroyed] of [[SEAT_ENFORCER, 3], [SEAT_ADMIN, 1], [SEAT_CITY_HARPY, 4]]) {
      const rank = await rankDoc(id);
      expect(rank.rank, String(id)).toBe(0);
      expect(rank.manoeuvre_xp_destroyed, String(id)).toBe(destroyed);
    }
  });

  it('the counter is CUMULATIVE per seat across handovers, never reset with the rank', async () => {
    await ranks().insertOne({
      _id: s(SEAT_ENFORCER), rank: 3, manoeuvre_xp_destroyed: 2,
      office_category: 'Enforcer', updated_at: '2026-08-01T00:00:00.000Z',
    });
    const boardId = await seedBoard();
    await resolvePraxis(boardId, declare(PETRA));

    const rank = await rankDoc(SEAT_ENFORCER);
    expect(rank.rank).toBe(0);
    expect(rank.manoeuvre_xp_destroyed).toBe(5);
  });

  it('seats that never purchased a rank mint no documents (no rank-0 rows)', async () => {
    const boardId = await seedBoard();
    await resolvePraxis(boardId, declare(PETRA));
    for (const id of [SEAT_ENFORCER, SEAT_ADMIN, SEAT_CITY_HARPY]) {
      expect(await rankDoc(id), String(id)).toBeNull();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The frozen tally: a City Status SUM, taken before any write.
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!dbAvailable)('prax.4b AC6: the frozen final_tally', () => {
  it('is the claimant’s City Status plus every supporter’s, PRE-clear', async () => {
    // PETRA   : status.city 4, no office             -> 4
    // DESMOND : status.city 2, no office             -> 2
    // WREN    : status.city 1, Socialite (+1)        -> 2   <- about to be cleared
    // Total 8. Computed AFTER the clears, Wren's title bonus would be gone and
    // this would read 7 - a number the ST never saw.
    const boardId = await seedBoard();
    const res = await resolvePraxis(boardId, declare(PETRA));
    expect(res.status).toBe(200);
    expect(res.body.resolved.final_tally).toBe(8);
  });

  it('counts only the supporters assigned to THAT claimant', async () => {
    // MIKAEL: status.city 3, Primogen (+2) -> 5, plus BRANDY (3 + Enforcer 1 = 4).
    const boardId = await seedBoard();
    const res = await resolvePraxis(boardId, declare(MIKAEL));
    expect(res.body.resolved.final_tally).toBe(9);
  });

  it('a claimant nobody has backed still carries their own City Status', async () => {
    const boardId = await seedBoard({
      praxis: { claims: [{ character_id: s(PETRA), opened_at: '2026-08-30T10:00:00.000Z' }], support: {} },
      harpy: { claims: [], support: {} },
    });
    const res = await resolvePraxis(boardId, declare(PETRA));
    // No supporters, but the Praxis weighting always includes the claimant's own
    // Status - unlike Harpy, which has no self-baseline at all.
    expect(res.body.resolved.final_tally).toBe(4);
  });

  it('does not drift when support changes afterwards', async () => {
    const boardId = await seedBoard();
    const res = await resolvePraxis(boardId, declare(PETRA));
    expect(res.body.resolved.final_tally).toBe(8);

    await boards().updateOne(
      { _id: new ObjectId(boardId) },
      { $set: { [`praxis.support.${s(CARVER)}`]: s(PETRA) } },
    );
    expect((await rawBoard(boardId)).resolved.praxis.final_tally).toBe(8);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC8 - the history survives, and Harpy is never touched.
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!dbAvailable)('prax.4b AC8: claims and support are preserved, not cleared', () => {
  it('every praxis claim and support entry survives a resolve', async () => {
    const boardId = await seedBoard();
    const before = await rawBoard(boardId);
    await resolvePraxis(boardId, declare(PETRA));
    const after = await rawBoard(boardId);

    // Including the LOSING claimant's own claim and their supporter.
    expect(after.praxis).toEqual(before.praxis);
    expect(after.praxis.claims.map(c => c.character_id)).toEqual([s(PETRA), s(MIKAEL)]);
    expect(after.praxis.support[s(BRANDY)]).toBe(s(MIKAEL));
  });

  it('the Harpy tally and resolved.harpy are untouched on the resolve path', async () => {
    const boardId = await seedBoard();
    const before = await rawBoard(boardId);
    await resolvePraxis(boardId, declare(PETRA));
    const after = await rawBoard(boardId);

    expect(after.harpy).toEqual(before.harpy);
    expect(after.resolved.harpy).toBeNull();
  });

  it('a board whose HARPY half is already resolved still resolves Praxis normally', async () => {
    const harpySnapshot = { winner_character_id: s(CORVIN), final_tally: 1, resolved_at: '2026-08-30T09:00:00.000Z' };
    const boardId = await seedBoard({ resolved: { praxis: null, harpy: harpySnapshot } });

    const res = await resolvePraxis(boardId, declare(PETRA));

    expect(res.status).toBe(200);
    // The two tallies are genuinely independent records.
    expect((await rawBoard(boardId)).resolved.harpy).toEqual(harpySnapshot);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC4 - runs exactly once per board.
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!dbAvailable)('prax.4b AC4: idempotency - one resolve per board, ever', () => {
  it('a second declare is a 409 that changes nothing', async () => {
    const boardId = await seedBoard();
    const first = await resolvePraxis(boardId, declare(PETRA));
    expect(first.status).toBe(200);
    const snapshot = (await rawBoard(boardId)).resolved.praxis;

    vi.clearAllMocks();
    // The mass-clear set is empty now, so this second attempt confirms nothing.
    const second = await resolvePraxis(boardId, { claimant_character_id: s(MIKAEL), confirmed_vacate_seat_ids: [] });

    expect(second.status).toBe(409);
    expect(second.body.error).toBe('CONFLICT');
    // MIKAEL was not crowned a second time and the record is the first
    // resolve's, byte for byte.
    expect((await charDoc(MIKAEL)).court_category).toBe('Primogen');
    expect((await rawBoard(boardId)).resolved.praxis).toEqual(snapshot);
    expect(broadcastPraxisUpdate).not.toHaveBeenCalled();
    expect(broadcastPraxisResolved).not.toHaveBeenCalled();
  });

  it('a dismiss after a declare is a 409, and a declare after a dismiss is too', async () => {
    const a = await seedBoard();
    await resolvePraxis(a, declare(PETRA));
    expect((await resolvePraxis(a, { claimant_character_id: null })).status).toBe(409);

    await boards().deleteMany({ chapter_id: CHAPTER });
    const b = await seedBoard();
    expect((await resolvePraxis(b, { claimant_character_id: null })).status).toBe(200);
    const after = await resolvePraxis(b, { claimant_character_id: s(PETRA), confirmed_vacate_seat_ids: [] });
    expect(after.status).toBe(409);
    expect((await rawBoard(b)).resolved.praxis.dismissed).toBe(true);
  });

  it('a board whose resolved.praxis was set directly is refused too', async () => {
    // The 409 is a property of the DOCUMENT, not of anything this process
    // remembers about having run before.
    const boardId = await seedBoard({
      resolved: { praxis: { dismissed: true, resolved_at: '2026-08-30T09:00:00.000Z' }, harpy: null },
    });
    const res = await resolvePraxis(boardId, declare(PETRA));
    expect(res.status).toBe(409);
    expect(String((await seatDoc(SEAT_ENFORCER)).holder_id)).toBe(s(BRANDY));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC9 - the two broadcasts.
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!dbAvailable)('prax.4b AC9: the praxis_resolved frame', () => {
  it('fires once, IN ADDITION to the plain board frame, naming every affected entity', async () => {
    const boardId = await seedBoard();
    await resolvePraxis(boardId, declare(PETRA));

    expect(broadcastPraxisUpdate).toHaveBeenCalledTimes(1);
    expect(broadcastPraxisResolved).toHaveBeenCalledTimes(1);

    const [sessionId, payload] = broadcastPraxisResolved.mock.calls[0];
    expect(String(sessionId)).toBe(boardId);
    // The mass-clear set PLUS the Head of State seat itself (vacant -> PETRA
    // in the default fixture, so it is claimed and named here too, but adds no
    // extra character below - nobody was cleared off an empty seat).
    expect([...payload.affected_seat_ids].sort()).toEqual([...MASS_CLEAR_IDS, s(SEAT_HOS)].sort());
    expect([...payload.affected_character_ids].sort())
      .toEqual([s(BRANDY), s(CORVIN), s(WREN), s(PETRA)].sort());
    expect(payload.resolved_office).toBe('Head of State');
  });

  it('names the winner’s own People’s Harpy seat among the affected seats', async () => {
    const boardId = await seedBoard({
      praxis: { claims: [{ character_id: s(CARVER), opened_at: '2026-08-30T10:00:00.000Z' }], support: {} },
      harpy: { claims: [], support: {} },
    });
    await resolvePraxis(boardId, declare(CARVER));

    const [, payload] = broadcastPraxisResolved.mock.calls[0];
    // Frozen `vacated_seat_ids` records the mass-clear only; the FRAME is about
    // what other domains must refetch, and that seat genuinely just changed.
    expect(payload.affected_seat_ids).toContain(s(SEAT_PEOPLES_HARPY));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Atomicity - a PARTIAL mass-clear must never survive.
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!dbAvailable)('prax.4b: atomicity across a multi-seat mass-clear', () => {
  it('a failure AFTER one seat is already cleared rolls back every seat, character and rank', async () => {
    await ranks().insertMany([
      { _id: s(SEAT_ENFORCER),   rank: 3, office_category: 'Enforcer',      updated_at: '2026-08-01T00:00:00.000Z' },
      { _id: s(SEAT_ADMIN),      rank: 1, office_category: 'Administrator', updated_at: '2026-08-01T00:00:00.000Z' },
      { _id: s(SEAT_CITY_HARPY), rank: 4, office_category: 'Socialite',     updated_at: '2026-08-01T00:00:00.000Z' },
    ]);
    const boardId = await seedBoard();
    const seatsBefore = await seats().find({ _id: { $in: SEAT_IDS } }).sort({ _id: 1 }).toArray();
    const charsBefore = await chars().find({ _id: { $in: CHAR_IDS } }).sort({ _id: 1 }).toArray();
    const ranksBefore = await ranks().find({ _id: { $in: SEAT_IDS.map(s) } }).sort({ _id: 1 }).toArray();

    // Let the FIRST seat's reset succeed, then fail. By then one seat has been
    // claimed, its holder cleared and its rank zeroed - so this proves a
    // genuinely partial mass-clear cannot survive, which is a strictly stronger
    // claim than prax.4a's single-seat atomicity test could make.
    globalThis.__prax4bResetCalls = [];
    globalThis.__prax4bFailResetAfter = 1;
    let res;
    try {
      res = await resolvePraxis(boardId, declare(PETRA));
    } finally {
      globalThis.__prax4bFailResetAfter = null;
    }

    expect(res.status).toBe(500);

    // (a) not one seat changed hands
    expect(await seats().find({ _id: { $in: SEAT_IDS } }).sort({ _id: 1 }).toArray()).toEqual(seatsBefore);
    // (b) no character moved - not the three holders, not the winner
    expect(await chars().find({ _id: { $in: CHAR_IDS } }).sort({ _id: 1 }).toArray()).toEqual(charsBefore);
    // (c) the snapshot did not land, so the board is still resolvable
    expect((await rawBoard(boardId)).resolved.praxis).toBeNull();
    // (d) NOT ONE rank was destroyed - including the one whose reset genuinely
    //     committed inside the transaction before the abort
    expect(await ranks().find({ _id: { $in: SEAT_IDS.map(s) } }).sort({ _id: 1 }).toArray()).toEqual(ranksBefore);

    // (e) and all of the above mean something, because the failure fired INSIDE
    // a real session, on the SECOND reset - proving at least one seat's writes
    // had already been made. Without this a route that opened no transaction at
    // all could satisfy (a) to (d) by simply doing nothing.
    expect(globalThis.__prax4bResetCalls.length).toBeGreaterThanOrEqual(2);
    const opts = globalThis.__prax4bResetCalls[1][2];
    expect(opts?.session).toBeTruthy();

    // Nothing was announced for a change that did not happen.
    expect(broadcastPraxisUpdate).not.toHaveBeenCalled();
    expect(broadcastPraxisResolved).not.toHaveBeenCalled();
  });

  it('the board stays resolvable after a rolled-back attempt', async () => {
    const boardId = await seedBoard();
    globalThis.__prax4bFailResetAfter = 1;
    try {
      await resolvePraxis(boardId, declare(PETRA));
    } finally {
      globalThis.__prax4bFailResetAfter = null;
    }

    // The retry succeeds, which is only true if the first attempt left both the
    // CAS baseline AND the whole mass-clear set exactly as it found them.
    const res = await resolvePraxis(boardId, declare(PETRA));
    expect(res.status).toBe(200);
    expect((await seatDoc(SEAT_ENFORCER)).holder_id).toBeNull();
    expect((await charDoc(PETRA)).court_category).toBe('Head of State');
  });

  it('a successful resolve commits every side together', async () => {
    await ranks().insertOne({ _id: s(SEAT_ADMIN), rank: 2, office_category: 'Administrator', updated_at: '2026-08-01T00:00:00.000Z' });
    const boardId = await seedBoard();
    await resolvePraxis(boardId, declare(PETRA));

    expect((await seatDoc(SEAT_ADMIN)).holder_id).toBeNull();
    expect((await charDoc(CORVIN)).court_category).toBeNull();
    expect((await charDoc(PETRA)).court_category).toBe('Head of State');
    expect((await rankDoc(SEAT_ADMIN)).manoeuvre_xp_destroyed).toBe(2);
    expect((await rawBoard(boardId)).resolved.praxis.winner_character_id).toBe(s(PETRA));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC1 / AC2 - the "City Harpy" rename precondition.
// ─────────────────────────────────────────────────────────────────────────────

describe('prax.4b AC2: the seed literal names the renamed seat', () => {
  it('the appointed Socialite seat is seeded as "City Harpy", never plain "Harpy"', () => {
    const socialite = OFFICE_SEATS.filter(x => x.office_category === 'Socialite');
    expect(socialite.map(x => x.seat_label).sort()).toEqual([NEW_SEAT_LABEL, SCRIPT_PEOPLES_HARPY_LABEL].sort());
    expect(socialite.map(x => x.seat_label)).not.toContain(OLD_SEAT_LABEL);
    // The popular seat is untouched by the rename, holder and all.
    const popular = socialite.find(x => x.seat_label === SCRIPT_PEOPLES_HARPY_LABEL);
    expect(popular.holder).toBe('Carver');
  });

  it('still seeds seven seats, so nothing was lost in the edit', () => {
    expect(OFFICE_SEATS).toHaveLength(7);
  });
});

describe.skipIf(!dbAvailable)('prax.4b AC1: rename-city-harpy-seat.mjs', () => {
  const lines = [];
  const log = msg => lines.push(msg);

  beforeEach(async () => {
    lines.length = 0;
    // This block drives the script against real seat documents, so it starts
    // from a clean Socialite slate rather than the six-seat fixture above.
    await seats().deleteMany({ office_category: 'Socialite' });
  });

  const socialiteSeat = (id, label, holder = null) => ({
    _id: id, office_category: 'Socialite', seat_label: label, holder_id: holder,
    created_at: '2026-01-01', notes: null,
  });

  it('DRY RUN reports the rename and writes nothing', async () => {
    await seats().insertMany([
      socialiteSeat(SEAT_CITY_HARPY, OLD_SEAT_LABEL, BRANDY),
      socialiteSeat(SEAT_PEOPLES_HARPY, SCRIPT_PEOPLES_HARPY_LABEL, CARVER),
    ]);

    const plan = await planRename(seats());
    expect(plan.action).toBe('will-rename');
    const totals = await applyRename(seats(), plan, { apply: false, log });

    expect(totals).toEqual({ renamed: 0, alreadyRenamed: 0, refused: 0, changedSincePlan: 0 });
    expect(lines.join('\n')).toMatch(/DRY RUN/);
    expect((await seatDoc(SEAT_CITY_HARPY)).seat_label).toBe(OLD_SEAT_LABEL);
  });

  it('--apply renames exactly the appointed seat and never the popular one', async () => {
    await seats().insertMany([
      socialiteSeat(SEAT_CITY_HARPY, OLD_SEAT_LABEL, BRANDY),
      socialiteSeat(SEAT_PEOPLES_HARPY, SCRIPT_PEOPLES_HARPY_LABEL, CARVER),
    ]);

    const totals = await applyRename(seats(), await planRename(seats()), { apply: true, log });

    expect(totals.renamed).toBe(1);
    expect((await seatDoc(SEAT_CITY_HARPY)).seat_label).toBe(NEW_SEAT_LABEL);
    // The whole reason the filter is an exact equality match on 'Harpy'.
    expect((await seatDoc(SEAT_PEOPLES_HARPY)).seat_label).toBe(SCRIPT_PEOPLES_HARPY_LABEL);
    // Nothing else about the seat moved.
    expect(String((await seatDoc(SEAT_CITY_HARPY)).holder_id)).toBe(s(BRANDY));
  });

  it('a second run is a clean no-op, not an error', async () => {
    await seats().insertMany([
      socialiteSeat(SEAT_CITY_HARPY, OLD_SEAT_LABEL, BRANDY),
      socialiteSeat(SEAT_PEOPLES_HARPY, SCRIPT_PEOPLES_HARPY_LABEL, CARVER),
    ]);
    await applyRename(seats(), await planRename(seats()), { apply: true, log });

    const plan2 = await planRename(seats());
    expect(plan2.action).toBe('already-renamed');
    const totals2 = await applyRename(seats(), plan2, { apply: true, log });
    expect(totals2).toEqual({ renamed: 0, alreadyRenamed: 1, refused: 0, changedSincePlan: 0 });
    expect((await seatDoc(SEAT_CITY_HARPY)).seat_label).toBe(NEW_SEAT_LABEL);
  });

  it('REFUSES when no Socialite seat exists at all', async () => {
    const plan = await planRename(seats());
    expect(plan.action).toBe('refused-none');
    const totals = await applyRename(seats(), plan, { apply: true, log });
    expect(totals.refused).toBe(1);
    expect(lines.join('\n')).toMatch(/REFUSED/);
  });

  it('REFUSES two plain "Harpy" seats rather than guessing which is appointed', async () => {
    await seats().insertMany([
      socialiteSeat(SEAT_CITY_HARPY, OLD_SEAT_LABEL, BRANDY),
      socialiteSeat(SEAT_SPARE, OLD_SEAT_LABEL, WREN),
    ]);
    const plan = await planRename(seats());
    expect(plan.action).toBe('refused-ambiguous-source');
    const totals = await applyRename(seats(), plan, { apply: true, log });
    expect(totals.refused).toBe(1);
    // Both untouched.
    expect((await seatDoc(SEAT_CITY_HARPY)).seat_label).toBe(OLD_SEAT_LABEL);
    expect((await seatDoc(SEAT_SPARE)).seat_label).toBe(OLD_SEAT_LABEL);
  });

  it('REFUSES when a "City Harpy" already exists alongside a plain "Harpy"', async () => {
    // Renaming here would produce TWO City Harpy seats - precisely the ambiguity
    // the rename exists to remove.
    await seats().insertMany([
      socialiteSeat(SEAT_CITY_HARPY, OLD_SEAT_LABEL, BRANDY),
      socialiteSeat(SEAT_SPARE, NEW_SEAT_LABEL, WREN),
    ]);
    const plan = await planRename(seats());
    expect(plan.action).toBe('refused-both-present');
    const totals = await applyRename(seats(), plan, { apply: true, log });
    expect(totals.refused).toBe(1);
    expect((await seatDoc(SEAT_CITY_HARPY)).seat_label).toBe(OLD_SEAT_LABEL);
  });

  it('reports CHANGED rather than overwriting a label edited since planning', async () => {
    await seats().insertOne(socialiteSeat(SEAT_CITY_HARPY, OLD_SEAT_LABEL, BRANDY));
    const plan = await planRename(seats());
    expect(plan.action).toBe('will-rename');

    // Somebody relabels it by hand between the plan and the write.
    await seats().updateOne({ _id: SEAT_CITY_HARPY }, { $set: { seat_label: 'Something Else' } });

    const totals = await applyRename(seats(), plan, { apply: true, log });
    expect(totals.changedSincePlan).toBe(1);
    expect(totals.renamed).toBe(0);
    expect((await seatDoc(SEAT_CITY_HARPY)).seat_label).toBe('Something Else');
  });
});
