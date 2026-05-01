/**
 * Parallel-write contract test — Discipline → Attribute / derived-stat rules.
 *
 * Compares legacy hardcoded behaviour against the new rules-collection-driven
 * discAttrBonus, calcSpeed, calcDefence for each scenario in the I/O matrix.
 *
 * Requires rule docs to be present in tm_suite_test (run
 * `MONGODB_DB=tm_suite_test node server/scripts/seed-rules-disc-attr.js --apply`).
 */

import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

// Hoisted cache ref — populated in beforeAll; read by getRulesCache mock
const cacheRef = vi.hoisted(() => ({ cache: null }));

vi.mock('../../public/js/data/loader.js', () => ({
  getRulesByCategory: () => [],
  getRuleByKey: () => null,
  getRulesDB: () => [],
  sanitiseChar: c => c,
  loadCharsFromApi: async () => null,
}));

vi.mock('../../public/js/editor/rule_engine/load-rules.js', () => ({
  preloadRules: async () => {},
  invalidateRulesCache: () => {},
  getRulesCache: () => cacheRef.cache,
  getRulesBySource: () => ({ grants: [], nineAgain: [], skillBonus: [], specialityGrants: [], tierBudget: null }),
}));

import { discAttrBonus, calcSpeed, calcDefence, getAttrEffective } from '../../public/js/data/accessors.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

// ── Legacy inline implementations (pre-refactor) ─────────────────────────────

const LEGACY_DISC_ATTR_MAP = { Strength: 'Vigour', Stamina: 'Resilience' };

function legacyDiscAttrBonus(c, attr) {
  const disc = LEGACY_DISC_ATTR_MAP[attr];
  if (!disc) return 0;
  return c.disciplines?.[disc]?.dots || 0;
}

function legacyGetAttrVal(c, attr) { return c.attributes?.[attr]?.dots || 0; }
function legacyGetAttrBonus(c, attr) { return c.attributes?.[attr]?.bonus || 0; }
function legacyGetAttrTotal(c, attr) { return legacyGetAttrVal(c, attr) + legacyGetAttrBonus(c, attr); }
function legacyGetAttrEffective(c, attr) {
  return legacyGetAttrVal(c, attr) + legacyGetAttrBonus(c, attr) + legacyDiscAttrBonus(c, attr);
}
function legacyCalcSize(c) {
  const giant = (c.merits || []).find(m => m.name === 'Giant');
  return 5 + (giant ? 1 : 0);
}
function legacySkDots(c, skill) { return c.skills?.[skill]?.dots || 0; }

function legacyCalcSpeed(c) {
  const str = legacyGetAttrEffective(c, 'Strength');
  const dex = legacyGetAttrTotal(c, 'Dexterity');
  const sz = legacyCalcSize(c);
  const celerity = c.disciplines?.Celerity?.dots || 0;
  const fleet = (c.merits || []).find(m => m.name === 'Fleet of Foot');
  return str + dex + sz + celerity + (fleet ? fleet.rating : 0);
}

function legacyCalcDefence(c) {
  const dex = legacyGetAttrTotal(c, 'Dexterity');
  const wits = legacyGetAttrVal(c, 'Wits');
  const celerity = c.disciplines?.Celerity?.dots || 0;
  const base = Math.min(dex, wits);
  const dc = (c.merits || []).find(m => m.name === 'Defensive Combat');
  const skill = dc ? legacySkDots(c, dc.qualifier || 'Athletics') : legacySkDots(c, 'Athletics');
  return base + skill + celerity;
}

// ── Fixture builder ───────────────────────────────────────────────────────────

function baseChar(overrides = {}) {
  return {
    name: 'Test',
    attributes: {
      Strength:    { dots: 2, bonus: 0 },
      Dexterity:   { dots: 2, bonus: 0 },
      Stamina:     { dots: 2, bonus: 0 },
      Presence:    { dots: 2, bonus: 0 },
      Manipulation:{ dots: 2, bonus: 0 },
      Composure:   { dots: 2, bonus: 0 },
      Intelligence:{ dots: 2, bonus: 0 },
      Wits:        { dots: 3, bonus: 0 },
      Resolve:     { dots: 2, bonus: 0 },
    },
    skills: { Athletics: { dots: 2, bonus: 0, specs: [], nine_again: false } },
    disciplines: {},
    merits: [],
    powers: [],
    fighting_styles: [],
    ...overrides,
  };
}

// ── Test setup ────────────────────────────────────────────────────────────────

beforeAll(async () => {
  await setupDb();

  const discAttrDocs = await getCollection('rule_disc_attr').find({}).toArray();

  if (!discAttrDocs.length) {
    throw new Error(
      'rule_disc_attr docs not found in tm_suite_test. ' +
      'Run: MONGODB_DB=tm_suite_test node server/scripts/seed-rules-disc-attr.js --apply',
    );
  }

  cacheRef.cache = { rule_disc_attr: discAttrDocs };
});

