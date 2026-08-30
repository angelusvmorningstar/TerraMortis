/**
 * dtlt.1 — bonus-success mechanic (Stronger Than You).
 *
 * Walks every row of the story's own I/O & Edge-Case Matrix through the new
 * roll-time evaluator, plus the schema/seed contract that backs it.
 *
 * The evaluator is a pure, import-free function (same shape as every other
 * module in public/js/editor/rule_engine/), so it runs here with no DB and no
 * browser. Nothing in this file touches live data.
 */

import { describe, it, expect } from 'vitest';
import Ajv from 'ajv';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';

import {
  resolveBonusSuccesses,
  combineSuccesses,
  formatSuccessBreakdown,
} from '../../public/js/editor/rule_engine/bonus-success-evaluator.js';
import { ruleBonusSuccessSchema } from '../schemas/rules/rule-bonus-success.schema.js';
import { BONUS_SUCCESS_DOCS } from '../scripts/seed-rules-bonus-successes.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** The v1 seed rule, as the evaluator will see it once loaded from Mongo. */
const STY_RULE = {
  source: 'Stronger Than You',
  predicate: { kind: 'manoeuvre_present', name: 'Stronger Than You' },
  also_requires: [{ kind: 'roll_attr', name: 'Strength' }],
  count_basis: 'flat',
  flat_amount: 1,
};

/** Character who has actually picked the manoeuvre. */
function charWithSTY() {
  return {
    name: 'Test Brute',
    merits: [],
    fighting_styles: [{ name: 'Strength Performance', type: 'style', cp: 4, rating: 4 }],
    fighting_picks: [
      { manoeuvre: 'Strength Tricks' },
      { manoeuvre: 'Stronger Than You' },
    ],
  };
}

/** Character with the style dots but no explicit pick — must NOT get the bonus. */
function charWithStyleOnly() {
  return {
    name: 'Test Lifter',
    merits: [],
    fighting_styles: [{ name: 'Strength Performance', type: 'style', cp: 4, rating: 4 }],
    fighting_picks: [
      { manoeuvre: 'Strength Tricks' },
      { manoeuvre: 'Lifting' },
    ],
  };
}

const STRENGTH_CRAFTS = { attr: 'Strength', skill: 'Crafts' };
const STRENGTH_BRAWL  = { attr: 'Strength', skill: 'Brawl' };
const DEX_ATHLETICS   = { attr: 'Dexterity', skill: 'Athletics' };

// ── I/O & Edge-Case Matrix ───────────────────────────────────────────────────

