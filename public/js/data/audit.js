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
import { ATTR_CATS, SKILL_CATS, PRI_BUDGETS, SKILL_PRI_BUDGETS,
         CLAN_DISCS, BLOODLINE_DISCS, RITUAL_DISCS } from './constants.js';
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
  } else if (left > 0) {
    warnings.push({ gate: 'xp_unspent', message: `${left} XP unspent`, detail: { earned, spent, left } });
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
  const inCL = BLOODLINE_DISCS[c.bloodline] || CLAN_DISCS[c.clan] || [];
  let discCPIn = 0, discCPOut = 0;
  for (const [d, v] of Object.entries(c.disciplines || {})) {
    const cp = v?.cp || 0;
    if (inCL.includes(d)) discCPIn += cp;
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
