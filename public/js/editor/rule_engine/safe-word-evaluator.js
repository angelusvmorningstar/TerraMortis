/**
 * Safe Word evaluator — mirrors partner's shared_merit as free_sw dots.
 *
 * Reads grant_type:'merit' + condition:'partner_pact_confirmation' rule docs
 * seeded by seed-rules-safe-word.js.
 *
 * Requires allChars for the bidirectional pact check.
 * free_sw is cleared before this runs (applyDerivedMerits stale-clear).
 * No import dependencies — pure function; safe in Node.js test contexts.
 */

/**
 * @param {object} c - character (mutated in place)
 * @param {{ grants: object[] }} swRules - getRulesBySource('Oath of the Safe Word')
 * @param {object[]} allChars - full character roster for partner lookup
 */
export function applySafeWordRulesFromDb(c, { grants = [] } = {}, allChars = []) {
  const meritGrants = grants.filter(r => r.grant_type === 'merit' && r.condition === 'partner_pact_confirmation');
  if (!meritGrants.length) return;

  for (const rule of meritGrants) {
    const sourceLower = rule.source.toLowerCase();
    const swPact = (c.powers || []).find(
      p => p.category === 'pact' && (p.name || '').toLowerCase() === sourceLower,
    );

    if (!swPact || !swPact.partner) continue; // pact absent — no-op; stale free_sw cleared by applyDerivedMerits

    const partner = allChars.find(ch => ch.name === swPact.partner);
    const isActive = partner && (partner.powers || []).some(
      p => p.category === 'pact' && (p.name || '').toLowerCase() === sourceLower && p.partner === c.name,
    );

    if (!isActive) {
      // Oath no longer active — remove auto-created SW merit if it has no own dots.
      // Auto-removal when the pact entry is fully absent is handled by a lifecycle
      // cleanup hook, not here; this path covers non-mutual / broken pacts.
      _removeStaleSwMerit(c);
      continue;
    }

    const partnerPact = (partner.powers || []).find(
      p => p.category === 'pact' && (p.name || '').toLowerCase() === sourceLower,
    );
    const smStr = ((partnerPact && partnerPact.shared_merit) ? partnerPact.shared_merit : '').trim();
    if (!smStr) continue;

    const parenMatch = smStr.match(/^(.+?)\s*\((.+)\)$/);
    const mName = parenMatch ? parenMatch[1].trim() : smStr;
    const mArea = parenMatch ? parenMatch[2].trim() : '';

    const pm = (partner.merits || []).find(m =>
      m.name === mName &&
      (!mArea || (m.area || '').toLowerCase() === mArea.toLowerCase() ||
                 (m.qualifier || '').toLowerCase() === mArea.toLowerCase()),
    );

    // Partner effective rating — excludes free_sw to prevent circular reference (one-hop only)
    const grant = pm ? _effectivePartnerRating(pm) : 0;
    if (grant <= 0) continue;

    let rm = (c.merits || []).find(m =>
      m.name === mName && m.granted_by === 'Safe Word' &&
      (!mArea || (m.area || '').toLowerCase() === mArea.toLowerCase()),
    );
    if (!rm) {
      if (!c.merits) c.merits = [];
      rm = {
        name: mName,
        category: rule.mirror_category || 'influence',
        granted_by: 'Safe Word',
        cp: 0,
        xp: 0,
        free_sw: 0,
      };
      if (mArea) rm.area = mArea;
      c.merits.push(rm);
    }
    rm[rule.target_field] = grant;
  }
}

function _removeStaleSwMerit(c) {
  const idx = (c.merits || []).findIndex(m =>
    m.granted_by === 'Safe Word' &&
    // inherent-intentional: zero-checks all dot channels to confirm merit is phantom (no purchased or derived dots remain)
    !(m.cp) && !(m.xp) && !(m.free_mci) && !(m.free_vm) && !(m.free_bloodline) &&
    !(m.free_pet) && !(m.free_lk) && !(m.free_ohm) && !(m.free_inv) && !(m.free_pt) && !(m.free_mdb),
  );
  if (idx !== -1) c.merits.splice(idx, 1);
}

/**
 * Effective partner merit rating: sums all active dot sources.
 * Excludes free_sw to prevent circular reference (one-hop only).
 */
function _effectivePartnerRating(m) {
  // inherent-intentional: effective partner rating sums all purchased + free dot sources; mirrors legacy mci.js line 79-81
  return (m.cp || 0) + (m.free_bloodline || 0) + (m.free_pet || 0) + (m.free_mci || 0) + // inherent-intentional: continuation
    (m.free_vm || 0) + (m.free_lk || 0) + (m.free_ohm || 0) + (m.free_inv || 0) +
    (m.free_pt || 0) + (m.free_mdb || 0) + (m.xp || 0); // inherent-intentional: continuation
}
