/**
 * Parallel-write contract test — derived-stat modifier rules.
 *
 * Compares legacy inline merit lookups against the new rules-collection-driven
 * calcSize, calcSpeed, calcDefence for each scenario in the I/O matrix.
 *
 * Requires rule docs in tm_suite_test (run
 * `MONGODB_DB=tm_suite_test node server/scripts/seed-rules-derived-stat-modifiers.js --apply`
 * and `MONGODB_DB=tm_suite_test node server/scripts/seed-rules-disc-attr.js --apply`).
 */

import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

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

import { calcSize, calcSpeed, calcDefence } from '../../public/js/data/accessors.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

// ── Legacy inline implementations (pre-RDE-15 state) ─────────────────────────

const LEGACY_DISC_ATTR = { Strength: 'Vigour', Stamina: 'Resilience' };

function legacyDiscAttrBonus(c, attr) {
  const disc = LEGACY_DISC_ATTR[attr];
  return disc ? (c.disciplines?.[disc]?.dots || 0) : 0;
}
function legacyGetAttrVal(c, a) { return c.attributes?.[a]?.dots || 0; }
function legacyGetAttrTotal(c, a) { return (c.attributes?.[a]?.dots || 0) + (c.attributes?.[a]?.bonus || 0); }
function legacyGetAttrEffective(c, a) { return legacyGetAttrTotal(c, a) + legacyDiscAttrBonus(c, a); }
function legacySkDots(c, sk) { return c.skills?.[sk]?.dots || 0; }

function legacyCalcSize(c) {
  const giant = (c.merits || []).find(m => m.name === 'Giant');
  return 5 + (giant ? 1 : 0);
}

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
      Wits:        { dots: 3, bonus: 0 },
      Presence:    { dots: 2, bonus: 0 },
      Manipulation:{ dots: 2, bonus: 0 },
      Composure:   { dots: 2, bonus: 0 },
      Intelligence:{ dots: 2, bonus: 0 },
      Resolve:     { dots: 2, bonus: 0 },
    },
    skills: {
      Athletics: { dots: 2, bonus: 0, specs: [], nine_again: false },
      Brawl:     { dots: 3, bonus: 0, specs: [], nine_again: false },
    },
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

  const [derivedDocs, discAttrDocs] = await Promise.all([
    getCollection('rule_derived_stat_modifier').find({}).toArray(),
    getCollection('rule_disc_attr').find({}).toArray(),
  ]);

  if (!derivedDocs.length) {
    throw new Error(
      'rule_derived_stat_modifier docs not found in tm_suite_test. ' +
      'Run: MONGODB_DB=tm_suite_test node server/scripts/seed-rules-derived-stat-modifiers.js --apply',
    );
  }

  cacheRef.cache = {
    rule_derived_stat_modifier: derivedDocs,
    rule_disc_attr: discAttrDocs,
  };
});

afterAll(() => teardownDb());

// ── Scenarios ─────────────────────────────────────────────────────────────────

describe('derived-stat-modifiers parallel-write contract', () => {

  describe('calcSize', () => {

    it('Giant present → size 6', () => {
      const c = baseChar({ merits: [{ name: 'Giant', category: 'general', rating: 1 }] });
      expect(calcSize(c)).toBe(legacyCalcSize(c));
      expect(calcSize(c)).toBe(6);
    });

    it('no Giant → size 5', () => {
      const c = baseChar();
      expect(calcSize(c)).toBe(legacyCalcSize(c));
      expect(calcSize(c)).toBe(5);
    });

    it('homebrew flat rule summed with Giant', () => {
      const c = baseChar({ merits: [{ name: 'Giant', category: 'general', rating: 1 }, { name: 'Towering', category: 'general', rating: 1 }] });
      const extraRule = { source: 'Towering', target_stat: 'size', mode: 'flat', flat_amount: 1 };
      cacheRef.cache = { ...cacheRef.cache, rule_derived_stat_modifier: [...cacheRef.cache.rule_derived_stat_modifier, extraRule] };

      expect(calcSize(c)).toBe(7); // 5 + 1 Giant + 1 Towering

      cacheRef.cache = { ...cacheRef.cache, rule_derived_stat_modifier: cacheRef.cache.rule_derived_stat_modifier.filter(r => r !== extraRule) };
    });

  });

  describe('calcSpeed', () => {

    it('Fleet of Foot rating 2 → speed includes +2', () => {
      const c = baseChar({ merits: [{ name: 'Fleet of Foot', category: 'general', rating: 2 }] });
      expect(calcSpeed(c)).toBe(legacyCalcSpeed(c));
    });

    it('no speed merits → speed = base', () => {
      const c = baseChar();
      expect(calcSpeed(c)).toBe(legacyCalcSpeed(c));
    });

    it('Celerity 3 + Fleet of Foot 2 → both included', () => {
      const c = baseChar({
        disciplines: { Celerity: { dots: 3 } },
        merits: [{ name: 'Fleet of Foot', category: 'general', rating: 2 }],
      });
      expect(calcSpeed(c)).toBe(legacyCalcSpeed(c));
    });

  });

  describe('calcDefence', () => {

    it('no Defensive Combat → uses Athletics', () => {
      const c = baseChar();
      expect(calcDefence(c)).toBe(legacyCalcDefence(c));
    });

    it('Defensive Combat qualifier=Brawl → uses Brawl skill', () => {
      const c = baseChar({
        merits: [{ name: 'Defensive Combat', category: 'general', qualifier: 'Brawl', rating: 1 }],
      });
      expect(calcDefence(c)).toBe(legacyCalcDefence(c));
    });

    it('Defensive Combat qualifier blank → falls back to Athletics', () => {
      const c = baseChar({
        merits: [{ name: 'Defensive Combat', category: 'general', qualifier: '', rating: 1 }],
      });
      expect(calcDefence(c)).toBe(legacyCalcDefence(c));
    });

    it('Celerity 2 + Defensive Combat Brawl → both in formula', () => {
      const c = baseChar({
        disciplines: { Celerity: { dots: 2 } },
        merits: [{ name: 'Defensive Combat', category: 'general', qualifier: 'Brawl', rating: 1 }],
      });
      expect(calcDefence(c)).toBe(legacyCalcDefence(c));
    });

  });

});
