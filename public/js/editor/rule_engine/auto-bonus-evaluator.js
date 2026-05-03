/**
 * Auto-bonus evaluator — processes rule_grant docs with grant_type='auto_bonus'.
 *
 * Models the SSJ/Flock pattern: a source merit grants a derived bonus on a
 * specific target merit, with no user allocation step. The bonus amount is
 * computed at render time from partner merit ratings (rating_of_partner_merit
 * basis) and written to target_field on the target merit instance — read back
 * by meritEffectiveRating like any other free_* field.
 *
 * Called once with all auto_bonus rules from the cache (no per-source
 * iteration needed). Each rule clears its own target_field on the target
 * merit before re-applying so removing the source merit also removes the
 * bonus on the next render pass.
 *
 * No external imports — pure function; safe in Node.js test contexts.
 */

export function applyAutoBonusRulesFromDb(c, { grants = [] } = {}) {
  const autoGrants = grants.filter(r => r.grant_type === 'auto_bonus');
  if (!autoGrants.length) return;

  // Stale-clear: zero every (target merit, target_field) tuple this evaluator
  // owns. Done up front so a removed source merit doesn't leave the bonus
  // stuck on the target.
  for (const rule of autoGrants) {
    if (!rule.target || !rule.target_field) continue;
    (c.merits || []).forEach(m => {
      if (m.name === rule.target) m[rule.target_field] = 0;
    });
  }

  for (const rule of autoGrants) {
    if (!rule.target || !rule.target_field) continue;

    // Source merit must be present on the character
    const hasMerit = (c.merits || []).some(m => m.name === rule.source);
    if (!hasMerit) continue;

    const amount = _computeAmount(c, rule);
    if (amount <= 0) continue;

    // Apply to the target merit instance (first match — auto-bonus targets a
    // single merit by name; if multiple instances exist, pick the first).
    const target = (c.merits || []).find(m => m.name === rule.target);
    if (target) target[rule.target_field] = amount;
  }
}

// ── Amount computation ────────────────────────────────────────────────────────

function _computeAmount(c, rule) {
  switch (rule.amount_basis) {
    case 'rating_of_partner_merit': {
      const names = Array.isArray(rule.partner_merit_names)
        ? rule.partner_merit_names
        : (rule.partner_merit_name ? [rule.partner_merit_name] : []);
      return names.reduce((sum, n) => sum + _ratingOfPartner(c, n), 0);
    }
    case 'flat':
      return rule.amount ?? 0;
    default:
      return 0;
  }
}

/**
 * Sum of (cp + xp) across all merits with the given name. Mirrors
 * pool-evaluator's _ratingOfPartner — purchased dots only, not free grants.
 */
function _ratingOfPartner(c, partnerMeritName) {
  if (!partnerMeritName) return 0;
  let total = 0;
  (c.merits || []).forEach(m => {
    if (m.name !== partnerMeritName) return;
    total += (m.cp || 0) + (m.xp || 0);
  });
  return total;
}
