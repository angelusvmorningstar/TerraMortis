/**
 * Mystery Cult Initiation rule evaluator.
 * Reads from loaded rule docs and applies the same side-effects as the
 * legacy MCI block in applyDerivedMerits (lines 32-57 pre-RDE-5).
 *
 * Phase-2 only: rating sync, pool building, spec collection, skill-bonus grant.
 * No imports — pure function; safe to call in Node.js test contexts.
 */

const FALLBACK_BUDGETS = [0, 1, 1, 2, 3, 3]; // index = tier (1-indexed), 0 unused

/**
 * Apply MCI rules from the DB against a character.
 *
 * @param {object} c - character (mutated in place; phase-1 clear already done by applyDerivedMerits)
 * @param {{ grants: object[], specialityGrants: object[], skillBonus: object[], tierBudget: object|null }} mciRules
 */
export function applyMCIRulesFromDb(c, { grants = [], specialityGrants = [], skillBonus = [], tierBudget = null } = {}) {
  const mcis = (c.merits || []).filter(m => m.name === 'Mystery Cult Initiation');

  // Sync MCI rating from inline creation fields — mirrors legacy early-sync.
  // Grants read m.rating below so this must run first.
  for (const mci of mcis) {
    // inherent-intentional: rating sync only — mirrors legacy early-sync; grants read m.rating below
    const _tot = (mci.cp || 0) + (mci.xp || 0) + (mci.free || 0);
    if (_tot > 0) mci.rating = _tot;
  }

  // Per-tier pool amounts: DB tier_budget is ST-editable; fall back to hardcoded.
  const budgets = (tierBudget && Array.isArray(tierBudget.budgets))
    ? tierBudget.budgets
    : FALLBACK_BUDGETS;

  let totalPool = 0;

  for (const mci of mcis) {
    if (mci.active === false) continue;
    const r = mci.rating || 0;

    // Pool grants (rule_grant, grant_type='pool')
    for (const rule of grants) {
      if (rule.grant_type !== 'pool') continue;
      if (rule.tier && r < rule.tier) continue;

      // Choice condition: skip this tier if the merit's choice field is the excluded value
      if (rule.condition === 'choice' && rule.choice_field && rule.excluded_choice) {
        if (mci[rule.choice_field] === rule.excluded_choice) continue;
      }

      // Prefer tier_budget amount over rule.amount so ST edits propagate
      const amount = (rule.tier != null && budgets[rule.tier] !== undefined)
        ? budgets[rule.tier]
        : (rule.amount ?? 0);
      totalPool += amount;
    }

    // Speciality grants (rule_speciality_grant) — dot 1 speciality choice
    if (r >= 1 && mci.dot1_choice === 'speciality') {
      for (const rule of specialityGrants) {
        if (rule.tier && r < rule.tier) continue;
        const skill = rule.target_skill === 'dot1_spec_skill' ? mci.dot1_spec_skill : rule.target_skill;
        const spec  = rule.spec         === 'dot1_spec'       ? mci.dot1_spec       : rule.spec;
        if (skill && spec) c._mci_free_specs.push({ skill, spec });
      }
    }

    // Skill bonus grants (rule_skill_bonus) — dot 3 skill choice
    if (r >= 3 && mci.dot3_choice === 'skill' && mci.dot3_skill) {
      for (const rule of skillBonus) {
        if (rule.tier && r < rule.tier) continue;
        const targetSkill = rule.target_skill === 'dot3_skill' ? mci.dot3_skill : rule.target_skill;
        if (targetSkill) {
          if (!c._mci_dot3_skills) c._mci_dot3_skills = new Set();
          c._mci_dot3_skills.add(targetSkill);
        }
      }
    }
  }

  if (totalPool > 0) {
    c._grant_pools.push({ source: 'MCI', name: '_mci', category: 'any', amount: totalPool });
  }
}
