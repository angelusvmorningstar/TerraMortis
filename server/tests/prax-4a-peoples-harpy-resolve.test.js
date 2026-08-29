/**
 * prax.4a - resolving the People's Harpy vote.
 *
 * `POST /api/praxis_sessions/:id/resolve-harpy` is the one place the Harpy
 * tally becomes real. It does in ONE transaction what the ST would otherwise
 * have to do in two places and two moments: hand the People's Harpy seat over
 * (seat holder, both characters' court fields, the manoeuvre reset) and freeze
 * the result into `praxis_sessions.resolved.harpy`.
 *
 * This suite pins the five things that are easy to get wrong:
 *
 *   1. It runs EXACTLY ONCE per board. `resolved.harpy` is a frozen historical
 *      record, so a second call - of either kind - is a 409 that writes nothing.
 *   2. The DESTROYED-XP COUNTER. Office spend is derived from the current rank,
 *      so zeroing the rank without recording what was destroyed REFUNDS the XP
 *      office-powers.md says is lost. A test pins the exact number, not merely
 *      that a reset happened.
 *   3. ATOMICITY. A failure partway through leaves neither the seat handover nor
 *      the snapshot behind. Half-applied, the board would show an unresolved
 *      vote whose seat had already changed hands, and no read path would notice.
 *   4. The claim/support history SURVIVES. This story adds a read-only summary
 *      of the tally, never a wipe.
 *   5. The PRAXIS tally is untouched, on every path.
 *
 * ═══ SHARED-COLLECTION HAZARD (read before running this alongside others) ═══
 *
 * The route resolves its target seat by `{ office_category: 'Socialite',
 * seat_label: "People's Harpy" }`, which is a natural key, not an id this suite
 * chooses. `office_seats` is shared with oxp.1's, oxp.4's, oxp.5's and oxp.11's
 * suites, and oxp.5's own fixtures include a seat carrying that exact label. So
 * this suite REMOVES every seat matching that natural key before seeding its
 * own, which is the only way to make the lookup deterministic - and means it
 * must be run on its own, not interleaved with those suites in the same vitest
 * invocation. That is the same parallel-DB contention class this repo already
 * documents for `office_seats` (oxp.1's own seven-seat count test).
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

// ── The atomicity probe ─────────────────────────────────────────────────────
//
// The manoeuvre reset is the LAST write inside the transaction before the
// `resolved.harpy` snapshot, so making `office_manoeuvre_ranks`'s own
// findOneAndUpdate throw is the natural injection point: by then the seat has
// been claimed and both characters written, and the snapshot has not. It needs
// no test-only hook in production code.
//
// The flag lives on globalThis because vi.mock's factory is hoisted above every
// local declaration in this file. The call ARGUMENTS are recorded as well as
// thrown on, so the test can prove the failure fired on the real session path -
// without that, a route that opened no transaction at all would pass both
// atomicity assertions vacuously.
globalThis.__prax4aFailManoeuvreReset = false;
globalThis.__prax4aResetCalls = [];
vi.mock('../db.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getCollection: (name) => {
      if (name === 'office_manoeuvre_ranks' && globalThis.__prax4aFailManoeuvreReset) {
        return {
          findOneAndUpdate: async (...args) => {
            globalThis.__prax4aResetCalls.push(args);
            throw new Error('prax-4a injected manoeuvre-reset failure');
          },
        };
      }
      return actual.getCollection(name);
    },
  };
});

// Mocked at the module boundary, exactly as prax.1's own suite does: what this
// story owns is WHICH paths broadcast, not the frame's ST/dev fan-out (gdx.8's
// own contract, covered there).
vi.mock('../ws.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, broadcastPraxisUpdate: vi.fn() };
});
const { broadcastPraxisUpdate } = await import('../ws.js');

const { getCollection } = await import('../db.js');

const dbAvailable = await isDbAvailable();

// ── Fixtures ────────────────────────────────────────────────────────────────
//
// The `9ac4` prefix is this suite's own range; prax.1 claimed `9ac1`, oxp.5
// claimed `0f11`. Explicit ids so cleanup removes exactly these documents.
const oid = n => new ObjectId(`9ac4${'0'.repeat(16)}${String(n).padStart(4, '0')}`);

const CHAPTER = oid(1);
const SESSION = oid(11);

const PETRA   = oid(101);  // the usual winner
const BRANDY  = oid(102);  // the usual sitting People's Harpy
const CORVIN  = oid(103);
const WREN    = oid(104);
const DESMOND = oid(105);
const MIKAEL  = oid(106);  // holds the Primogen seat - the conflict case
const CHAR_IDS = [PETRA, BRANDY, CORVIN, WREN, DESMOND, MIKAEL];

const s = id => String(id);

const SEAT_PEOPLES_HARPY = oid(201);
const SEAT_APPOINTED_HARPY = oid(202);   // the OTHER Socialite seat, never touched
const SEAT_PRIMOGEN = oid(203);
const SEAT_IDS = [SEAT_PEOPLES_HARPY, SEAT_APPOINTED_HARPY, SEAT_PRIMOGEN];

const PEOPLES_HARPY_SEAT_LABEL = "People's Harpy";

const UNKNOWN_BOARD = '9ac40000000000000000ffff';

let app;

const boards = () => getCollection('praxis_sessions');
const seats = () => getCollection('office_seats');
const chars = () => getCollection('characters');
const ranks = () => getCollection('office_manoeuvre_ranks');

const att = id => ({ character_id: s(id), attended: true, costuming: false, downtime: false, extra: 0 });

function buildChar(_id, name, courtCategory = null, courtTitle = null) {
  return {
    _id,
    name,
    moniker: null,
    honorific: null,
    court_category: courtCategory,
    court_title: courtTitle,
    retired: false,
    updated_at: '2026-08-01T00:00:00.000Z',
    _prax4a_probe: true,
  };
}

async function removeFixtures() {
  await boards().deleteMany({ chapter_id: CHAPTER });
  await getCollection('game_sessions').deleteMany({ _id: SESSION });
  await getCollection('chapters').deleteMany({ _id: CHAPTER });
  await chars().deleteMany({ _id: { $in: CHAR_IDS } });
  await ranks().deleteMany({ _id: { $in: SEAT_IDS.map(s) } });
  // The natural-key sweep. See this file's header: the route looks the seat up
  // by label, so any other suite's leftover People's Harpy seat would make the
  // lookup non-deterministic.
  await seats().deleteMany({
    $or: [
      { _id: { $in: SEAT_IDS } },
      { office_category: 'Socialite', seat_label: PEOPLES_HARPY_SEAT_LABEL },
    ],
  });
}

/**
 * Seed a board with a live Harpy tally.
 *
 *   harpy  claims : PETRA, CORVIN
 *   harpy  support: WREN -> PETRA, DESMOND -> PETRA, BRANDY -> CORVIN
 *   praxis claims : CORVIN
 *   praxis support: WREN -> CORVIN
 *
 * The Praxis side is deliberately populated and deliberately different: every
 * assertion that it survives a Harpy resolve untouched needs something there to
 * survive.
 */
