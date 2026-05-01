/**
 * Positive effective-rating contract — ADR-001.
 *
 * Constructs fixture characters where the relevant trait has bonus > 0 (or
 * free > 0) beyond inherent dots, then asserts the PT evaluator fires at the
 * *effective* threshold, not at inherent-only.
 *
 * If an evaluator silently read pt.cp instead of pt.rating (the effective
 * value), these tests would fail.
 */

import { describe, it, expect } from 'vitest';
import { applyPTRulesFromDb } from '../../public/js/editor/rule_engine/pt-evaluator.js';

// ── Minimal phase-1 clear ─────────────────────────────────────────────────────

function clearEphemerals(c) {
  c._pt_nine_again_skills = new Set();
  c._pt_dot4_bonus_skills = new Set();
  (c.merits || []).forEach(m => { m.free_pt = 0; });
}

// ── Simple fixture factory (no FixtureBuilder dependency) ─────────────────────

function makePTChar({ cp = 0, xp = 0, free = 0, assetSkills = [], dot4Skill = null } = {}) {
  return {
    name: 'Contract Test',
    merits: [{
      name: 'Professional Training',
      category: 'general',
      cp,
      xp,
      free,
      rating: 0,
      asset_skills: assetSkills,
      dot4_skill: dot4Skill,
    }],
    powers: [],
    fighting_styles: [],
    skills: {},
  };
}

// ── PT rule docs (inline — no DB needed) ─────────────────────────────────────

const PT_RULES = {
  grants: [
    { source: 'Professional Training', tier: 1, grant_type: 'merit', target: 'Contacts', amount: 2, amount_basis: 'flat' },
  ],
  nineAgain: [
    { source: 'Professional Training', tier: 2, target_skills: 'asset_skills' },
  ],
  skillBonus: [
    { source: 'Professional Training', tier: 4, target_skill: 'dot4_skill', amount: 1, cap_at: 5 },
  ],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PT effective-rating positive contract', () => {
  it('dot1 fires when PT rating is 1 via free (not just cp)', () => {
    // inherent cp = 0, but free = 1 → effective = 1 → dot1 must fire
    const c = makePTChar({ cp: 0, free: 1 });
    clearEphemerals(c);
    applyPTRulesFromDb(c, PT_RULES);
    const contacts = c.merits.find(m => m.name === 'Contacts');
    expect(contacts).toBeTruthy();
    expect(contacts.free_pt).toBe(2);
  });

  it('dot1 fires when PT rating is 1 via xp (not just cp)', () => {
    const c = makePTChar({ cp: 0, xp: 1 });
    clearEphemerals(c);
    applyPTRulesFromDb(c, PT_RULES);
    expect(c.merits.find(m => m.name === 'Contacts')?.free_pt).toBe(2);
  });

  it('dot2 fires when PT effective rating ≥ 2 via free', () => {
    const c = makePTChar({ cp: 0, free: 2, assetSkills: ['Brawl'] });
    clearEphemerals(c);
    applyPTRulesFromDb(c, PT_RULES);
    expect([...c._pt_nine_again_skills]).toContain('Brawl');
  });

  it('dot4 fires when PT effective rating ≥ 4 via mixed cp+xp+free', () => {
    // cp:2 + xp:1 + free:1 = effective 4; inherent cp alone would be 2 (no dot4)
    const c = makePTChar({ cp: 2, xp: 1, free: 1, assetSkills: ['Athletics'], dot4Skill: 'Athletics' });
    clearEphemerals(c);
    applyPTRulesFromDb(c, PT_RULES);
    expect([...c._pt_dot4_bonus_skills]).toContain('Athletics');
  });

  it('dot4 does NOT fire when only inherent cp = 3 (effective = 3, below threshold)', () => {
    // cp:3 → effective = 3, not enough for dot4
    const c = makePTChar({ cp: 3, dot4Skill: 'Firearms' });
    clearEphemerals(c);
    applyPTRulesFromDb(c, PT_RULES);
    expect([...c._pt_dot4_bonus_skills]).not.toContain('Firearms');
  });

  it('dot4 fires at effective 4 even when cp alone would be insufficient', () => {
    // cp:1 + xp:3 = effective 4; if evaluator read only cp it would see 1 and skip dot4
    const c = makePTChar({ cp: 1, xp: 3, assetSkills: ['Stealth'], dot4Skill: 'Stealth' });
    clearEphemerals(c);
    applyPTRulesFromDb(c, PT_RULES);
    expect([...c._pt_dot4_bonus_skills]).toContain('Stealth');
  });
});
