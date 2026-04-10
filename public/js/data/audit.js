/**
 * Character audit — validates CP budgets, XP balance, completeness, and prereqs.
 *
 * Pure function: receives a character object (with _gameXP already cached),
 * returns a structured audit result. No DOM, no side-effects.
 *
 * Usage:
 *   import { auditCharacter } from './audit.js';
 *   const result = auditCharacter(c);
 *   // result.valid     — true if zero errors
 *   // result.complete   — true if all creation points spent and priorities set
 *   // result.errors[]   — hard failures (overspend, missing required)
 *   // result.warnings[] — soft issues (unspent points, possible mistakes)
 *   // result.summary    — { cpUsed, cpBudget, xpEarned, xpSpent, xpLeft }
 */

import { xpEarned, xpSpent, xpLeft, xpSpentAttrs, xpSpentSkills,
         xpSpentMerits, xpSpentPowers, xpSpentSpecial, meritRating } from '../editor/xp.js';
import { ATTR_CATS, SKILL_CATS, PRI_BUDGETS, SKILL_PRI_BUDGETS } from './constants.js';
import { isInClanDisc } from './accessors.js';
import { meetsPrereq } from './prereq.js';
import { getRuleByKey } from './loader.js';

/**
 * Run all audit gates on a character.
 * @param {object} c — character object (with _gameXP cached if available)
 * @returns {{ valid: boolean, complete: boolean, errors: object[], warnings: object[], summary: object }}
 */
