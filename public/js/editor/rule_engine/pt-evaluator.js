/**
 * Professional Training rule evaluator.
 * Reads from loaded rule docs and applies the same side-effects as the
 * legacy PT block in applyDerivedMerits. Phase-2 only (unconditional grants).
 *
 * No imports — pure function; safe to call in Node.js test contexts.
 */

/**
 * Apply PT rules from the DB against a character.
 *
 * @param {object} c - character (mutated in place; phase-1 clear already done by applyDerivedMerits)
 * @param {{ grants: object[], nineAgain: object[], skillBonus: object[] }} ptRules
 */
export function applyPTRulesFromDb(c, { grants = [], nineAgain = [], skillBonus = [] } = {}) {
  const pts = (c.merits || []).filter(m => m.name === 'Professional Training');

  for (const pt of pts) {
    // inherent-intentional: rating sync only — mirrors legacy early-sync; grants read m.rating below
    const _ptInlineTotal = (pt.cp || 0) + (pt.xp || 0) + (pt.free || 0);
    if (_ptInlineTotal > 0) pt.rating = _ptInlineTotal;
  }

  for (const pt of pts) {
    const dots = pt.rating || 0;
    const assets = (pt.asset_skills || []).filter(Boolean);

    for (const rule of grants) {
      const tierOk = !rule.tier || dots >= rule.tier;
      if (!tierOk) continue;

      if (rule.grant_type === 'merit' && rule.target) {
        let tgt = (c.merits || []).find(
          m => m.category === 'influence' && m.name === rule.target,
        );
        if (!tgt) {
          if (!c.merits) c.merits = [];
          tgt = { name: rule.target, category: 'influence', rating: 0, granted_by: 'PT' };
          c.merits.push(tgt);
        }
        tgt.free_pt = rule.amount;
      }
    }

    for (const rule of nineAgain) {
      const tierOk = !rule.tier || dots >= rule.tier;
      if (!tierOk || !assets.length) continue;

      const skills =
        rule.target_skills === 'asset_skills' ? assets : (rule.target_skills || []);
      for (const sk of skills) c._pt_nine_again_skills.add(sk);
    }

    for (const rule of skillBonus) {
      const tierOk = !rule.tier || dots >= rule.tier;
      if (!tierOk) continue;

      const targetSkill =
        rule.target_skill === 'dot4_skill' ? pt.dot4_skill : rule.target_skill;
      if (targetSkill) c._pt_dot4_bonus_skills.add(targetSkill);
    }
  }
}
