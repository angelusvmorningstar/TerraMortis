/**
 * prax.1 - Praxis board schema and scaffold.
 *
 * `praxis_sessions` is the DB-backed, WS-synced board prax.2 (Praxis claim
 * board) and prax.3 (Harpy board) render against. This suite covers the five
 * routes end to end, and pins the four things that are easy to get wrong:
 *
 *   1. The AC6 CASCADE. Withdrawing a claimant releases every supporter
 *      assigned to them, in the same write, and never auto-reassigns them.
 *      Two inversions of this are silent and plausible, and both are pinned
 *      below: filtering the support map on its KEY rather than its VALUE
 *      (which deletes the withdrawing character's own outgoing support and
 *      strands all of their supporters instead), and cascading into the OTHER
 *      tally.
 *   2. The two tallies are INDEPENDENT. One character may claim in both at
 *      once; a supporter's chip in one says nothing about the other; and no
 *      write to one may touch the other.
 *   3. Absent key and explicit null are DIFFERENT requests on PUT /support.
 *      A dropped field must be a 400, not a silent unassign.
 *   4. The role boundary. Every route is ST-only, permanently, and the WS
 *      frame goes out on the ST/dev fan-out only.
 *
 * DB-backed: real MongoDB required. A skipped suite is not a passing suite -
 * read the summary line, not the exit code.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { ObjectId } from 'mongodb';
import Ajv from 'ajv';
import { createTestApp, stUser, playerUser, coordinatorUser } from './helpers/test-app.js';
import { setupDb, teardownDb, isDbAvailable } from './helpers/db-setup.js';
import { getCollection, getDb } from '../db.js';
import { praxisSessionSchema } from '../schemas/praxis_session.schema.js';

// AC8 - the broadcaster is mocked so the three write routes' calls can be
// counted, and the two non-write routes' silence proved. Mocked at the module
// boundary rather than by opening a real socket: the frame's ST/dev-only
// fan-out is `_fanOutRoles`'s own contract (already covered by gdx.8's suite),
// while what prax.1 owns is WHICH routes fire and which deliberately do not.
vi.mock('../ws.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, broadcastPraxisUpdate: vi.fn() };
});
const { broadcastPraxisUpdate } = await import('../ws.js');

const dbAvailable = await isDbAvailable();

// Explicit, known ids so this suite removes exactly its own fixtures. The
// `9ac1` prefix is not shared with any other suite's fixture range.
const oid = n => new ObjectId(`9ac1${'0'.repeat(16)}${String(n).padStart(4, '0')}`);

const CHAPTER_A = oid(1);          // has a linked game session with attendees
const CHAPTER_B = oid(2);          // has a linked game session, second board
const CHAPTER_NO_SESSION = oid(3); // real chapter, NO game session linked
const CHAPTER_IDS = [CHAPTER_A, CHAPTER_B, CHAPTER_NO_SESSION];

const SESSION_A = oid(11);
const SESSION_B = oid(12);
const SESSION_IDS = [SESSION_A, SESSION_B];

// Character ids. These are deliberately synthetic rather than real `characters`
// documents: the attendee pool is read from `game_sessions.attendance[]` and
// NOTHING in this router reads the characters collection at all, so seeding it
// would prove nothing while adding cleanup surface to a shared collection.
const ALICE   = String(oid(101)); // attendee
const BRUNO   = String(oid(102)); // attendee
const CARMEN  = String(oid(103)); // attendee
const DIETER  = String(oid(104)); // attendee
const EVELYN  = String(oid(105)); // attendee
const ABSENTEE = String(oid(106)); // on the roll, attended === false
const STRANGER = String(oid(107)); // not on the session's attendance at all

const UNKNOWN_BOARD = '9ac10000000000000000ffff';

/** Build one attendance row in `game_sessions`' own shape. */
const att = (id, attended) => ({ character_id: id, attended, costuming: false, downtime: false, extra: 0 });