async function seedBoard(overrides = {}) {
  const now = '2026-08-29T10:00:00.000Z';
  const doc = {
    chapter_id: CHAPTER,
    praxis: {
      claims: [{ character_id: s(CORVIN), opened_at: now }],
      support: { [s(WREN)]: s(CORVIN) },
    },
    harpy: {
      claims: [
        { character_id: s(PETRA), opened_at: now },
        { character_id: s(CORVIN), opened_at: now },
      ],
      support: { [s(WREN)]: s(PETRA), [s(DESMOND)]: s(PETRA), [s(BRANDY)]: s(CORVIN) },
    },
    resolved: { praxis: null, harpy: null },
    created_at: now,
    updated_at: now,
    ...overrides,
  };
  const { insertedId } = await boards().insertOne(doc);
  return String(insertedId);
}

/** Seed the three seats. `harpyHolder` is the sitting People's Harpy, or null. */
async function seedSeats(harpyHolder = BRANDY) {
  await seats().insertMany([
    {
      _id: SEAT_PEOPLES_HARPY,
      office_category: 'Socialite',
      seat_label: PEOPLES_HARPY_SEAT_LABEL,
      holder_id: harpyHolder,
      created_at: '2026-01-02',
      notes: null,
    },
    {
      _id: SEAT_APPOINTED_HARPY,
      office_category: 'Socialite',
      seat_label: 'Harpy',
      holder_id: null,
      created_at: '2026-01-01',
      notes: null,
    },
    {
      _id: SEAT_PRIMOGEN,
      office_category: 'Primogen',
      seat_label: null,
      holder_id: MIKAEL,
      created_at: '2026-01-03',
      notes: null,
    },
  ]);
}

const seatDoc = id => seats().findOne({ _id: id });
const charDoc = id => chars().findOne({ _id: id });
const rankDoc = id => ranks().findOne({ _id: s(id) });
const rawBoard = id => boards().findOne({ _id: new ObjectId(id) });

const resolveHarpy = (boardId, body, user = stUser()) =>
  request(app).post(`/api/praxis_sessions/${boardId}/resolve-harpy`).set('X-Test-User', user).send(body);

beforeAll(async () => {
  if (!dbAvailable) return;
  await setupDb();
  app = createTestApp();
});

