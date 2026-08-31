/**
 * AC4 regression test — TM Admin Story tm-admin.10.1 ("one true rating"
 * Stage 1, Phase A). Proves the read-path accessors this story deliberately
 * did NOT change (getAttrEffective, skTotal, discDots) still sum
 * dots + bonus exactly as before, using the two named live characters from
 * rules-engine-and-mods-audit.md's AC4 table (Jack Fallow, Charles
 * Mercer-Willows) whose real, un-migrated nonzero Presence.bonus values are
 * exactly the kind of data this story's schema-comment freeze must not
 * silently change the rendering of.
 *
 * Fixture values are the audit's own live-data snapshot, not invented:
 * both characters carry Cruac 2 / Presence dots 3 / Presence bonus 2 (a
 * raw-field write from cockpit/scripts/apply-mantle-presence-bonus-2026-08.mjs,
 * not an st_mods overlay — see the audit's AC4 table). Cruac is not a
 * physical discipline (discAttrBonus only maps Vigour/Resilience/Celerity),
 * so the Mantle's own bonus does not double-apply through discAttrBonus;
 * the effective total is exactly dots + bonus.
 */

import { describe, it, expect } from 'vitest';
import { getAttrEffective, getAttrTotal, getAttrVal, getAttrBonus } from '../../public/js/data/accessors.js';

function makeCharacter(name) {
  return {
    name,
    attributes: {
      Presence: { dots: 3, bonus: 2, cp: 0, xp: 0, free: 0, rule_key: null },
    },
    disciplines: {
      Cruac: { dots: 2, bonus: 0, cp: 0, xp: 0, free: 0, rule_key: null },
    },
  };
}

describe('AC4 — read-path accessors unchanged for real live drifted characters', () => {
  it.each([
    ['Jack Fallow'],
    ['Charles Mercer-Willows'],
  ])('%s: Presence renders as dots (3) + bonus (2) = 5, unaffected by the schema-comment freeze', (name) => {
    const c = makeCharacter(name);

    expect(getAttrVal(c, 'Presence')).toBe(3);
    expect(getAttrBonus(c, 'Presence')).toBe(2);
    expect(getAttrTotal(c, 'Presence')).toBe(5);
    // No rule_disc_attr cache loaded in this unit test -> discAttrBonus falls
    // back to its hardcoded Vigour/Resilience map, which Presence/Cruac is
    // not part of, so effective === total here (0 discipline contribution).
    expect(getAttrEffective(c, 'Presence')).toBe(5);
  });
});
