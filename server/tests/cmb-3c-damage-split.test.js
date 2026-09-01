/**
 * cmb.3c - the Kindred damage-split arithmetic in
 * `public/js/game/combat-tab.js`.
 *
 * This file is the unit-level home the story's Task 1 asks for: the pure
 * `computeKindredSplit` formula, swept exhaustively, plus the wiring that has to
 * agree with it (the rendered preview prose, the calculator's own state, and
 * what Apply actually writes through `trackerAdj`).
 *
 * The real-browser half - measured tap targets, real dispatched taps, the raw
 * damage buttons staying independently usable - lives in
 * `tests/cmb-3c-damage-split.spec.js`, which has a layout engine. This one has
 * no DOM, so it asserts against the rendered HTML string, exactly as
 * `cmb-1-combat-card-shell.test.js` established for this same module.
 *
 * THE FORMULA UNDER TEST (Terra Mortis Conflict Errata, quoted in the story):
 *   rating > 0 -> `rating` points of the rated type PLUS every success as
 *                 Bashing. Total = rating + successes.
 *   rating = 0 -> the FIRST success is upgraded to the rated type, the rest are
 *                 Bashing. Total = successes exactly.
 *
 * The rating = 0 branch is the only non-additive case in the whole rule and the
 * story flags it as the likeliest real bug, so it is swept rather than sampled.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const ATTRS = { Dexterity: 3, Composure: 2, Strength: 4, Wits: 2, Stamina: 2 };

// Same mock preamble cmb-1-combat-card-shell.test.js established for this
// module - combat-tab.js reaches for browser-only imports at module load, and
// there is no jsdom in this repo.
vi.mock('../../public/js/data/accessors.js', () => ({
  getAttrEffective: vi.fn((c, attr) => (c._attrs || ATTRS)[attr] || 0),
  calcDefence: vi.fn(() => 2),
  // Deliberately generous: the split arithmetic under test here must not be
  // measured against trackerAdj's own at-the-cap refusal, which is a separate
  // pre-existing rule (see the note on the Apply describe block below).
  calcHealth: vi.fn(() => 20),
  calcVitaeMax: vi.fn(() => 10),
  calcWillpowerMax: vi.fn(() => 5),
  calcSpeed: vi.fn(() => 9),
  skTotal: vi.fn((c, skill) => (c._skills || {})[skill] || 0),
}));
vi.mock('../../public/js/data/equipment-derivation.js', () => ({
  defenceForDisplay: vi.fn(() => 2),
  isEquipmentOnMe: item => !!item && (item.state === 'carried' || item.state === 'worn' || item.state === 'active'),
  isCombatGearWeaponShaped: entry => !!entry &&
    (entry.weapon_type != null || entry.damage_mod != null || entry.damage_type != null),
}));
vi.mock('../../public/js/data/equipment-catalogue-cache.js', () => ({
  getCatalogueEntry: vi.fn(() => null),
}));
vi.mock('../../public/js/data/helpers.js', () => ({
  esc: s => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
}));

const TRACKER = {};
const trackerAdj = vi.fn(async (charId, field, delta) => {
  const cs = TRACKER[charId];
  if (!cs) return;
  cs[field] = Math.max(0, (cs[field] || 0) + delta);
});
const trackerRead = vi.fn(charId => TRACKER[charId] || null);
vi.mock('../../public/js/game/tracker.js', () => ({
  trackerAdj: (...a) => trackerAdj(...a),
  trackerRead: (...a) => trackerRead(...a),
}));

const loadPool = vi.fn();
vi.mock('../../public/js/suite/roll-v2.js', () => ({ loadPool }));

const _session = new Map();
globalThis.window = globalThis.window || {};
globalThis.sessionStorage = {
  getItem: k => (_session.has(k) ? _session.get(k) : null),
  setItem: (k, v) => _session.set(k, String(v)),
  removeItem: k => _session.delete(k),
};
globalThis.document = globalThis.document || { getElementById: () => null };

const combatTab = await import('../../public/js/game/combat-tab.js');
const suiteState = (await import('../../public/js/suite/data.js')).default;

const { computeKindredSplit } = combatTab;

// ── Fixtures ─────────────────────────────────────────────────────────────────

const WAN = { _id: 'c-wan', name: 'Wan', moniker: 'Wan' };
const REED = { _id: 'c-reed', name: 'Reed', moniker: 'Reed' };

function makeEl() {
  return {
    _html: '',
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = v; },
  };
}

let el;

function trackerSeed(id, over = {}) {
  TRACKER[id] = { vitae: 6, willpower: 4, bashing: 0, lethal: 0, aggravated: 0, ...over };
}

function startScene() {
  window.combatAddChar('c-wan');
  window.combatAddChar('c-reed');
  window.combatStart();
  vi.spyOn(Math, 'random').mockReturnValue(0.41);
  window.combatRollInit();
  Math.random.mockRestore();
}

/** Drive a card's calculator to a given state through its real window API. */
function setSplit(id, successes, rating, type) {
  for (let i = 0; i < successes; i++) window.combatSplitStep(id, 'successes', 1);
  for (let i = 0; i < rating; i++) window.combatSplitStep(id, 'rating', 1);
  if (type) window.combatSplitType(id, type);
}

