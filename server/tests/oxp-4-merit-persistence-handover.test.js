/**
 * oxp.4: office merit dots persist across a change of officeholder.
 *
 * Epic OXP names two purchase categories with opposite handover behaviour:
 * merits persist (institutional infrastructure), manoeuvres reset (oxp.5,
 * still backlog). This suite exists to PROVE the merit half rather than
 * assert it from a source reading.
 *
 * The guarantee is structural, not procedural — and oxp.11 changed WHY it
 * holds without changing THAT it holds, so the proof is restated rather than
 * assumed to have survived.
 *
 *   Before oxp.11: `office_merit_dots` was keyed by office category
 *   (`_id: 'Enforcer'`). No character reference existed anywhere, so nothing
 *   about a character's `court_category` changing could reach the collection.
 *
 *   After oxp.11: it is keyed by SEAT (`_id` is the seat's own
 *   `office_seats._id` as a 24-hex string). A seat's `_id` is minted once by
 *   MongoDB and never changes; a handover moves `office_seats.holder_id`, which
 *   is never copied into a purchase document. So the same seat still resolves
 *   to the same document before and after a handover — and now Primogen's two
 *   seats are distinguishable from each other, which category-keying could not
 *   express at all.
 *
 * AC9 (oxp.11) is what this file now proves: the handover chain, end to end
 * through the real routes, with `office_seats.holder_id` genuinely repointed at
 * a second character rather than only the character's `court_category` moving.
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

// Name prefix so this suite only ever removes its own character fixtures.
const FIXTURE_PREFIX = 'OXP4 Handover ';
// Escaped once so an edit to the prefix above can never change $regex semantics
// by accident (review finding: an unescaped constant in a Mongo regex is a
// latent fragility even when the current value has no metacharacters).
const FIXTURE_PREFIX_RE = `^${FIXTURE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`;

// oxp.11: explicit, known seat _ids so this suite deletes exactly its own
// fixtures. `office_seats` is shared with oxp.1's and oxp.2's suites, so a
// deleteMany({}) here would silently reach into theirs.
const seatId = n => new ObjectId(`0f11${'0'.repeat(16)}${String(n).padStart(4, '0')}`);
const SEAT_ENFORCER  = seatId(41);
const SEAT_PRIMOGEN  = seatId(42);
const SEAT_SOCIALITE = seatId(43);
const SEAT_IDS = [SEAT_ENFORCER, SEAT_PRIMOGEN, SEAT_SOCIALITE];

const ENFORCER  = String(SEAT_ENFORCER);
const PRIMOGEN  = String(SEAT_PRIMOGEN);
const SOCIALITE = String(SEAT_SOCIALITE);

let app;

/** Create a character through the real ST create route and return its id. */
async function createChar(name, courtCategory) {
  const body = { name: FIXTURE_PREFIX + name };
  if (courtCategory !== undefined) body.court_category = courtCategory;
  const res = await request(app).post('/api/characters').set('X-Test-User', stUser()).send(body);
  expect(res.status).toBe(201);
  return String(res.body._id);
}

/** Change a character's court_category through the real ST update route. */
async function setCourtCategory(id, courtCategory) {
  const res = await request(app).put(`/api/characters/${id}`).set('X-Test-User', stUser())
    .send({ court_category: courtCategory });
  expect(res.status).toBe(200);
  expect(res.body.court_category).toBe(courtCategory);
  return res.body;
}

/** oxp.11 AC9: repoint a seat at a different character, which is the other
 *  half of a real handover.
 *
 *  This used to say "nothing in the app writes `holder_id` yet... so the test
 *  does directly what oxp.5 will eventually do through a route". That is no
 *  longer true: oxp.5 shipped PUT /api/office_seats/:seatId/holder, which is
 *  now the real writer.
 *
 *  The direct write is KEPT anyway, deliberately, and that is the point of this
 *  comment. oxp.4's guarantee is that merit dots survive a change of
 *  officeholder. If this suite proved it by driving oxp.5's route, the proof
 *  would be circular: it would show only that one particular route happens not
 *  to touch `office_merit_dots` today. Writing the seat directly keeps the
 *  guarantee independent of any route, so it still holds for a future writer
 *  that has not been built yet. oxp.5's own suite proves its route's behaviour
 *  separately (see oxp-5-handover-logic.test.js, AC7). */
