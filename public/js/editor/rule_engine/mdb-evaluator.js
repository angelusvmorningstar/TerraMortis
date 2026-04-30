/**
 * MDB evaluator — Mother-Daughter Bond free dots into chosen Crúac style.
 *
 * Reads grant_type:'merit' rule docs seeded by seed-rules-mdb.js.
 * Sets rule.target_field (free_mdb) on the general merit named by
 * mdbMerit.qualifier, equal to the character's effective Mentor rating.
 *
 * free_mdb is cleared before this runs (applyDerivedMerits stale-clear).
 * No import dependencies — pure function; safe in Node.js test contexts.
 */

/**
 * @param {object} c - character (mutated in place)
 * @param {{ grants: object[] }} mdbRules - getRulesBySource('The Mother-Daughter Bond')
 */
export function applyMDBRulesFromDb(c, { grants = [] } = {}) {
  const meritGrants = grants.filter(r => r.grant_type === 'merit' && r.condition === 'merit_present');
  if (!meritGrants.length) return;

  for (const rule of meritGrants) {
    const mdbMerit = (c.merits || []).find(m => m.name === rule.source);
    if (!mdbMerit || !mdbMerit.qualifier) continue;

    const partnerM = (c.merits || []).find(m => m.category === 'influence' && m.name === rule.partner_merit_name);
    if (!partnerM) continue;

    const amount = _effectivePartnerRating(partnerM);
    if (amount <= 0) continue;

    const styleM = (c.merits || []).find(m => m.category === (rule.target_category || 'general') && m.name === mdbMerit.qualifier);
    if (styleM) styleM[rule.target_field] = amount;
  }
}

/**
 * Effective partner merit rating: sums all active dot sources.
 * Mirrors the legacy mentorRating formula in mci.js.
 * Excludes lifecycle-clear fields (free_bloodline, free_pet, free_sw, free_mdb)
 * because those are either inapplicable to Mentor or would create a cycle.
 */
function _effectivePartnerRating(m) {
  // inherent-intentional: effective Mentor rating sums all applicable dot sources (cp + free + free_mci/vm/lk/ohm/inv/pt + xp); matches legacy mentorRating formula
  return (m.cp || 0) + (m.free || 0) + (m.free_mci || 0) + (m.free_vm || 0) + (m.free_lk || 0) + (m.free_ohm || 0) + (m.free_inv || 0) + (m.free_pt || 0) + (m.xp || 0); // inherent-intentional: continuation
}