beforeEach(async () => {
  if (!dbAvailable) return;
  vi.clearAllMocks();
  globalThis.__prax4aFailManoeuvreReset = false;
  globalThis.__prax4aResetCalls = [];
  await removeFixtures();
  await getCollection('chapters').insertOne({ _id: CHAPTER, chapter_number: 914, label: 'PRAX4a Chapter' });
  await getCollection('game_sessions').insertOne({
    _id: SESSION,
    session_date: '2026-08-29',
    chapter_id: CHAPTER,
    attendance: CHAR_IDS.map(att),
  });
  await chars().insertMany([
    buildChar(PETRA, 'Petra Voss'),
    buildChar(BRANDY, 'Brandy LaRoux', 'Socialite', PEOPLES_HARPY_SEAT_LABEL),
    buildChar(CORVIN, 'Corvin Adeyemi'),
    buildChar(WREN, 'Wren Halloway'),
    buildChar(DESMOND, 'Desmond Okafor'),
    buildChar(MIKAEL, 'Mikael Thorne', 'Primogen', 'Primogen'),
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

describe.skipIf(!dbAvailable)('prax.4a: ST-only, permanently', () => {
  it('refuses a player, a coordinator and an unauthenticated caller', async () => {
    const boardId = await seedBoard();
    const body = { claimant_character_id: s(PETRA) };

    expect((await resolveHarpy(boardId, body, playerUser([s(PETRA)]))).status).toBe(403);
    expect((await resolveHarpy(boardId, body, coordinatorUser())).status).toBe(403);
    const anon = await request(app).post(`/api/praxis_sessions/${boardId}/resolve-harpy`).send(body);
    expect(anon.status).toBe(401);

    // Nothing leaked past any of the three refusals.
    expect((await rawBoard(boardId)).resolved.harpy).toBeNull();
    expect(String((await seatDoc(SEAT_PEOPLES_HARPY)).holder_id)).toBe(s(BRANDY));
  });

  it('admits dev, the privacy-redacted ST login', async () => {
    const boardId = await seedBoard();
    const res = await resolveHarpy(boardId, { claimant_character_id: null }, stUser({ role: 'dev' }));
    expect(res.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC2 - request validation.
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!dbAvailable)('prax.4a AC2: the request body', () => {
  it('an ABSENT claimant_character_id is a 400, never read as a dismissal', async () => {
    // The dangerous direction: a client bug that dropped the field would
    // otherwise close a live vote with a cheerful 200 and no way back.
    const boardId = await seedBoard();
    const res = await resolveHarpy(boardId, {});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect((await rawBoard(boardId)).resolved.harpy).toBeNull();
  });

  it('400s on a malformed claimant id', async () => {
    const boardId = await seedBoard();
    for (const bad of ['nope', `${s(PETRA)}0`, 7, {}]) {
      const res = await resolveHarpy(boardId, { claimant_character_id: bad });
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
    expect((await rawBoard(boardId)).resolved.harpy).toBeNull();
  });

  it('404s on an unknown board id and 400s on a malformed one', async () => {
    expect((await resolveHarpy(UNKNOWN_BOARD, { claimant_character_id: null })).status).toBe(404);
    expect((await resolveHarpy('nope', { claimant_character_id: null })).status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC4 - the dismiss path.
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!dbAvailable)('prax.4a AC4: dismissing the vote', () => {
  it('writes a dismissed snapshot and touches nothing else at all', async () => {
    const boardId = await seedBoard();
    const seatBefore = await seatDoc(SEAT_PEOPLES_HARPY);
    const brandyBefore = await charDoc(BRANDY);

    const res = await resolveHarpy(boardId, { claimant_character_id: null });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.dismissed).toBe(true);
    expect(res.body.resolved.dismissed).toBe(true);
    expect(res.body.resolved.winner_character_id).toBeUndefined();
    expect(Number.isNaN(Date.parse(res.body.resolved.resolved_at))).toBe(false);

    const stored = await rawBoard(boardId);
    expect(stored.resolved.harpy).toEqual({
      dismissed: true,
      resolved_at: res.body.resolved.resolved_at,
    });

    // No seat write, no character write, no manoeuvre document minted.
    expect(await seatDoc(SEAT_PEOPLES_HARPY)).toEqual(seatBefore);
    expect(await charDoc(BRANDY)).toEqual(brandyBefore);
    expect(await rankDoc(SEAT_PEOPLES_HARPY)).toBeNull();
  });

  it('leaves the whole claim/support history and the Praxis tally intact', async () => {
    const boardId = await seedBoard();
    const before = await rawBoard(boardId);
    await resolveHarpy(boardId, { claimant_character_id: null });
    const after = await rawBoard(boardId);

    expect(after.harpy).toEqual(before.harpy);
    expect(after.praxis).toEqual(before.praxis);
    expect(after.resolved.praxis).toBeNull();
  });

  it('broadcasts exactly once', async () => {
    const boardId = await seedBoard();
    await resolveHarpy(boardId, { claimant_character_id: null });
    expect(broadcastPraxisUpdate).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC5 - the resolve path: the full handover.
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!dbAvailable)('prax.4a AC5: declaring a winner', () => {
  it('hands the seat over, moves both characters, and freezes the tally', async () => {
    const boardId = await seedBoard();
    const res = await resolveHarpy(boardId, { claimant_character_id: s(PETRA) });

    expect(res.status).toBe(200);
    expect(res.body.dismissed).toBe(false);
    expect(res.body.resolved.winner_character_id).toBe(s(PETRA));
    // WREN and DESMOND back her; BRANDY backs CORVIN. An unweighted headcount.
    expect(res.body.resolved.final_tally).toBe(2);

    // The seat: holder_id is a real ObjectId, never a string.
    const seat = await seatDoc(SEAT_PEOPLES_HARPY);
    expect(seat.holder_id).toBeInstanceOf(ObjectId);
    expect(String(seat.holder_id)).toBe(s(PETRA));

    // The incoming holder gets the SEAT LABEL as her title, not the bare
    // category - this route never collects a title, so it supplies the one that
    // describes what was actually won.
    const petra = await charDoc(PETRA);
    expect(petra.court_category).toBe('Socialite');
    expect(petra.court_title).toBe(PEOPLES_HARPY_SEAT_LABEL);

    // The departing holder is cleared.
    const brandy = await charDoc(BRANDY);
    expect(brandy.court_category).toBeNull();
    expect(brandy.court_title).toBeNull();

    // The snapshot on the document matches the response exactly.
    const stored = await rawBoard(boardId);
    expect(stored.resolved.harpy).toEqual(res.body.resolved);
  });

  it('writes ONLY holder_id on the seat - seat_label survives the handover', async () => {
    const boardId = await seedBoard();
    const before = await seatDoc(SEAT_PEOPLES_HARPY);
    await resolveHarpy(boardId, { claimant_character_id: s(PETRA) });
    const after = await seatDoc(SEAT_PEOPLES_HARPY);

    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
    for (const k of Object.keys(before)) {
      if (k === 'holder_id') continue;
      expect(after[k], k).toEqual(before[k]);
    }
    // The one thing that tells Socialite's two seats apart.
    expect(after.seat_label).toBe(PEOPLES_HARPY_SEAT_LABEL);
  });

  it('never touches the OTHER Socialite seat', async () => {
    const boardId = await seedBoard();
    const before = await seatDoc(SEAT_APPOINTED_HARPY);
    await resolveHarpy(boardId, { claimant_character_id: s(PETRA) });
    expect(await seatDoc(SEAT_APPOINTED_HARPY)).toEqual(before);
  });

  it('resolves a seat that was VACANT, with no departing holder to clear', async () => {
    await seats().deleteMany({ _id: SEAT_PEOPLES_HARPY });
    await seats().insertOne({
      _id: SEAT_PEOPLES_HARPY,
      office_category: 'Socialite',
      seat_label: PEOPLES_HARPY_SEAT_LABEL,
      holder_id: null,
      created_at: '2026-01-02',
      notes: null,
    });
    await chars().updateOne({ _id: BRANDY }, { $set: { court_category: null, court_title: null } });

    const boardId = await seedBoard();
    const res = await resolveHarpy(boardId, { claimant_character_id: s(PETRA) });

    expect(res.status).toBe(200);
    expect(String((await seatDoc(SEAT_PEOPLES_HARPY)).holder_id)).toBe(s(PETRA));
    expect((await charDoc(PETRA)).court_category).toBe('Socialite');
  });

  it('a departing holder whose court_category has already moved is left alone, not an error', async () => {
    // The benign mismatch the existing handover route documents: clearing
    // unconditionally would wipe a legitimate newer assignment.
    await chars().updateOne({ _id: BRANDY }, { $set: { court_category: 'Primogen', court_title: 'Primogen' } });
    const boardId = await seedBoard();

    const res = await resolveHarpy(boardId, { claimant_character_id: s(PETRA) });

    expect(res.status).toBe(200);
    const brandy = await charDoc(BRANDY);
    expect(brandy.court_category).toBe('Primogen');
    expect(brandy.court_title).toBe('Primogen');
  });

  it('the LOSING claimant can be declared, and carries their own headcount', async () => {
    // Nothing on this route reads the leader. The ST decides; the tally is
    // recorded, not obeyed. CORVIN sits on one vote (BRANDY) against PETRA's
    // two, and declaring him works and freezes HIS number.
    const boardId = await seedBoard();
    const res = await resolveHarpy(boardId, { claimant_character_id: s(CORVIN) });
    expect(res.status).toBe(200);
    expect(res.body.resolved.final_tally).toBe(1);
    expect(String((await seatDoc(SEAT_PEOPLES_HARPY)).holder_id)).toBe(s(CORVIN));
  });

  it('a claimant nobody has backed resolves on a final_tally of 0', async () => {
    const boardId = await seedBoard({
      harpy: { claims: [{ character_id: s(PETRA), opened_at: '2026-08-29T10:00:00.000Z' }], support: {} },
      praxis: { claims: [], support: {} },
    });
    const res = await resolveHarpy(boardId, { claimant_character_id: s(PETRA) });
    expect(res.status).toBe(200);
    // No baseline self-vote is invented for the claimant, matching the tally
    // the board itself renders.
    expect(res.body.resolved.final_tally).toBe(0);
  });

  it('the frozen tally does not drift when support changes afterwards', async () => {
    const boardId = await seedBoard();
    const res = await resolveHarpy(boardId, { claimant_character_id: s(PETRA) });
    expect(res.body.resolved.final_tally).toBe(2);

    // A later direct edit to the (still fully preserved) support map must not
    // change the historical record.
    await boards().updateOne(
      { _id: new ObjectId(boardId) },
      { $set: { [`harpy.support.${s(CORVIN)}`]: s(PETRA) } },
    );
    expect((await rawBoard(boardId)).resolved.harpy.final_tally).toBe(2);
  });

  it('broadcasts exactly once on success', async () => {
    const boardId = await seedBoard();
    await resolveHarpy(boardId, { claimant_character_id: s(PETRA) });
    expect(broadcastPraxisUpdate).toHaveBeenCalledTimes(1);
  });

  it('the resolved board still validates against the praxis_session schema', async () => {
    const ajv = new Ajv({ allErrors: true, coerceTypes: false });
    const validate = ajv.compile(praxisSessionSchema);
    const boardId = await seedBoard();
    await resolveHarpy(boardId, { claimant_character_id: s(PETRA) });
    const stored = await rawBoard(boardId);
    const serialised = { ...stored, _id: String(stored._id), chapter_id: String(stored.chapter_id) };
    expect(validate(serialised), JSON.stringify(validate.errors)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC7 - the history survives, and Praxis is never touched.
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!dbAvailable)('prax.4a AC7: claims and support are preserved, not cleared', () => {
  it('every harpy claim and every support entry survives a resolve', async () => {
    const boardId = await seedBoard();
    const before = await rawBoard(boardId);
    await resolveHarpy(boardId, { claimant_character_id: s(PETRA) });
    const after = await rawBoard(boardId);

    // Including the LOSING claimant's own claim and their supporter.
    expect(after.harpy).toEqual(before.harpy);
    expect(after.harpy.claims.map(c => c.character_id)).toEqual([s(PETRA), s(CORVIN)]);
    expect(after.harpy.support[s(BRANDY)]).toBe(s(CORVIN));
  });

  it('the Praxis tally and resolved.praxis are untouched on the resolve path', async () => {
    const boardId = await seedBoard();
    const before = await rawBoard(boardId);
    await resolveHarpy(boardId, { claimant_character_id: s(PETRA) });
    const after = await rawBoard(boardId);

    expect(after.praxis).toEqual(before.praxis);
    expect(after.resolved.praxis).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The manoeuvre reset and its destroyed-XP counter.
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!dbAvailable)('prax.4a: the manoeuvre reset records what it destroyed', () => {
  it('zeroes the rank and pins the EXACT destroyed-XP figure', async () => {
    await ranks().insertOne({
      _id: s(SEAT_PEOPLES_HARPY),
      rank: 3,
      office_category: 'Socialite',
      updated_at: '2026-08-01T00:00:00.000Z',
    });
    const boardId = await seedBoard();

    await resolveHarpy(boardId, { claimant_character_id: s(PETRA) });

    const rank = await rankDoc(SEAT_PEOPLES_HARPY);
    expect(rank.rank).toBe(0);
    // The whole point of the counter. Office spend is DERIVED from the current
    // rank, so a reset with no counter would RAISE the office's balance by 3 -
    // a refund, the precise opposite of office-powers.md's ruling. If the two
    // pipeline stages were ever swapped this would read 0.
    expect(rank.manoeuvre_xp_destroyed).toBe(3);
  });

  it('the counter is CUMULATIVE across handovers, never reset with the rank', async () => {
    await ranks().insertOne({
      _id: s(SEAT_PEOPLES_HARPY),
      rank: 3,
      manoeuvre_xp_destroyed: 2,
      office_category: 'Socialite',
      updated_at: '2026-08-01T00:00:00.000Z',
    });
    const boardId = await seedBoard();
    await resolveHarpy(boardId, { claimant_character_id: s(PETRA) });

    const rank = await rankDoc(SEAT_PEOPLES_HARPY);
    expect(rank.rank).toBe(0);
    expect(rank.manoeuvre_xp_destroyed).toBe(5);
  });

  it('a seat that never purchased a rank mints no document (no rank-0 rows)', async () => {
    const boardId = await seedBoard();
    await resolveHarpy(boardId, { claimant_character_id: s(PETRA) });
    expect(await rankDoc(SEAT_PEOPLES_HARPY)).toBeNull();
  });

  it('the DISMISS path resets nothing', async () => {
    await ranks().insertOne({
      _id: s(SEAT_PEOPLES_HARPY),
      rank: 4,
      office_category: 'Socialite',
      updated_at: '2026-08-01T00:00:00.000Z',
    });
    const boardId = await seedBoard();
    await resolveHarpy(boardId, { claimant_character_id: null });

    const rank = await rankDoc(SEAT_PEOPLES_HARPY);
    expect(rank.rank).toBe(4);
    expect(rank.manoeuvre_xp_destroyed).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC3 - runs exactly once per board.
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!dbAvailable)('prax.4a AC3: idempotency - one resolve per board, ever', () => {
  it('a second declare is a 409 that changes nothing', async () => {
    const boardId = await seedBoard();
    const first = await resolveHarpy(boardId, { claimant_character_id: s(PETRA) });
    expect(first.status).toBe(200);
    const snapshot = (await rawBoard(boardId)).resolved.harpy;

    broadcastPraxisUpdate.mockClear();
    const second = await resolveHarpy(boardId, { claimant_character_id: s(CORVIN) });

    expect(second.status).toBe(409);
    expect(second.body.error).toBe('CONFLICT');
    // The seat did NOT change hands a second time, and the record is the first
    // resolve's, byte for byte.
    expect(String((await seatDoc(SEAT_PEOPLES_HARPY)).holder_id)).toBe(s(PETRA));
    expect((await charDoc(CORVIN)).court_category).toBeNull();
    expect((await rawBoard(boardId)).resolved.harpy).toEqual(snapshot);
    expect(broadcastPraxisUpdate).not.toHaveBeenCalled();
  });

  it('a dismiss after a declare is a 409, and a declare after a dismiss is too', async () => {
    const a = await seedBoard();
    await resolveHarpy(a, { claimant_character_id: s(PETRA) });
    expect((await resolveHarpy(a, { claimant_character_id: null })).status).toBe(409);

    await removeFixtures();
    await getCollection('chapters').insertOne({ _id: CHAPTER, chapter_number: 914, label: 'PRAX4a Chapter' });
    await chars().insertMany([buildChar(PETRA, 'Petra Voss'), buildChar(CORVIN, 'Corvin Adeyemi')]);
    await seedSeats(null);
    const b = await seedBoard();
    expect((await resolveHarpy(b, { claimant_character_id: null })).status).toBe(200);
    const after = await resolveHarpy(b, { claimant_character_id: s(PETRA) });
    expect(after.status).toBe(409);
    // The dismissal stands; no seat was handed over by the refused call.
    expect((await rawBoard(b)).resolved.harpy.dismissed).toBe(true);
    expect((await seatDoc(SEAT_PEOPLES_HARPY)).holder_id).toBeNull();
  });

  it('a board whose resolved.harpy was set directly is refused too', async () => {
    // The 409 is a property of the DOCUMENT, not of anything this process
    // remembers about having run before.
    const boardId = await seedBoard({ resolved: { praxis: null, harpy: { dismissed: true, resolved_at: '2026-08-29T09:00:00.000Z' } } });
    const res = await resolveHarpy(boardId, { claimant_character_id: s(PETRA) });
    expect(res.status).toBe(409);
    expect(String((await seatDoc(SEAT_PEOPLES_HARPY)).holder_id)).toBe(s(BRANDY));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC5 - the two refusals on the resolve path.
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!dbAvailable)('prax.4a AC5: refusals', () => {
  it('400s a character who is not currently standing in the harpy tally', async () => {
    const boardId = await seedBoard();
    // WREN is an attendee and a SUPPORTER, but has no claim of his own.
    const res = await resolveHarpy(boardId, { claimant_character_id: s(WREN) });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/no open harpy claim/i);
    expect((await rawBoard(boardId)).resolved.harpy).toBeNull();
    expect(String((await seatDoc(SEAT_PEOPLES_HARPY)).holder_id)).toBe(s(BRANDY));
  });

  it('400s a character standing in PRAXIS only - the two tallies are never coupled', async () => {
    const boardId = await seedBoard({
      harpy: { claims: [{ character_id: s(PETRA), opened_at: '2026-08-29T10:00:00.000Z' }], support: {} },
      praxis: { claims: [{ character_id: s(MIKAEL), opened_at: '2026-08-29T10:00:00.000Z' }], support: {} },
    });
    const res = await resolveHarpy(boardId, { claimant_character_id: s(MIKAEL) });
    expect(res.status).toBe(400);
  });

  it('409s a winner who already holds a DIFFERENT seat, naming it, and writes nothing', async () => {
    // MIKAEL holds the Primogen seat. `court_category` is a single field, so
    // assigning him here would either strand the Primogen seat's holder_id or
    // force this route to edit a third document nobody named.
    const boardId = await seedBoard({
      harpy: { claims: [{ character_id: s(MIKAEL), opened_at: '2026-08-29T10:00:00.000Z' }], support: {} },
      praxis: { claims: [], support: {} },
    });
    const primogenBefore = await seatDoc(SEAT_PRIMOGEN);

    const res = await resolveHarpy(boardId, { claimant_character_id: s(MIKAEL) });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('CONFLICT');
    expect(res.body.message).toContain('Primogen');
    expect(res.body.message).toMatch(/vacate/i);
    expect(res.body.conflicting_seat_id).toBe(s(SEAT_PRIMOGEN));

    // All three documents untouched: the seat being assigned, the conflicting
    // seat, and the board.
    expect(String((await seatDoc(SEAT_PEOPLES_HARPY)).holder_id)).toBe(s(BRANDY));
    expect(await seatDoc(SEAT_PRIMOGEN)).toEqual(primogenBefore);
    expect((await charDoc(MIKAEL)).court_category).toBe('Primogen');
    expect((await rawBoard(boardId)).resolved.harpy).toBeNull();
  });

  it('the SITTING People’s Harpy re-winning is NOT a conflict', async () => {
    // BRANDY already holds this seat. The refusal above is scoped to a
    // DIFFERENT seat; an incumbent re-elected must go through cleanly.
    const boardId = await seedBoard({
      harpy: {
        claims: [{ character_id: s(BRANDY), opened_at: '2026-08-29T10:00:00.000Z' }],
        support: { [s(WREN)]: s(BRANDY) },
      },
      praxis: { claims: [], support: {} },
    });
    const res = await resolveHarpy(boardId, { claimant_character_id: s(BRANDY) });

    expect(res.status).toBe(200);
    expect(res.body.resolved.final_tally).toBe(1);
    expect(String((await seatDoc(SEAT_PEOPLES_HARPY)).holder_id)).toBe(s(BRANDY));
    // She keeps the office rather than being cleared and half-restored.
    const brandy = await charDoc(BRANDY);
    expect(brandy.court_category).toBe('Socialite');
    expect(brandy.court_title).toBe(PEOPLES_HARPY_SEAT_LABEL);
  });

  it('404s when the winner has no character document', async () => {
    await chars().deleteMany({ _id: PETRA });
    const boardId = await seedBoard();
    const res = await resolveHarpy(boardId, { claimant_character_id: s(PETRA) });
    expect(res.status).toBe(404);
    // The seat did not change hands on the way to the refusal.
    expect(String((await seatDoc(SEAT_PEOPLES_HARPY)).holder_id)).toBe(s(BRANDY));
    expect((await rawBoard(boardId)).resolved.harpy).toBeNull();
  });

  it('500s with a legible message when the People’s Harpy seat is missing entirely', async () => {
    await seats().deleteMany({ office_category: 'Socialite', seat_label: PEOPLES_HARPY_SEAT_LABEL });
    const boardId = await seedBoard();
    const res = await resolveHarpy(boardId, { claimant_character_id: s(PETRA) });
    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/seed/i);
    expect((await rawBoard(boardId)).resolved.harpy).toBeNull();
  });

  it('no refusal broadcasts', async () => {
    const boardId = await seedBoard();
    await resolveHarpy(boardId, { claimant_character_id: s(WREN) });   // 400
    await resolveHarpy(boardId, {});                                   // 400
    await resolveHarpy(UNKNOWN_BOARD, { claimant_character_id: null }); // 404
    expect(broadcastPraxisUpdate).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Atomicity - one transaction, all of it or none of it.
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!dbAvailable)('prax.4a: atomicity across four collections', () => {
  it('a failure after the seat handover rolls back the seat, both characters AND the snapshot', async () => {
    await ranks().insertOne({
      _id: s(SEAT_PEOPLES_HARPY),
      rank: 3,
      office_category: 'Socialite',
      updated_at: '2026-08-01T00:00:00.000Z',
    });
    const boardId = await seedBoard();
    const seatBefore = await seatDoc(SEAT_PEOPLES_HARPY);
    const petraBefore = await charDoc(PETRA);
    const brandyBefore = await charDoc(BRANDY);

    globalThis.__prax4aResetCalls = [];
    globalThis.__prax4aFailManoeuvreReset = true;
    let res;
    try {
      res = await resolveHarpy(boardId, { claimant_character_id: s(PETRA) });
    } finally {
      globalThis.__prax4aFailManoeuvreReset = false;
    }

    expect(res.status).toBe(500);

    // (a) the seat never changed hands
    expect(await seatDoc(SEAT_PEOPLES_HARPY)).toEqual(seatBefore);
    // (b) neither character moved
    expect(await charDoc(PETRA)).toEqual(petraBefore);
    expect(await charDoc(BRANDY)).toEqual(brandyBefore);
    // (c) the snapshot did not land - the board is still resolvable
    expect((await rawBoard(boardId)).resolved.harpy).toBeNull();
    // (d) the rank document is untouched by the aborted attempt
    expect((await rankDoc(SEAT_PEOPLES_HARPY)).rank).toBe(3);

    // (e) and all of the above mean something, because the failure fired INSIDE
    // a real session. Without this a route that opened no transaction at all
    // could satisfy (a) to (d) by simply doing nothing.
    expect(globalThis.__prax4aResetCalls).toHaveLength(1);
    const opts = globalThis.__prax4aResetCalls[0][2];
    expect(opts?.session).toBeTruthy();

    // Nothing was announced for a change that did not happen.
    expect(broadcastPraxisUpdate).not.toHaveBeenCalled();
  });

  it('the board stays resolvable after a rolled-back attempt', async () => {
    const boardId = await seedBoard();
    globalThis.__prax4aFailManoeuvreReset = true;
    try {
      await resolveHarpy(boardId, { claimant_character_id: s(PETRA) });
    } finally {
      globalThis.__prax4aFailManoeuvreReset = false;
    }

    // The retry succeeds, which is only true if the first attempt left the CAS
    // baseline exactly as it found it.
    const res = await resolveHarpy(boardId, { claimant_character_id: s(PETRA) });
    expect(res.status).toBe(200);
    expect(String((await seatDoc(SEAT_PEOPLES_HARPY)).holder_id)).toBe(s(PETRA));
  });

  it('a successful resolve commits every side together', async () => {
    await ranks().insertOne({
      _id: s(SEAT_PEOPLES_HARPY),
      rank: 2,
      office_category: 'Socialite',
      updated_at: '2026-08-01T00:00:00.000Z',
    });
    const boardId = await seedBoard();
    await resolveHarpy(boardId, { claimant_character_id: s(PETRA) });

    expect(String((await seatDoc(SEAT_PEOPLES_HARPY)).holder_id)).toBe(s(PETRA));
    expect((await charDoc(PETRA)).court_category).toBe('Socialite');
    expect((await charDoc(BRANDY)).court_category).toBeNull();
    expect((await rankDoc(SEAT_PEOPLES_HARPY)).manoeuvre_xp_destroyed).toBe(2);
    expect((await rawBoard(boardId)).resolved.harpy.winner_character_id).toBe(s(PETRA));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC1 - the extraction is a pure move.
// ─────────────────────────────────────────────────────────────────────────────

describe('prax.4a AC1: resetManoeuvreRank lives in exactly one place', () => {
  it('office-seats.js imports it and keeps no local copy', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('routes/office-seats.js', 'utf8');
    expect(src).toMatch(/import\s*\{\s*resetManoeuvreRank\s*\}\s*from\s*'\.\.\/lib\/reset-manoeuvre-rank\.js'/);
    expect(src).not.toContain('async function resetManoeuvreRank');
    // The one place the counter's arithmetic may live.
    expect(src).not.toContain('manoeuvre_xp_destroyed:');
  });

  it('praxis-sessions.js imports the shared module rather than copying it', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('routes/praxis-sessions.js', 'utf8');
    expect(src).toMatch(/import\s*\{\s*resetManoeuvreRank\s*\}\s*from\s*'\.\.\/lib\/reset-manoeuvre-rank\.js'/);
    expect(src).not.toContain('async function resetManoeuvreRank');
    expect(src).not.toContain('manoeuvre_xp_destroyed');
  });
});
