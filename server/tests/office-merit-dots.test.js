/**
 * office-merit-dots — minimal ST-editable purchase-state tracking for office
 * merits (e.g. the Enforcer/"Protector" office's Safe Place, Retainer
 * (Hound), Trained Observer suite).
 *
 * Deliberately NOT Epic OXP (still backlog): no accrual, no XP spend, no
 * approval-queue routing, no handover reset logic. Just "what dots does
 * this office's merit suite show right now", settable directly by an ST —
 * scoped this way ahead of Saturday's game per Angelus's explicit call.
 *
 * oxp.11 (2026-08-13) RE-KEYED this collection. A document is now keyed by the
 * SEAT the purchase belongs to (`_id` is that seat's own `office_seats._id` as
 * a 24-hex string), not by the office category. Every URL and every stored-key
 * assertion in this suite moved with it. The route resolves the seat first, so
 * two failure modes are new: a malformed seat id (400) and a well-formed id
 * with no seat behind it (404). The category is still what merit names and
 * caps are validated against, but it is now DERIVED from the resolved seat
 * rather than taken from the URL.
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
const SEAT_ENFORCER      = seatId(11);
const SEAT_SOCIALITE     = seatId(12);
const SEAT_ADMINISTRATOR = seatId(13);
const SEAT_IDS = [SEAT_ENFORCER, SEAT_SOCIALITE, SEAT_ADMINISTRATOR];

// A well-formed 24-hex id that deliberately matches no seat document.
const SEAT_ABSENT = '0f11000000000000000000ff';

const SEAT_FIXTURES = [
  { _id: SEAT_ENFORCER,      office_category: 'Enforcer',      holder_id: null, created_at: '2026-02-21', seat_label: null, notes: null },
  { _id: SEAT_SOCIALITE,     office_category: 'Socialite',     holder_id: null, created_at: '2026-02-21', seat_label: null, notes: null },
  // Administrator has no OFFICE_DATA entry yet (oxp.8), so a seat pointing at
  // it must still be rejected — the same 400 the category-keyed route gave.
  { _id: SEAT_ADMINISTRATOR, office_category: 'Administrator', holder_id: null, created_at: '2026-06-20', seat_label: null, notes: null },
];

let app;

beforeAll(async () => {
  if (!dbAvailable) return;
  await setupDb();
  app = createTestApp();
});

beforeEach(async () => {
  if (!dbAvailable) return;
  await getCollection('office_merit_dots').deleteMany({});
  await getCollection('office_seats').deleteMany({ _id: { $in: SEAT_IDS } });
  await getCollection('office_seats').insertMany(SEAT_FIXTURES.map(s => ({ ...s })));
});

afterAll(async () => {
  if (!dbAvailable) return;
  await getCollection('office_merit_dots').deleteMany({});
  await getCollection('office_seats').deleteMany({ _id: { $in: SEAT_IDS } });
  await teardownDb();
});

const ENFORCER = String(SEAT_ENFORCER);
const SOCIALITE = String(SEAT_SOCIALITE);
const ADMINISTRATOR = String(SEAT_ADMINISTRATOR);

describe.skipIf(!dbAvailable)('office-merit-dots — GET /api/office_merit_dots', () => {
  it('returns {} when nothing has ever been set', async () => {
    const res = await request(app).get('/api/office_merit_dots').set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });

  it('oxp.11: reflects a prior PUT, keyed by SEAT id then merit name', async () => {
    await request(app).put(`/api/office_merit_dots/${ENFORCER}`).set('X-Test-User', stUser())
      .send({ merit: 'Safe Place', dots: 2 });

    const res = await request(app).get('/api/office_merit_dots').set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(res.body[ENFORCER]['Safe Place']).toBe(2);
    // The office category is never the key any more.
    expect(res.body).not.toHaveProperty('Enforcer');
  });

  it('oxp.11: the value shape is byte-identical to the category-keyed era — only the key changed', async () => {
    await request(app).put(`/api/office_merit_dots/${ENFORCER}`).set('X-Test-User', stUser())
      .send({ merit: 'Safe Place', dots: 2 });
    await request(app).put(`/api/office_merit_dots/${ENFORCER}`).set('X-Test-User', stUser())
      .send({ merit: 'Trained Observer', dots: 1 });

    const res = await request(app).get('/api/office_merit_dots').set('X-Test-User', stUser());
    expect(res.body).toEqual({ [ENFORCER]: { 'Safe Place': 2, 'Trained Observer': 1 } });
  });

  it('a seat with no document is simply absent — the client still treats missing as 0', async () => {
    await request(app).put(`/api/office_merit_dots/${ENFORCER}`).set('X-Test-User', stUser())
      .send({ merit: 'Safe Place', dots: 2 });

    const res = await request(app).get('/api/office_merit_dots').set('X-Test-User', stUser());
    expect(res.body).not.toHaveProperty(SOCIALITE);
  });

  it('is readable by a player, not just an ST (reference info, not a secret)', async () => {
    const res = await request(app).get('/api/office_merit_dots')
      .set('X-Test-User', playerUser(['000000000000000000000001']));
    expect(res.status).toBe(200);
  });
});

describe.skipIf(!dbAvailable)('office-merit-dots — PUT /api/office_merit_dots/:seatId', () => {
  it('ST can set a merit\'s dots', async () => {
    const res = await request(app).put(`/api/office_merit_dots/${ENFORCER}`).set('X-Test-User', stUser())
      .send({ merit: 'Trained Observer', dots: 3 });
    expect(res.status).toBe(200);
    expect(res.body.dots['Trained Observer']).toBe(3);

    const stored = await getCollection('office_merit_dots').findOne({ _id: ENFORCER });
    expect(stored.dots['Trained Observer']).toBe(3);
  });

  it('oxp.11 AC1: the write denormalises office_category from the resolved seat, on every write', async () => {
    await request(app).put(`/api/office_merit_dots/${ENFORCER}`).set('X-Test-User', stUser())
      .send({ merit: 'Safe Place', dots: 1 });
    let stored = await getCollection('office_merit_dots').findOne({ _id: ENFORCER });
    expect(stored.office_category).toBe('Enforcer');

    // Self-healing: corrupt the denormalised copy and a later write repairs it,
    // because the seat is authoritative and the category is never trusted.
    await getCollection('office_merit_dots').updateOne(
      { _id: ENFORCER }, { $set: { office_category: 'Socialite' } });
    await request(app).put(`/api/office_merit_dots/${ENFORCER}`).set('X-Test-User', stUser())
      .send({ merit: 'Safe Place', dots: 2 });
    stored = await getCollection('office_merit_dots').findOne({ _id: ENFORCER });
    expect(stored.office_category).toBe('Enforcer');
  });

  it('a second PUT for a different merit on the same seat does not clobber the first', async () => {
    await request(app).put(`/api/office_merit_dots/${ENFORCER}`).set('X-Test-User', stUser())
      .send({ merit: 'Safe Place', dots: 4 });
    await request(app).put(`/api/office_merit_dots/${ENFORCER}`).set('X-Test-User', stUser())
      .send({ merit: 'Trained Observer', dots: 1 });

    const stored = await getCollection('office_merit_dots').findOne({ _id: ENFORCER });
    expect(stored.dots['Safe Place']).toBe(4);
    expect(stored.dots['Trained Observer']).toBe(1);
  });

  it('rejects a player (403)', async () => {
    const res = await request(app).put(`/api/office_merit_dots/${ENFORCER}`)
      .set('X-Test-User', playerUser(['000000000000000000000001']))
      .send({ merit: 'Safe Place', dots: 2 });
    expect(res.status).toBe(403);
  });

  it('oxp.11 AC2: rejects a malformed seat id (400) — an office category name is now malformed', async () => {
    for (const bad of ['Enforcer', 'NotAnOffice', 'zzzz', '0f11', `${ENFORCER}0`]) {
      const res = await request(app).put(`/api/office_merit_dots/${encodeURIComponent(bad)}`)
        .set('X-Test-User', stUser()).send({ merit: 'Safe Place', dots: 2 });
      expect(res.status, `seat id '${bad}' should be a 400`).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    }
  });

  it('oxp.11 AC2: rejects a well-formed seat id with no seat behind it (404)', async () => {
    const res = await request(app).put(`/api/office_merit_dots/${SEAT_ABSENT}`).set('X-Test-User', stUser())
      .send({ merit: 'Safe Place', dots: 2 });
    expect(res.status).toBe(404);
  });

  it('oxp.11 AC2: the seat is resolved BEFORE the body is validated — a bad seat id beats a bad merit', async () => {
    // Otherwise a caller could not tell which of the two was actually wrong.
    const res = await request(app).put(`/api/office_merit_dots/${SEAT_ABSENT}`).set('X-Test-User', stUser())
      .send({ merit: 'Not A Merit', dots: 99 });
    expect(res.status).toBe(404);
  });

  it('oxp.11 AC2: rejects a seat whose category has no OFFICE_DATA entry (400) — Administrator, until oxp.8', async () => {
    const res = await request(app).put(`/api/office_merit_dots/${ADMINISTRATOR}`).set('X-Test-User', stUser())
      .send({ merit: 'Safe Place', dots: 2 });
    expect(res.status).toBe(400);
  });

  it('rejects a merit that does not belong to the resolved seat\'s office', async () => {
    // "Safe Place" is Enforcer's, not Socialite's.
    const res = await request(app).put(`/api/office_merit_dots/${SOCIALITE}`).set('X-Test-User', stUser())
      .send({ merit: 'Safe Place', dots: 2 });
    expect(res.status).toBe(400);
  });

  it('enforces the three-dot cap on Trained Observer', async () => {
    const res = await request(app).put(`/api/office_merit_dots/${ENFORCER}`).set('X-Test-User', stUser())
      .send({ merit: 'Trained Observer', dots: 4 });
    expect(res.status).toBe(400);
  });

  it('enforces the five-dot cap on an ordinary merit', async () => {
    const res = await request(app).put(`/api/office_merit_dots/${ENFORCER}`).set('X-Test-User', stUser())
      .send({ merit: 'Safe Place', dots: 6 });
    expect(res.status).toBe(400);
  });

  it('rejects a negative value', async () => {
    const res = await request(app).put(`/api/office_merit_dots/${ENFORCER}`).set('X-Test-User', stUser())
      .send({ merit: 'Safe Place', dots: -1 });
    expect(res.status).toBe(400);
  });

  it('rejects a non-integer value', async () => {
    const res = await request(app).put(`/api/office_merit_dots/${ENFORCER}`).set('X-Test-User', stUser())
      .send({ merit: 'Safe Place', dots: 2.5 });
    expect(res.status).toBe(400);
  });

  it('Codex review, DBO-4 (Medium): rejects malformed dots rather than silently coercing to 0', async () => {
    // Bare Number() turns null/false/''/[] into a valid-looking 0, which
    // would silently accept malformed input as "clear this merit to zero"
    // instead of rejecting it — the same class office-manoeuvre-rank.js's PUT
    // routes already guard against.
    for (const bad of [null, false, '', '   ', []]) {
      const res = await request(app).put(`/api/office_merit_dots/${ENFORCER}`).set('X-Test-User', stUser())
        .send({ merit: 'Safe Place', dots: bad });
      expect(res.status, `dots ${JSON.stringify(bad)} should be a 400`).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    }
    // Confirm nothing was written for any of the rejected calls.
    const stored = await getCollection('office_merit_dots').findOne({ _id: ENFORCER });
    expect(stored).toBeNull();
  });

  it('still accepts a numeric string, same as before', async () => {
    const res = await request(app).put(`/api/office_merit_dots/${ENFORCER}`).set('X-Test-User', stUser())
      .send({ merit: 'Safe Place', dots: '3' });
    expect(res.status).toBe(200);
    expect(res.body.dots['Safe Place']).toBe(3);
  });

  it('allows setting a merit back down to 0', async () => {
    await request(app).put(`/api/office_merit_dots/${ENFORCER}`).set('X-Test-User', stUser())
      .send({ merit: 'Safe Place', dots: 3 });
    const res = await request(app).put(`/api/office_merit_dots/${ENFORCER}`).set('X-Test-User', stUser())
      .send({ merit: 'Safe Place', dots: 0 });
    expect(res.status).toBe(200);
    expect(res.body.dots['Safe Place']).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Client wiring — office-tab.js's merit-dot rendering (static-analysis, no
// browser harness in this repo — see issue-873-ecm-6-admin-sidebar.test.js)
// ─────────────────────────────────────────────────────────────────────────────

describe('office-merit-dots — office-tab.js client wiring', () => {
  it('oxp.11: fetches GET /api/office_merit_dots and PUTs to a SEAT id via apiPut', () => {
    const src = readFile('public/js/tabs/office-tab.js');
    expect(src).toMatch(/apiGet\(['"]\/api\/office_merit_dots['"]\)/);
    expect(src).toMatch(/apiPut\(`\/api\/office_merit_dots\/\$\{encodeURIComponent\(outcome\.seatId\)\}`/);
    // The office category is no longer part of the write URL at all.
    expect(src).not.toMatch(/office_merit_dots\/\$\{encodeURIComponent\(category\)\}/);
  });

  it('oxp.11 AC5: office_seats is fetched ONCE per render pass, not once per wiring function', () => {
    const src = readFile('public/js/tabs/office-tab.js');
    const fetches = [...src.matchAll(/apiGet\(['"]\/api\/office_seats['"]\)/g)];
    expect(fetches).toHaveLength(1);
    // And that one fetch lives in the shared entry point, which then drives
    // both wiring functions with the seat it resolved.
    expect(src).toMatch(/async function _wirePurchaseState/);
  });

  it('gates the +/- stepper controls on ST/dev role', () => {
    const src = readFile('public/js/tabs/office-tab.js');
    expect(src).toMatch(/getRole\(\)\s*===\s*['"]st['"]\s*\|\|\s*getRole\(\)\s*===\s*['"]dev['"]/);
  });

  it('reuses existing component classes (cs-step-btn, office-merit-chip) — no inline style attributes', () => {
    const src = readFile('public/js/tabs/office-tab.js');
    expect(src).toMatch(/cs-step-btn/);
    expect(src).toMatch(/office-merit-chip/);
    expect(src).not.toMatch(/style="/);
  });

  it('imports MERIT_DOT_CAPS from office-data.js and applies per-merit caps client-side too', () => {
    const src = readFile('public/js/tabs/office-tab.js');
    expect(src).toMatch(/import\s*\{\s*OFFICE_DATA,\s*MERIT_DOT_CAPS\s*\}\s*from\s*['"]\.\/office-data\.js['"]/);
  });

  it('MERIT_DOT_CAPS caps Trained Observer and Cacophony Savvy at 3, everything else at 5', () => {
    const src = readFile('public/js/tabs/office-data.js');
    expect(src).toMatch(/'Trained Observer':\s*3/);
    expect(src).toMatch(/'Cacophony Savvy':\s*3/);
    expect(src).toMatch(/'Safe Place':\s*5/);
  });
});