describe('resolveBonusSuccesses — story I/O matrix', () => {
  it('row 1: STY picked, Strength + Crafts, 4 rolled → +1 (Stronger Than You)', () => {
    const res = combineSuccesses(4, charWithSTY(), STRENGTH_CRAFTS, [STY_RULE]);
    expect(res.rolled).toBe(4);
    expect(res.bonus).toEqual([{ source: 'Stronger Than You', count: 1 }]);
    expect(res.total).toBe(5);
  });

  it('row 2: STY picked, Strength + Brawl, 0 rolled → failed-roll gate, no bonus', () => {
    const res = combineSuccesses(0, charWithSTY(), STRENGTH_BRAWL, [STY_RULE]);
    expect(res.rolled).toBe(0);
    expect(res.bonus).toEqual([]);
    expect(res.total).toBe(0);
  });

  it('row 3: STY picked, Dexterity + Athletics, 5 rolled → predicate does not match', () => {
    const res = combineSuccesses(5, charWithSTY(), DEX_ATHLETICS, [STY_RULE]);
    expect(res.bonus).toEqual([]);
    expect(res.total).toBe(5);
  });

  it('row 4: Strength Performance style dots but no pick → no bonus', () => {
    const res = combineSuccesses(4, charWithStyleOnly(), STRENGTH_BRAWL, [STY_RULE]);
    expect(res.bonus).toEqual([]);
    expect(res.total).toBe(4);
  });

  it('row 5: chance die showing 10 counts as a rolled success, so the bonus applies', () => {
    const res = combineSuccesses(1, charWithSTY(), STRENGTH_BRAWL, [STY_RULE]);
    expect(res.rolled).toBe(1);
    expect(res.total).toBe(2);
  });

  it('row 6: rote — better ROLLED count is chosen first, then the bonus is added once', () => {
    const rolledA = 0, rolledB = 4;
    const better = Math.max(rolledA, rolledB);
    const res = combineSuccesses(better, charWithSTY(), STRENGTH_CRAFTS, [STY_RULE]);
    expect(res.rolled).toBe(4);
    expect(res.bonus).toHaveLength(1);
    expect(res.total).toBe(5);
  });

  it('row 7: two rules with the same source and overlapping predicate both apply (additive)', () => {
    const dup = { ...STY_RULE, notes: 'ST homebrew duplicate' };
    const res = combineSuccesses(3, charWithSTY(), STRENGTH_CRAFTS, [STY_RULE, dup]);
    expect(res.bonus).toHaveLength(2);
    expect(res.total).toBe(5);
  });

  it('row 8: a pick added mid-session is picked up on the very next roll (no cache to invalidate)', () => {
    const c = charWithStyleOnly();
    expect(combineSuccesses(3, c, STRENGTH_CRAFTS, [STY_RULE]).total).toBe(3);
    c.fighting_picks.push({ manoeuvre: 'Stronger Than You' });
    expect(combineSuccesses(3, c, STRENGTH_CRAFTS, [STY_RULE]).total).toBe(4);
  });

  it('row 9: chance die that fails yields 0 rolled and 0 bonus', () => {
    const res = combineSuccesses(0, charWithSTY(), STRENGTH_CRAFTS, [STY_RULE]);
    expect(res.total).toBe(0);
  });

  it('row 10: a Vigour character gets no bonus successes from this story (rule_disc_attr untouched)', () => {
    // Vigour contributes Strength DOTS via rule_disc_attr; it is not a
    // bonus-success source and must not appear in the bonus list.
    const c = charWithStyleOnly();
    c.disciplines = { Vigour: { dots: 2 } };
    const res = combineSuccesses(4, c, STRENGTH_BRAWL, [STY_RULE]);
    expect(res.bonus).toEqual([]);
    expect(res.total).toBe(4);
  });
});

// ── Acceptance criteria not covered by a matrix row ──────────────────────────