beforeEach(() => {
  vi.clearAllMocks();
  // The calculator's own state is a module-level Map that deliberately survives
  // a re-render, and the module is imported once for the whole file. End Combat
  // is its real teardown (asserted in its own right further down), so the suite
  // uses that rather than reaching into the module's internals.
  if (window.combatEnd) window.combatEnd();
  _session.clear();
  for (const k of Object.keys(TRACKER)) delete TRACKER[k];
  trackerSeed('c-wan');
  trackerSeed('c-reed');
  suiteState.chars = [WAN, REED];
  window.goTab = vi.fn();
  el = makeEl();
  combatTab.initCombatTab(el);
  // Every test below works on an open card, since the calculator only exists in
  // the expanded body.
  startScene();
  window.combatToggleExpand('c-wan');
});

// ── The pure formula ─────────────────────────────────────────────────────────

describe('cmb.3c - computeKindredSplit, rating > 0 (purely additive)', () => {
  it('the Errata\'s own worked example: 5 successes with a 1L weapon', () => {
    // "a 1L weapon used with Kindred duelling would deliver one Lethal damage +
    // successes Bashing damage" - 6 points of damage in total, not 5.
    expect(computeKindredSplit(5, 1)).toEqual({ ratedPoints: 1, bashingPoints: 5 });
    const { ratedPoints, bashingPoints } = computeKindredSplit(5, 1);
    expect(ratedPoints + bashingPoints).toBe(6);
  });

  it('the rating is ADDED, never subtracted from or capped by the successes', () => {
    // Each of these would come out differently under the three wrong readings
    // the story warns about (successes - rating, min(successes, rating), or
    // rating replacing successes).
    expect(computeKindredSplit(5, 3)).toEqual({ ratedPoints: 3, bashingPoints: 5 });
    expect(computeKindredSplit(2, 4)).toEqual({ ratedPoints: 4, bashingPoints: 2 });
    expect(computeKindredSplit(1, 1)).toEqual({ ratedPoints: 1, bashingPoints: 1 });
  });

  it('zero successes with a positive rating still delivers the rating alone', () => {
    // An ST calling up a guaranteed effect, per the story's third bullet - the
    // calculator does not gate on "was this actually a hit".
    expect(computeKindredSplit(0, 2)).toEqual({ ratedPoints: 2, bashingPoints: 0 });
    expect(computeKindredSplit(0, 1)).toEqual({ ratedPoints: 1, bashingPoints: 0 });
  });

  it('total damage is exactly rating + successes for every rating >= 1', () => {
    for (let s = 0; s <= 10; s++) {
      for (let r = 1; r <= 5; r++) {
        const { ratedPoints, bashingPoints } = computeKindredSplit(s, r);
        expect(ratedPoints, `rating ${r} must be delivered whole`).toBe(r);
        expect(bashingPoints, `all ${s} successes must be Bashing`).toBe(s);
        expect(ratedPoints + bashingPoints).toBe(s + r);
      }
    }
  });
});