async function repointSeat(seatObjectId, holderId) {
  await getCollection('office_seats').updateOne(
    { _id: seatObjectId },
    { $set: { holder_id: holderId === null ? null : new ObjectId(holderId) } },
  );
}

async function insertSeats() {
  await getCollection('office_seats').insertMany([
    { _id: SEAT_ENFORCER,  office_category: 'Enforcer',  holder_id: null, created_at: '2026-02-21', seat_label: null, notes: null },
    { _id: SEAT_PRIMOGEN,  office_category: 'Primogen',  holder_id: null, created_at: '2026-02-21', seat_label: null, notes: null },
    { _id: SEAT_SOCIALITE, office_category: 'Socialite', holder_id: null, created_at: '2026-02-21', seat_label: null, notes: null },
  ]);
}

beforeAll(async () => {
  if (!dbAvailable) return;
  await setupDb();
  app = createTestApp();
});

beforeEach(async () => {
  if (!dbAvailable) return;
  await getCollection('office_merit_dots').deleteMany({});
  await getCollection('office_seats').deleteMany({ _id: { $in: SEAT_IDS } });
  await insertSeats();
  await getCollection('characters').deleteMany({ name: { $regex: FIXTURE_PREFIX_RE } });
});

afterAll(async () => {
  if (!dbAvailable) return;
  await getCollection('office_merit_dots').deleteMany({});
  await getCollection('office_seats').deleteMany({ _id: { $in: SEAT_IDS } });
  await getCollection('characters').deleteMany({ name: { $regex: FIXTURE_PREFIX_RE } });
  await teardownDb();
});