export function auditCharacter(c) {
  const errors = [];
  const warnings = [];

  // ── XP balance ──
  const earned = xpEarned(c);
  const spent = xpSpent(c);
  const left = xpLeft(c);
  if (left < 0) {
    errors.push({ gate: 'xp_overspend', message: `XP overspent by ${Math.abs(left)}`, detail: { earned, spent, left } });
  }

  // ── Attribute CP per category ──
  const atPri = c.attribute_priorities || {};
  let attrCPTotal = 0;
  for (const cat of Object.keys(ATTR_CATS)) {
    const pri = atPri[cat] || 'Tertiary';
    const budget = PRI_BUDGETS[pri] || 3;
    const used = (ATTR_CATS[cat] || []).reduce((s, a) => s + (c.attributes?.[a]?.cp || 0), 0);
    attrCPTotal += used;
    if (used > budget) {
      errors.push({ gate: 'attr_cp_over', message: `${cat} attributes: ${used} CP used, budget ${budget}`, detail: { category: cat, used, budget } });
    } else if (used < budget) {
      warnings.push({ gate: 'attr_cp_under', message: `${cat} attributes: ${budget - used} CP unspent`, detail: { category: cat, used, budget } });
    }
  }

  // ── Skill CP per category ──
  const skPri = c.skill_priorities || {};
  let skillCPTotal = 0;
  for (const cat of Object.keys(SKILL_CATS)) {
    const pri = skPri[cat] || 'Tertiary';
    const budget = SKILL_PRI_BUDGETS[pri] || 4;
    const used = (SKILL_CATS[cat] || []).reduce((s, sk) => s + (c.skills?.[sk]?.cp || 0), 0);
    skillCPTotal += used;
    if (used > budget) {
      errors.push({ gate: 'skill_cp_over', message: `${cat} skills: ${used} CP used, budget ${budget}`, detail: { category: cat, used, budget } });
    } else if (used < budget) {
      warnings.push({ gate: 'skill_cp_under', message: `${cat} skills: ${budget - used} CP unspent`, detail: { category: cat, used, budget } });
    }
  }

  // ── Skill specialisations ──
  const ptM = (c.merits || []).find(m => m.name === 'Professional Training');
  const ptFree = (ptM && (meritRating(c, ptM)) >= 3) ? 2 : 0;
  const ptAssets = new Set((ptM && meritRating(c, ptM) >= 3 && ptM.asset_skills) ? (ptM.asset_skills || []).filter(Boolean) : []);
  let assetSpecs = 0, nonAssetSpecs = 0;
  Object.entries(c.skills || {}).forEach(([sk, skillObj]) => {
    const count = (skillObj?.specs || []).length;
    if (ptAssets.has(sk)) assetSpecs += count;
    else nonAssetSpecs += count;
  });
  const mciFreeSpecs = (c._mci_free_specs || []).filter(fs =>
    fs.skill && fs.spec && (c.skills || {})[fs.skill] && ((c.skills[fs.skill].specs || []).includes(fs.spec))
  ).length;
  const ptFreeCovered = Math.min(ptFree, assetSpecs);
  const totalSpecs = nonAssetSpecs + assetSpecs;
  const freeSpecs = 3 + ptFreeCovered + mciFreeSpecs;
  const paidSpecs = Math.max(0, nonAssetSpecs + Math.max(0, assetSpecs - ptFreeCovered) - 3 - mciFreeSpecs);
  if (totalSpecs < 3) {
    warnings.push({ gate: 'spec_under', message: `${3 - totalSpecs} of 3 free specialisations unused`, detail: { total: totalSpecs, free: 3 } });
  }
  if (paidSpecs > 0 && left < 0) {
    warnings.push({ gate: 'spec_xp', message: `${paidSpecs} specialisation${paidSpecs > 1 ? 's' : ''} cost XP (${paidSpecs} XP)`, detail: { paid: paidSpecs, freeTotal: freeSpecs } });
  }

  // ── Discipline CP (3 total, max 1 out-of-clan) ──
  // Cruac and Theban are always out-of-clan per house rule.
  let discCPIn = 0, discCPOut = 0;
  for (const [d, v] of Object.entries(c.disciplines || {})) {
    const cp = v?.cp || 0;
    if (isInClanDisc(c, d)) discCPIn += cp;
    else discCPOut += cp;
  }
  const discCPTotal = discCPIn + discCPOut;
  if (discCPTotal > 3) {
    errors.push({ gate: 'disc_cp_over', message: `Discipline CP: ${discCPTotal} used, budget 3`, detail: { inClan: discCPIn, outClan: discCPOut } });
  }
  if (discCPOut > 1) {
    errors.push({ gate: 'disc_oc_over', message: `Out-of-clan discipline CP: ${discCPOut}, max 1`, detail: { outClan: discCPOut } });
  }
  if (discCPIn < 2 && discCPTotal > 0) {
    warnings.push({ gate: 'disc_ic_low', message: `In-clan discipline CP: ${discCPIn}, expected at least 2`, detail: { inClan: discCPIn } });
  }
  if (discCPTotal < 3) {
    warnings.push({ gate: 'disc_cp_under', message: `${3 - discCPTotal} discipline CP unspent`, detail: { used: discCPTotal, budget: 3 } });
  }

  // ── Merit/Style/Pact/BP CP (10 total) ──
  const meritCP = (c.merits || []).reduce((s, m) => s + (m.cp || 0), 0);
  const styleCP = (c.fighting_styles || []).reduce((s, fs) => s + (fs.cp || 0), 0);
  const pactCP = (c.powers || []).filter(p => p.category === 'pact').reduce((s, p) => s + (p.cp || 0), 0);
  const bpCP = (c.bp_creation || {}).cp || 0;
  const meritCPTotal = meritCP + styleCP + pactCP + bpCP;
  if (meritCPTotal > 10) {
    errors.push({ gate: 'merit_cp_over', message: `Merit CP: ${meritCPTotal} used, budget 10`, detail: { merits: meritCP, styles: styleCP, pacts: pactCP, bp: bpCP } });
  } else if (meritCPTotal < 10) {
    warnings.push({ gate: 'merit_cp_under', message: `${10 - meritCPTotal} merit CP unspent`, detail: { used: meritCPTotal, budget: 10 } });
  }

  // ── Priorities assigned ──
  const hasPri = atPri.Mental && atPri.Physical && atPri.Social;
  const hasSkPri = skPri.Mental && skPri.Physical && skPri.Social;
  if (!hasPri) warnings.push({ gate: 'no_attr_pri', message: 'Attribute priorities not set' });
  if (!hasSkPri) warnings.push({ gate: 'no_skill_pri', message: 'Skill priorities not set' });

  // ── Clan attribute set ──
  if (!c.clan_attribute && c.clan) {
    warnings.push({ gate: 'no_clan_attr', message: 'Clan favoured attribute not set' });
  }

  // ── Identity completeness ──
  if (!c.name) errors.push({ gate: 'no_name', message: 'Character has no name' });
  if (!c.clan) warnings.push({ gate: 'no_clan', message: 'Clan not set' });
  if (!c.covenant) warnings.push({ gate: 'no_covenant', message: 'Covenant not set' });
  if (!c.mask) warnings.push({ gate: 'no_mask', message: 'Mask not set' });
  if (!c.dirge) warnings.push({ gate: 'no_dirge', message: 'Dirge not set' });

  // ── MCI allocation ──
  // Each MCI has 5 tiers (capped at the merit's rating). Tiers 2 and 4 always
  // grant merits; tiers 1, 3 and 5 grant either merits or an alternative
  // (specialisation, skill dot, advantage) depending on dotN_choice. Every
  // grant tier needs a fully-specified entry: a tier_grants record (with
  // qualifier where required) for merit grants, or the dotN_skill / dotN_text
  // fields for the alternates. Anything missing is a hard error.
  const MCI_TIER_BUDGET = [0, 1, 1, 2, 3, 3];
  for (const m of (c.merits || [])) {
    if (m.name !== 'Mystery Cult Initiation' || m.active === false) continue;
    const rating = m.rating || 0;
    if (rating === 0) continue;
    const d1c = m.dot1_choice || 'merits', d3c = m.dot3_choice || 'merits', d5c = m.dot5_choice || 'merits';
    const tg = m.tier_grants || [];
    const tgByTier = new Map(tg.map(g => [g.tier, g]));
    const cultLbl = m.cult_name ? ` (${m.cult_name})` : '';

    // Tier over-budget (existing check)
    for (const g of tg) {
      const budget = MCI_TIER_BUDGET[g.tier] || 0;
      if (g.rating > budget) {
        errors.push({ gate: 'mci_tier_over', message: `MCI${cultLbl} tier ${g.tier}: ${g.name} (${g.rating}) exceeds budget (${budget})`, detail: { tier: g.tier, merit: g.name } });
      }
    }

    // Per-tier completeness
    const missingTiers = [];
    const checkMeritTier = (tier) => {
      const g = tgByTier.get(tier);
      if (!g || !g.name) { missingTiers.push(tier); return; }
      if ((g.name === 'Allies' || g.name === 'Status') && !g.qualifier) missingTiers.push(tier);
    };
    if (rating >= 1) {
      if (d1c === 'speciality') {
        if (!m.dot1_spec_skill || !m.dot1_spec) missingTiers.push(1);
      } else checkMeritTier(1);
    }
    if (rating >= 2) checkMeritTier(2);
    if (rating >= 3) {
      if (d3c === 'skill') {
        if (!m.dot3_skill) missingTiers.push(3);
      } else checkMeritTier(3);
    }
    if (rating >= 4) checkMeritTier(4);
    if (rating >= 5) {
      if (d5c === 'advantage') {
        if (!m.dot5_text) missingTiers.push(5);
      } else checkMeritTier(5);
    }
    if (missingTiers.length) {
      errors.push({
        gate: 'mci_unallocated',
        message: `MCI${cultLbl} not properly allocated (tier${missingTiers.length > 1 ? 's' : ''} ${missingTiers.join(', ')})`,
        detail: { tiers: missingTiers },
      });
    }
  }

  // ── Professional Training allocation ──
  // PT requires Asset Skill picks at rating 2 (slots 0/1), rating 3 (slot 2),
  // and a dot4_skill choice at rating 4 that must match one of the chosen
  // asset skills. Missing slots are a hard error.
  for (const m of (c.merits || [])) {
    if (m.name !== 'Professional Training' || m.active === false) continue;
    const rating = m.rating || 0;
    if (rating === 0) continue;
    const as = m.asset_skills || [];
    const validAs = as.filter(Boolean);
    const roleLbl = m.role ? ` (${m.role})` : '';
    const missing = [];
    if (rating >= 2 && (!as[0] || !as[1])) missing.push('Asset Skills 1/2');
    if (rating >= 3 && !as[2]) missing.push('3rd Asset Skill');
    if (rating >= 4 && (!m.dot4_skill || !validAs.includes(m.dot4_skill))) missing.push('On-the-Job Training skill');
    if (missing.length) {
      errors.push({
        gate: 'pt_unallocated',
        message: `PT${roleLbl} skills not properly allocated: ${missing.join(', ')}`,
        detail: { missing },
      });
    }
  }

  // ── Free dots used in character ──
  // Flag any item (attribute, skill, discipline, merit, fighting style)
  // that was paid for with the unsourced `free` bucket. These dots bypass
  // CP/XP accounting and usually come from legacy imports or manual ST
  // grants that weren't properly tracked.
  //
  // Exemptions:
  //   * Every attribute carries 1 base dot in `free`, plus 1 more on the
  //     clan-favoured attribute (base + favoured = 2 in `free`). Anything
  //     beyond that baseline is the genuinely-suspect "free" allocation.
  const freeItems = [];
  for (const [a, v] of Object.entries(c.attributes || {})) {
    const isClan = c.clan_attribute === a;
    const expected = 1 + (isClan ? 1 : 0);
    const suspect = (v?.free || 0) - expected;
    if (suspect > 0) freeItems.push(`${a} (attr) +${suspect}`);
  }
  for (const [s, v] of Object.entries(c.skills || {})) {
    const f = v?.free || 0;
    if (f > 0) freeItems.push(`${s} (skill) +${f}`);
  }
  for (const [d, v] of Object.entries(c.disciplines || {})) {
    const f = v?.free || 0;
    if (f > 0) freeItems.push(`${d} (disc) +${f}`);
  }
  for (const m of (c.merits || [])) {
    const f = m?.free || 0;
    if (f > 0) freeItems.push(`${m.name} (merit) +${f}`);
  }
  for (const fs of (c.fighting_styles || [])) {
    const f = fs?.free || 0;
    if (f > 0) freeItems.push(`${fs.name} (style) +${f}`);
  }
  if (freeItems.length) {
    warnings.push({
      gate: 'free_dots_used',
      message: `Free dots used in character! (${freeItems.length} item${freeItems.length === 1 ? '' : 's'})`,
      detail: { items: freeItems },
    });
  }

  // ── Merit prereqs ──
  for (const m of (c.merits || [])) {
    if (m.granted_by) continue; // granted merits bypass prereqs
    const slug = (m.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const rule = getRuleByKey(slug);
    if (rule?.prereq && !meetsPrereq(c, rule.prereq)) {
      warnings.push({ gate: 'merit_prereq', message: `${m.name}: prerequisites not met`, detail: { merit: m.name } });
    }
  }

  // ── Blood Potency chronicle cap ──
  if ((c.blood_potency || 0) > 2) {
    warnings.push({ gate: 'bp_cap', message: `Blood Potency ${c.blood_potency} exceeds chronicle cap of 2` });
  }

  // ── Summary ──
  const cpBudget = 12 + 22 + 3 + 10; // attr(12) + skill(22) + disc(3) + merit(10) = 47
  const cpUsed = attrCPTotal + skillCPTotal + discCPTotal + meritCPTotal;

  const complete = errors.length === 0
    && warnings.filter(w => w.gate.endsWith('_under') || w.gate.startsWith('no_')).length === 0;

  return {
    valid: errors.length === 0,
    complete,
    errors,
    warnings,
    summary: {
      xpEarned: earned,
      xpSpent: spent,
      xpLeft: left,
      cpUsed,
      cpBudget,
      attrCP: attrCPTotal,
      skillCP: skillCPTotal,
      discCP: discCPTotal,
      meritCP: meritCPTotal,
    }
  };
}