const ATTENDANCE = [
  att(ALICE, true), att(BRUNO, true), att(CARMEN, true),
  att(DIETER, true), att(EVELYN, true),
  att(ABSENTEE, false),
];

let app;

const boards = () => getCollection('praxis_sessions');

async function removeFixtures() {
  await boards().deleteMany({ chapter_id: { $in: CHAPTER_IDS } });
  await getCollection('game_sessions').deleteMany({ _id: { $in: SESSION_IDS } });
  await getCollection('chapters').deleteMany({ _id: { $in: CHAPTER_IDS } });
}

beforeAll(async () => {
  if (!dbAvailable) return;
  await setupDb();
  app = createTestApp();
  // AC2 - build the SAME partial unique index server/index.js creates at boot,
  // so the constraint this suite asserts against is the real one rather than a
  // paraphrase of it. Idempotent: createIndex on an identical existing index is
  // a no-op.
  await getDb().collection('praxis_sessions').createIndex(
    { chapter_id: 1 },
    {
      name: 'chapter_id_unique_notnull',
      unique: true,
      background: true,
      partialFilterExpression: { chapter_id: { $type: ['objectId'] } },
    },
  );
});

beforeEach(async () => {
  if (!dbAvailable) return;
  vi.clearAllMocks();
  await removeFixtures();
  await getCollection('chapters').insertMany([
    { _id: CHAPTER_A, chapter_number: 901, label: 'PRAX1 Chapter A' },
    { _id: CHAPTER_B, chapter_number: 902, label: 'PRAX1 Chapter B' },
    { _id: CHAPTER_NO_SESSION, chapter_number: 903, label: 'PRAX1 Chapter with no session' },
  ]);
  await getCollection('game_sessions').insertMany([
    { _id: SESSION_A, session_date: '2026-08-01', chapter_id: CHAPTER_A, attendance: ATTENDANCE },
    { _id: SESSION_B, session_date: '2026-08-08', chapter_id: CHAPTER_B, attendance: ATTENDANCE },
  ]);
});

afterAll(async () => {
  if (!dbAvailable) return;
  await removeFixtures();
  await teardownDb();
});

// ── Request helpers ─────────────────────────────────────────────────────────

const get = (chapterId, user = stUser()) =>
  request(app).get(`/api/praxis_sessions?chapter_id=${chapterId}`).set('X-Test-User', user);

const create = (body, user = stUser()) =>
  request(app).post('/api/praxis_sessions').set('X-Test-User', user).send(body);

const claim = (id, body, user = stUser()) =>
  request(app).post(`/api/praxis_sessions/${id}/claims`).set('X-Test-User', user).send(body);

const withdraw = (id, characterId, tally, user = stUser()) =>
  request(app).delete(`/api/praxis_sessions/${id}/claims/${characterId}?tally=${tally}`).set('X-Test-User', user);

const support = (id, body, user = stUser()) =>
  request(app).put(`/api/praxis_sessions/${id}/support`).set('X-Test-User', user).send(body);

/** Open a board on CHAPTER_A and return its id. */
async function openBoard(chapter = CHAPTER_A) {
  const res = await create({ chapter_id: String(chapter) });
  expect(res.status).toBe(201);
  return res.body._id;
}

/** Read the stored board straight from Mongo, bypassing the route. */
const raw = id => boards().findOne({ _id: new ObjectId(id) });

// ─────────────────────────────────────────────────────────────────────────────
// AC1 - the schema itself.
// ─────────────────────────────────────────────────────────────────────────────