describe('resolveBonusSuccesses — defensive and vocabulary contract', () => {
  it('an empty rules collection leaves the roll untouched (total === rolled)', () => {
    const res = combineSuccesses(4, charWithSTY(), STRENGTH_CRAFTS, []);
    expect(res.bonus).toEqual([]);
    expect(res.total).toBe(4);
  });

  it('a null/undefined rules argument is tolerated', () => {
    expect(combineSuccesses(4, charWithSTY(), STRENGTH_CRAFTS, null).total).toBe(4);
    expect(combineSuccesses(4, charWithSTY(), STRENGTH_CRAFTS).total).toBe(4);
  });

  it('a null character is tolerated', () => {
    expect(combineSuccesses(4, null, STRENGTH_CRAFTS, [STY_RULE]).total).toBe(4);
  });

  it('an ST homebrew roll_attr rule fires with no code change', () => {
    const homebrew = {
      source: 'Iron Stamina',
      predicate: { kind: 'roll_attr', name: 'Stamina' },
      count_basis: 'flat',
      flat_amount: 1,
    };
    const c = charWithStyleOnly();
    const res = combineSuccesses(2, c, { attr: 'Stamina', skill: 'Survival' }, [homebrew]);
    expect(res.bonus).toEqual([{ source: 'Iron Stamina', count: 1 }]);
    expect(res.total).toBe(3);
  });

  it('a roll_skill predicate matches on the skill leg of the pool', () => {
    const rule = {
      source: 'Bookish',
      predicate: { kind: 'roll_skill', name: 'Academics' },
      count_basis: 'flat',
      flat_amount: 2,
    };
    const res = combineSuccesses(1, charWithSTY(), { attr: 'Intelligence', skill: 'Academics' }, [rule]);
    expect(res.total).toBe(3);
  });

  it('a merit_present predicate reads the EFFECTIVE rating, not inherent dots', () => {
    const rule = {
      source: 'Iron Will',
      predicate: { kind: 'merit_present', name: 'Iron Will', min_rating: 3 },
      count_basis: 'flat',
      flat_amount: 1,
    };
    // Inherent purchased dots are 1; the other 2 come from a free_* grant, so
    // the persisted effective rating is 3. Reading inherent-only would miss it.
    const c = charWithStyleOnly();
    c.merits = [{ name: 'Iron Will', category: 'general', cp: 1, free_pt: 2, rating: 3 }];
    expect(combineSuccesses(2, c, STRENGTH_CRAFTS, [rule]).total).toBe(3);

    const below = JSON.parse(JSON.stringify(c));
    below.merits[0].rating = 2;
    expect(combineSuccesses(2, below, STRENGTH_CRAFTS, [rule]).total).toBe(2);
  });

  it('count_basis "rating" scales the bonus with the merit rating', () => {
    const rule = {
      source: 'Scaling Merit',
      predicate: { kind: 'merit_present', name: 'Scaling Merit' },
      count_basis: 'rating',
    };
    const c = charWithStyleOnly();
    c.merits = [{ name: 'Scaling Merit', category: 'general', cp: 2, rating: 2 }];
    expect(combineSuccesses(1, c, STRENGTH_CRAFTS, [rule]).bonus)
      .toEqual([{ source: 'Scaling Merit', count: 2 }]);
  });

  it('review fix (Codex): count_basis "rating" reads the entry that satisfied min_rating, not the first same-named one', () => {
    // Real characters carry several same-named repeatable merits (Allies,
    // Contacts, Retainer...) distinguished only by a `qualifier` field, e.g.
    // chars_v3.json:319,336,353,370. A low-rating duplicate earlier in the
    // array must not silently undercount a rule gated on a higher rating.
    const rule = {
      source: 'Well-Connected',
      predicate: { kind: 'merit_present', name: 'Allies', min_rating: 3 },
      count_basis: 'rating',
    };
    const c = charWithStyleOnly();
    c.merits = [
      { name: 'Allies', qualifier: 'Street', category: 'influence', cp: 1, rating: 1 },
      { name: 'Allies', qualifier: 'Politics', category: 'influence', cp: 3, rating: 3 },
    ];
    expect(combineSuccesses(1, c, STRENGTH_CRAFTS, [rule]).bonus)
      .toEqual([{ source: 'Well-Connected', count: 3 }]);
  });

  it('a legacy string-form fighting_picks entry still matches', () => {
    const c = charWithSTY();
    c.fighting_picks = ['Strength Tricks', 'Stronger Than You'];
    expect(combineSuccesses(2, c, STRENGTH_CRAFTS, [STY_RULE]).total).toBe(3);
  });

  it('never mutates the character or the rule docs', () => {
    const c = charWithSTY();
    const rules = [STY_RULE];
    const cBefore = JSON.stringify(c);
    const rBefore = JSON.stringify(rules);
    combineSuccesses(4, c, STRENGTH_CRAFTS, rules);
    expect(JSON.stringify(c)).toBe(cBefore);
    expect(JSON.stringify(rules)).toBe(rBefore);
  });

  it('bonus successes never rescue a failure, whatever the rule says', () => {
    const greedy = {
      source: 'Greedy',
      predicate: { kind: 'roll_attr', name: 'Strength' },
      count_basis: 'flat',
      flat_amount: 5,
    };
    expect(combineSuccesses(0, charWithSTY(), STRENGTH_CRAFTS, [greedy]).total).toBe(0);
  });

  it('malformed rule docs are skipped rather than thrown on', () => {
    const junk = [null, {}, { source: 'X' }, { predicate: { kind: 'roll_attr', name: 'Strength' } },
      { source: 'Y', predicate: { kind: 'nonsense', name: 'Strength' }, count_basis: 'flat' }];
    expect(() => combineSuccesses(3, charWithSTY(), STRENGTH_CRAFTS, junk)).not.toThrow();
    expect(combineSuccesses(3, charWithSTY(), STRENGTH_CRAFTS, junk).total).toBe(3);
  });

  it('resolveBonusSuccesses returns [] when rolledSuccesses is absent from the context', () => {
    expect(resolveBonusSuccesses(charWithSTY(), STRENGTH_CRAFTS, [STY_RULE])).toEqual([]);
  });
});

