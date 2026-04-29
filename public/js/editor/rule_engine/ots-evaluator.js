/**
 * Oath of the Scapegoat evaluator.
 *
 * Reads grant_type:'status_floor' and grant_type:'style_pool' rule docs
 * seeded by seed-rules-ots.js.
 *
 * Sets _ots_covenant_bonus and _ots_free_dots on the character.
 * Clears stale free_ots on all fighting styles when the pact is absent.
 * No import dependencies — pure function; safe in Node.js test contexts.
 */

/**
 * @param {object} c - character (mutated in place)
 * @param {{ grants: object[] }} otsRules - getRulesBySource('Oath of the Scapegoat')
 */
export function applyOTSRulesFromDb(c, { grants = [] } = {}) {
  c._ots_covenant_bonus = 0;
  c._ots_free_dots = 0;

  const otsPact = (c.powers || []).find(
    p => p.category === 'pact' && (p.name || '').toLowerCase() === 'oath of the scapegoat',
  );

  if (!otsPact) {
    // Lifecycle: clear stale free_ots on all styles when pact is absent
    (c.fighting_styles || []).forEach(fs => { fs.free_ots = 0; });
    return;
  }

  const pactRating = (otsPact.cp || 0) + (otsPact.xp || 0); // inherent-intentional: pact rating = cp + xp; pacts have no free_* channels

  if (pactRating <= 0) {
    // Oath unpurchased — treat same as absent
    (c.fighting_styles || []).forEach(fs => { fs.free_ots = 0; });
    return;
  }

  for (const rule of grants) {
    if (rule.grant_type === 'status_floor' && rule.amount_basis === 'pact_rating') {
      c[rule.ephemeral_field] = pactRating;
    } else if (rule.grant_type === 'style_pool' && rule.amount_basis === 'pact_rating') {
      c[rule.ephemeral_field] = pactRating * (rule.amount_multiplier || 2);
    }
  }
}