describe('cmb.3c - computeKindredSplit, rating = 0 (the off-by-one branch)', () => {
  it('1 success bare is 1 rated point and no Bashing at all', () => {
    expect(computeKindredSplit(1, 0)).toEqual({ ratedPoints: 1, bashingPoints: 0 });
  });

  it('5 successes bare is 1 rated point + 4 Bashing, NOT 1 + 5', () => {
    // The single likeliest real bug in this story: reusing the rating > 0 shape
    // here gives { 1, 5 } and silently invents a sixth point of damage.
    expect(computeKindredSplit(5, 0)).toEqual({ ratedPoints: 1, bashingPoints: 4 });
    expect(computeKindredSplit(5, 0)).not.toEqual({ ratedPoints: 1, bashingPoints: 5 });
  });

  it('nothing at all is applied on zero successes and no rating', () => {
    expect(computeKindredSplit(0, 0)).toEqual({ ratedPoints: 0, bashingPoints: 0 });
  });

  it('total damage stays exactly the successes rolled, for every count', () => {
    for (let s = 0; s <= 12; s++) {
      const { ratedPoints, bashingPoints } = computeKindredSplit(s, 0);
      expect(ratedPoints + bashingPoints, `${s} successes must total ${s}`).toBe(s);
      expect(ratedPoints).toBe(s >= 1 ? 1 : 0);
      expect(bashingPoints).toBe(s >= 1 ? s - 1 : 0);
    }
  });

  it('is never negative, whatever it is handed', () => {
    for (const [s, r] of [[-3, 0], [-3, 2], [0, -1], [-1, -1]]) {
      const out = computeKindredSplit(s, r);
      expect(out.ratedPoints).toBeGreaterThanOrEqual(0);
      expect(out.bashingPoints).toBeGreaterThanOrEqual(0);
    }
    expect(computeKindredSplit(-3, 0)).toEqual({ ratedPoints: 0, bashingPoints: 0 });
    expect(computeKindredSplit(-3, 2)).toEqual({ ratedPoints: 2, bashingPoints: 0 });
  });

  it('is pure - the same inputs give the same answer with no state anywhere', () => {
    const a = computeKindredSplit(5, 0);
    setSplit('c-wan', 3, 2);
    window.combatSplitApply('c-wan');
    expect(computeKindredSplit(5, 0)).toEqual(a);
  });
});

// ── AC1 - the calculator renders on the expanded card ────────────────────────

describe('cmb.3c AC1 - the calculator is on the card, beside the damage buttons', () => {
  it('renders both steppers, the type toggle and Apply', () => {
    expect(el.innerHTML).toContain('cbt-split');
    expect(el.innerHTML).toContain(`combatSplitStep('c-wan','successes',1)`);
    expect(el.innerHTML).toContain(`combatSplitStep('c-wan','successes',-1)`);
    expect(el.innerHTML).toContain(`combatSplitStep('c-wan','rating',1)`);
    expect(el.innerHTML).toContain(`combatSplitStep('c-wan','rating',-1)`);
    expect(el.innerHTML).toContain(`combatSplitType('c-wan','lethal')`);
    expect(el.innerHTML).toContain(`combatSplitType('c-wan','aggravated')`);
    expect(el.innerHTML).toContain(`combatSplitApply('c-wan')`);
  });

  it('sits inside the expanded body only, never on a collapsed card', () => {
    window.combatToggleExpand('c-wan');   // collapse it again
    expect(el.innerHTML).not.toContain('cbt-card-exp');
    expect(el.innerHTML).not.toContain('cbt-split');
  });

  it('starts at 0 / 0 / Lethal', () => {
    const st = window.combatSplitState('c-wan');
    expect(st).toEqual({ successes: 0, rating: 0, type: 'lethal', ratedPoints: 0, bashingPoints: 0 });
    expect(el.innerHTML).toContain('data-cbt-split-type="lethal" aria-pressed="true"');
    expect(el.innerHTML).toContain('data-cbt-split-type="aggravated" aria-pressed="false"');
  });

  it('the steppers move their own field and floor at zero', () => {
    window.combatSplitStep('c-wan', 'successes', 1);
    window.combatSplitStep('c-wan', 'successes', 1);
    window.combatSplitStep('c-wan', 'rating', 1);
    expect(window.combatSplitState('c-wan')).toMatchObject({ successes: 2, rating: 1 });

    for (let i = 0; i < 5; i++) window.combatSplitStep('c-wan', 'successes', -1);
    for (let i = 0; i < 5; i++) window.combatSplitStep('c-wan', 'rating', -1);
    expect(window.combatSplitState('c-wan')).toMatchObject({ successes: 0, rating: 0 });
  });

  it('each card carries its own calculator, not a shared one', () => {
    setSplit('c-wan', 4, 2);
    expect(window.combatSplitState('c-reed')).toMatchObject({ successes: 0, rating: 0 });
    expect(window.combatSplitState('c-wan')).toMatchObject({ successes: 4, rating: 2 });
  });

  it('is scratch state - nothing about it reaches sessionStorage', () => {
    setSplit('c-wan', 5, 1, 'aggravated');
    const stored = _session.get('tm_combat_scene') || '';
    expect(stored).not.toContain('successes');
    expect(stored).not.toContain('aggravated');
    expect(stored).not.toContain('split');
  });

  it('a combatant leaving the fight takes their calculator with them', () => {
    setSplit('c-wan', 5, 1);
    window.combatRemove('c-wan');
    window.combatAddChar('c-wan');
    expect(window.combatSplitState('c-wan')).toMatchObject({ successes: 0, rating: 0 });
  });
});

