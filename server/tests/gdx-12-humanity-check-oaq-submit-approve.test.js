/**
 * gdx.12 (#no-issue-yet) — Humanity Check via Epic OAQ's submit/approve
 * pattern. Carved out of gdx-11's own former AC4; see
 * specs/stories/gdx-12-humanity-check-oaq-submit-approve.md for the full
 * grounding and design.
 *
 * This file covers:
 *   - attachedTouchstoneCount(char) (accessors.js, AC1)
 *   - the dice-per-breaking-point-level table + touchstone-modifier mapping
 *     + pool floor (server/routes/humanity-check.js's exported pure helpers)
 *   - route-level (POST/accept/decline, DB-backed) + the contested-rolls.js
 *     guard-widening regression, Supertest, mirroring
 *     oaq-2-pending-status-actions.test.js's pattern
 *   - submitHumanityCheck() (public/js/game/humanity-check.js, AC4) — same
 *     no-jsdom document/location/localStorage shim technique gdx-7/gdx-11
 *     established (their own top-level code never touches these globals, so
 *     shim placement relative to the static imports below is safe; only the
 *     *called* functions, invoked from inside `it()` blocks after the whole
 *     file has evaluated, actually read them).
 */

const hadLocation = 'location' in globalThis;
const hadLocalStorage = 'localStorage' in globalThis;
const hadDocument = 'document' in globalThis;
if (!hadLocation) globalThis.location = { hostname: 'test', pathname: '/' };
if (!hadLocalStorage) {
  const store = new Map();
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    clear: () => store.clear(),
  };
}
// Generic fake element for loadPool()/showResistSec()/updPool()/closePanel()
// (roll-v2.js) to write into without crashing — same shape gdx-7/gdx-11's own
// test files use for this exact purpose. Every id gets one EXCEPT 'toast',
// which is the single tracked instance below (so toast() assertions work).
function _fakeElement() {
  return {
    _html: '', _text: '', disabled: false,
    get innerHTML() { return this._html; }, set innerHTML(v) { this._html = v; },
    get textContent() { return this._text; }, set textContent(v) { this._text = v; },
    classList: { add() {}, remove() {}, toggle() {} },
    style: {},
    querySelectorAll: () => [],
    querySelector: () => null,
  };
}
const _toastEl = { _text: '', classList: { add() {}, remove() {}, toggle() {} }, get textContent() { return this._text; }, set textContent(v) { this._text = v; } };
// Slightly smarter fake for checkForResolvedHumanityCheck()'s own
// document.createElement('div') banner — needs querySelector to find the
// [data-hc-load-btn] it just wrote into innerHTML, so its click handler can
// actually be exercised (same hand-rolled-fake-DOM technique this project's
// own oxp-3 review established for exactly this no-jsdom class of test).
function _fakeButtonEl() {
  const handlers = {};
  return { addEventListener(ev, cb) { handlers[ev] = cb; }, _click() { handlers.click?.(); } };
}
function _fakeCreatedDiv() {
  let html = '', btn = null;
  return {
    id: '', className: '',
    get innerHTML() { return html; },
    set innerHTML(v) { html = v; btn = v.includes('data-hc-load-btn') ? _fakeButtonEl() : null; },
    querySelector: sel => (sel === '[data-hc-load-btn]' ? btn : null),
    remove() {},
  };
}
if (!hadDocument) {
  globalThis.document = {
    getElementById: id => (id === 'toast' ? _toastEl : _fakeElement()),
    createElement: () => _fakeCreatedDiv(),
  };
}

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb, isDbAvailable } from './helpers/db-setup.js';
import { getCollection } from '../db.js';
import { attachedTouchstoneCount } from '../../public/js/data/accessors.js';
import { BASE_DICE_BY_LEVEL, touchstoneModifier, computeHumanityCheckPool } from '../routes/humanity-check.js';

