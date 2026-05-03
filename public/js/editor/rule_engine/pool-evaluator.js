/**
 * Pool grant evaluator — processes rule_grant docs with grant_type='pool'.
 * Generic: called once per source (Invested, Lorekeeper) from applyDerivedMerits.
 *
 * No external imports — pure function; safe to call in Node.js test contexts.
 */

/**
 * Apply pool grant rules from the DB against a character.
 * Checks that the source merit is present, computes the pool size, and pushes
 * a _grant_pools entry if the pool is non-zero.
 *
 * @param {object} c - character (mutated in place; _grant_pools cleared by applyDerivedMerits before first call)
 * @param {{ grants: object[] }} poolRules - grants for this source (getRulesBySource(sourceName))
 */
export function applyPoolRulesFromDb(c, { grants = [] } = {}) {
  // condition:'merit_present' distinguishes Invested/Lorekeeper-style pools from
  // MCI tier pools (condition:'tier'/'choice') which the MCI evaluator handles.
  const poolGrants = grants.filter(r => r.grant_type === 'pool' && r.condition === 'merit_present');
  if (!poolGrants.length) return;

  for (const rule of poolGrants) {
    // Source merit must be present on the character
    const hasMerit = (c.merits || []).some(m => m.name === rule.source);
    if (!hasMerit) continue;

    const amount = _computeAmount(c, rule);
    if (amount <= 0) continue;

    c._grant_pools.push({
      source: rule.source,
      names: rule.pool_targets,
      category: rule.category,
      amount,
    });
  }
}

// ── Amount computation ────────────────────────────────────────────────────────

function _computeAmount(c, rule) {
  switch (rule.amount_basis) {
    case 'vm_pool':
    case 'vm_allies_pool':  // legacy alias — pre-Herd-allocation rule docs
      return _vmPool(c);
    case 'rating_of_partner_merit': {
      // Accept either partner_merit_names (array, summed) or partner_merit_name
      // (singular, legacy). Array form lets one pool draw from multiple source
      // merits — e.g. Lorekeeper accepting both Library and Esoteric Armoury.
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
 * Inline copy of domain.js:vmPool — no import needed.
 * Single shared pool across Allies (cp + xp + free_mci) and Herd (cp + xp).
 * VM-granted Allies (granted_by: 'VM') excluded to prevent feedback loop.
 */
function _vmPool(c) {
  let total = 0;
  (c.merits || []).forEach(m => {
    if (m.granted_by === 'VM') return;
    if (m.category === 'influence' && m.name === 'Allies') {
      total += (m.cp || 0) + (m.xp || 0) + (m.free_mci || 0); // inherent-intentional: free_mci counts because MCI Allies are real influence resources
    } else if (m.name === 'Herd') {
      if (m.derived) return;
      total += (m.cp || 0) + (m.xp || 0);
    }
  });
  return total;
}

/**
 * Compute the effective rating of the named partner merit.
 * 'Invictus Status' is a special case resolved via effectiveInvictusStatus
 * (covenant status, not a merit; also accounts for OTS floor).
 * All other names: sum of purchased dots (cp + xp) across all matching merits.
 */
function _ratingOfPartner(c, partnerMeritName) {
  if (!partnerMeritName) return 0;
  if (partnerMeritName === 'Invictus Status') return _effectiveInvictusStatus(c);
  let total = 0;
  (c.merits || []).forEach(m => {
    if (m.name !== partnerMeritName) return;
    total += (m.cp || 0) + (m.xp || 0); // inherent-intentional: pool basis is purchased dots only, not free grants
  });
  return total;
}

/**
 * Inline copy of domain.js:effectiveInvictusStatus — no import needed.
 * Evaluators must be pure functions with no browser-module dependencies.
 */
function _effectiveInvictusStatus(c) {
  if (c.covenant !== 'Invictus') return 0;
  return Math.max(c.status?.covenant?.['Invictus'] || 0, c._ots_covenant_bonus || 0);
}
