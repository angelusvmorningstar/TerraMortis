/**
 * gdx.8 (#989) — persisted roll history + live ST roll feed.
 *
 * Four layers, matching the story's own AC9:
 *  1. Server auth-boundary (AC3, AC4) — a player can POST a roll for their
 *     OWN character only; GET is ST/dev only.
 *  2. The TTL-Date proof (AC2) — `rolled_at` must be a genuine BSON Date at
 *     write time, unlike `contested_roll_requests.updated_at`'s own
 *     documented, still-live ISO-string bug
 *     (`crd-1-contested-roll-request-shape.test.js`'s own "DOCUMENTED
 *     LIMITATION" test is the direct precedent this one inverts).
 *  3. `broadcastRollLogged` WS emission (AC5) — fires on a successful POST,
 *     not on a rejected one. Mirrors `stm-9-ws-broadcast.test.js`'s
 *     `vi.spyOn(wsModule, ...)` pattern.
 *  4. `buildRollLogPayload`'s pure-function shape (AC6) — no DOM, directly
 *     importable with the same `location`/`localStorage`/`document` shim
 *     `gdx-7-apply-costs-on-roll.test.js` already established for this same
 *     `roll-v2.js` module.
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
if (!hadDocument) {
  globalThis.document = {
    getElementById: id => (String(id).startsWith('trk-card-') ? null : _fakeElement()),
    createElement: () => _fakeElement(),
  };
}

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { ObjectId } from 'mongodb';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb, isDbAvailable } from './helpers/db-setup.js';
import { getCollection } from '../db.js';
import * as wsModule from '../ws.js';

afterAll(() => {
  if (!hadLocation) delete globalThis.location;
  if (!hadLocalStorage) delete globalThis.localStorage;
  if (!hadDocument) delete globalThis.document;
});

const dbAvailable = await isDbAvailable();
const MY_CHAR = new ObjectId().toHexString();
const OTHER_CHAR = new ObjectId().toHexString();

function validBody(overrides = {}) {
  return {
    character_id: MY_CHAR,
    label: 'Success',
    pool: '5d10',
    results: [3, 7, 8, 2, 10],
    successes: 3,
    again_rule: '9',
    rote: false,
    wp_bonus: false,
    vitae_spent: 0,
    wp_spent: 0,
    ...overrides,
  };
}

// ── AC3, AC4: server auth boundary ──────────────────────────────────────

describe.skipIf(!dbAvailable)('gdx.8 — POST /api/roll_log auth boundary (AC3)', () => {
  let app;
  const cleanup = () => getCollection('roll_log').deleteMany({ character_id: { $in: [MY_CHAR, OTHER_CHAR] } });

  beforeAll(async () => { await setupDb(); app = createTestApp(); await cleanup(); });
  afterAll(async () => { await cleanup(); await teardownDb(); });

  it('a player can POST a roll for their own character', async () => {
    const res = await request(app).post('/api/roll_log')
      .set('X-Test-User', playerUser([MY_CHAR]))
      .send(validBody());
    expect(res.status).toBe(201);
    expect(res.body.character_id).toBe(MY_CHAR);
    // Review fix (Codex, external): must be req.user.player_id ('p-player-001'
    // per test-app.js's playerUser()), NOT req.user.id ('test-player-001',
    // the Discord-shaped mock field) — the original assertion encoded the
    // pre-fix bug (player_id: req.user._id || req.user.id, which always fell
    // through to the Discord id since req.user._id never exists) as correct.
    expect(res.body.player_id).toBe('p-player-001');
  });

  it('a player is blocked posting a roll for a character they do not own', async () => {
    const res = await request(app).post('/api/roll_log')
      .set('X-Test-User', playerUser([MY_CHAR]))
      .send(validBody({ character_id: OTHER_CHAR }));
    expect(res.status).toBe(403);
  });

  it('ST can post a roll for any character', async () => {
    const res = await request(app).post('/api/roll_log')
      .set('X-Test-User', stUser())
      .send(validBody({ character_id: OTHER_CHAR }));
    expect(res.status).toBe(201);
  });

  // Review fix (Codex, external): same AC9 st/dev boundary gap as the GET
  // suite below — dev must be covered on POST too, not just st.
  it('dev can post a roll for any character too', async () => {
    const res = await request(app).post('/api/roll_log')
      .set('X-Test-User', stUser({ role: 'dev' }))
      .send(validBody({ character_id: OTHER_CHAR }));
    expect(res.status).toBe(201);
  });

  it('player_id is server-derived, not read from the request body', async () => {
    const res = await request(app).post('/api/roll_log')
      .set('X-Test-User', playerUser([MY_CHAR]))
      .send({ ...validBody(), player_id: 'spoofed-player-id' });
    // additionalProperties: false in the schema rejects the extra field outright.
    expect(res.status).toBe(400);
  });

  it('unauthenticated request is rejected', async () => {
    const res = await request(app).post('/api/roll_log').send(validBody());
    expect(res.status).toBe(401);
  });
});

describe.skipIf(!dbAvailable)('gdx.8 — GET /api/roll_log auth boundary (AC4)', () => {
  let app;
  beforeAll(async () => { await setupDb(); app = createTestApp(); });
  afterAll(async () => { await teardownDb(); });

  it('a player cannot read the roll feed', async () => {
    const res = await request(app).get('/api/roll_log').set('X-Test-User', playerUser([MY_CHAR]));
    expect(res.status).toBe(403);
  });

  it('ST can read the roll feed', async () => {
    const res = await request(app).get('/api/roll_log').set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // Review fix (Codex, external): AC9 explicitly names "ST/dev can POST and
  // GET", but the suite above only ever constructs an stUser() — a future
  // break in requireRole('st')'s own st→dev equivalence could pass every
  // existing test here while silently locking dev out. Covers the boundary
  // AC9 actually specifies, not just the st half of it.
  it('dev can read the roll feed too', async () => {
    const res = await request(app).get('/api/roll_log').set('X-Test-User', stUser({ role: 'dev' }));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ── AC2: rolled_at must be a genuine Date, not an ISO string ────────────

describe.skipIf(!dbAvailable)('gdx.8 AC2 — rolled_at is a real BSON Date, unlike contested_roll_requests.updated_at', () => {
  let app;
  const cleanup = () => getCollection('roll_log').deleteMany({ character_id: MY_CHAR });

  beforeAll(async () => { await setupDb(); app = createTestApp(); await cleanup(); });
  afterAll(async () => { await cleanup(); await teardownDb(); });

  it('the stored rolled_at field is a Date instance, so the TTL index actually reaps this collection', async () => {
    // Deliberately the inverse of crd-1-contested-roll-request-shape.test.js's
    // own "DOCUMENTED LIMITATION" test — that one proves updated_at is STILL
    // a string there; this one proves rolled_at here is NOT, and must stay
    // that way. If this test ever fails, roll_log's TTL index has silently
    // gone inert the same way crd1_terminal_status_ttl already has.
    const res = await request(app).post('/api/roll_log')
      .set('X-Test-User', playerUser([MY_CHAR]))
      .send(validBody());
    expect(res.status).toBe(201);
    const stored = await getCollection('roll_log').findOne({ _id: new ObjectId(res.body._id) });
    expect(stored.rolled_at, 'must be a real Date instance, not an ISO string').toBeInstanceOf(Date);
  });

  it('server/index.js declares exactly one roll_log TTL index, with a 30-day window', async () => {
    const fs = await import('node:fs');
    const src = await fs.promises.readFile(new URL('../index.js', import.meta.url), 'utf8');
    const marker = "collection('roll_log').createIndex(";
    const at = src.indexOf(marker);
    expect(at, 'a boot-time index declared on roll_log').not.toBe(-1);
    // Review fix (Blind Hunter): the message said "exactly one" but the
    // original assertion only ever checked `indexOf`'s first hit — it never
    // looked for a second occurrence, so it couldn't actually have proven
    // that. This does.
    const second = src.indexOf(marker, at + marker.length);
    expect(second, 'exactly one boot-time index declared on roll_log').toBe(-1);
    const end = src.indexOf('\n    );', at);
    const block = src.slice(at, end).replace(/\s+/g, ' ');
    expect(block).toContain('rolled_at: 1');
    expect(block).toContain('expireAfterSeconds: 2592000');
  });
});

// ── AC5: broadcastRollLogged WS emission ────────────────────────────────

describe.skipIf(!dbAvailable)('gdx.8 AC5 — POST /api/roll_log emits broadcastRollLogged', () => {
  let app;
  let broadcastSpy;
  const cleanup = () => getCollection('roll_log').deleteMany({ character_id: { $in: [MY_CHAR, OTHER_CHAR] } });

  beforeAll(async () => {
    await setupDb();
    app = createTestApp();
    await cleanup();
    broadcastSpy = vi.spyOn(wsModule, 'broadcastRollLogged');
  });
  afterAll(async () => { await cleanup(); broadcastSpy.mockRestore(); await teardownDb(); });

  it('fires once on a successful POST, with the written doc', async () => {
    broadcastSpy.mockClear();
    const res = await request(app).post('/api/roll_log')
      .set('X-Test-User', playerUser([MY_CHAR]))
      .send(validBody());
    expect(res.status).toBe(201);
    expect(broadcastSpy).toHaveBeenCalledTimes(1);
    expect(broadcastSpy.mock.calls[0][0].character_id).toBe(MY_CHAR);
  });

  it('does NOT fire on a rejected (validation-failed) POST', async () => {
    broadcastSpy.mockClear();
    const res = await request(app).post('/api/roll_log')
      .set('X-Test-User', playerUser([MY_CHAR]))
      .send({ character_id: MY_CHAR }); // missing required fields
    expect(res.status).toBe(400);
    expect(broadcastSpy).not.toHaveBeenCalled();
  });

  it('does NOT fire on a rejected (forbidden) POST', async () => {
    broadcastSpy.mockClear();
    const res = await request(app).post('/api/roll_log')
      .set('X-Test-User', playerUser([MY_CHAR]))
      .send(validBody({ character_id: OTHER_CHAR }));
    expect(res.status).toBe(403);
    expect(broadcastSpy).not.toHaveBeenCalled();
  });
});

// ── Review fix (Edge Case Hunter): _logRoll uses a captured char, ───────
// not live state.rollChar. Source-text guard, same shape as
// rlv-6-dice-engine-removed.test.js's own regexes — doRoll() needs live
// #dice-area/#res-hdr DOM to exercise behaviourally, which no existing test
// in this repo attempts, so this pins the fix at the source level instead.

describe('gdx.8 review fix — _logRoll uses a char captured before doRoll()\'s awaits', () => {
  let src;

  beforeAll(async () => {
    const fs = await import('node:fs');
    src = await fs.promises.readFile(
      new URL('../../public/js/suite/roll-v2.js', import.meta.url), 'utf8',
    );
  });

  it('captures _rollChar = state.rollChar before the first await in doRoll()', () => {
    const doRollStart = src.indexOf('export async function doRoll()');
    expect(doRollStart).not.toBe(-1);
    const captureAt = src.indexOf('const _rollChar = state.rollChar;', doRollStart);
    const firstAwaitAt = src.indexOf('await ensureTrackerLoaded(state.rollChar)', doRollStart);
    expect(captureAt, '_rollChar capture must exist in doRoll()').toBeGreaterThan(doRollStart);
    expect(captureAt, '_rollChar must be captured BEFORE the first await').toBeLessThan(firstAwaitAt);
  });

  it('none of the three _logRoll call sites re-read state.rollChar', () => {
    const captured = [...src.matchAll(/_logRoll\(_rollChar\._id,/g)].length;
    const stale = [...src.matchAll(/_logRoll\(state\.rollChar\._id,/g)].length;
    expect(captured, 'expected exactly three _logRoll(_rollChar._id, ...) call sites').toBe(3);
    expect(stale, '_logRoll must never re-read state.rollChar live').toBe(0);
  });

  it('none of the three log-guard conditions re-read state.rollChar either', () => {
    const guards = [...src.matchAll(/if \((_rollChar|state\.rollChar) && getGlobalSettings\(\)\?\.game_in_progress\)/g)];
    expect(guards.length).toBe(3);
    for (const m of guards) expect(m[1]).toBe('_rollChar');
  });

  // Review fix (Codex, external): the standard and contested branches must
  // flatten wC (a dice-CHAIN array, rollPool's own shape) before it reaches
  // results — a raw `results: wC` 400s every real roll (see the
  // "realistic doRoll()-shaped payload" integration test above, which only
  // proves the pure functions are correct when USED correctly; it can't
  // catch a regression at these call sites themselves, since it never
  // invokes doRoll() — no test in this repo can, it needs live DOM. This
  // pins the call sites directly, the same way the _rollChar guards above
  // do for that fix.
  it('the standard and contested branches flatten wC before passing it as results', () => {
    const flattened = [...src.matchAll(/results: flattenDiceChainResults\(wC\)/g)].length;
    const raw = [...src.matchAll(/results: wC,/g)].length;
    expect(flattened, 'both non-chance-die branches must flatten wC').toBe(2);
    expect(raw, 'wC must never reach results unflattened').toBe(0);
  });

  // Review fix (Codex, external): a lost/drawn contested roll must persist
  // 0 successes, not the attacker's raw wS. addHist()'s own pre-existing
  // (untouched, out of scope) call still uses `won ? net : wS` for the
  // client-local history list — only the NEW _logRoll call this story adds
  // must differ, since roll-feed.js is a new consumer whose hit/miss
  // styling keys directly on `entry.successes > 0`.
  it('the contested branch logs 0 successes on a loss/draw, not the attacker\'s raw wS', () => {
    // The contested branch is the one whose payload label var is `outcome`
    // (the standard branch's is `lbl`) — anchors on that to isolate it.
    const at = src.indexOf('label: outcome, successes:');
    expect(at, 'contested branch\'s _logRoll call').not.toBe(-1);
    const line = src.slice(at, src.indexOf('\n', at));
    expect(line).toContain('successes: won ? net : 0');
    expect(line).not.toContain('successes: won ? net : wS');
  });
});

// ── Review fix (Blind Hunter + Acceptance Auditor, independently): ──────
// broadcastRollLogged must reach only st/dev sockets, not every connected
// client — unlike catalogue/settings/tracker frames, a roll_log doc carries
// another character's real dice results and vitae/willpower spend, which
// GET /api/roll_log (AC4) deliberately keeps ST/dev-only. Exercises the
// real `_fanOutRoles` role filter via the `_setWssForTesting` seam, not a
// spy — a spy on `broadcastRollLogged` (as AC5's own tests use) proves the
// route CALLS it, not that the function itself scopes correctly.

describe('gdx.8 review fix — broadcastRollLogged only reaches st/dev sockets', () => {
  function fakeSocket(role) {
    return { readyState: 1, user: { role }, send: vi.fn() };
  }

  afterEach(() => {
    wsModule._setWssForTesting(null);
  });

  it('sends to st and dev sockets, not to a player or an unauthenticated socket', () => {
    const st = fakeSocket('st');
    const dev = fakeSocket('dev');
    const player = fakeSocket('player');
    const noUser = { readyState: 1, user: undefined, send: vi.fn() };
    wsModule._setWssForTesting({ clients: [st, dev, player, noUser] });

    wsModule.broadcastRollLogged({ _id: 'x', character_id: MY_CHAR });

    expect(st.send).toHaveBeenCalledTimes(1);
    expect(dev.send).toHaveBeenCalledTimes(1);
    expect(player.send).not.toHaveBeenCalled();
    expect(noUser.send).not.toHaveBeenCalled();
  });

  it('skips a not-OPEN st socket the same way _fanOut does', () => {
    const closingSt = { readyState: 2, user: { role: 'st' }, send: vi.fn() };
    wsModule._setWssForTesting({ clients: [closingSt] });

    wsModule.broadcastRollLogged({ _id: 'x', character_id: MY_CHAR });

    expect(closingSt.send).not.toHaveBeenCalled();
  });

  it('is a no-op with no WS server attached', () => {
    wsModule._setWssForTesting(null);
    expect(() => wsModule.broadcastRollLogged({ _id: 'x', character_id: MY_CHAR })).not.toThrow();
  });
});

// ── AC6: buildRollLogPayload (pure function, no DOM) ────────────────────

describe('gdx.8 AC6 — buildRollLogPayload (pure)', () => {
  let buildRollLogPayload;

  beforeAll(async () => {
    ({ buildRollLogPayload } = await import('../../public/js/suite/roll-v2.js'));
  });

  it('builds the full AC1 shape from a standard-roll call site', () => {
    expect(buildRollLogPayload({
      pool: '5d10', label: 'Success', successes: 3, results: [3, 7, 8, 2, 10],
      againRule: '9', rote: false, wpBonus: false, vitaeSpent: 0, willpowerSpent: 0,
    })).toEqual({
      label: 'Success', pool: '5d10', results: [3, 7, 8, 2, 10], successes: 3,
      again_rule: '9', rote: false, wp_bonus: false, vitae_spent: 0, wp_spent: 0,
    });
  });

  it('rote/wp_bonus coerce to real booleans, not truthy leftovers', () => {
    const out = buildRollLogPayload({
      pool: '5d10', label: 'Success', successes: 1, results: [10],
      againRule: '10', rote: 1, wpBonus: 0, vitaeSpent: 0, willpowerSpent: 0,
    });
    expect(out.rote).toBe(true);
    expect(out.wp_bonus).toBe(false);
  });

  it('a null/undefined again_rule becomes null, not undefined (schema-safe)', () => {
    const out = buildRollLogPayload({
      pool: 'Chance', label: 'Failure (Chance)', successes: 0, results: [5],
      againRule: undefined, rote: false, wpBonus: false, vitaeSpent: 0, willpowerSpent: 0,
    });
    expect(out.again_rule).toBeNull();
  });

  it('real vitae/willpower spend amounts are threaded through untouched', () => {
    const out = buildRollLogPayload({
      pool: '3d10', label: 'Success', successes: 2, results: [8, 9, 3],
      againRule: '9', rote: false, wpBonus: true, vitaeSpent: 2, willpowerSpent: 1,
    });
    expect(out.vitae_spent).toBe(2);
    expect(out.wp_spent).toBe(1);
  });

  it('zero spend stays zero, not falsy-coerced to something else', () => {
    const out = buildRollLogPayload({
      pool: '5d10', label: 'Success', successes: 3, results: [3, 7, 8, 2, 10],
      againRule: '9', rote: false, wpBonus: false, vitaeSpent: 0, willpowerSpent: 0,
    });
    expect(out.vitae_spent).toBe(0);
    expect(out.wp_spent).toBe(0);
  });

  // Review fix (Codex, external — the real find this internal review's own
  // three layers missed): every one of the three real doRoll() call sites
  // passes `state.AGAIN`, which is a NUMBER (public/js/suite/data.js's own
  // `AGAIN: 10` default), not the string literals every test above uses.
  // The original `again_rule: againRule || null` passed that number through
  // unconverted, and the schema (`type: ['string', 'null']`) with this
  // server's `coerceTypes: false` validator rejects a raw number outright —
  // silently 400ing every real roll, swallowed by _logRoll's own catch.
  it('a NUMERIC again_rule (the real state.AGAIN shape) coerces to a string', () => {
    const out = buildRollLogPayload({
      pool: '5d10', label: 'Success', successes: 3, results: [3, 7, 8, 2, 10],
      againRule: 10, rote: false, wpBonus: false, vitaeSpent: 0, willpowerSpent: 0,
    });
    expect(out.again_rule).toBe('10');
    expect(typeof out.again_rule).toBe('string');
  });
});

// ── Review fix (Codex, external): flattenDiceChainResults ────────────────

describe('gdx.8 review fix — flattenDiceChainResults (pure)', () => {
  let flattenDiceChainResults;

  beforeAll(async () => {
    ({ flattenDiceChainResults } = await import('../../public/js/suite/roll-v2.js'));
  });

  it('flattens dice-chain objects (rollPool\'s real shape) to plain face-value integers', () => {
    // Mirrors shared/dice.js's own mkChain/rollPool output shape exactly —
    // { r: { v, s, x }, ch: [...] } per column, ch holding any exploded
    // re-rolls. This is what wC/cA/cB actually are at the two real call
    // sites (standard + contested branches) — never plain integers.
    const chains = [
      { r: { v: 7, s: false, x: false }, ch: [] },
      { r: { v: 10, s: true, x: true }, ch: [{ v: 9, s: true, x: true }, { v: 3, s: false, x: false }] },
      { r: { v: 1, s: false, x: false }, ch: [] },
    ];
    expect(flattenDiceChainResults(chains)).toEqual([7, 10, 9, 3, 1]);
  });

  it('an empty pool flattens to an empty array, not a crash', () => {
    expect(flattenDiceChainResults([])).toEqual([]);
  });

  it('a column with no explosions contributes exactly its own face value', () => {
    const chains = [{ r: { v: 4, s: false, x: false }, ch: [] }];
    expect(flattenDiceChainResults(chains)).toEqual([4]);
  });
});

// ── Review fix (Codex, external): realistic doRoll() payload actually ────
// validates against the real schema, not just the hand-authored test data
// every other AC1/AC3 test above uses. This is the integration-level proof
// the original suite was missing — it would have caught the 400 both real
// bugs above caused.

describe.skipIf(!dbAvailable)('gdx.8 review fix — a realistic doRoll()-shaped payload validates', () => {
  let app;
  const cleanup = () => getCollection('roll_log').deleteMany({ character_id: MY_CHAR });

  beforeAll(async () => { await setupDb(); app = createTestApp(); await cleanup(); });
  afterAll(async () => { await cleanup(); await teardownDb(); });

  it('a standard-roll payload built via buildRollLogPayload + flattenDiceChainResults, with the real numeric againRule, POSTs 201 not 400', async () => {
    const { buildRollLogPayload, flattenDiceChainResults } =
      await import('../../public/js/suite/roll-v2.js');
    // Exactly what a real doRoll() standard branch builds: state.AGAIN is a
    // number (10 here), and wC is rollPool()'s own chain-object shape.
    const wC = [
      { r: { v: 8, s: true, x: false }, ch: [] },
      { r: { v: 10, s: true, x: true }, ch: [{ v: 6, s: false, x: false }] },
      { r: { v: 3, s: false, x: false }, ch: [] },
    ];
    const payload = buildRollLogPayload({
      pool: '3d10', label: 'Success', successes: 2, results: flattenDiceChainResults(wC),
      againRule: 10, rote: false, wpBonus: false, vitaeSpent: 0, willpowerSpent: 0,
    });
    const res = await request(app).post('/api/roll_log')
      .set('X-Test-User', playerUser([MY_CHAR]))
      .send({ character_id: MY_CHAR, ...payload });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.again_rule).toBe('10');
    expect(res.body.results).toEqual([8, 10, 6, 3]);
  });
});