// ── AC2 / AC3 - the preview prose names both audiences ───────────────────────

describe('cmb.3c AC2 - rating > 0 previews rating at type + successes Bashing', () => {
  it('is the story\'s own worked sentence, word for word', () => {
    setSplit('c-wan', 5, 1);
    expect(el.innerHTML).toContain(
      '5 successes, rating 1 → 1 Lethal (a mortal takes this too) + 5 Bashing to Kindred (a mortal would take these as Lethal too).'
    );
  });

  it('names both audiences, never a bare number', () => {
    setSplit('c-wan', 3, 2);
    expect(el.innerHTML).toContain('2 Lethal (a mortal takes these too)');
    expect(el.innerHTML).toContain('3 Bashing to Kindred (a mortal would take these as Lethal too)');
  });

  it('drops the Bashing half entirely when there are no successes', () => {
    setSplit('c-wan', 0, 2);
    expect(el.innerHTML).toContain('0 successes, rating 2 → 2 Lethal (a mortal takes these too).');
    expect(el.innerHTML).not.toContain('Bashing to Kindred');
  });
});

describe('cmb.3c AC3 - rating = 0 upgrades the first success only', () => {
  it('successes = 1 previews 1 Lethal and no Bashing half at all', () => {
    setSplit('c-wan', 1, 0);
    expect(el.innerHTML).toContain('1 success, rating 0 → 1 Lethal (a mortal takes this too).');
    expect(el.innerHTML).not.toContain('Bashing to Kindred');
  });

  it('successes = 5 previews 1 Lethal + 4 Bashing, never 1 + 5', () => {
    setSplit('c-wan', 5, 0);
    expect(el.innerHTML).toContain('5 successes, rating 0 → 1 Lethal (a mortal takes this too) + 4 Bashing to Kindred (a mortal would take these as Lethal too).');
    expect(el.innerHTML).not.toContain('+ 5 Bashing to Kindred');
  });

  it('successes = 0 has nothing to apply and says so', () => {
    expect(el.innerHTML).toContain('0 successes, rating 0 → nothing to apply.');
  });
});

// ── AC4 - the Aggravated toggle changes the label and the field, not the maths ──

describe('cmb.3c AC4 - Aggravated changes only the labelled type and the target field', () => {
  it('the split arithmetic is identical either way', () => {
    setSplit('c-wan', 5, 1, 'lethal');
    const asLethal = window.combatSplitState('c-wan');
    window.combatSplitType('c-wan', 'aggravated');
    const asAgg = window.combatSplitState('c-wan');
    expect(asAgg.ratedPoints).toBe(asLethal.ratedPoints);
    expect(asAgg.bashingPoints).toBe(asLethal.bashingPoints);
  });

  it('relabels the preview and keeps the Bashing half Bashing', () => {
    setSplit('c-wan', 5, 1, 'aggravated');
    expect(el.innerHTML).toContain('1 Aggravated (a mortal takes this too)');
    expect(el.innerHTML).toContain('5 Bashing to Kindred');
    expect(el.innerHTML).not.toContain('1 Lethal (a mortal takes');
  });

  it('relabels the rating = 0 upgrade too', () => {
    setSplit('c-wan', 4, 0, 'aggravated');
    expect(el.innerHTML).toContain('4 successes, rating 0 → 1 Aggravated (a mortal takes this too) + 3 Bashing to Kindred');
  });

  it('marks exactly one type button pressed', () => {
    window.combatSplitType('c-wan', 'aggravated');
    expect(el.innerHTML).toContain('data-cbt-split-type="aggravated" aria-pressed="true"');
    expect(el.innerHTML).toContain('data-cbt-split-type="lethal" aria-pressed="false"');
    expect(el.innerHTML.match(/data-cbt-split-type="[a-z]+" aria-pressed="true"/g)).toHaveLength(1);
  });

  it('an unknown type is ignored rather than rendered', () => {
    window.combatSplitType('c-wan', 'bashing');
    expect(window.combatSplitState('c-wan').type).toBe('lethal');
    window.combatSplitType('c-wan', 'nonsense');
    expect(window.combatSplitState('c-wan').type).toBe('lethal');
  });
});

