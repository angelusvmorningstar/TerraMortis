/**
 * Style-retainer evaluator — processes rule_grant docs with condition:'fighting_style_present'.
 * Replaces the legacy K-9 / Falconry inline block in applyDerivedMerits.
 *
 * No external imports — pure function; safe to call in Node.js test contexts.
 */

/**
 * Apply style-retainer grant rules from the DB against a character.
 * Clears stale free_pet on auto-created Retainers first (lifecycle guard for
 * when a style is removed), then re-applies for styles that are still purchased.
 *
 * @param {object} c - character (mutated in place)
 * @param {{ grants: object[] }} styleRules - grants for this source (getRulesBySource(styleName))
 */
export function applyStyleRetainerRulesFromDb(c, { grants = [] } = {}) {
  const retainerGrants = grants.filter(r =>
    r.grant_type === 'merit' && r.condition === 'fighting_style_present',
  );
  if (!retainerGrants.length) return;

  for (const rule of retainerGrants) {
    const styleName = rule.source;
    const area = rule.target_qualifier;

    // Clear stale grant dots — handles cleanup when style is removed or unpurchased
    (c.merits || []).forEach(m => {
      if (m.name === 'Retainer' && m.granted_by === styleName) { m.free = 0; m.free_pet = 0; }
    });

    const hasStyle = (c.fighting_styles || []).some(fs => {
      if (fs.type === 'merit' || fs.name !== styleName) return false;
      // inherent-intentional: sum spans all dot channels; fs.up is dead code preserved for bug-for-bug parity with legacy mci.js
      return ((fs.cp || 0) + (fs.free || 0) + (fs.free_mci || 0) + (fs.free_ots || 0) + (fs.xp || 0) + (fs.up || 0)) >= 1;
    });
    if (!hasStyle) continue;

    let m = (c.merits || []).find(m => m.name === 'Retainer' && m.granted_by === styleName);
    if (!m) {
      if (!c.merits) c.merits = [];
      m = { name: 'Retainer', category: 'influence', rating: 0, area, granted_by: styleName };
      c.merits.push(m);
    }
    m.free_pet = 1;
  }
}
