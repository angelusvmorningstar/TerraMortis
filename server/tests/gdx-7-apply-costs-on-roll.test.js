/**
 * gdx.7 (#988) — apply vitae/WP costs on roll during `game_in_progress`.
 *
 * Three layers, matching the story's own AC9:
 *  1. `pools.js`'s `getPool()` field threading (AC1) — the new
 *     `vitae_cost`/`willpower_cost` fields mirror the existing `cost` string
 *     threading, with `0` (a confirmed-free power, gdx.6) staying distinct
 *     from `null` (never migrated/unparsed).
 *  2. `roll-v2.js`'s three pure decision functions (AC3, AC5, AC6) —
 *     `spendableCost`, `canAffordCost`, `rollButtonLabel` — exported
 *     specifically so the spend decision is testable without a browser.
 *  3. A live-DB integration test proving `trackerAdj`'s existing clamp-at-0
 *     guard holds for a roll-triggered spend the same way it already holds
 *     for a manual one (AC9's own explicit ask — `trackerAdj` itself is
 *     unmodified by this story, but easy to assume-safe without checking).
 *
 * `pools.js`'s import chain reaches `loader.js` -> `api.js`, which reads
 * `location.hostname` at module load, and `roll-v2.js` additionally reaches
 * `game/tracker.js` (same pattern, its own `location.hostname` at line 13)
 * and `app-settings.js` (ditto, line 20) — same shim technique established
 * by #1137 and reused throughout this codebase's client-side test suites
 * (most recently dbo-3-standing-merit-filter.test.js). `document` is also
 * stubbed: `trackerAdj`'s own `patchCard()` calls `document.getElementById`
 * unconditionally on every write, and (follow-up) `spendVitae`/
 * `spendWillpower` call `updPool()`, which touches several more DOM ids
 * unconditionally. With no jsdom in this project, `document` is undefined
 * entirely — `getElementById` returns a fresh minimal fake element (settable
 * `innerHTML`/`textContent`/`disabled`, no-op `classList`/`style`) rather
 * than `null`, so both `patchCard`'s writes and `updPool`'s full repaint run
 * to completion without throwing. Nothing in this file asserts on painted
 * DOM content — that's the pure-function unit tests' job (`rollButtonLabel`
 * etc., no DOM needed at all) — this stub only has to not crash.
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
    // 'trk-card-*' stays null — trackerAdj's own patchCard() falls back to
    // renderAll() (a no-op, `_el` never set) on that specific miss; a fake
    // truthy element there would hit `old.replaceWith(...)`, which this
    // stub doesn't implement. Every other id gets a fake element so
    // updPool()'s full repaint (spendVitae/spendWillpower's follow-up call)
    // doesn't throw on a plain `el.innerHTML = ...` write.
    getElementById: id => (String(id).startsWith('trk-card-') ? null : _fakeElement()),
    createElement: () => _fakeElement(),
  };
}

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { ObjectId } from 'mongodb';
import { createTestApp, stUser } from './helpers/test-app.js';
import { setupDb, teardownDb, isDbAvailable } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

afterAll(() => {
  if (!hadLocation) delete globalThis.location;
  if (!hadLocalStorage) delete globalThis.localStorage;
  if (!hadDocument) delete globalThis.document;
});

// ── AC1: pools.js field threading ──────────────────────────────────────
//
// Fixtures deliberately cover all four shapes gdx.6's migration can leave a
// rule in: a real positive cost, a confirmed-free 0, an explicit null
// (unparsed cost string), and a rule that predates the migration entirely
// (fields simply absent — must also read as null, per the AC's own `?? null`
// requirement).
const RULE_NOROLL = {
  key: 'rule-noroll', parent: 'Test Discipline', cost: '1 Vitae',
  vitae_cost: 2, willpower_cost: 0, cost_note: null,
  action: 'Instant', duration: 'One scene', description: 'Test effect.',
};
const RULE_ZERO_NULL = {
  key: 'rule-zero-null', parent: 'Test Discipline', cost: null,
  vitae_cost: 0, willpower_cost: null, cost_note: null,
  action: 'Instant', duration: 'Instant', description: 'A confirmed-free power.',
};
const RULE_POOLED = {
  key: 'rule-pooled', parent: 'Test Discipline', pool: { attr: 'Resolve', skill: 'Occult' },
  cost: '1 Vitae & 1 WP', vitae_cost: 1, willpower_cost: 1,
  action: 'Reflexive', duration: 'Instant', description: 'A rollable power.',
};
const RULE_LEGACY = {
  key: 'rule-legacy', parent: 'Test Discipline', cost: '—',
  action: 'Instant', duration: 'Instant', description: 'Predates gdx.6\'s migration.',
  // vitae_cost/willpower_cost deliberately absent.
};

const POOL_CHAR = {
  attributes: { Resolve: { dots: 3, bonus: 0 } },
  skills: { Occult: { dots: 2, bonus: 0, specs: [], nine_again: false } },
  disciplines: {},
};

describe('gdx.7 — pools.js getPool() field threading (AC1)', () => {
  let getPool;

  beforeAll(async () => {
    globalThis.localStorage.setItem(
      'tm_rules_db',
      JSON.stringify([RULE_NOROLL, RULE_ZERO_NULL, RULE_POOLED, RULE_LEGACY])
    );
    ({ getPool } = await import('../../public/js/shared/pools.js'));
  });

  it('noRoll branch: vitae_cost/willpower_cost thread through at the top level, 0 preserved distinctly from null', () => {
    const p = getPool(POOL_CHAR, 'rule-noroll');
    expect(p.noRoll).toBe(true);
    expect(p.vitae_cost).toBe(2);
    expect(p.willpower_cost).toBe(0);
    // Disclosed deviation (Task 1, Dev Notes): the `info` sub-object does NOT
    // also carry these fields — nothing reads them there. The legacy `cost`
    // string still does, unaffected by this story.
    expect(p.info.vitae_cost).toBeUndefined();
    expect(p.info.willpower_cost).toBeUndefined();
    expect(p.info.c).toBe('1 Vitae');
  });

  it('0 and null are distinct — a confirmed-free power never collapses to the unparsed-null shape', () => {
    const p = getPool(POOL_CHAR, 'rule-zero-null');
    expect(p.vitae_cost).toBe(0);
    expect(p.willpower_cost).toBeNull();
  });

  it('main-return branch (a rollable power): same threading, top level only, existing pool math unaffected', () => {
    const p = getPool(POOL_CHAR, 'rule-pooled');
    expect(p.noRoll).toBeUndefined();
    expect(p.vitae_cost).toBe(1);
    expect(p.willpower_cost).toBe(1);
    expect(p.info.vitae_cost).toBeUndefined();
    expect(p.info.willpower_cost).toBeUndefined();
    expect(p.info.c).toBe('1 Vitae & 1 WP');
    expect(p.attrV).toBe(3);
    expect(p.skillV).toBe(2);
  });

  it('a rule predating gdx.6\'s migration (fields absent entirely) reports both as null, not 0', () => {
    const p = getPool(POOL_CHAR, 'rule-legacy');
    expect(p.vitae_cost).toBeNull();
    expect(p.willpower_cost).toBeNull();
  });

  it('an unknown key still returns null, unaffected by this story', () => {
    expect(getPool(POOL_CHAR, 'not-a-real-key')).toBeNull();
  });
});

// ── AC3, AC5, AC6: roll-v2.js's pure spend-decision functions ──────────
describe('gdx.7 — spendableCost / canAffordCost / rollButtonLabel (AC3, AC5, AC6)', () => {
  let spendableCost, canAffordCost, rollButtonLabel;

  beforeAll(async () => {
    ({ spendableCost, canAffordCost, rollButtonLabel } = await import('../../public/js/suite/roll-v2.js'));
  });

  describe('spendableCost', () => {
    it('reads the loaded power\'s own cost when the WP chip is off', () => {
      expect(spendableCost({ vitae_cost: 2, willpower_cost: 1 }, false)).toEqual({
        vitaeCost: 2, willpowerCost: 1, hasPowerCost: true, powerWillpowerCost: 1,
      });
    });

    it('the WP chip adds 1 Willpower ADDITIVELY to the combined total, never replacing the power\'s own cost (AC6)', () => {
      expect(spendableCost({ vitae_cost: 2, willpower_cost: 1 }, true)).toEqual({
        vitaeCost: 2, willpowerCost: 2, hasPowerCost: true, powerWillpowerCost: 1,
      });
    });

    it('no pool info loaded (common action, or nothing picked yet): only the chip can spend anything, and hasPowerCost stays false', () => {
      expect(spendableCost(null, true)).toEqual({ vitaeCost: 0, willpowerCost: 1, hasPowerCost: false, powerWillpowerCost: 0 });
      expect(spendableCost(undefined, false)).toEqual({ vitaeCost: 0, willpowerCost: 0, hasPowerCost: false, powerWillpowerCost: 0 });
    });

    it('a confirmed-free power (0) and an unparsed one (null) are both "nothing to spend" at this layer, hasPowerCost false', () => {
      expect(spendableCost({ vitae_cost: 0, willpower_cost: 0 }, false)).toEqual({ vitaeCost: 0, willpowerCost: 0, hasPowerCost: false, powerWillpowerCost: 0 });
      expect(spendableCost({ vitae_cost: null, willpower_cost: null }, false)).toEqual({ vitaeCost: 0, willpowerCost: 0, hasPowerCost: false, powerWillpowerCost: 0 });
    });

    it('review fix (Acceptance Auditor, AC3): a genuinely free power with the WP chip on still reports hasPowerCost false — the chip alone must never read as a power cost', () => {
      const c = spendableCost({ vitae_cost: 0, willpower_cost: null }, true);
      expect(c.hasPowerCost).toBe(false);
      expect(c.willpowerCost).toBe(1); // the chip's own spend is still real and combined-total...
      expect(c.powerWillpowerCost).toBe(0); // ...but attributed to the chip, not the power.
    });

    it('review fix (Acceptance Auditor, AC6): a power costing WP plus the chip keeps the two amounts separately readable', () => {
      const c = spendableCost({ vitae_cost: 0, willpower_cost: 1 }, true);
      expect(c.hasPowerCost).toBe(true);
      expect(c.powerWillpowerCost).toBe(1); // the power's own share...
      expect(c.willpowerCost).toBe(2);      // ...combined with the chip's, for affordability/actual spend.
    });
  });

  describe('canAffordCost', () => {
    it('affords exactly at the boundary (<=, not <)', () => {
      expect(canAffordCost({ vitaeCost: 5, willpowerCost: 3 }, { vitae: 5, willpower: 3 })).toBe(true);
    });

    it('insufficient Vitae alone fails the whole check, even if Willpower covers its share', () => {
      expect(canAffordCost({ vitaeCost: 2, willpowerCost: 0 }, { vitae: 1, willpower: 5 })).toBe(false);
    });

    it('insufficient Willpower alone fails the whole check, even if Vitae covers its share', () => {
      expect(canAffordCost({ vitaeCost: 0, willpowerCost: 2 }, { vitae: 5, willpower: 1 })).toBe(false);
    });

    it('a nothing-to-spend cost always affords, even against an unknown/null balance', () => {
      expect(canAffordCost({ vitaeCost: 0, willpowerCost: 0 }, null)).toBe(true);
    });

    it('a real cost against an unknown balance never affords — never a silent partial spend (AC5)', () => {
      expect(canAffordCost({ vitaeCost: 1, willpowerCost: 0 }, null)).toBe(false);
    });
  });

  describe('rollButtonLabel', () => {
    // Literal, not spendableCost(null, false) — this describe body runs
    // during test COLLECTION, before beforeAll (which assigns spendableCost)
    // has run; calling it here throws "not a function".
    const noCost = { vitaeCost: 0, willpowerCost: 0, hasPowerCost: false, powerWillpowerCost: 0 };

    it('flag off = current behaviour, byte-for-byte, whatever the loaded cost is (AC7)', () => {
      const cost = spendableCost({ vitae_cost: 2, willpower_cost: 1 }, false);
      expect(rollButtonLabel(8, cost, false, true)).toBe('✦ ROLL 8 DICE');
    });

    it('no real cost keeps the plain label even with the flag on', () => {
      expect(rollButtonLabel(8, noCost, true, true)).toBe('✦ ROLL 8 DICE');
    });

    it('a chance-die roll (eff <= 0) still says CHANCE DIE, not "0 DICE"', () => {
      expect(rollButtonLabel(0, noCost, true, true)).toBe('✦ ROLL CHANCE DIE');
      expect(rollButtonLabel(-1, noCost, true, true)).toBe('✦ ROLL CHANCE DIE');
    });

    it('Vitae-only, WP-only, and combined cost each render their own bit list (AC3)', () => {
      expect(rollButtonLabel(8, spendableCost({ vitae_cost: 2, willpower_cost: 0 }, false), true, true)).toBe('✦ ROLL & SPEND 2 VITAE');
      expect(rollButtonLabel(8, spendableCost({ vitae_cost: 0, willpower_cost: 1 }, false), true, true)).toBe('✦ ROLL & SPEND 1 WP');
      expect(rollButtonLabel(8, spendableCost({ vitae_cost: 2, willpower_cost: 1 }, false), true, true)).toBe('✦ ROLL & SPEND 2 VITAE, 1 WP');
    });

    it('an unaffordable real cost falls back to the plain dice label — one button, no separate state (AC5, Task 2\'s simplification)', () => {
      expect(rollButtonLabel(8, spendableCost({ vitae_cost: 2, willpower_cost: 0 }, false), true, false)).toBe('✦ ROLL 8 DICE');
    });

    it('review fix (Acceptance Auditor, AC3): a genuinely free power with the WP chip on keeps the plain dice label — the chip alone never flips the button', () => {
      const cost = spendableCost({ vitae_cost: 0, willpower_cost: null }, true); // chip on, power itself free
      expect(cost.willpowerCost).toBe(1); // there IS a real combined spend (the chip)...
      expect(rollButtonLabel(8, cost, true, true)).toBe('✦ ROLL 8 DICE'); // ...but AC3 says this path stays untouched.
    });

    it('review fix (Acceptance Auditor, AC6): a power\'s own WP cost and the chip\'s +1 never merge into one ambiguous bit — the button names only the power\'s own share', () => {
      const cost = spendableCost({ vitae_cost: 0, willpower_cost: 1 }, true); // power costs 1 WP, chip also on
      expect(cost.willpowerCost).toBe(2); // combined total actually spent...
      expect(rollButtonLabel(8, cost, true, true)).toBe('✦ ROLL & SPEND 1 WP'); // ...but the button names only the power's 1 WP, not the chip's.
    });
  });
});

// ── AC9: live-DB integration — the clamp-at-0 guard for a roll-triggered spend ──
//
// `trackerAdj` itself is unmodified by this story (Dev Notes: "reused
// exactly as-is"), but AC9 asks for this explicitly rather than assuming it
// safe. Routes `game/tracker.js`'s own `fetch()` calls through the real
// Express app and the real `tm_suite_test` database via a thin adapter, so
// this proves actual persistence, not a mocked stand-in. Runs as an ST test
// user throughout — this test is about the CLAMP guard, not a re-proof of
// the player-scoped write-path finding already recorded in the story's own
// Dev Notes (and see gdx-7's Dev Agent Record for a related test-harness
// finding logged to deferred-work.md rather than fixed here, as out of this
// story's scope).
describe('gdx.7 — trackerAdj clamp-at-0 guard, live DB', async () => {
  const dbAvailable = await isDbAvailable();

  describe.skipIf(!dbAvailable)('with a local mongod available', () => {
    const CHAR_ID = new ObjectId().toHexString();
    const TEST_CHAR = {
      _id: CHAR_ID,
      blood_potency: 0, // calcVitaeMax -> BP_TABLE[0].vitae = 5
      attributes: {
        Resolve:   { dots: 1, bonus: 0 },
        Composure: { dots: 1, bonus: 0 }, // calcWillpowerMax -> 1+1 = 2
        Stamina:   { dots: 1, bonus: 0 },
      },
      skills: {},
      disciplines: {},
    };

    let app;
    let trackerAdj, trackerRead, ensureTrackerLoaded, rollState;
    let realFetch;

    beforeAll(async () => {
      await setupDb();
      app = createTestApp();

      realFetch = globalThis.fetch;
      globalThis.fetch = async (url, opts = {}) => {
        const path = String(url).replace(/^https?:\/\/[^/]+/, '');
        const method = (opts.method || 'GET').toLowerCase();
        let req = request(app)[method](path).set('X-Test-User', stUser());
        if (opts.body) req = req.send(JSON.parse(opts.body));
        const res = await req;
        return { ok: res.status >= 200 && res.status < 300, status: res.status, json: async () => res.body };
      };

      ({ trackerAdj, trackerRead, ensureLoaded: ensureTrackerLoaded } =
        await import('../../public/js/game/tracker.js'));
      ({ default: rollState } = await import('../../public/js/suite/data.js'));
      rollState.chars = [TEST_CHAR];
    });

    afterAll(async () => {
      globalThis.fetch = realFetch;
      await getCollection('tracker_state').deleteMany({ character_id: CHAR_ID });
      await teardownDb();
    });

    async function flush(turns = 15) {
      for (let i = 0; i < turns; i++) await new Promise(r => setTimeout(r, 0));
    }

    it('a roll-triggered vitae spend larger than the balance clamps at 0, in both the client cache and the persisted document', async () => {
      await ensureTrackerLoaded(TEST_CHAR); // seeds fresh defaults: vitae 5, willpower 2
      await flush();
      expect(trackerRead(CHAR_ID).vitae).toBe(5);

      // Exactly the shape doRoll() calls when a roll-triggered spend fires —
      // a delta far larger than the character actually has.
      await trackerAdj(CHAR_ID, 'vitae', -999);
      await flush();

      expect(trackerRead(CHAR_ID).vitae).toBe(0);

      const persisted = await request(app)
        .get(`/api/tracker_state/${CHAR_ID}`)
        .set('X-Test-User', stUser());
      expect(persisted.status).toBe(200);
      expect(persisted.body.vitae).toBe(0);
      expect(persisted.body.vitae).toBeGreaterThanOrEqual(0);
    });

    it('willpower spend clamps the same way, independently of vitae', async () => {
      await trackerAdj(CHAR_ID, 'willpower', -999);
      await flush();

      expect(trackerRead(CHAR_ID).willpower).toBe(0);

      const persisted = await request(app)
        .get(`/api/tracker_state/${CHAR_ID}`)
        .set('X-Test-User', stUser());
      expect(persisted.body.willpower).toBe(0);
      expect(persisted.body.willpower).toBeGreaterThanOrEqual(0);
    });

    it('a spend within balance is not clamped — proves the guard is a ceiling at 0, not a blanket zero-out', async () => {
      // Reset to a known value first (also proves upward adjustment works).
      await trackerAdj(CHAR_ID, 'vitae', 5); // 0 -> 5, clamped at calcVitaeMax (5)
      await flush();
      expect(trackerRead(CHAR_ID).vitae).toBe(5);

      await trackerAdj(CHAR_ID, 'vitae', -2); // an affordable spend
      await flush();
      expect(trackerRead(CHAR_ID).vitae).toBe(3);

      const persisted = await request(app)
        .get(`/api/tracker_state/${CHAR_ID}`)
        .set('X-Test-User', stUser());
      expect(persisted.body.vitae).toBe(3);
    });

    // ── Follow-up: standalone spendVitae()/spendWillpower(), live DB ──
    //
    // Angelus's actual original ask ("a button that spends vitae and
    // another that spends willpower for that player from their totals"),
    // distinct from the roll-triggered spend above. Same live-DB harness,
    // same TEST_CHAR/app/flush — adds spendVitae/spendWillpower and
    // loadGlobalSettings to what's already imported, and drives
    // game_in_progress through a real PATCH so the module-level
    // getGlobalSettings() cache reflects it, exactly as a real ST toggle
    // would.
    describe('spendVitae / spendWillpower (standalone, not roll-triggered)', () => {
      let spendVitae, spendWillpower, loadGlobalSettings;

      beforeAll(async () => {
        ({ spendVitae, spendWillpower } = await import('../../public/js/suite/roll-v2.js'));
        ({ loadGlobalSettings } = await import('../../public/js/data/app-settings.js'));
      });

      async function setGameInProgress(on) {
        await request(app)
          .patch('/api/settings')
          .set('X-Test-User', stUser())
          .send({ game_in_progress: on });
        await loadGlobalSettings();
      }

      it('spendVitae() decrements by exactly 1 and persists, when game_in_progress is on', async () => {
        await setGameInProgress(true);
        rollState.rollChar = TEST_CHAR;
        await trackerAdj(CHAR_ID, 'vitae', 5); // reset to a known value: 5 (clamped at max)
        await flush();
        expect(trackerRead(CHAR_ID).vitae).toBe(5);

        await spendVitae();
        await flush();

        expect(trackerRead(CHAR_ID).vitae).toBe(4);
        const persisted = await request(app).get(`/api/tracker_state/${CHAR_ID}`).set('X-Test-User', stUser());
        expect(persisted.body.vitae).toBe(4);
      });

      it('spendWillpower() decrements by exactly 1 and persists, independently of vitae', async () => {
        await trackerAdj(CHAR_ID, 'willpower', 2); // reset to max (2)
        await flush();
        expect(trackerRead(CHAR_ID).willpower).toBe(2);

        await spendWillpower();
        await flush();

        expect(trackerRead(CHAR_ID).willpower).toBe(1);
        const persisted = await request(app).get(`/api/tracker_state/${CHAR_ID}`).set('X-Test-User', stUser());
        expect(persisted.body.willpower).toBe(1);
      });

      it('spending at 0 is a safe no-op — never goes negative', async () => {
        await trackerAdj(CHAR_ID, 'willpower', -999); // drive to 0
        await flush();
        expect(trackerRead(CHAR_ID).willpower).toBe(0);

        await spendWillpower();
        await flush();

        expect(trackerRead(CHAR_ID).willpower).toBe(0);
        const persisted = await request(app).get(`/api/tracker_state/${CHAR_ID}`).set('X-Test-User', stUser());
        expect(persisted.body.willpower).toBe(0);
      });

      it('real guard, not just a UI hide: spendVitae()/spendWillpower() no-op when game_in_progress is off', async () => {
        await setGameInProgress(false);
        await trackerAdj(CHAR_ID, 'vitae', 5); // reset to a known value
        await flush();
        const before = trackerRead(CHAR_ID).vitae;

        await spendVitae();
        await flush();

        expect(trackerRead(CHAR_ID).vitae).toBe(before); // unchanged — the flag-off guard fired
        await setGameInProgress(true); // restore for any tests that run after this one
      });
    });
  });
});
