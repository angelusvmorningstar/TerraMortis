/**
 * Pool grant evaluator — processes rule_grant docs with grant_type='pool'.
 *
 * Called ONCE from applyDerivedMerits with the WHOLE rule_grant collection
 * (#1137). It was previously called once per hardcoded source name, which is
 * how two seeded compounds shipped with no pool at all: nobody added their
 * call. Do not reintroduce per-source dispatch — this function already filters
 * to grant_type='pool' + condition='merit_present' and checks merit presence
 * per rule, so it needs no help identifying which rules apply.
 *
 * No external imports — pure function; safe to call in Node.js test contexts.
 */

/**
 * Apply pool grant rules from the DB against a character.
 * Checks that the source merit is present, computes the pool size, and pushes
 * a _grant_pools entry if the pool is non-zero.
 *
 * @param {object} c - character (mutated in place; _grant_pools cleared by applyDerivedMerits before first call)
 * @param {{ grants: object[] }} poolRules - the whole rule_grant collection
 *        (`getRulesCache().rule_grant`). A per-source subset still works, but
 *        the production caller passes everything; see the header note.
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
      // Issue #775: bridge rule_grant docs that use `source_slug` (N-1
      // convention) without an explicit `category` field. Older docs set
      // only `category`; N-3-era and post-MNEC docs may set only
      // `source_slug`. Fall back so consumers downstream (sheet.js:124
      // `_renderPoolCounters` filters, poolAvailableFor cap math) always
      // see a non-undefined category. Belt-and-braces with the seed which
      // writes both fields explicitly.
      category: rule.category ?? rule.source_slug,
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
    case 'rating_of_source':
      // N-3 / MNEC (issue #692): pool size = the source merit's own purchased
      // rating. Necropolis Sepulcher 3 → 3 free dots distributable across the
      // Collective Compound's six target merits via `free_grants.necro`.
      // Reads cp+xp directly (matches _ratingOfPartner semantics — pool basis
      // is purchased dots only, not free grants — to avoid feedback loops).
      return _ratingOfPartner(c, rule.source);
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
      // inherent-intentional: free_mci counts because MCI Allies are real influence resources; N-1 map-fallback so N-2 backfill (legacy → map) doesn't drop dots
      total += (m.cp || 0) + (m.xp || 0) + ((m.free_grants?.mci) ?? m.free_mci ?? 0);
    } else if (m.name === 'Herd') {
      if (m.derived) return;
      // inherent-intentional: Herd dice-pool contribution counts purchased dots only (cp+xp); derived/granted Herd is filtered above.
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
  return c.status?.covenant?.['Invictus'] || 0;
}