// ─────────────────────────────────────────────────────────────────────────────
// AC1 / AC2 (oxp.4), restated as AC9 (oxp.11): the handover chain, end to end
// through the real routes, under seat-keying.
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!dbAvailable)('oxp.4 merit dots survive a change of officeholder', () => {
  it('AC1: vacating the office leaves the seat\'s merit dots byte-identical', async () => {
    const holderA = await createChar('Holder A', 'Enforcer');
    await repointSeat(SEAT_ENFORCER, holderA);

    await request(app).put(`/api/office_merit_dots/${ENFORCER}`).set('X-Test-User', stUser())
      .send({ merit: 'Safe Place', dots: 3 }).expect(200);
    await request(app).put(`/api/office_merit_dots/${ENFORCER}`).set('X-Test-User', stUser())
      .send({ merit: 'Retainer (Hound)', dots: 2 }).expect(200);
    await request(app).put(`/api/office_merit_dots/${ENFORCER}`).set('X-Test-User', stUser())
      .send({ merit: 'Trained Observer', dots: 1 }).expect(200);

    const before = await request(app).get('/api/office_merit_dots').set('X-Test-User', stUser());
    expect(before.status).toBe(200);
    expect(before.body[ENFORCER]).toEqual({
      'Safe Place': 3,
      'Retainer (Hound)': 2,
      'Trained Observer': 1,
    });
    // Whole stored document, updated_at included, so any write at all shows up.
    const storedBefore = await getCollection('office_merit_dots').findOne({ _id: ENFORCER });

    // The handover: A stops holding the office, via the real character route.
    await setCourtCategory(holderA, null);

    const after = await request(app).get('/api/office_merit_dots').set('X-Test-User', stUser());
    expect(after.status).toBe(200);
    expect(after.body).toEqual(before.body);

    const storedAfter = await getCollection('office_merit_dots').findOne({ _id: ENFORCER });
    expect(storedAfter).toEqual(storedBefore);
    // updated_at unchanged is the strongest available evidence that no code
    // path wrote to the document at all, not merely that it wrote the same
    // values back.
    expect(storedAfter.updated_at).toBe(storedBefore.updated_at);
  });

  it('AC9: a FULL handover — court_category moves AND the seat is repointed — changes nothing', async () => {
    const holderA = await createChar('Holder A', 'Enforcer');
    const holderB = await createChar('Holder B', null);
    await repointSeat(SEAT_ENFORCER, holderA);

    await request(app).put(`/api/office_merit_dots/${ENFORCER}`).set('X-Test-User', stUser())
      .send({ merit: 'Safe Place', dots: 4 }).expect(200);

    const asHeldByA = await request(app).get('/api/office_merit_dots').set('X-Test-User', stUser());
    expect(asHeldByA.body[ENFORCER]['Safe Place']).toBe(4);
    const storedBefore = await getCollection('office_merit_dots').findOne({ _id: ENFORCER });

    // Both halves of a real handover. B has never touched the merit-dots write
    // route, and never will in this test.
    await setCourtCategory(holderA, null);
    await setCourtCategory(holderB, 'Enforcer');
    await repointSeat(SEAT_ENFORCER, holderB);

    const asHeldByB = await request(app).get('/api/office_merit_dots').set('X-Test-User', stUser());
    expect(asHeldByB.body).toEqual(asHeldByA.body);
    expect(asHeldByB.body[ENFORCER]['Safe Place']).toBe(4);

    // Byte-identical, updated_at included: repointing the seat did not so much
    // as touch the purchase document.
    const storedAfter = await getCollection('office_merit_dots').findOne({ _id: ENFORCER });
    expect(storedAfter).toEqual(storedBefore);
    expect(storedAfter.updated_at).toBe(storedBefore.updated_at);

    // And B genuinely sees them from their own auth context: the GET is
    // reference info readable by the player who owns B, not an ST-only view.
    const asB = await request(app).get('/api/office_merit_dots')
      .set('X-Test-User', playerUser([holderB]));
    expect(asB.status).toBe(200);
    expect(asB.body[ENFORCER]['Safe Place']).toBe(4);

    // The seat that carries the purchase state is the same seat throughout —
    // its _id is its identity, and a handover cannot change it.
    const seat = await getCollection('office_seats').findOne({ _id: SEAT_ENFORCER });
    expect(String(seat._id)).toBe(ENFORCER);
    expect(String(seat.holder_id)).toBe(holderB);
  });

  it('a second, unrelated office\'s seat is equally untouched by the handover', async () => {
    const holderA = await createChar('Holder A', 'Enforcer');
    await createChar('Primogen Holder', 'Primogen');
    await repointSeat(SEAT_ENFORCER, holderA);

    await request(app).put(`/api/office_merit_dots/${ENFORCER}`).set('X-Test-User', stUser())
      .send({ merit: 'Safe Place', dots: 2 }).expect(200);
    await request(app).put(`/api/office_merit_dots/${PRIMOGEN}`).set('X-Test-User', stUser())
      .send({ merit: 'Resources', dots: 5 }).expect(200);

    await setCourtCategory(holderA, 'Socialite');

    const after = await request(app).get('/api/office_merit_dots').set('X-Test-User', stUser());
    expect(after.body[ENFORCER]['Safe Place']).toBe(2);
    expect(after.body[PRIMOGEN].Resources).toBe(5);
    // Moving A into Socialite did not conjure a Socialite document either.
    expect(after.body[SOCIALITE]).toBeUndefined();
  });

  it('AC9 companion: the stored document carries no character or holder reference at all', async () => {
    const holderA = await createChar('Holder A', 'Enforcer');
    await repointSeat(SEAT_ENFORCER, holderA);
    await request(app).put(`/api/office_merit_dots/${ENFORCER}`).set('X-Test-User', stUser())
      .send({ merit: 'Safe Place', dots: 1 }).expect(200);

    const stored = await getCollection('office_merit_dots').findOne({ _id: ENFORCER });
    // This is the whole mechanism: the key is a SEAT's identity, not a
    // person's. `office_category` is a denormalised copy for legibility, never
    // the key and never authoritative.
    expect(stored._id).toBe(ENFORCER);
    expect(Object.keys(stored).sort()).toEqual(['_id', 'dots', 'office_category', 'updated_at']);

    const serialised = JSON.stringify(stored);
    expect(serialised).not.toContain(holderA);
    expect(serialised).not.toMatch(/character/i);
    expect(serialised).not.toMatch(/holder/i);
  });

  it('deletes of the holder character leave the office merit suite intact', async () => {
    const holderA = await createChar('Holder A', 'Enforcer');
    await repointSeat(SEAT_ENFORCER, holderA);
    await request(app).put(`/api/office_merit_dots/${ENFORCER}`).set('X-Test-User', stUser())
      .send({ merit: 'Safe Place', dots: 3 }).expect(200);

    // The hard-delete cascade in characters.js sweeps every collection that
    // references a character id. office_merit_dots is not one of them, and
    // must not become one without revisiting oxp.4.
    await request(app).delete(`/api/characters/${holderA}`).set('X-Test-User', stUser()).expect(204);

    const after = await request(app).get('/api/office_merit_dots').set('X-Test-User', stUser());
    expect(after.body[ENFORCER]['Safe Place']).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC3 (oxp.4), restated for oxp.11: the client half of the same guarantee.
// Static source analysis, matching office-merit-dots.test.js's own "client
// wiring" describe (no browser harness in this repo).
//
// What is still guaranteed, exactly:
//
//   - No character id ever reaches the `office_merit_dots` API. The merit-dot
//     functions do not take a character, do not read one, and send nothing but
//     a seat id in the URL and `{ merit, dots }` in the body.
//   - No `holder_id` is ever stored in a purchase document (proved server-side
//     above, by the serialised-form assertion).
//
// What is NEW and is stated rather than denied: the client DOES read
// `office_seats.holder_id`, legitimately, to work out which seat the viewer's
// own office corresponds to. That read is confined to one function, it happens
// before either merit-dot function is called, and its result is a seat id. So
// the contract is not "the client never touches a holder" any more — it is
// "the holder is used to CHOOSE a seat and never travels any further".
// ─────────────────────────────────────────────────────────────────────────────

/** Source text of _wireMeritDots + _adjustMeritDots only, excluding neighbours.
 *  The end anchor is the next function after the pair, so the slice really is
 *  the two merit-dot functions and nothing else.
 *
 *  oxp.6: `_wireMeritDots` lost its `async` keyword (it no longer fetches its
 *  own data — see `refreshPurchaseStateBlock()` below for where that guarantee
 *  now lives) and both functions' signatures widened to carry `data`
 *  (OFFICE_DATA[category], for the merit-dot render loop) and `isOwnOffice`
 *  (so a post-adjustment refresh can re-derive the seat balance both purchase
 *  sections now share). Neither addition is a character reference. */
function meritDotsBlock() {
  const src = readFile('public/js/tabs/office-tab.js');
  const start = src.indexOf('function _wireMeritDots');
  const end = src.indexOf('function _wireManoeuvreRank');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

/** Source text of the seat-resolution entry point and its helpers. */
function seatResolutionBlock() {
  const src = readFile('public/js/tabs/office-tab.js');
  const start = src.indexOf('async function _wirePurchaseState');
  const end = src.indexOf('function _wireMeritDots');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

/**
 * oxp.6: source text of `_refreshPurchaseState` alone — the function that now
 * does the `office_merit_dots` fetch `_wireMeritDots` itself used to do.
 * Scoped narrowly (not merged into `seatResolutionBlock`) because
 * `_wirePurchaseState`, which precedes it, legitimately reads `char._id` for
 * the holder-match comparison — sweeping that in would make the "no character
 * reaches the merit-dots API" guarantee below trivially fail for an unrelated
 * reason.
 */
function refreshPurchaseStateBlock() {
  const src = readFile('public/js/tabs/office-tab.js');
  const start = src.indexOf('async function _refreshPurchaseState');
  const end = src.indexOf('function _wireMeritDots');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe('oxp.4 client wiring: no character id reaches the office_merit_dots API', () => {
  it('extracts a block containing both merit-dot functions and neither neighbour', () => {
    const block = meritDotsBlock();
    expect(block).toContain('function _wireMeritDots');
    expect(block).toContain('async function _adjustMeritDots');
    expect(block).not.toContain('async function _wirePurchaseState');
    expect(block).not.toContain('function _wireManoeuvreRank');
  });

  it('oxp.6: the fetch moved to _refreshPurchaseState (shared with the manoeuvre section), still no character-scoped query string', () => {
    // Both purchase sections now share ONE fetch of each collection (AC7: the
    // holder decides the split between merits and manoeuvres, so both must see
    // the same balance) — the fetch itself is no longer inside _wireMeritDots.
    const block = refreshPurchaseStateBlock();
    expect(block).toMatch(/apiGet\(['"]\/api\/office_merit_dots['"]\)/);
    // No query parameters of any kind: nothing to smuggle a holder id into.
    expect(block).not.toMatch(/\/api\/office_merit_dots\?/);
    expect(block).not.toMatch(/\bchars?\b/);
    expect(block).not.toMatch(/\bchar\./);
  });

  it('the seat filter happens client-side, off the returned map, inside _wireMeritDots', () => {
    const block = meritDotsBlock();
    expect(block).toMatch(/dotsBySeat\[outcome\.seatId\]/);
  });

  it('oxp.11: writes with the SEAT id in the URL and only merit/dots in the body', () => {
    const block = meritDotsBlock();
    expect(block).toMatch(
      /apiPut\(`\/api\/office_merit_dots\/\$\{encodeURIComponent\(outcome\.seatId\)\}`,\s*\{\s*merit,\s*dots:\s*next\s*\}\)/
    );
  });

  it('never references a character, a character id, or a holder in either function', () => {
    const block = meritDotsBlock();
    // If either function ever grows a `char` parameter or a `char.*` read, the
    // structural guarantee proven by AC1/AC9 above stops being structural.
    expect(block).not.toMatch(/\bchars?\b/);
    expect(block).not.toMatch(/\bchar\./);
    expect(block).not.toMatch(/character_id/);
    expect(block).not.toMatch(/holder/i);
  });

  it('takes the resolved seat, never a character, in either function signature', () => {
    const block = meritDotsBlock();
    // oxp.6: widened to carry `data` (this office's merit list) and
    // `isOwnOffice` (so a post-adjustment refresh can re-derive the shared
    // seat balance) — neither is a character reference.
    expect(block).toMatch(/function _wireMeritDots\(el, outcome, data, dotsBySeat, fetchFailed, balance, isOwnOffice, gen\)/);
    expect(block).toMatch(/async function _adjustMeritDots\(el, outcome, data, isOwnOffice, merit, delta\)/);
  });

  it('oxp.6 Codex review (Low): neither function reads outcome.seat or outcome.allSeats, only outcome.seatId', () => {
    // Codex review, Pass 2: oxp.6's `_wirePurchaseState` widened `outcome` to
    // also carry `seat` (the full seat document, including `holder_id`) and
    // `allSeats` — needed by officeSeatXp, but NOT by these two functions. The
    // pre-existing `/holder/i` ban above already catches a literal `.holder_id`
    // read if one is ever added, but this is the stronger, positive form of the
    // same guarantee: prove the wider `outcome` object's new holder-bearing
    // fields are never touched here at all, not just that the word "holder"
    // never appears.
    const block = meritDotsBlock();
    expect(block).not.toMatch(/outcome\.seat\b/); // seatId is fine; outcome.seat (no suffix) is not
    expect(block).not.toMatch(/outcome\.allSeats/);
  });

  it('oxp.11: a seat\'s holder_id is READ in exactly one place, only to CHOOSE a seat', () => {
    // Deliberately `\bs\.holder_id` — a real property read off a seat object —
    // rather than the bare word, which also appears in the comments that
    // explain the dependency. Prose about it is not a use of it.
    //
    // oxp.7 (AC2) moved this read out of office-tab.js entirely, into the new
    // shared resolveHeldSeat(char, seats) in office-seat-resolve.js - the SAME
    // guarantee this test always proved (holder_id read in exactly one place,
    // only to choose a seat), now stronger: office-tab.js doesn't read it at
    // all any more, only the one shared resolver does.
    const READ = /\bs\.holder_id\b/g;
    const officeTabSrc = readFile('public/js/tabs/office-tab.js');
    expect([...officeTabSrc.matchAll(READ)].length).toBe(0);

    const resolverSrc = readFile('public/js/data/office-seat-resolve.js');
    const inResolver = [...resolverSrc.matchAll(READ)].length;
    // Two matches, both on the single find() line (a null-guard, then the
    // real comparison) - one real place, not two. The dependency is real,
    // not denied.
    expect(inResolver).toBe(2);
  });

  it('oxp.11: seat resolution reduces the holder match to a seat id before anything else sees it', () => {
    // oxp.7 (AC2) extracted the holder_id comparison itself into a shared
    // resolveHeldSeat(char, seats), which office-tab.js's _wirePurchaseState
    // now calls rather than comparing inline - proving the SAME guarantee
    // this test always asserted, just from its new shared location, so it
    // isn't duplicated a second time inside office-tab.js's own block.
    const sharedResolver = readFile('public/js/data/office-seat-resolve.js');
    expect(sharedResolver).toMatch(/String\(s\.holder_id\)\s*===\s*String\(char\._id\)/);

    const block = seatResolutionBlock();
    expect(block).toMatch(/resolveHeldSeat\(char,\s*seats\)/);
    // What leaves this block is a seat id, never the seat, holder, or character.
    expect(block).toMatch(/seatId:\s*String\(seat\._id\)/);
    // Only ever a read of office_seats — this block writes to no API at all.
    expect(block).toMatch(/apiGet\(['"]\/api\/office_seats['"]\)/);
    expect(block).not.toMatch(/apiPut|apiPost/);
  });
});