// ── Display breakdown ────────────────────────────────────────────────────────

describe('formatSuccessBreakdown', () => {
  it('renders the exact breakdown shape the story specifies', () => {
    const res = combineSuccesses(4, charWithSTY(), STRENGTH_CRAFTS, [STY_RULE]);
    expect(formatSuccessBreakdown(res)).toBe('4 rolled + 1 (Stronger Than You) = 5 successes');
  });

  it('renders each source when several stack', () => {
    const second = {
      source: 'Iron Stamina',
      predicate: { kind: 'roll_attr', name: 'Strength' },
      count_basis: 'flat',
      flat_amount: 2,
    };
    const res = combineSuccesses(3, charWithSTY(), STRENGTH_CRAFTS, [STY_RULE, second]);
    expect(formatSuccessBreakdown(res))
      .toBe('3 rolled + 1 (Stronger Than You) + 2 (Iron Stamina) = 6 successes');
  });

  it('returns an empty string when there is no bonus, so the display is unchanged', () => {
    const res = combineSuccesses(4, charWithSTY(), DEX_ATHLETICS, [STY_RULE]);
    expect(formatSuccessBreakdown(res)).toBe('');
  });

  it('uses the singular for a one-success total', () => {
    const res = combineSuccesses(0, charWithSTY(), STRENGTH_CRAFTS, [STY_RULE]);
    expect(formatSuccessBreakdown(res)).toBe('');
    const one = { rolled: 0, bonus: [{ source: 'X', count: 1 }], total: 1 };
    expect(formatSuccessBreakdown(one)).toBe('0 rolled + 1 (X) = 1 success');
  });
});

// ── Schema + seed contract ───────────────────────────────────────────────────

describe('rule_bonus_success schema', () => {
  const ajv = new Ajv({ allErrors: true });
  const validate = ajv.compile(ruleBonusSuccessSchema);

  it('accepts the v1 seed doc', () => {
    for (const doc of BONUS_SUCCESS_DOCS) {
      const ok = validate(doc.doc);
      if (!ok) console.error(validate.errors);
      expect(ok).toBe(true);
    }
  });

  it('seeds exactly one rule — Stronger Than You (v1 scope, resolved 2026-08-31)', () => {
    expect(BONUS_SUCCESS_DOCS).toHaveLength(1);
    expect(BONUS_SUCCESS_DOCS[0].doc.source).toBe('Stronger Than You');
    expect(BONUS_SUCCESS_DOCS[0].doc.predicate.kind).toBe('manoeuvre_present');
  });

  it('the seed doc, run through the evaluator, satisfies AC-1', () => {
    const res = combineSuccesses(4, charWithSTY(), STRENGTH_CRAFTS, [BONUS_SUCCESS_DOCS[0].doc]);
    expect(res.bonus).toEqual([{ source: 'Stronger Than You', count: 1 }]);
  });

  it('rejects an unknown predicate kind', () => {
    expect(validate({
      source: 'X', count_basis: 'flat', flat_amount: 1,
      predicate: { kind: 'roll_vibes', name: 'Strength' },
    })).toBe(false);
  });

  it('rejects a predicate with no name', () => {
    expect(validate({
      source: 'X', count_basis: 'flat', flat_amount: 1,
      predicate: { kind: 'roll_attr' },
    })).toBe(false);
  });

  it('rejects unknown top-level properties', () => {
    expect(validate({
      source: 'X', count_basis: 'flat', flat_amount: 1,
      predicate: { kind: 'roll_attr', name: 'Strength' },
      sneaky: true,
    })).toBe(false);
  });

  it('accepts also_requires and excludes_from_threshold metadata (errata capture)', () => {
    const ok = validate({
      source: 'X',
      predicate: { kind: 'roll_attr', name: 'Strength' },
      also_requires: [{ kind: 'roll_skill', name: 'Brawl' }],
      count_basis: 'flat',
      flat_amount: 1,
      excludes_from_threshold: ['knocked_down'],
      notes: 'Errata capture only; enforcement is downstream.',
    });
    if (!ok) console.error(validate.errors);
    expect(ok).toBe(true);
  });
});

