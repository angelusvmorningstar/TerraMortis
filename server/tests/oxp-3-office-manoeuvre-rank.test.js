/**
 * oxp.3 — office_manoeuvre_ranks: minimal ST-set graduated purchase state for
 * an office's five ranked manoeuvres.
 *
 * A sibling to office-merit-dots (PR #1147), deliberately NOT a reshape of it:
 * office_merit_dots' GET response shape is already client-consumed, and adding
 * a rank field to it would have meant either a breaking re-nest or a stray
 * differently-shaped key in a flat merit-keyed object. Separate collection,
 * separate route, same posture — open read, ST-only write, no XP bookkeeping.
 *
 * Deliberately NOT Epic OXP's full accrual/spend economy (oxp.1/oxp.2 still
 * backlog): no derived office XP, no spend cost, no OAQ approval routing, no
 * handover reset (oxp.5). The ST sets the rank directly.
 *
 * oxp.11 (2026-08-13) RE-KEYED this collection from office category to SEAT,
 * across all three verbs. `_id` is now a seat's own `office_seats._id` as a
 * 24-hex string. The office's manoeuvre count — still the only source of the
 * upper bound, still never hardcoded — is now read from the office of the
 * RESOLVED SEAT rather than from the URL. The atomicity of the step route,
 * which oxp.3's review round established to close a real lost-update race, is
 * load-bearing and is re-proved below under the new keying.
 *
 * DB-backed: real MongoDB required. See db-setup.js.
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

// oxp.11: explicit, known seat _ids so this suite deletes exactly its own
// fixtures. `office_seats` is shared with oxp.1's and oxp.2's suites, so a
// deleteMany({}) here would silently reach into theirs.
const seatId = n => new ObjectId(`0f11${'0'.repeat(16)}${String(n).padStart(4, '0')}`);
const SEAT_ENFORCER      = seatId(31);
const SEAT_PRIMOGEN      = seatId(32);
const SEAT_SOCIALITE     = seatId(33);
const SEAT_ADMINISTRATOR = seatId(34);
const SEAT_IDS = [SEAT_ENFORCER, SEAT_PRIMOGEN, SEAT_SOCIALITE, SEAT_ADMINISTRATOR];

// A well-formed 24-hex id that deliberately matches no seat document.
const SEAT_ABSENT = '0f11000000000000000000ff';

const SEAT_FIXTURES = [
  { _id: SEAT_ENFORCER,      office_category: 'Enforcer',      holder_id: null, created_at: '2026-02-21', seat_label: null, notes: null },
  { _id: SEAT_PRIMOGEN,      office_category: 'Primogen',      holder_id: null, created_at: '2026-02-21', seat_label: null, notes: null },
  { _id: SEAT_SOCIALITE,     office_category: 'Socialite',     holder_id: null, created_at: '2026-02-21', seat_label: null, notes: null },
  // Administrator has no OFFICE_DATA entry yet (oxp.8), so it has no
  // `manoeuvres` array to bound a rank against. Still a 400, expressed now as
  // "a seat whose category has no OFFICE_DATA entry" rather than as a bare
  // category name in the URL.
  { _id: SEAT_ADMINISTRATOR, office_category: 'Administrator', holder_id: null, created_at: '2026-06-20', seat_label: null, notes: null },
];

const ENFORCER = String(SEAT_ENFORCER);
const PRIMOGEN = String(SEAT_PRIMOGEN);
const SOCIALITE = String(SEAT_SOCIALITE);
const ADMINISTRATOR = String(SEAT_ADMINISTRATOR);

let app;

beforeAll(async () => {
  if (!dbAvailable) return;
  await setupDb();
  app = createTestApp();
});

beforeEach(async () => {
  if (!dbAvailable) return;
  await getCollection('office_manoeuvre_ranks').deleteMany({});
  await getCollection('office_seats').deleteMany({ _id: { $in: SEAT_IDS } });
  await getCollection('office_seats').insertMany(SEAT_FIXTURES.map(s => ({ ...s })));
});

afterAll(async () => {
  if (!dbAvailable) return;
  await getCollection('office_manoeuvre_ranks').deleteMany({});
  await getCollection('office_seats').deleteMany({ _id: { $in: SEAT_IDS } });
  await teardownDb();
});

describe.skipIf(!dbAvailable)('oxp.3 — GET /api/office_manoeuvre_rank', () => {
  it('AC3: returns {} when no seat has ever had a rank set', async () => {
    const res = await request(app).get('/api/office_manoeuvre_rank').set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });

  it('oxp.11: reflects a prior PUT, keyed by SEAT id; oxp.6: value is {rank, manoeuvre_xp_destroyed}', async () => {
    await request(app).put(`/api/office_manoeuvre_rank/${ENFORCER}`).set('X-Test-User', stUser())
      .send({ rank: 3 });

    const res = await request(app).get('/api/office_manoeuvre_rank').set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(res.body[ENFORCER]).toEqual({ rank: 3, manoeuvre_xp_destroyed: 0 });
    // The office category is never the key any more.
    expect(res.body).not.toHaveProperty('Enforcer');
  });

  it('oxp.6 AC1: a non-zero manoeuvre_xp_destroyed (as oxp.5\'s handover reset writes) round-trips', async () => {
    await request(app).put(`/api/office_manoeuvre_rank/${ENFORCER}`).set('X-Test-User', stUser())
      .send({ rank: 1 });
    // oxp.5's route writes this field directly; simulate that here rather than
    // depending on the handover route from this suite.
    await getCollection('office_manoeuvre_ranks').updateOne(
      { _id: ENFORCER }, { $set: { manoeuvre_xp_destroyed: 5 } });

    const res = await request(app).get('/api/office_manoeuvre_rank').set('X-Test-User', stUser());
    expect(res.body[ENFORCER]).toEqual({ rank: 1, manoeuvre_xp_destroyed: 5 });
  });

  it('AC3: a seat with no document is simply absent — the client treats missing as 0', async () => {
    await request(app).put(`/api/office_manoeuvre_rank/${ENFORCER}`).set('X-Test-User', stUser())
      .send({ rank: 2 });

    const res = await request(app).get('/api/office_manoeuvre_rank').set('X-Test-User', stUser());
    expect(res.body[ENFORCER]).toEqual({ rank: 2, manoeuvre_xp_destroyed: 0 });
    expect(res.body).not.toHaveProperty(PRIMOGEN);
    expect(res.body).not.toHaveProperty(SOCIALITE);
  });

  it('AC4: is readable by a player, not just an ST (reference info, not a secret)', async () => {
    const res = await request(app).get('/api/office_manoeuvre_rank')
      .set('X-Test-User', playerUser(['000000000000000000000001']));
    expect(res.status).toBe(200);
  });
});

describe.skipIf(!dbAvailable)('oxp.3 — PUT /api/office_manoeuvre_rank/:seatId', () => {
  it('AC5: an ST can set a seat\'s manoeuvre rank, and it persists', async () => {
    const res = await request(app).put(`/api/office_manoeuvre_rank/${ENFORCER}`).set('X-Test-User', stUser())
      .send({ rank: 4 });
    expect(res.status).toBe(200);
    expect(res.body.rank).toBe(4);

    const stored = await getCollection('office_manoeuvre_ranks').findOne({ _id: ENFORCER });
    expect(stored.rank).toBe(4);
    expect(typeof stored.updated_at).toBe('string');
  });

  it('oxp.11 AC1: the write denormalises office_category from the resolved seat, on every write', async () => {
    await request(app).put(`/api/office_manoeuvre_rank/${ENFORCER}`).set('X-Test-User', stUser())
      .send({ rank: 2 });
    let stored = await getCollection('office_manoeuvre_ranks').findOne({ _id: ENFORCER });
    expect(stored.office_category).toBe('Enforcer');

    // Self-healing: corrupt the denormalised copy and a later write repairs it,
    // because the seat is authoritative and the category is never trusted.
    await getCollection('office_manoeuvre_ranks').updateOne(
      { _id: ENFORCER }, { $set: { office_category: 'Primogen' } });
    await request(app).put(`/api/office_manoeuvre_rank/${ENFORCER}`).set('X-Test-User', stUser())
      .send({ rank: 3 });
    stored = await getCollection('office_manoeuvre_ranks').findOne({ _id: ENFORCER });
    expect(stored.office_category).toBe('Enforcer');
  });

  it('AC3: setting one seat does not disturb another', async () => {
    await request(app).put(`/api/office_manoeuvre_rank/${ENFORCER}`).set('X-Test-User', stUser())
      .send({ rank: 5 });
    await request(app).put(`/api/office_manoeuvre_rank/${PRIMOGEN}`).set('X-Test-User', stUser())
      .send({ rank: 1 });

    const res = await request(app).get('/api/office_manoeuvre_rank').set('X-Test-User', stUser());
    expect(res.body[ENFORCER].rank).toBe(5);
    expect(res.body[PRIMOGEN].rank).toBe(1);
  });

  it('AC5: rejects a player (403)', async () => {
    const res = await request(app).put(`/api/office_manoeuvre_rank/${ENFORCER}`)
      .set('X-Test-User', playerUser(['000000000000000000000001']))
      .send({ rank: 2 });
    expect(res.status).toBe(403);
  });

  it('oxp.11 AC3: rejects a malformed seat id (400) — an office category name is now malformed', async () => {
    for (const bad of ['Enforcer', 'NotAnOffice', 'zzzz', '0f11', `${ENFORCER}0`]) {
      const res = await request(app).put(`/api/office_manoeuvre_rank/${encodeURIComponent(bad)}`)
        .set('X-Test-User', stUser()).send({ rank: 2 });
      expect(res.status, `seat id '${bad}' should be a 400`).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    }
  });

  it('oxp.11 AC3: rejects a well-formed seat id with no seat behind it (404)', async () => {
    const res = await request(app).put(`/api/office_manoeuvre_rank/${SEAT_ABSENT}`).set('X-Test-User', stUser())
      .send({ rank: 2 });
    expect(res.status).toBe(404);
  });

  it('oxp.11 AC3: the seat is resolved BEFORE the body is validated — a bad seat id beats a bad rank', async () => {
    const res = await request(app).put(`/api/office_manoeuvre_rank/${SEAT_ABSENT}`).set('X-Test-User', stUser())
      .send({ rank: 'not a rank' });
    expect(res.status).toBe(404);
  });

  it('AC5: rejects a seat whose category has no OFFICE_DATA entry (400) — Administrator, until oxp.8', async () => {
    const res = await request(app).put(`/api/office_manoeuvre_rank/${ADMINISTRATOR}`).set('X-Test-User', stUser())
      .send({ rank: 1 });
    expect(res.status).toBe(400);
  });

  it('AC5: rejects a rank above the resolved seat\'s own office\'s manoeuvre count (400)', async () => {
    const res = await request(app).put(`/api/office_manoeuvre_rank/${ENFORCER}`).set('X-Test-User', stUser())
      .send({ rank: 6 });
    expect(res.status).toBe(400);
  });

  it('AC5: accepts a rank exactly equal to the office\'s manoeuvre count (the boundary is inclusive)', async () => {
    const res = await request(app).put(`/api/office_manoeuvre_rank/${ENFORCER}`).set('X-Test-User', stUser())
      .send({ rank: 5 });
    expect(res.status).toBe(200);
    expect(res.body.rank).toBe(5);
  });

  it('AC5: rejects a negative rank (400)', async () => {
    const res = await request(app).put(`/api/office_manoeuvre_rank/${ENFORCER}`).set('X-Test-User', stUser())
      .send({ rank: -1 });
    expect(res.status).toBe(400);
  });

  it('AC5: rejects a non-integer rank (400)', async () => {
    const res = await request(app).put(`/api/office_manoeuvre_rank/${ENFORCER}`).set('X-Test-User', stUser())
      .send({ rank: 2.5 });
    expect(res.status).toBe(400);
  });

  it('AC5: rejects a null/missing rank rather than coercing it to 0', async () => {
    // oxp.11 must not lose oxp.3's stricter-than-its-sibling input validation:
    // null, '', [] and booleans all become a valid-looking 0 under Number().
    for (const body of [{ rank: null }, {}, { rank: '' }, { rank: [] }, { rank: true }]) {
      const res = await request(app).put(`/api/office_manoeuvre_rank/${ENFORCER}`).set('X-Test-User', stUser())
        .send(body);
      expect(res.status, `body ${JSON.stringify(body)} should be a 400`).toBe(400);
    }
  });

  it('AC3: allows setting the rank back down to 0 (nothing purchased)', async () => {
    await request(app).put(`/api/office_manoeuvre_rank/${ENFORCER}`).set('X-Test-User', stUser())
      .send({ rank: 3 });
    const res = await request(app).put(`/api/office_manoeuvre_rank/${ENFORCER}`).set('X-Test-User', stUser())
      .send({ rank: 0 });
    expect(res.status).toBe(200);
    expect(res.body.rank).toBe(0);

    const get = await request(app).get('/api/office_manoeuvre_rank').set('X-Test-User', stUser());
    expect(get.body[ENFORCER].rank).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /:category/step: the atomic relative adjustment the stepper uses.
//
// Added in the oxp.3 review round (external Codex review, 2026-08-13). The
// stepper used to GET the current rank, compute current + delta in the client,
// and PUT that absolute value. Two overlapping adjustments could both read the
// same starting rank and both write the same next one, so one of the two
// requested steps vanished. The read-modify-write now happens inside MongoDB,
// in one aggregation-pipeline update, clamp included.
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!dbAvailable)('oxp.3: PUT /api/office_manoeuvre_rank/:seatId/step', () => {
  it('AC7: concurrent steps from the same starting rank all land, none is lost', async () => {
    // Four at once rather than two: a read-then-write loses a step only when
    // two requests genuinely interleave, which two racers do not reliably do.
    // Four from 0 must land on 4, below Enforcer's cap of 5, so a short result
    // means lost steps and not a clamp.
    const results = await Promise.all([1, 2, 3, 4].map(() =>
      request(app).put(`/api/office_manoeuvre_rank/${ENFORCER}/step`).set('X-Test-User', stUser()).send({ delta: 1 })));
    for (const res of results) expect(res.status).toBe(200);

    const stored = await getCollection('office_manoeuvre_ranks').findOne({ _id: ENFORCER });
    expect(stored.rank).toBe(4);
  });

  it('AC7: opposing concurrent steps cancel out rather than clobbering each other', async () => {
    await request(app).put(`/api/office_manoeuvre_rank/${ENFORCER}`).set('X-Test-User', stUser())
      .send({ rank: 3 });

    await Promise.all([
      request(app).put(`/api/office_manoeuvre_rank/${ENFORCER}/step`).set('X-Test-User', stUser()).send({ delta: 1 }),
      request(app).put(`/api/office_manoeuvre_rank/${ENFORCER}/step`).set('X-Test-User', stUser()).send({ delta: -1 }),
    ]);

    const stored = await getCollection('office_manoeuvre_ranks').findOne({ _id: ENFORCER });
    expect(stored.rank).toBe(3);
  });

  it('AC3: steps up from nothing, upserting the document on the first click', async () => {
    const res = await request(app).put(`/api/office_manoeuvre_rank/${PRIMOGEN}/step`).set('X-Test-User', stUser())
      .send({ delta: 1 });
    expect(res.status).toBe(200);
    expect(res.body.rank).toBe(1);
    expect(typeof res.body.updated_at).toBe('string');
  });

  it('oxp.11 AC3: the office_category $set composes with the pipeline update, including on the upsert path', async () => {
    const res = await request(app).put(`/api/office_manoeuvre_rank/${PRIMOGEN}/step`).set('X-Test-User', stUser())
      .send({ delta: 1 });
    expect(res.status).toBe(200);
    // Upserted by the pipeline itself, so the denormalised category has to
    // survive the aggregation form of the update, not just the plain $set form.
    expect(res.body.office_category).toBe('Primogen');
    const stored = await getCollection('office_manoeuvre_ranks').findOne({ _id: PRIMOGEN });
    expect(stored.office_category).toBe('Primogen');
  });

  it('AC5: clamps at the resolved seat\'s own office\'s manoeuvre count, never above it', async () => {
    await request(app).put(`/api/office_manoeuvre_rank/${ENFORCER}`).set('X-Test-User', stUser())
      .send({ rank: 5 });
    const res = await request(app).put(`/api/office_manoeuvre_rank/${ENFORCER}/step`).set('X-Test-User', stUser())
      .send({ delta: 1 });
    expect(res.status).toBe(200);
    expect(res.body.rank).toBe(5);
  });

  it('AC5: clamps at 0, never below it, including on the upsert path', async () => {
    const res = await request(app).put(`/api/office_manoeuvre_rank/${SOCIALITE}/step`).set('X-Test-User', stUser())
      .send({ delta: -1 });
    expect(res.status).toBe(200);
    expect(res.body.rank).toBe(0);
  });

  it('AC5: rejects a player (403)', async () => {
    const res = await request(app).put(`/api/office_manoeuvre_rank/${ENFORCER}/step`)
      .set('X-Test-User', playerUser(['000000000000000000000001']))
      .send({ delta: 1 });
    expect(res.status).toBe(403);
  });

  it('oxp.11 AC3: rejects a malformed seat id (400) and an unknown seat (404)', async () => {
    const malformed = await request(app).put('/api/office_manoeuvre_rank/NotAnOffice/step')
      .set('X-Test-User', stUser()).send({ delta: 1 });
    expect(malformed.status).toBe(400);

    const unknown = await request(app).put(`/api/office_manoeuvre_rank/${SEAT_ABSENT}/step`)
      .set('X-Test-User', stUser()).send({ delta: 1 });
    expect(unknown.status).toBe(404);
  });

  it('AC5: rejects a seat whose category has no OFFICE_DATA entry (400)', async () => {
    const res = await request(app).put(`/api/office_manoeuvre_rank/${ADMINISTRATOR}/step`)
      .set('X-Test-User', stUser()).send({ delta: 1 });
    expect(res.status).toBe(400);
  });

  it('AC5: rejects a missing, zero, or non-integer delta (400)', async () => {
    for (const body of [{}, { delta: 0 }, { delta: 1.5 }, { delta: null }, { delta: 'up' }, { delta: [] }]) {
      const res = await request(app).put(`/api/office_manoeuvre_rank/${ENFORCER}/step`).set('X-Test-User', stUser())
        .send(body);
      expect(res.status).toBe(400);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Client wiring — office-tab.js's manoeuvre-rank rendering (static-analysis,
// no browser harness in this repo — see office-merit-dots.test.js, which this
// block mirrors). Behavioural rendering assertions live in
// issue-1141-office-tab-render.test.js.
// ─────────────────────────────────────────────────────────────────────────────

describe('oxp.3 — office-tab.js client wiring', () => {
  it('AC7 / oxp.11: fetches GET /api/office_manoeuvre_rank and steps a SEAT id via apiPut', () => {
    const src = readFile('public/js/tabs/office-tab.js');
    expect(src).toMatch(/apiGet\(['"]\/api\/office_manoeuvre_rank['"]\)/);
    expect(src).toMatch(/apiPut\(`\/api\/office_manoeuvre_rank\/\$\{encodeURIComponent\(outcome\.seatId\)\}\/step`/);
    // The office category is no longer part of the write URL at all.
    expect(src).not.toMatch(/office_manoeuvre_rank\/\$\{encodeURIComponent\(category\)\}/);
  });

  it('AC7: _adjustManoeuvreRank sends a relative step and never computes an absolute rank itself', () => {
    const src = readFile('public/js/tabs/office-tab.js');
    // Slice to the next top-level function rather than a closing brace —
    // brace-matching on '\n}\n' is line-ending sensitive and silently
    // produced an empty body under CRLF.
    const rest = src.slice(src.indexOf('async function _adjustManoeuvreRank') + 20);
    const end  = rest.indexOf('async function ');
    const body = end === -1 ? rest : rest.slice(0, end);

    // Review round, 2026-08-13: the re-fetch-then-compute pattern this test
    // used to assert WAS the lost-update bug. Reading the rank, adding the
    // delta locally and writing the result back is a read-then-write race,
    // however fresh the read is. The delta goes to the server instead.
    expect(body).toMatch(/apiPut\(`\/api\/office_manoeuvre_rank\/\$\{encodeURIComponent\(outcome\.seatId\)\}\/step`,\s*\{ delta \}\)/);
    expect(body).not.toContain("apiGet('/api/office_manoeuvre_rank')");
    // No local arithmetic on the rank at all: no clamp, no addition, nothing
    // for a concurrent write to invalidate.
    expect(body).not.toMatch(/Math\.(min|max)\(/);
  });

  it('AC7: the step route does its read-modify-write atomically in MongoDB, not from a prior read', () => {
    const route = readFile('server/routes/office-manoeuvre-rank.js');
    const rest = route.slice(route.indexOf("router.put('/:seatId/step'"));
    // An aggregation-pipeline update: the clamp and the increment are one
    // operation against the stored value, so nothing is computed from a read
    // that another request could have invalidated.
    expect(rest).toMatch(/\$ifNull/);
    expect(rest).toMatch(/\$add/);
    expect(rest).toMatch(/upsert: true/);
    // No findOne-then-write anywhere in the route file.
    expect(route).not.toMatch(/await col\(\)\.findOne\(/);
  });

  it('AC7: the stale-render guard is anchored to the tab root, not to module scope', () => {
    const src = readFile('public/js/tabs/office-tab.js');
    // office-approvals.js's _fetchGen precedent uses a module-scoped counter
    // because it only ever drives one root. This tab re-renders the same root
    // repeatedly, so the counter has to live on the element itself.
    expect(src).toMatch(/el\._officeManoeuvreGen = \(el\._officeManoeuvreGen \|\| 0\) \+ 1/);
    expect(src).toMatch(/gen !== el\._officeManoeuvreGen/);
  });

  it('AC1: a failed rank fetch replaces the holder\'s list rather than leaving it unmuted', () => {
    const src = readFile('public/js/tabs/office-tab.js');
    expect(src).toMatch(/Could not load purchase state\./);
  });

  it('AC6: gates the +/- stepper controls on ST/dev role', () => {
    const src = readFile('public/js/tabs/office-tab.js');
    expect(src).toMatch(/getRole\(\)\s*===\s*['"]st['"]\s*\|\|\s*getRole\(\)\s*===\s*['"]dev['"]/);
    expect(src).toMatch(/data-manoeuvre-rank-up/);
    expect(src).toMatch(/data-manoeuvre-rank-down/);
  });

  it('AC6: reuses the existing .cs-edit-stepper/.cs-step-btn component classes — no new stepper markup, no inline styles', () => {
    const src = readFile('public/js/tabs/office-tab.js');
    expect(src).toMatch(/cs-edit-stepper office-manoeuvre-rank-stepper/);
    expect(src).toMatch(/cs-step-btn/);
    expect(src).not.toMatch(/style="/);
  });

  it('AC5: the manoeuvre cap is read from the office\'s own manoeuvres array, never hardcoded to 5', () => {
    const route = readFile('server/routes/office-manoeuvre-rank.js');
    expect(route).toMatch(/manoeuvres\.length/);
    // No bare numeric cap anywhere in the validation.
    expect(route).not.toMatch(/n\s*>\s*5/);
  });

  it('AC5: the route gates its write with requireRole(\'st\')', () => {
    const route = readFile('server/routes/office-manoeuvre-rank.js');
    expect(route).toMatch(/router\.put\(\s*['"]\/:seatId['"]\s*,\s*requireRole\(['"]st['"]\)/);
    expect(route).toMatch(/router\.put\(\s*['"]\/:seatId\/step['"]\s*,\s*requireRole\(['"]st['"]\)/);
    // GET is deliberately open to any authenticated user (AC4).
    expect(route).toMatch(/router\.get\(\s*['"]\/['"]\s*,\s*async/);
  });

  it('oxp.11: both purchase routes resolve the seat through the one shared helper, never their own regex', () => {
    // A second, drifting copy of the 24-hex pattern is how one route would
    // start accepting an id shape the other rejects.
    const merits = readFile('server/routes/office-merit-dots.js');
    const ranks  = readFile('server/routes/office-manoeuvre-rank.js');
    for (const src of [merits, ranks]) {
      expect(src).toMatch(/resolveOfficeSeat/);
      expect(src).not.toMatch(/\[0-9a-f/i);
      expect(src).not.toMatch(/new ObjectId\(/);
    }
  });

  it('AC3: the route is mounted behind requireAuth + noCache, mirroring office_merit_dots', () => {
    const index = readFile('server/index.js');
    expect(index).toMatch(/app\.use\(\s*'\/api\/office_manoeuvre_rank',\s*requireAuth,\s*noCache\(\),\s*officeManoeuvreRankRouter\s*\)/);
  });

  it('AC1: the muted class is applied by array position, so rank order is the manoeuvres array order', () => {
    const src = readFile('public/js/tabs/office-tab.js');
    expect(src).toMatch(/office-manoeuvre-unpurchased/);
    // Rank is derived from the array index, not from any per-manoeuvre field.
    expect(src).toMatch(/\(i \+ 1\) > rank/);
  });

  it('AC1: the muted class is defined in suite.css with tokens/existing idioms only, no bare colour literals', () => {
    const css = readFile('public/css/suite.css');
    const idx = css.indexOf('.office-manoeuvre-unpurchased');
    expect(idx).toBeGreaterThan(-1);
    const block = css.slice(idx, css.indexOf('}', idx) + 1);
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(block).not.toMatch(/rgba?\(/);
  });
});