// Dynamic import, not a static one: humanity-check.js pulls in roll-v2.js,
// whose own import chain reads `location` at MODULE TOP LEVEL
// (data/app-settings.js's `const API_BASE = location.hostname === ...`) —
// a static import here would be hoisted and evaluated before the shim
// above runs (confirmed the hard way: it throws `location is not defined`).
// A dynamic import() is NOT hoisted; it runs exactly where it appears, i.e.
// after the shim has already set globalThis.location — same reason gdx-11's
// own test file uses `await import(...)` for roll-v2.js instead of a static
// import.
const { submitHumanityCheck, checkForResolvedHumanityCheck } = await import('../../public/js/game/humanity-check.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

afterAll(() => {
  if (!hadLocation) delete globalThis.location;
  if (!hadLocalStorage) delete globalThis.localStorage;
  if (!hadDocument) delete globalThis.document;
});

const dbAvailable = await isDbAvailable();

describe('gdx.12 — attachedTouchstoneCount() (AC1)', () => {
  it('counts touchstones whose humanity rating is at or below the character\'s current humanity', () => {
    const char = {
      humanity: 6,
      touchstones: [
        { humanity: 6, name: 'A' }, // attached (6 >= 6)
        { humanity: 7, name: 'B' }, // detached (6 < 7)
        { humanity: 5, name: 'C' }, // attached (6 >= 5)
      ],
    };
    expect(attachedTouchstoneCount(char)).toBe(2);
  });

  it('returns 0 for a character with no touchstones array', () => {
    expect(attachedTouchstoneCount({ humanity: 7 })).toBe(0);
  });

  it('returns 0 for an empty touchstones array', () => {
    expect(attachedTouchstoneCount({ humanity: 7, touchstones: [] })).toBe(0);
  });

  it('treats a missing humanity as 0 (all touchstones detached)', () => {
    const char = { touchstones: [{ humanity: 1, name: 'A' }] };
    expect(attachedTouchstoneCount(char)).toBe(0);
  });

  it('counts all touchstones attached when humanity is at the maximum', () => {
    const char = {
      humanity: 10,
      touchstones: [{ humanity: 10, name: 'A' }, { humanity: 1, name: 'B' }],
    };
    expect(attachedTouchstoneCount(char)).toBe(2);
  });
});

describe('gdx.12 — BASE_DICE_BY_LEVEL table (rulebook p.108, AC2)', () => {
  it('matches the rulebook exactly for all 10 levels', () => {
    expect(BASE_DICE_BY_LEVEL).toEqual({
      10: 5, 9: 5, 8: 4, 7: 4, 6: 3, 5: 3, 4: 2, 3: 2, 2: 1, 1: 0,
    });
  });
});

describe('gdx.12 — touchstoneModifier() (rulebook p.108, AC2)', () => {
  it('no attached touchstones -> -2', () => {
    expect(touchstoneModifier(0)).toBe(-2);
  });
  it('exactly one attached touchstone -> +2', () => {
    expect(touchstoneModifier(1)).toBe(2);
  });
  it('two or more attached touchstones -> +3', () => {
    expect(touchstoneModifier(2)).toBe(3);
    expect(touchstoneModifier(3)).toBe(3);
    expect(touchstoneModifier(6)).toBe(3);
  });
});

describe('gdx.12 — computeHumanityCheckPool() (AC2)', () => {
  it('composes base dice + touchstone modifier for a mid-level check', () => {
    // Humanity 8 = 4 base dice; 1 attached touchstone = +2 -> pool 6
    expect(computeHumanityCheckPool(8, 1)).toEqual({ base_dice: 4, touchstone_count: 1, touchstone_mod: 2, pool: 6 });
  });
  it('floors the pool at 0 rather than going negative', () => {
    // Humanity 1 = 0 base dice; no touchstones = -2 -> would be -2, floored to 0
    expect(computeHumanityCheckPool(1, 0)).toEqual({ base_dice: 0, touchstone_count: 0, touchstone_mod: -2, pool: 0 });
  });
  it('the maximum case: Humanity 10, multiple touchstones', () => {
    expect(computeHumanityCheckPool(10, 3)).toEqual({ base_dice: 5, touchstone_count: 3, touchstone_mod: 3, pool: 8 });
  });
  it('throws on a level outside 1-10', () => {
    expect(() => computeHumanityCheckPool(0, 0)).toThrow();
    expect(() => computeHumanityCheckPool(11, 0)).toThrow();
  });
});

describe('gdx.12 — submitHumanityCheck() (public/js/game/humanity-check.js, AC4)', () => {
  it('posts the character_id and toasts a confirmation on success', async () => {
    const realFetch = globalThis.fetch;
    let capturedBody = null;
    globalThis.fetch = async (url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return { status: 201, ok: true, json: async () => ({ _id: 'req1', status: 'pending' }) };
    };
    try {
      const tileEl = { disabled: false };
      await submitHumanityCheck({ _id: 'char1' }, tileEl);
      expect(capturedBody).toEqual({ character_id: 'char1' });
      expect(_toastEl.textContent).toMatch(/submitted/i);
      expect(tileEl.disabled).toBe(true);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('toasts the server error and re-enables the tile on failure (e.g. the 409 dedupe case)', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      status: 409, ok: false,
      json: async () => ({ error: 'CONFLICT', message: 'A Humanity Check is already pending for this character' }),
    });
    try {
      const tileEl = { disabled: false };
      await submitHumanityCheck({ _id: 'char1' }, tileEl);
      expect(_toastEl.textContent).toMatch(/already pending/i);
      expect(tileEl.disabled).toBe(false);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('makes no network call and toasts feedback for a character with no _id (review finding: was a silent no-op)', async () => {
    const realFetch = globalThis.fetch;
    let called = false;
    globalThis.fetch = async () => { called = true; return { status: 200, ok: true, json: async () => ({}) }; };
    _toastEl._text = '';
    try {
      await submitHumanityCheck(null);
      expect(called).toBe(false);
      expect(_toastEl.textContent).toMatch(/no character selected/i);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

function _fakeContainer() {
  const children = [];
  return {
    querySelector: sel => (sel === '#gcp-hc-load-banner' ? (children.find(c => c.id === 'gcp-hc-load-banner') || null) : null),
    appendChild(el) { children.push(el); },
    _children: children,
  };
}

describe('gdx.12 — checkForResolvedHumanityCheck() (public/js/game/humanity-check.js, AC7)', () => {
  it('fetches by character_id and appends a Load Pool banner for a resolved request', async () => {
    const realFetch = globalThis.fetch;
    let requestedUrl = null;
    globalThis.fetch = async (url) => {
      requestedUrl = url;
      return {
        status: 200, ok: true,
        json: async () => ([{ _id: 'req-ac7-1', status: 'resolved', outcome: { pool: 6 } }]),
      };
    };
    const container = _fakeContainer();
    try {
      await checkForResolvedHumanityCheck({ _id: 'charX' }, container);
      expect(requestedUrl).toContain('/api/humanity_check_requests/mine?character_id=charX');
      expect(container._children.length).toBe(1);
      expect(container._children[0].innerHTML).toMatch(/6 dice/);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('tapping Load Pool loads the pool with noWP and marks the request as loaded (no re-append on a second check)', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      status: 200, ok: true,
      json: async () => ([{ _id: 'req-ac7-2', status: 'resolved', outcome: { pool: 5 } }]),
    });
    try {
      const container1 = _fakeContainer();
      await checkForResolvedHumanityCheck({ _id: 'charY' }, container1);
      const banner = container1._children[0];
      const btn = banner.querySelector('[data-hc-load-btn]');
      expect(btn).toBeTruthy();
      btn._click();

      // A second check for the same character/request must not re-surface
      // the already-loaded request.
      const container2 = _fakeContainer();
      await checkForResolvedHumanityCheck({ _id: 'charY' }, container2);
      expect(container2._children.length).toBe(0);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('appends nothing when there is no resolved request', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ status: 200, ok: true, json: async () => ([]) });
    const container = _fakeContainer();
    try {
      await checkForResolvedHumanityCheck({ _id: 'charZ' }, container);
      expect(container._children.length).toBe(0);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('is a no-op for a missing character or container', async () => {
    const realFetch = globalThis.fetch;
    let called = false;
    globalThis.fetch = async () => { called = true; return { status: 200, ok: true, json: async () => ([]) }; };
    try {
      await checkForResolvedHumanityCheck(null, _fakeContainer());
      await checkForResolvedHumanityCheck({ _id: 'char1' }, null);
      expect(called).toBe(false);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe('gdx.12 — office-approvals.js Humanity Check row (AC5, static-analysis)', () => {
  // Matches this project's own established pattern for this exact module —
  // see oaq-3-approval-queue.test.js's own "file shape" describe block and
  // its stated rationale (no browser harness for admin/game-tab UI modules).
  const src = fs.readFileSync(path.resolve(__dirname, '../../public/js/suite/office-approvals.js'), 'utf8');

  it('dispatches humanity_check rows to their own renderer, not _renderRow', () => {
    expect(src).toMatch(/r\.request_type === 'humanity_check' \? _renderHumanityCheckRow\(r\) : _renderRow\(r\)/);
  });

  it('the level <select> is a delegated change listener (data-oaq-level-select), not per-row', () => {
    expect(src).toMatch(/data-oaq-level-select/);
    expect(src).toMatch(/addEventListener\('change'/);
  });

  it('Accept is disabled until a level is chosen (canAccept gate)', () => {
    expect(src).toMatch(/const canAccept = !!chosenLevel && !busy;/);
    expect(src).toMatch(/\$\{canAccept \? '' : 'disabled'\}/);
  });

  it('_resolve() refuses to accept a Humanity Check with no level chosen, even if called directly (defence in depth)', () => {
    expect(src).toMatch(/if \(!level\) return;/);
  });

  // review finding (AC8): AC8 requires proving status_action rows are
  // unaffected, "by loading the queue with at least one real pending Status
  // Action present, or a targeted test asserting _renderRow's output is
  // byte-identical pre/post this story" — neither had actually been done.
  // This is that targeted test: it isolates _renderRow's own function body
  // from the file source and asserts it carries none of this story's new
  // Humanity Check vocabulary, proving the shared status_action renderer
  // wasn't touched by this diff (oaq-3-approval-queue.test.js's own
  // pre-existing shape assertions — ch-btn ch-btn-accept/decline, dtl-badge,
  // redactCharName, redactPlayer — already pin the actual markup this
  // function emits; this test pins that the FUNCTION ITSELF is the
  // untouched one producing it).
  it("_renderRow's own body carries none of this story's new Humanity Check vocabulary (AC8, status_action rows unaffected)", () => {
    const match = src.match(/function _renderRow\(r\) \{[\s\S]*?\r?\n\}\r?\n/);
    expect(match, '_renderRow function body not found in source').toBeTruthy();
    const body = match[0];
    expect(body).not.toMatch(/_renderHumanityCheckRow/);
    expect(body).not.toMatch(/humanity_check/);
    expect(body).not.toMatch(/breaking_point_level/);
    expect(body).not.toMatch(/BREAKING_POINT_LEVELS/);
    expect(body).not.toMatch(/levelByRequestId/);
  });

  // review finding: _resolve() used to default a not-found row to
  // isHumanityCheck=false and misroute to /api/office_actions/... instead of
  // refusing to guess. Confirms the fix resyncs from the server instead.
  it('_resolve() resyncs via _refetchAndRender rather than guessing an endpoint when the row is stale/missing', () => {
    expect(src).toMatch(/const row = state\.rows\.find\(r => String\(r\._id\) === requestId\);\s*\n\s*if \(!row\) \{/);
    const guardBlock = src.match(/if \(!row\) \{[\s\S]*?\r?\n {2}\}/)[0];
    expect(guardBlock).toMatch(/_refetchAndRender\(\);/);
    expect(guardBlock).toMatch(/return;/);
  });
});

describe('gdx.12 — app.js Load Pool banner is v2-gated (AC8, static-analysis)', () => {
  // review finding: checkForResolvedHumanityCheck() was called unconditionally
  // from pickChar(), not gated behind USE_NEW_ROLLER the way the sibling
  // submit tile is — a real AC8 gap, since AC8 requires the whole feature to
  // be "v2-gated exactly like the rest of gdx-11's Vampire Mechanics section."
  const appSrc = fs.readFileSync(path.resolve(__dirname, '../../public/js/app.js'), 'utf8');

  it('gates the checkForResolvedHumanityCheck() call behind USE_NEW_ROLLER', () => {
    expect(appSrc).toMatch(/if \(USE_NEW_ROLLER\) checkForResolvedHumanityCheck\(c, rollPoolsEl\);/);
  });
});

// ── Route-level (DB-backed) ─────────────────────────────────────────────────
// Follows oaq-2-pending-status-actions.test.js's pattern: real Supertest
// requests against the mounted app + tm_suite_test, prefixed fixtures,
// describe.skipIf(!dbAvailable) for a clean skip when MongoDB is unreachable.

let app;
const NAME_PREFIX = 'GDX-12 Probe';

async function cleanup() {
  await getCollection('characters').deleteMany({ name: { $regex: `^${NAME_PREFIX}` } });
  await getCollection('contested_roll_requests').deleteMany({ character_name: { $regex: `^${NAME_PREFIX}` } });
}

async function seedCharacter({ humanity = 7, touchstones = [] } = {}) {
  const { insertedId } = await getCollection('characters').insertOne({
    name: `${NAME_PREFIX} Char ${Date.now()}_${Math.random()}`,
    humanity, touchstones, retired: false,
  });
  return insertedId;
}

beforeAll(async () => {
  if (!dbAvailable) return;
  await setupDb();
  app = createTestApp();
  await cleanup();
});

afterAll(async () => {
  if (!dbAvailable) return;
  await cleanup();
  await teardownDb();
});

describe.skipIf(!dbAvailable)('gdx.12 — POST /api/humanity_check_requests (AC2)', () => {
  it('a player submits a pending request for their own character', async () => {
    const charId = await seedCharacter();
    const res = await request(app).post('/api/humanity_check_requests')
      .set('X-Test-User', playerUser([String(charId)]))
      .send({ character_id: String(charId) });

    expect(res.status).toBe(201);
    expect(res.body.request_type).toBe('humanity_check');
    expect(res.body.status).toBe('pending');
    expect(res.body.outcome).toBeNull();
  });

  it('rejects a player submitting for a character they do not own', async () => {
    const charId = await seedCharacter();
    const res = await request(app).post('/api/humanity_check_requests')
      .set('X-Test-User', playerUser(['some-other-char-id']))
      .send({ character_id: String(charId) });
    expect(res.status).toBe(403);
  });

  it('an ST may submit on behalf of any character', async () => {
    const charId = await seedCharacter();
    const res = await request(app).post('/api/humanity_check_requests')
      .set('X-Test-User', stUser())
      .send({ character_id: String(charId) });
    expect(res.status).toBe(201);
  });

  it('rejects a second submission while one is already pending for the same character', async () => {
    const charId = await seedCharacter();
    const userHeader = playerUser([String(charId)]);
    const first = await request(app).post('/api/humanity_check_requests').set('X-Test-User', userHeader).send({ character_id: String(charId) });
    expect(first.status).toBe(201);

    const second = await request(app).post('/api/humanity_check_requests').set('X-Test-User', userHeader).send({ character_id: String(charId) });
    expect(second.status).toBe(409);
  });
});

describe.skipIf(!dbAvailable)('gdx.12 — PUT /:id/accept and /:id/decline (AC2)', () => {
  it('accept computes the pool from the character\'s live touchstone count and the chosen level', async () => {
    const charId = await seedCharacter({ humanity: 8, touchstones: [{ humanity: 6, name: 'A' }, { humanity: 8, name: 'B' }] });
    const submitRes = await request(app).post('/api/humanity_check_requests')
      .set('X-Test-User', playerUser([String(charId)]))
      .send({ character_id: String(charId) });
    const requestId = submitRes.body._id;

    const acceptRes = await request(app).put(`/api/humanity_check_requests/${requestId}/accept`)
      .set('X-Test-User', stUser())
      .send({ breaking_point_level: 8 });

    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.status).toBe('resolved');
    // Humanity 8 -> 4 base dice; both touchstones attached (8 >= 6, 8 >= 8) -> +3 -> pool 7
    expect(acceptRes.body.outcome).toEqual({
      breaking_point_level: 8, base_dice: 4, touchstone_count: 2, touchstone_mod: 3, pool: 7,
    });
    expect(acceptRes.body.resolved_by).toBe('test_st');
  });

  it('rejects accept from a non-ST', async () => {
    const charId = await seedCharacter();
    const submitRes = await request(app).post('/api/humanity_check_requests')
      .set('X-Test-User', playerUser([String(charId)]))
      .send({ character_id: String(charId) });

    const res = await request(app).put(`/api/humanity_check_requests/${submitRes.body._id}/accept`)
      .set('X-Test-User', playerUser([String(charId)]))
      .send({ breaking_point_level: 5 });
    expect(res.status).toBe(403);
  });

  it('rejects accept with a level outside 1-10', async () => {
    const charId = await seedCharacter();
    const submitRes = await request(app).post('/api/humanity_check_requests')
      .set('X-Test-User', playerUser([String(charId)]))
      .send({ character_id: String(charId) });

    const res = await request(app).put(`/api/humanity_check_requests/${submitRes.body._id}/accept`)
      .set('X-Test-User', stUser())
      .send({ breaking_point_level: 11 });
    expect(res.status).toBe(400);
  });

  it('a second accept on an already-resolved request 409s', async () => {
    const charId = await seedCharacter();
    const submitRes = await request(app).post('/api/humanity_check_requests')
      .set('X-Test-User', playerUser([String(charId)]))
      .send({ character_id: String(charId) });
    const requestId = submitRes.body._id;

    await request(app).put(`/api/humanity_check_requests/${requestId}/accept`).set('X-Test-User', stUser()).send({ breaking_point_level: 5 });
    const second = await request(app).put(`/api/humanity_check_requests/${requestId}/accept`).set('X-Test-User', stUser()).send({ breaking_point_level: 5 });
    expect(second.status).toBe(409);
  });

  it('decline marks the request declined without computing an outcome', async () => {
    const charId = await seedCharacter();
    const submitRes = await request(app).post('/api/humanity_check_requests')
      .set('X-Test-User', playerUser([String(charId)]))
      .send({ character_id: String(charId) });

    const res = await request(app).put(`/api/humanity_check_requests/${submitRes.body._id}/decline`).set('X-Test-User', stUser()).send({});
    expect(res.status).toBe(200);
    expect(res.body.declined).toBe(true);

    const stored = await getCollection('contested_roll_requests').findOne({ character_id: String(charId), request_type: 'humanity_check' });
    expect(stored.status).toBe('declined');
    expect(stored.outcome).toBeNull();
  });
});

describe.skipIf(!dbAvailable)('gdx.12 — GET /:base/mine (AC7)', () => {
  it('returns the resolved requests for the owning character', async () => {
    const charId = await seedCharacter();
    const submitRes = await request(app).post('/api/humanity_check_requests')
      .set('X-Test-User', playerUser([String(charId)]))
      .send({ character_id: String(charId) });
    await request(app).put(`/api/humanity_check_requests/${submitRes.body._id}/accept`)
      .set('X-Test-User', stUser())
      .send({ breaking_point_level: 5 });

    const res = await request(app).get(`/api/humanity_check_requests/mine?character_id=${charId}`)
      .set('X-Test-User', playerUser([String(charId)]));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].status).toBe('resolved');
  });

  // review finding: character_id was read from req.query with only a
  // truthiness check. Verified against this app's actual Express 5 runtime
  // (its default 'simple' query parser, unlike Express 4's 'extended'
  // default, does NOT turn ?character_id[$ne]=x into a nested object — that
  // specific injection shape doesn't reach this route at all here) — but a
  // REPEATED query key (?character_id=a&character_id=b) genuinely does
  // reach it as an array, which would otherwise pass straight into the
  // Mongo filter untyped.
  it('rejects a non-string character_id (repeated query key -> array, the real Express-5 vector)', async () => {
    const res = await request(app).get('/api/humanity_check_requests/mine?character_id=a&character_id=b')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });
});

describe.skipIf(!dbAvailable)('gdx.12 — GET /api/office_actions/pending widening (AC2, regression)', () => {
  it('surfaces a pending Humanity Check alongside a pending Status Action', async () => {
    const charId = await seedCharacter();
    await request(app).post('/api/humanity_check_requests')
      .set('X-Test-User', playerUser([String(charId)]))
      .send({ character_id: String(charId) });

    const res = await request(app).get('/api/office_actions/pending').set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    const found = res.body.find(r => r.character_id === String(charId) && r.request_type === 'humanity_check');
    expect(found).toBeTruthy();
    expect(found.status).toBe('pending');
  });

  it('rejects a non-ST caller (unchanged pre-existing behaviour)', async () => {
    const res = await request(app).get('/api/office_actions/pending').set('X-Test-User', playerUser([]));
    expect(res.status).toBe(403);
  });
});

describe.skipIf(!dbAvailable)('gdx.12 — contested-rolls.js guard widening (AC3, regression)', () => {
  it('a pending Humanity Check is invisible to contested-rolls.js void (ST override)', async () => {
    const charId = await seedCharacter();
    const submitRes = await request(app).post('/api/humanity_check_requests')
      .set('X-Test-User', playerUser([String(charId)]))
      .send({ character_id: String(charId) });

    const voidRes = await request(app).put(`/api/contested_roll_requests/${submitRes.body._id}/void`).set('X-Test-User', stUser());
    expect(voidRes.status).toBe(404);

    // Untouched — still pending under its own route family.
    const stored = await getCollection('contested_roll_requests').findOne({ character_id: String(charId), request_type: 'humanity_check' });
    expect(stored.status).toBe('pending');
  });

  it('a pending Humanity Check is invisible to contested-rolls.js accept/decline', async () => {
    const charId = await seedCharacter();
    const submitRes = await request(app).post('/api/humanity_check_requests')
      .set('X-Test-User', playerUser([String(charId)]))
      .send({ character_id: String(charId) });

    const acceptRes = await request(app).put(`/api/contested_roll_requests/${submitRes.body._id}/accept`)
      .set('X-Test-User', playerUser([String(charId)]));
    expect(acceptRes.status).toBe(404);
  });
});