// ── Boundary guards (story "Never" list) ─────────────────────────────────────
//
// Source-level assertions, in the same style as this repo's other structural
// guards (rlv-6-dice-engine-removed, issue-836-legacy-tracker-cache-removed).
// They exist so a later refactor cannot quietly undo the story's constraints.

const REPO_ROOT = resolve(import.meta.dirname, '../../');
const read = (p) => readFileSync(join(REPO_ROOT, p), 'utf8');

describe('dtlt.1 boundary guards', () => {
  it('cntSuc is untouched — still the rolled-only primitive', () => {
    const src = read('public/js/shared/dice.js');
    expect(src).toContain('export function cntSuc(cols) {');
    // The body must not consult rules, characters or bonus successes.
    const body = src.slice(src.indexOf('export function cntSuc'), src.indexOf('// ── Bonus successes'));
    expect(body).not.toMatch(/bonus|rule|character/i);
  });

  it('shared/dice.js adds resolveSuccesses alongside cntSuc, not in place of it', () => {
    const src = read('public/js/shared/dice.js');
    expect(src).toContain('export function resolveSuccesses(');
    expect(src).toContain('export function addBonusSuccesses(');
  });

  it('feeding-tab keeps cntSuc for the rote comparison and resolves the final roll', () => {
    const src = read('public/js/tabs/feeding-tab.js');
    expect(src).toMatch(/return cntSuc\(r1\) >= cntSuc\(r2\) \? r1 : r2;/);
    expect(src).toContain('resolveSuccesses(cols, currentChar');
  });

  it('roll-v2 still picks the rote winner on ROLLED successes only', () => {
    const src = read('public/js/suite/roll-v2.js');
    expect(src).toContain('const sA = cntSuc(cA);');
    expect(src).toContain('const sB = state.ROTE ? cntSuc(cB) : 0;');
    // ...and adds the bonus once, after that choice.
    expect(src).toContain('const bonusRes = addBonusSuccesses(wS,');
  });

  it('the evaluator is not wired into applyDerivedMerits (roll-time, not render-time)', () => {
    const src = read('public/js/editor/mci.js');
    expect(src).not.toMatch(/bonus-success-evaluator|resolveBonusSuccesses/);
  });

  it('Vigour and Resilience stay in rule_disc_attr — nothing migrated out', () => {
    const src = read('server/scripts/archive/seed-rules-disc-attr.js');
    expect(src).toContain("discipline: 'Vigour'");
    expect(src).toContain("discipline: 'Resilience'");
    const seed = read('server/scripts/seed-rules-bonus-successes.js');
    expect(seed).not.toMatch(/Vigour|Resilience/);
  });

  it('bonus-success rules live in their own collection, not an existing one', () => {
    const routes = read('server/routes/rules-engine.js');
    expect(routes).toContain("makeRulesRouter('rule_bonus_success'");
    const evaluator = read('public/js/editor/rule_engine/bonus-success-evaluator.js');
    expect(evaluator).not.toMatch(/rule_grant|rule_skill_bonus/);
  });
});
