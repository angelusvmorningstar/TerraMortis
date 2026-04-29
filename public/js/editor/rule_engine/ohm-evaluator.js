/**
 * Oath of the Hard Motherfucker rule evaluator.
 * Reads from loaded rule docs and applies the same side-effects as the
 * legacy OHM block in applyDerivedMerits.
 *
 * No imports — pure function; safe to call in Node.js test contexts.
 */

/**
 * Apply OHM rules from the DB against a character.
 *
 * @param {object} c - character (mutated in place; phase-1 clear already done by applyDerivedMerits)
 * @param {{ grants: object[], nineAgain: object[] }} ohmRules
 */
export function applyOHMRulesFromDb(c, { grants = [], nineAgain = [] } = {}) {
  const ohmPact = (c.powers || []).find(
    p => p.category === 'pact' && (p.name || '').toLowerCase() === 'oath of the hard motherfucker',
  );

  // Clear stale free_ohm on all merits before re-applying
  (c.merits || []).forEach(m => { m.free_ohm = 0; });

  if (!ohmPact) {
    // Lifecycle guard: remove auto-created FHP when the pact is absent.
    // Auto-removal is not a grant rule — grant rules only fire while the pact is
    // present. This code keeps the DB clean when an ST removes the pact entry.
    const fhpIdx = (c.merits || []).findIndex(
      m => m.name === 'Friends in High Places' && m.granted_by === 'OHM',
    );
    if (fhpIdx !== -1) c.merits.splice(fhpIdx, 1);
    return;
  }

  const ohmSphere = (ohmPact.ohm_allies_sphere || '').trim();
  let poolAmount = 0;

  for (const rule of grants) {
    if (rule.grant_type !== 'merit') continue;

    if (rule.auto_create) {
      // Auto-create grant: find or create the target merit
      let m = (c.merits || []).find(
        x => x.name === rule.target && x.granted_by === 'OHM',
      );
      if (!m) {
        if (!c.merits) c.merits = [];
        m = { name: rule.target, category: rule.target_category || 'general', granted_by: 'OHM', rating: 0 };
        c.merits.push(m);
      }
      m.free_ohm = rule.amount ?? 1;
    } else {
      // Standard grant: apply free_ohm to existing merit if found; count toward pool regardless
      poolAmount += rule.amount ?? 1;

      if (rule.target === 'Contacts' || rule.target === 'Resources') {
        const m = (c.merits || []).find(
          x => x.category === (rule.target_category || 'influence') && x.name === rule.target,
        );
        if (m) m.free_ohm = rule.amount ?? 1;
      } else if (rule.target === 'Allies' && rule.sphere_source === 'ohm_allies_sphere') {
        if (ohmSphere) {
          const m = (c.merits || []).find(
            x => x.category === 'influence' && x.name === 'Allies' &&
            (x.area || '').toLowerCase() === ohmSphere.toLowerCase(),
          );
          if (m) m.free_ohm = rule.amount ?? 1;
        }
      }
    }
  }

  if (poolAmount > 0) {
    c._grant_pools.push({
      source: 'Oath of the Hard Motherfucker',
      names: ['Allies', 'Contacts', 'Resources'],
      category: 'ohm',
      amount: poolAmount,
    });
  }

  // 9-again on chosen skills (target_skills sentinel resolves to pact.ohm_skills)
  const skillRule = nineAgain.find(r => r.target_skills === 'ohm_skills');
  if (skillRule) {
    const skills = (ohmPact.ohm_skills || []).filter(Boolean);
    if (skills.length) {
      c._ohm_nine_again_skills = new Set(skills);
    }
  }
}