afterAll(() => teardownDb());

// ── I/O Matrix scenarios ──────────────────────────────────────────────────────

describe('disc-attr parallel-write contract', () => {

  describe('discAttrBonus — attribute rules', () => {

    it('Vigour 2 → Strength bonus = 2', () => {
      const c = baseChar({ disciplines: { Vigour: { dots: 2 } } });
      expect(discAttrBonus(c, 'Strength')).toBe(legacyDiscAttrBonus(c, 'Strength'));
      expect(discAttrBonus(c, 'Strength')).toBe(2);
    });

    it('Resilience 1 → Stamina bonus = 1', () => {
      const c = baseChar({ disciplines: { Resilience: { dots: 1 } } });
      expect(discAttrBonus(c, 'Stamina')).toBe(legacyDiscAttrBonus(c, 'Stamina'));
      expect(discAttrBonus(c, 'Stamina')).toBe(1);
    });

    it('Celerity 3 → Dexterity bonus = 0 (no Celerity→Dex rule)', () => {
      const c = baseChar({ disciplines: { Celerity: { dots: 3 } } });
      expect(discAttrBonus(c, 'Dexterity')).toBe(legacyDiscAttrBonus(c, 'Dexterity'));
      expect(discAttrBonus(c, 'Dexterity')).toBe(0);
    });

    it('no disciplines → all bonuses = 0', () => {
      const c = baseChar();
      for (const attr of ['Strength', 'Stamina', 'Dexterity']) {
        expect(discAttrBonus(c, attr)).toBe(legacyDiscAttrBonus(c, attr));
        expect(discAttrBonus(c, attr)).toBe(0);
      }
    });

  });

  describe('getAttrEffective — includes discipline bonus', () => {

    it('Vigour 2 → effective Strength = base + 2', () => {
      const c = baseChar({ disciplines: { Vigour: { dots: 2 } } });
      expect(getAttrEffective(c, 'Strength')).toBe(legacyGetAttrEffective(c, 'Strength'));
    });

    it('no disciplines → effective Dexterity = base only', () => {
      const c = baseChar();
      expect(getAttrEffective(c, 'Dexterity')).toBe(legacyGetAttrEffective(c, 'Dexterity'));
    });

  });

  describe('calcSpeed — Celerity via derived_stat rule', () => {

    it('Celerity 3 → Speed includes +3', () => {
      const c = baseChar({ disciplines: { Celerity: { dots: 3 } } });
      expect(calcSpeed(c)).toBe(legacyCalcSpeed(c));
    });

    it('Vigour 2 + Celerity 3 → Speed includes both', () => {
      const c = baseChar({ disciplines: { Vigour: { dots: 2 }, Celerity: { dots: 3 } } });
      expect(calcSpeed(c)).toBe(legacyCalcSpeed(c));
    });

    it('no disciplines → Speed = base formula', () => {
      const c = baseChar();
      expect(calcSpeed(c)).toBe(legacyCalcSpeed(c));
    });

  });

  describe('calcDefence — Celerity via derived_stat rule', () => {

    it('Celerity 3 → Defence includes +3', () => {
      const c = baseChar({ disciplines: { Celerity: { dots: 3 } } });
      expect(calcDefence(c)).toBe(legacyCalcDefence(c));
    });

    it('no disciplines → Defence = base formula', () => {
      const c = baseChar();
      expect(calcDefence(c)).toBe(legacyCalcDefence(c));
    });

    it('Defensive Combat merit → uses qualifier skill', () => {
      const c = baseChar({
        disciplines: { Celerity: { dots: 2 } },
        merits: [{ name: 'Defensive Combat', category: 'general', qualifier: 'Brawl', rating: 1 }],
        skills: {
          Athletics: { dots: 2, bonus: 0, specs: [], nine_again: false },
          Brawl:     { dots: 3, bonus: 0, specs: [], nine_again: false },
        },
      });
      expect(calcDefence(c)).toBe(legacyCalcDefence(c));
    });

  });

  // ST adds Celerity → Dexterity rule mid-game → effective Dexterity reflects it
  it('ST-added Celerity→Dexterity rule is respected by new code', () => {
    const c = baseChar({ disciplines: { Celerity: { dots: 2 } } });
    // Temporarily inject an extra rule into the mocked cache
    const extraRule = { discipline: 'Celerity', target_kind: 'attribute', target_name: 'Dexterity', amount_basis: 'rating' };
    cacheRef.cache = { rule_disc_attr: [...cacheRef.cache.rule_disc_attr, extraRule] };

    expect(discAttrBonus(c, 'Dexterity')).toBe(2);

    // Restore original cache (remove injected rule)
    cacheRef.cache = { rule_disc_attr: cacheRef.cache.rule_disc_attr.filter(r => r !== extraRule) };
  });

});