// ── AC5 - Apply writes through the same trackerAdj path, additively ──────────

/* NOTE ON THE HEALTH CAP. `trackerAdj` refuses a positive damage delta when the
   track is ALREADY full (`if (delta > 0 && used >= maxHp) return;`) but does not
   clamp the delta itself. Applying a split of N in one call therefore diverges
   from N individual +B clicks only in that one at-the-cap case - a pre-existing
   property of trackerAdj, not something this story introduced. calcHealth is
   mocked generously above so these assertions measure the split, not that rule. */
describe('cmb.3c AC5 - Apply commits through applyDmg, additively', () => {
  it('writes the rated half and the Bashing half through trackerAdj', async () => {
    setSplit('c-wan', 5, 1);
    await window.combatSplitApply('c-wan');
    expect(trackerAdj).toHaveBeenCalledWith('c-wan', 'lethal', 1);
    expect(trackerAdj).toHaveBeenCalledWith('c-wan', 'bashing', 5);
    expect(TRACKER['c-wan']).toMatchObject({ lethal: 1, bashing: 5, aggravated: 0 });
  });

  it('adds to existing damage rather than resetting it', async () => {
    trackerSeed('c-wan', { bashing: 2, lethal: 1, aggravated: 1 });
    setSplit('c-wan', 5, 1);
    await window.combatSplitApply('c-wan');
    // Pre-existing 2B/1L/1A, plus this split's 1L + 5B.
    expect(TRACKER['c-wan']).toMatchObject({ bashing: 7, lethal: 2, aggravated: 1 });
  });

  it('writes the rating = 0 split as 1 + (successes - 1), not 1 + successes', async () => {
    setSplit('c-wan', 5, 0);
    await window.combatSplitApply('c-wan');
    expect(trackerAdj).toHaveBeenCalledWith('c-wan', 'lethal', 1);
    expect(trackerAdj).toHaveBeenCalledWith('c-wan', 'bashing', 4);
    expect(trackerAdj).not.toHaveBeenCalledWith('c-wan', 'bashing', 5);
    expect(TRACKER['c-wan'].bashing + TRACKER['c-wan'].lethal).toBe(5);
  });

  it('writes no Bashing call at all when the Bashing half is zero', async () => {
    setSplit('c-wan', 1, 0);
    await window.combatSplitApply('c-wan');
    expect(TRACKER['c-wan']).toMatchObject({ lethal: 1, bashing: 0 });
    expect(trackerAdj).not.toHaveBeenCalledWith('c-wan', 'bashing', 0);
  });

  it('writes to `aggravated` when Aggravated is selected', async () => {
    setSplit('c-wan', 5, 1, 'aggravated');
    await window.combatSplitApply('c-wan');
    expect(trackerAdj).toHaveBeenCalledWith('c-wan', 'aggravated', 1);
    expect(trackerAdj).toHaveBeenCalledWith('c-wan', 'bashing', 5);
    expect(trackerAdj).not.toHaveBeenCalledWith('c-wan', 'lethal', 1);
    expect(TRACKER['c-wan']).toMatchObject({ aggravated: 1, bashing: 5, lethal: 0 });
  });

  it('a guaranteed effect with zero successes still writes the rating alone', async () => {
    setSplit('c-wan', 0, 2, 'aggravated');
    await window.combatSplitApply('c-wan');
    expect(TRACKER['c-wan']).toMatchObject({ aggravated: 2, bashing: 0 });
  });

  it('writes nothing at all when there is nothing to apply', async () => {
    await window.combatSplitApply('c-wan');
    expect(trackerAdj).not.toHaveBeenCalled();
    expect(TRACKER['c-wan']).toMatchObject({ bashing: 0, lethal: 0, aggravated: 0 });
  });

  it('applies to the card it belongs to, never to another combatant', async () => {
    setSplit('c-wan', 3, 1);
    await window.combatSplitApply('c-wan');
    expect(TRACKER['c-reed']).toMatchObject({ bashing: 0, lethal: 0, aggravated: 0 });
  });

  it('applying twice stacks, because it is the same additive path as the buttons', async () => {
    setSplit('c-wan', 2, 1);
    await window.combatSplitApply('c-wan');
    await window.combatSplitApply('c-wan');
    expect(TRACKER['c-wan']).toMatchObject({ lethal: 2, bashing: 4 });
  });

  it('leaves the calculator inputs alone, so a repeat hit needs no retyping', async () => {
    setSplit('c-wan', 5, 1);
    await window.combatSplitApply('c-wan');
    expect(window.combatSplitState('c-wan')).toMatchObject({ successes: 5, rating: 1, type: 'lethal' });
  });
});