describe('prax.1 AC1: praxis_session schema', () => {
  const ajv = new Ajv({ allErrors: true, coerceTypes: false });
  const validate = ajv.compile(praxisSessionSchema);

  const validDoc = () => ({
    _id: String(oid(999)),
    chapter_id: String(CHAPTER_A),
    praxis: { claims: [{ character_id: ALICE, opened_at: '2026-08-29T10:00:00.000Z' }], support: { [BRUNO]: ALICE } },
    harpy: { claims: [], support: {} },
    resolved: { praxis: null, harpy: null },
    created_at: '2026-08-29T10:00:00.000Z',
    updated_at: '2026-08-29T10:00:00.000Z',
  });

  it('accepts a well-formed board', () => {
    expect(validate(validDoc())).toBe(true);
  });

  it('requires both tallies, resolved, and both timestamps', () => {
    for (const field of ['chapter_id', 'praxis', 'harpy', 'resolved', 'created_at', 'updated_at']) {
      const doc = validDoc();
      delete doc[field];
      expect(validate(doc), `${field} should be required`).toBe(false);
    }
  });

  it('rejects an upper-case or malformed supporter key', () => {
    // The support map's KEYS are character ids, and an upper-case duplicate of
    // an existing key would silently give one supporter two assignments in the
    // same tally. The route lower-cases before writing; this is the structural
    // backstop for that.
    for (const badKey of [ALICE.toUpperCase(), 'nope', `${ALICE}0`]) {
      const doc = validDoc();
      doc.praxis.support = { [badKey]: BRUNO };
      expect(validate(doc), `${badKey} should be rejected as a support key`).toBe(false);
    }
  });

  it('rejects a malformed supporter VALUE (the claimant being pointed at)', () => {
    const doc = validDoc();
    doc.praxis.support = { [BRUNO]: 'not-an-id' };
    expect(validate(doc)).toBe(false);
  });

  it('accepts an object in resolved.<tally> as well as null, without pinning its shape', () => {
    // prax.4a/prax.4b design their own snapshot. prax.1 only reserves the field.
    const doc = validDoc();
    doc.resolved.praxis = { winner: ALICE, final_tally: { [ALICE]: 7 } };
    expect(validate(doc)).toBe(true);
  });

  it('rejects an unknown top-level field', () => {
    const doc = validDoc();
    doc.live_score = 5;
    expect(validate(doc)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The role boundary - permanent, for every route.
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!dbAvailable)('prax.1: ST-only on every route, permanently', () => {
  let boardId;
  beforeEach(async () => { boardId = await openBoard(); });

  it('refuses a player on all five routes with 403', async () => {
    const p = playerUser([ALICE]);
    const responses = await Promise.all([
      get(String(CHAPTER_A), p),
      create({ chapter_id: String(CHAPTER_B) }, p),
      claim(boardId, { tally: 'praxis', character_id: ALICE }, p),
      withdraw(boardId, ALICE, 'praxis', p),
      support(boardId, { tally: 'praxis', supporter_character_id: BRUNO, claimant_character_id: null }, p),
    ]);
    for (const res of responses) expect(res.status).toBe(403);
  });

  it('refuses a coordinator too - this is not a finance-adjacent surface', async () => {
    const res = await get(String(CHAPTER_A), coordinatorUser());
    expect(res.status).toBe(403);
  });

  it('refuses an unauthenticated caller with 401', async () => {
    const res = await request(app).get(`/api/praxis_sessions?chapter_id=${CHAPTER_A}`);
    expect(res.status).toBe(401);
  });

  it('admits dev, the privacy-redacted ST login', async () => {
    const res = await get(String(CHAPTER_A), stUser({ role: 'dev' }));
    expect(res.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC3 - GET.
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!dbAvailable)('prax.1 AC3: GET /api/praxis_sessions', () => {
  it('returns null (not 404) when no board has been opened for the chapter', async () => {
    const res = await get(String(CHAPTER_A));
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it('returns the board once one exists, with string ids', async () => {
    const boardId = await openBoard();
    const res = await get(String(CHAPTER_A));
    expect(res.status).toBe(200);
    expect(res.body._id).toBe(boardId);
    expect(res.body.chapter_id).toBe(String(CHAPTER_A));
    expect(res.body.praxis).toEqual({ claims: [], support: {} });
    expect(res.body.harpy).toEqual({ claims: [], support: {} });
    expect(res.body.resolved).toEqual({ praxis: null, harpy: null });
  });

  it('400s on a missing or malformed chapter_id', async () => {
    const missing = await request(app).get('/api/praxis_sessions').set('X-Test-User', stUser());
    expect(missing.status).toBe(400);
    for (const bad of ['nope', '9ac1', `${CHAPTER_A}0`]) {
      const res = await get(bad);
      expect(res.status).toBe(400);
    }
  });

  it('does not broadcast - a read changes nothing', async () => {
    await openBoard();
    broadcastPraxisUpdate.mockClear();
    await get(String(CHAPTER_A));
    expect(broadcastPraxisUpdate).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC4 - POST (create).
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!dbAvailable)('prax.1 AC4: POST /api/praxis_sessions', () => {
  const ajv = new Ajv({ allErrors: true, coerceTypes: false });
  const validate = ajv.compile(praxisSessionSchema);

  it('creates an empty board that validates against the schema', async () => {
    const res = await create({ chapter_id: String(CHAPTER_A) });
    expect(res.status).toBe(201);
    expect(validate(res.body), JSON.stringify(validate.errors)).toBe(true);
    expect(res.body.praxis).toEqual({ claims: [], support: {} });
    expect(res.body.harpy).toEqual({ claims: [], support: {} });
    expect(res.body.resolved).toEqual({ praxis: null, harpy: null });
  });

  it('stores chapter_id as a real ObjectId, not a string', async () => {
    // The FK type is the whole reason the boot-time partial index can list
    // `objectId` alone. A string here would slip straight past the uniqueness
    // constraint and quietly allow two boards on one Chapter.
    const boardId = await openBoard();
    const stored = await raw(boardId);
    expect(stored.chapter_id).toBeInstanceOf(ObjectId);
  });

  it('404s when the chapter does not exist', async () => {
    const res = await create({ chapter_id: UNKNOWN_BOARD });
    expect(res.status).toBe(404);
  });

  it('400s on a missing or malformed chapter_id', async () => {
    expect((await create({})).status).toBe(400);
    expect((await create({ chapter_id: 'nope' })).status).toBe(400);
    expect((await create({ chapter_id: null })).status).toBe(400);
  });

  it('409s on a second board for the same chapter, naming the existing board id', async () => {
    const boardId = await openBoard();
    const res = await create({ chapter_id: String(CHAPTER_A) });
    expect(res.status).toBe(409);
    expect(res.body.existing_id).toBe(boardId);
  });

  it('AC2: the DB index refuses a duplicate even on a direct write bypassing the route', async () => {
    await openBoard();
    let err = null;
    try {
      await boards().insertOne({
        chapter_id: CHAPTER_A,
        praxis: { claims: [], support: {} },
        harpy: { claims: [], support: {} },
        resolved: { praxis: null, harpy: null },
        created_at: '2026-08-29T10:00:00.000Z',
        updated_at: '2026-08-29T10:00:00.000Z',
      });
    } catch (e) { err = e; }
    expect(err?.code).toBe(11000);
  });

  it('allows a separate board on a different chapter', async () => {
    await openBoard(CHAPTER_A);
    const res = await create({ chapter_id: String(CHAPTER_B) });
    expect(res.status).toBe(201);
  });

  it('does not broadcast - nothing can be watching a board that did not exist', async () => {
    await create({ chapter_id: String(CHAPTER_A) });
    expect(broadcastPraxisUpdate).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC5 - opening a claim.
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!dbAvailable)('prax.1 AC5: POST /:id/claims', () => {
  let boardId;
  beforeEach(async () => { boardId = await openBoard(); });

  it('opens a claim with an ISO opened_at timestamp', async () => {
    const res = await claim(boardId, { tally: 'praxis', character_id: ALICE });
    expect(res.status).toBe(201);
    expect(res.body.claim.character_id).toBe(ALICE);
    expect(Number.isNaN(Date.parse(res.body.claim.opened_at))).toBe(false);

    const stored = await raw(boardId);
    expect(stored.praxis.claims).toHaveLength(1);
    expect(stored.harpy.claims).toHaveLength(0);
  });

  it('lets one character claim in BOTH tallies at once - no cross-tally exclusivity', async () => {
    expect((await claim(boardId, { tally: 'praxis', character_id: ALICE })).status).toBe(201);
    expect((await claim(boardId, { tally: 'harpy', character_id: ALICE })).status).toBe(201);
    const stored = await raw(boardId);
    expect(stored.praxis.claims.map(c => c.character_id)).toEqual([ALICE]);
    expect(stored.harpy.claims.map(c => c.character_id)).toEqual([ALICE]);
  });

  it('409s on a duplicate claim in the SAME tally (the double-tap case)', async () => {
    await claim(boardId, { tally: 'praxis', character_id: ALICE });
    const res = await claim(boardId, { tally: 'praxis', character_id: ALICE });
    expect(res.status).toBe(409);
    const stored = await raw(boardId);
    expect(stored.praxis.claims).toHaveLength(1);
  });

  it('normalises an upper-case character_id rather than opening a second claim', async () => {
    await claim(boardId, { tally: 'praxis', character_id: ALICE });
    const res = await claim(boardId, { tally: 'praxis', character_id: ALICE.toUpperCase() });
    expect(res.status).toBe(409);
  });

  it('400s on a tally that is not one of the two literals', async () => {
    for (const bad of ['Praxis', 'harpies', '', undefined, 7]) {
      const res = await claim(boardId, { tally: bad, character_id: ALICE });
      expect(res.status).toBe(400);
    }
  });

  it('400s on a missing or malformed character_id', async () => {
    expect((await claim(boardId, { tally: 'praxis' })).status).toBe(400);
    expect((await claim(boardId, { tally: 'praxis', character_id: 'nope' })).status).toBe(400);
  });

  it('404s on an unknown board id, and 400s on a malformed one', async () => {
    expect((await claim(UNKNOWN_BOARD, { tally: 'praxis', character_id: ALICE })).status).toBe(404);
    expect((await claim('nope', { tally: 'praxis', character_id: ALICE })).status).toBe(400);
  });

  it('400s a character who is not a current attendee', async () => {
    // Never checked in at all.
    expect((await claim(boardId, { tally: 'praxis', character_id: STRANGER })).status).toBe(400);
    // On the roll, but attended === false. The pool is `attended === true` only.
    expect((await claim(boardId, { tally: 'praxis', character_id: ABSENTEE })).status).toBe(400);
  });

  it('400s with a distinct message when no game session is linked to the chapter', async () => {
    const res = await create({ chapter_id: String(CHAPTER_NO_SESSION) });
    expect(res.status).toBe(201);
    const orphan = res.body._id;
    const claimRes = await claim(orphan, { tally: 'praxis', character_id: ALICE });
    expect(claimRes.status).toBe(400);
    expect(claimRes.body.message).toMatch(/no game session is linked/i);
  });

  it('reads the attendee pool LIVE - a late check-in becomes claimable with no board change', async () => {
    expect((await claim(boardId, { tally: 'praxis', character_id: STRANGER })).status).toBe(400);
    await getCollection('game_sessions').updateOne(
      { _id: SESSION_A },
      { $push: { attendance: att(STRANGER, true) } },
    );
    expect((await claim(boardId, { tally: 'praxis', character_id: STRANGER })).status).toBe(201);
  });

  it('broadcasts exactly once on success and not at all on a refusal', async () => {
    await claim(boardId, { tally: 'praxis', character_id: ALICE });
    expect(broadcastPraxisUpdate).toHaveBeenCalledTimes(1);
    expect(broadcastPraxisUpdate).toHaveBeenCalledWith(expect.anything());
    broadcastPraxisUpdate.mockClear();
    await claim(boardId, { tally: 'praxis', character_id: ALICE });
    expect(broadcastPraxisUpdate).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC7 - support assignment. Deliberately before AC6 in this file: the cascade
// tests below need a board with real support entries on it.
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!dbAvailable)('prax.1 AC7: PUT /:id/support', () => {
  let boardId;
  beforeEach(async () => {
    boardId = await openBoard();
    await claim(boardId, { tally: 'praxis', character_id: ALICE });
    await claim(boardId, { tally: 'praxis', character_id: BRUNO });
    await claim(boardId, { tally: 'harpy', character_id: CARMEN });
    broadcastPraxisUpdate.mockClear();
  });

  it('assigns a supporter to an open claimant', async () => {
    const res = await support(boardId, { tally: 'praxis', supporter_character_id: DIETER, claimant_character_id: ALICE });
    expect(res.status).toBe(200);
    const stored = await raw(boardId);
    expect(stored.praxis.support).toEqual({ [DIETER]: ALICE });
    // The other tally is untouched.
    expect(stored.harpy.support).toEqual({});
  });

  it('reassigning OVERWRITES the one key - a supporter has at most one assignment per tally', async () => {
    await support(boardId, { tally: 'praxis', supporter_character_id: DIETER, claimant_character_id: ALICE });
    await support(boardId, { tally: 'praxis', supporter_character_id: DIETER, claimant_character_id: BRUNO });
    const stored = await raw(boardId);
    expect(stored.praxis.support).toEqual({ [DIETER]: BRUNO });
  });

  it('an explicit null claimant returns the supporter to the unassigned pool', async () => {
    await support(boardId, { tally: 'praxis', supporter_character_id: DIETER, claimant_character_id: ALICE });
    const res = await support(boardId, { tally: 'praxis', supporter_character_id: DIETER, claimant_character_id: null });
    expect(res.status).toBe(200);
    const stored = await raw(boardId);
    expect(stored.praxis.support).toEqual({});
  });

  it('an ABSENT claimant_character_id key is a 400, NOT a silent unassign', async () => {
    await support(boardId, { tally: 'praxis', supporter_character_id: DIETER, claimant_character_id: ALICE });
    const res = await support(boardId, { tally: 'praxis', supporter_character_id: DIETER });
    expect(res.status).toBe(400);
    // The critical half: the existing assignment survived the refusal.
    const stored = await raw(boardId);
    expect(stored.praxis.support).toEqual({ [DIETER]: ALICE });
  });

  it('the two tallies hold independent assignments for the same supporter', async () => {
    await support(boardId, { tally: 'praxis', supporter_character_id: DIETER, claimant_character_id: ALICE });
    await support(boardId, { tally: 'harpy', supporter_character_id: DIETER, claimant_character_id: CARMEN });
    const stored = await raw(boardId);
    expect(stored.praxis.support).toEqual({ [DIETER]: ALICE });
    expect(stored.harpy.support).toEqual({ [DIETER]: CARMEN });
  });

  it('400s a claimant who has no open claim in THAT tally', async () => {
    // EVELYN is an attendee but is not standing anywhere.
    const none = await support(boardId, { tally: 'praxis', supporter_character_id: DIETER, claimant_character_id: EVELYN });
    expect(none.status).toBe(400);
    // CARMEN is standing, but in the HARPY tally only.
    const wrongTally = await support(boardId, { tally: 'praxis', supporter_character_id: DIETER, claimant_character_id: CARMEN });
    expect(wrongTally.status).toBe(400);
  });

  it('400s a supporter who is not a current attendee', async () => {
    expect((await support(boardId, { tally: 'praxis', supporter_character_id: STRANGER, claimant_character_id: ALICE })).status).toBe(400);
    expect((await support(boardId, { tally: 'praxis', supporter_character_id: ABSENTEE, claimant_character_id: ALICE })).status).toBe(400);
  });

  it('400s on a bad tally or a malformed supporter id, 404s on an unknown board', async () => {
    expect((await support(boardId, { tally: 'nope', supporter_character_id: DIETER, claimant_character_id: null })).status).toBe(400);
    expect((await support(boardId, { tally: 'praxis', supporter_character_id: 'nope', claimant_character_id: null })).status).toBe(400);
    expect((await support(UNKNOWN_BOARD, { tally: 'praxis', supporter_character_id: DIETER, claimant_character_id: null })).status).toBe(404);
  });

  it('broadcasts on both assign and unassign', async () => {
    await support(boardId, { tally: 'praxis', supporter_character_id: DIETER, claimant_character_id: ALICE });
    expect(broadcastPraxisUpdate).toHaveBeenCalledTimes(1);
    await support(boardId, { tally: 'praxis', supporter_character_id: DIETER, claimant_character_id: null });
    expect(broadcastPraxisUpdate).toHaveBeenCalledTimes(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC6 - withdrawal, and the support cascade. The one genuinely tricky
// invariant in this story, so it gets its own dedicated block.
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!dbAvailable)('prax.1 AC6: DELETE /:id/claims/:characterId - the cascade', () => {
  let boardId;

  /**
   * A board with a deliberately awkward shape:
   *
   *   praxis claims : ALICE, BRUNO
   *   praxis support: CARMEN -> ALICE, DIETER -> ALICE, EVELYN -> BRUNO,
   *                   ALICE  -> BRUNO       (ALICE is a claimant AND a supporter)
   *   harpy  claims : ALICE
   *   harpy  support: CARMEN -> ALICE
   *
   * ALICE appearing as both a claim and a support KEY is the whole point. A
   * cascade that filtered the map on its key rather than its value would delete
   * ALICE's own outgoing support for BRUNO and leave CARMEN and DIETER stranded
   * on a claimant who no longer exists: the exact inversion of the rule, with
   * no error and no visible symptom until somebody counted the tally.
   */
  beforeEach(async () => {
    boardId = await openBoard();
    await claim(boardId, { tally: 'praxis', character_id: ALICE });
    await claim(boardId, { tally: 'praxis', character_id: BRUNO });
    await claim(boardId, { tally: 'harpy', character_id: ALICE });
    await support(boardId, { tally: 'praxis', supporter_character_id: CARMEN, claimant_character_id: ALICE });
    await support(boardId, { tally: 'praxis', supporter_character_id: DIETER, claimant_character_id: ALICE });
    await support(boardId, { tally: 'praxis', supporter_character_id: EVELYN, claimant_character_id: BRUNO });
    await support(boardId, { tally: 'praxis', supporter_character_id: ALICE, claimant_character_id: BRUNO });
    await support(boardId, { tally: 'harpy', supporter_character_id: CARMEN, claimant_character_id: ALICE });
    broadcastPraxisUpdate.mockClear();
  });

  it('removes the claim and releases exactly that claimant\'s supporters', async () => {
    const res = await withdraw(boardId, ALICE, 'praxis');
    expect(res.status).toBe(200);
    expect(res.body.supporters_released).toBe(2); // CARMEN and DIETER

    const stored = await raw(boardId);
    expect(stored.praxis.claims.map(c => c.character_id)).toEqual([BRUNO]);
    // CARMEN and DIETER are back in the unassigned pool - absent keys, NOT
    // reassigned to BRUNO, and NOT left pointing at a withdrawn claimant.
    expect(stored.praxis.support[CARMEN]).toBeUndefined();
    expect(stored.praxis.support[DIETER]).toBeUndefined();
  });

  it('KEY vs VALUE: the withdrawing character\'s OWN outgoing support survives', async () => {
    // ALICE supports BRUNO. Withdrawing ALICE's CLAIM must not touch that.
    await withdraw(boardId, ALICE, 'praxis');
    const stored = await raw(boardId);
    expect(stored.praxis.support[ALICE]).toBe(BRUNO);
  });

  it('leaves another claimant\'s supporters entirely alone', async () => {
    await withdraw(boardId, ALICE, 'praxis');
    const stored = await raw(boardId);
    expect(stored.praxis.support[EVELYN]).toBe(BRUNO);
  });

  it('never cascades into the OTHER tally', async () => {
    await withdraw(boardId, ALICE, 'praxis');
    const stored = await raw(boardId);
    expect(stored.harpy.claims.map(c => c.character_id)).toEqual([ALICE]);
    expect(stored.harpy.support).toEqual({ [CARMEN]: ALICE });
  });

  it('reports 0 released when the withdrawn claimant had no supporters', async () => {
    const res = await withdraw(boardId, BRUNO, 'harpy'); // BRUNO has no harpy claim
    expect(res.status).toBe(404);
    const evelyn = await claim(boardId, { tally: 'harpy', character_id: EVELYN });
    expect(evelyn.status).toBe(201);
    const res2 = await withdraw(boardId, EVELYN, 'harpy');
    expect(res2.status).toBe(200);
    expect(res2.body.supporters_released).toBe(0);
  });

  it('the claim and the cascade land together - no intermediate state is observable', async () => {
    // Both facts are asserted from ONE post-write read: the claim is gone AND
    // no support entry still points at it. A two-write implementation could
    // leave the second half undone; a single pipeline update cannot.
    await withdraw(boardId, ALICE, 'praxis');
    const stored = await raw(boardId);
    const claimIds = stored.praxis.claims.map(c => c.character_id);
    for (const [supporter, claimant] of Object.entries(stored.praxis.support)) {
      expect(claimIds, `${supporter} still points at a withdrawn claimant`).toContain(claimant);
    }
  });

  it('404s when the character has no open claim in that tally', async () => {
    expect((await withdraw(boardId, EVELYN, 'praxis')).status).toBe(404);
    // BRUNO claims in praxis only - a harpy withdrawal must not find it.
    expect((await withdraw(boardId, BRUNO, 'harpy')).status).toBe(404);
  });

  it('404s on an unknown board, 400s on a bad tally or a malformed character id', async () => {
    expect((await withdraw(UNKNOWN_BOARD, ALICE, 'praxis')).status).toBe(404);
    expect((await withdraw(boardId, ALICE, 'nope')).status).toBe(400);
    expect((await withdraw(boardId, 'nope', 'praxis')).status).toBe(400);
  });

  it('a re-claim after a withdrawal starts with a clean, empty supporter set', async () => {
    await withdraw(boardId, ALICE, 'praxis');
    expect((await claim(boardId, { tally: 'praxis', character_id: ALICE })).status).toBe(201);
    const stored = await raw(boardId);
    const backers = Object.entries(stored.praxis.support).filter(([, v]) => v === ALICE);
    expect(backers).toEqual([]);
  });

  it('broadcasts once on a successful withdrawal and not at all on a 404', async () => {
    await withdraw(boardId, ALICE, 'praxis');
    expect(broadcastPraxisUpdate).toHaveBeenCalledTimes(1);
    broadcastPraxisUpdate.mockClear();
    await withdraw(boardId, ALICE, 'praxis');
    expect(broadcastPraxisUpdate).not.toHaveBeenCalled();
  });

  it('leaves resolved untouched - prax.1 never writes into it', async () => {
    await withdraw(boardId, ALICE, 'praxis');
    const stored = await raw(boardId);
    expect(stored.resolved).toEqual({ praxis: null, harpy: null });
  });
});
