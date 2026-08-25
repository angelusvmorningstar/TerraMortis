/**
 * gdx.11 (#981) — Vampire Mechanics quick actions + free Custom Pool builder.
 *
 * Task 11's own scope: noWP guard unit test (roll-v2.js only) and Lash Out
 * Kindred/Mortal toggle vs. actual WP delta charged. Humanity Check's own
 * tests (attachedTouchstoneCount, dice/modifier table) moved to gdx-12 with
 * the rest of that carve-out - not this file's job.
 *
 * Same no-jsdom DOM/location/localStorage shim technique established by
 * gdx-7-apply-costs-on-roll.test.js (and reused throughout this codebase's
 * client-side suites) - roll-v2.js's own import chain touches `location`
 * (game/tracker.js, data/app-settings.js) and calls `document.getElementById`
 * unconditionally in several places `effPool()` itself does not reach, so
 * the shim still has to be present even though this file's own assertions
 * never touch the DOM.
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
    getElementById: () => _fakeElement(),
    createElement: () => _fakeElement(),
  };
}

import { describe, it, expect, beforeEach } from 'vitest';
import { isStakeWeapon } from '../../public/js/data/equipment-derivation.js';

describe('gdx.11 — isStakeWeapon() (AC7, Task 5)', () => {
  it('true for a catalogue entry tagged "stake"', () => {
    expect(isStakeWeapon({ name: 'Stake', tags: ['melee', 'kindred', 'stake'] })).toBe(true);
  });
  it('false for a weapon entry without the stake tag', () => {
    expect(isStakeWeapon({ name: 'Machete', tags: ['melee'] })).toBe(false);
  });
  it('false for a missing/empty tags array, not a throw', () => {
    expect(isStakeWeapon({ name: 'Improvised Weapon' })).toBe(false);
    expect(isStakeWeapon({ name: 'X', tags: [] })).toBe(false);
  });
  it('false for a null/undefined entry, not a throw', () => {
    expect(isStakeWeapon(null)).toBe(false);
    expect(isStakeWeapon(undefined)).toBe(false);
  });
});

describe('gdx.11 — effPool() noWP guard (AC6)', () => {
  let effPool, state;

  beforeEach(async () => {
    ({ effPool } = await import('../../public/js/suite/roll-v2.js'));
    ({ default: state } = await import('../../public/js/suite/data.js'));
    state.PS = 5;
    state.MOD = 0;
    state.WP = false;
    state.POOL_INFO = null;
    state.RESIST_MODE = null;
    state.RESIST_VAL = 0;
  });

  it('adds the WP(+3) bonus when the WP chip is on and the pool is a normal (non-noWP) pool', () => {
    state.WP = true;
    state.POOL_INFO = { total: 5, attr: 'Strength', noWP: false };
    expect(effPool()).toBe(8);
  });

  it('does NOT add the WP(+3) bonus when the WP chip is on but the loaded pool is noWP (Blood Bond Resistance)', () => {
    state.WP = true;
    state.POOL_INFO = { total: 5, attr: 'Blood Potency', noWP: true };
    expect(effPool()).toBe(5);
  });

  it('does NOT add the WP(+3) bonus for a noWP pool even with no pool loaded yet is irrelevant - null POOL_INFO is not noWP, chip still applies', () => {
    // Documents the boundary explicitly: a falsy POOL_INFO (nothing loaded)
    // is NOT the same as an explicit noWP pool - the chip still functions
    // normally (matches `!state.POOL_INFO?.noWP` reading `undefined` as
    // falsy, not as "true").
    state.WP = true;
    state.POOL_INFO = null;
    expect(effPool()).toBe(8);
  });

  it('never adds the WP bonus when the WP chip itself is off, noWP or not', () => {
    state.WP = false;
    state.POOL_INFO = { total: 5, attr: 'Strength', noWP: false };
    expect(effPool()).toBe(5);
    state.POOL_INFO = { total: 5, attr: 'Blood Potency', noWP: true };
    expect(effPool()).toBe(5);
  });

  it('composes with the resist-subtraction branch (RESIST_MODE "-") the same way regardless of noWP', () => {
    state.WP = true;
    state.RESIST_MODE = '-';
    state.RESIST_VAL = 2;
    state.POOL_INFO = { total: 5, attr: 'Blood Potency', noWP: true };
    // No +3 from the inert chip, but the -2 resist still applies: 5 - 2 = 3
    expect(effPool()).toBe(3);
  });
});

describe('gdx.11 — lashOutPool() Kindred/Mortal toggle vs. actual WP delta charged (AC3)', () => {
  let lashOutPool, spendableCost;
  const char = { blood_potency: 3, attributes: { Strength: { dots: 2, bonus: 0 } }, disciplines: {} };

  beforeEach(async () => {
    ({ lashOutPool } = await import('../../public/js/shared/resist.js'));
    ({ spendableCost } = await import('../../public/js/suite/roll-v2.js'));
  });

  it('Kindred sets willpower_cost: 1', () => {
    const { pi } = lashOutPool(char, 'Strength', true);
    expect(pi.willpower_cost).toBe(1);
  });

  it('Mortal sets willpower_cost: 0', () => {
    const { pi } = lashOutPool(char, 'Strength', false);
    expect(pi.willpower_cost).toBe(0);
  });

  it('pool total is the chosen Power Attribute + Blood Potency, unaffected by the toggle', () => {
    const kindred = lashOutPool(char, 'Strength', true);
    const mortal = lashOutPool(char, 'Strength', false);
    expect(kindred.total).toBe(2 + 3);
    expect(mortal.total).toBe(2 + 3);
  });

  it('resistance string is "v " + the same attribute + " BP", regardless of the toggle', () => {
    const { pi } = lashOutPool(char, 'Strength', true);
    expect(pi.resistance).toBe('v Strength + BP');
  });

  it('feeds directly into spendableCost() to produce the actual WP delta the roll would charge - Kindred', () => {
    const { pi } = lashOutPool(char, 'Strength', true);
    const cost = spendableCost(pi, false);
    expect(cost.willpowerCost).toBe(1);
    expect(cost.hasPowerCost).toBe(true);
  });

  it('feeds directly into spendableCost() to produce the actual WP delta the roll would charge - Mortal', () => {
    const { pi } = lashOutPool(char, 'Strength', false);
    const cost = spendableCost(pi, false);
    expect(cost.willpowerCost).toBe(0);
    expect(cost.hasPowerCost).toBe(false);
  });

  it('Kindred WP cost stacks additively with the separate WP(+3) boost chip, matching spendableCost\'s own documented "additive, never either/or" rule', () => {
    const { pi } = lashOutPool(char, 'Strength', true);
    const cost = spendableCost(pi, true); // chip also on
    expect(cost.willpowerCost).toBe(2); // 1 from Lash Out itself + 1 from the chip
  });
});

// Code review finding (Blind Hunter + Edge Case Hunter, independently): the
// original inline pi at the app.js call site set noWP:true but never
// willpower_cost, so the "1 WP to attempt" AC5 promises was never actually
// charged. Extracted to bloodBondPool() specifically so this is provable -
// revert willpower_cost to undefined/0 in resist.js and these two go red.
describe('gdx.11 — bloodBondPool() willpower cost + clamp (AC5, code review fix)', () => {
  let bloodBondPool, spendableCost;
  const char = { blood_potency: 3, disciplines: {} };

  beforeEach(async () => {
    ({ bloodBondPool } = await import('../../public/js/shared/resist.js'));
    ({ spendableCost } = await import('../../public/js/suite/roll-v2.js'));
  });

  it('sets willpower_cost: 1 - the cost of ATTEMPTING, per AC5', () => {
    const { pi } = bloodBondPool(char, 1, 0);
    expect(pi.willpower_cost).toBe(1);
    expect(pi.noWP).toBe(true);
  });

  it('feeds directly into spendableCost() to produce the actual WP delta the roll would charge', () => {
    const { pi } = bloodBondPool(char, 1, 0);
    const cost = spendableCost(pi, false);
    expect(cost.willpowerCost).toBe(1);
    expect(cost.hasPowerCost).toBe(true);
  });

  it('pool total is max(0, Blood Potency - Vitae - Attempts)', () => {
    expect(bloodBondPool(char, 1, 0).total).toBe(2);
    expect(bloodBondPool(char, 2, 1).total).toBe(0);
  });

  it('clamps at 0 rather than going negative when Vitae + Attempts exceed Blood Potency', () => {
    expect(bloodBondPool(char, 4, 3).total).toBe(0);
  });
});

// Code review finding (Acceptance Auditor): DISC_ABBR only covers the 10
// base-clan/ritual disciplines, but this campaign's live data has non-core
// disciplines (Creation, Divination, Protection) that Clash of Wills can
// legitimately name in a resistance string. The old fallback silently
// resolved these as type:'attr' (a guaranteed 0 via getAttrEffective on a
// non-attribute name); revert the fallback to 'attr' and this goes red.
describe('gdx.11 — parseResistance() resolves an unrecognised token as a discipline, not a silent-zero attribute (code review fix)', () => {
  let parseResistance, getResistTokenVal;

  beforeEach(async () => {
    ({ parseResistance, getResistTokenVal } = await import('../../public/js/shared/resist.js'));
  });

  it('a non-core discipline name (not in DISC_ABBR) resolves as type: "disc"', () => {
    const parsed = parseResistance('v Creation + BP');
    expect(parsed.tokens[0]).toMatchObject({ key: 'Creation', type: 'disc' });
  });

  it('resolves to the real dot count via getResistTokenVal, not a silent 0', () => {
    const char = { disciplines: { Creation: { dots: 4 } } };
    const parsed = parseResistance('v Creation + BP');
    expect(getResistTokenVal(char, parsed.tokens[0])).toBe(4);
  });

  it('a known base-clan abbreviation still resolves exactly as before (no regression)', () => {
    const parsed = parseResistance('v Obf + BP');
    expect(parsed.tokens[0]).toMatchObject({ key: 'Obfuscate', type: 'disc' });
  });
});