// ── AC6 / AC7 - the raw buttons and the rest of the card are untouched ───────

describe('cmb.3c AC6 - the raw +B/+L/+A/- buttons are unchanged', () => {
  it('all four are still rendered and still wired straight to combatDmg', () => {
    expect(el.innerHTML).toContain("combatDmg('c-wan','bashing',1)");
    expect(el.innerHTML).toContain("combatDmg('c-wan','lethal',1)");
    expect(el.innerHTML).toContain("combatDmg('c-wan','aggravated',1)");
    expect(el.innerHTML).toContain("combatDmg('c-wan','bashing',-1)");
  });

  it('still work with the calculator mid-edit and never consult it', async () => {
    setSplit('c-wan', 5, 2, 'aggravated');   // deliberately never applied
    await window.combatDmg('c-wan', 'bashing', 1);
    expect(TRACKER['c-wan']).toMatchObject({ bashing: 1, lethal: 0, aggravated: 0 });
    expect(window.combatSplitState('c-wan')).toMatchObject({ successes: 5, rating: 2 });
  });
});

describe('cmb.3c AC7 - the calculator gates nothing else on the card', () => {
  beforeEach(() => { setSplit('c-wan', 7, 3, 'aggravated'); });

  it('the card still collapses and expands', () => {
    window.combatToggleExpand('c-wan');
    expect(el.innerHTML).not.toContain('cbt-card-exp');
    window.combatToggleExpand('c-wan');
    expect(el.innerHTML).toContain('cbt-card-exp');
  });

  it('the calculator survives a re-render with its values intact', () => {
    window.combatNextTurn();
    expect(window.combatSplitState('c-wan')).toMatchObject({ successes: 7, rating: 3, type: 'aggravated' });
    expect(el.innerHTML).toContain('7 successes, rating 3');
  });

  it('the drag handle, the Attack button and the tracks are all still there', () => {
    expect(el.innerHTML).toContain('data-cbt-grip="c-wan"');
    expect(el.innerHTML).toContain(`combatAttack('c-wan')`);
    expect(el.innerHTML).toContain(`combatTrack('c-wan','vitae',1)`);
    expect(el.innerHTML).toContain(`combatTrack('c-wan','willpower',-1)`);
  });

  it('End Combat still clears the scene, and the calculator with it', () => {
    window.combatEnd();
    expect(el.innerHTML).toContain('cbt-setup');
    expect(window.combatSplitState('c-wan')).toMatchObject({ successes: 0, rating: 0, type: 'lethal' });
  });

  it('a step for a combatant who is not in the scene is a no-op', () => {
    window.combatSplitStep('c-nobody', 'successes', 1);
    expect(window.combatSplitState('c-nobody')).toMatchObject({ successes: 0, rating: 0 });
  });

  it('a step on an unknown field is a no-op', () => {
    window.combatSplitStep('c-wan', 'aggravated', 1);
    expect(window.combatSplitState('c-wan')).toMatchObject({ successes: 7, rating: 3 });
  });
});
