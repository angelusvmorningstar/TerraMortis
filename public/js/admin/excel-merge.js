/**
 * Merge engine — overlays Excel point allocations onto existing character data.
 * Preserves powers, touchstones, ordeals, banes, and other non-Excel fields.
 */

import { getRuleByKey } from '../data/loader.js';

function slugify(str) {
  return (str || '').toLowerCase().replace(/['']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function ruleKey(category, name) {
  const slug = slugify(name);
  const r = getRuleByKey(slug);
  return r?.key || null;
}

/**
 * Merge Excel-extracted data onto an existing character.
 * @param {object|null} existing — existing DB character (null for new)
 * @param {object} excel — parsed Excel data from excel-parser.js
 * @returns {{ merged: object, changes: object[], warnings: string[] }}
 */
export function mergeExcelOntoCharacter(existing, excel) {
  const c = existing ? JSON.parse(JSON.stringify(existing)) : blankCharacter(excel.name);
  const isNew = !existing;
  const changes = [];
  const warnings = [];

  // ── Identity from Excel Character Data headers ──
  // Map common header names to character fields
  const ID_MAP = {
    'Name': 'name', 'Character Name': 'name',
    'Player': 'player', 'Player Name': 'player',
    'Clan': 'clan', 'Bloodline': 'bloodline',
    'Covenant': 'covenant', 'Mask': 'mask', 'Dirge': 'dirge',
    'Concept': 'concept', 'Pronouns': 'pronouns', 'Apparent Age': 'apparent_age',
    'Honorific': 'honorific', 'Moniker': 'moniker', 'Court Title': 'court_title',
    'Blood Potency': 'blood_potency', 'BP': 'blood_potency',
    'Humanity': 'humanity', 'Hum': 'humanity', 'Humanity Base': 'humanity_base',
  };
  const INT_FIELDS = new Set(['blood_potency', 'humanity']);
  if (excel.identity) {
    for (const [header, val] of Object.entries(excel.identity)) {
      const field = ID_MAP[header];
      if (!field) continue;
      const newVal = INT_FIELDS.has(field) ? parseInt(val, 10) || 0 : String(val).trim();
      const oldVal = c[field];
      if (oldVal !== newVal && newVal) {
        if (oldVal && field !== 'name') {
          warnings.push(`${header}: "${oldVal}" → "${newVal}" (identity change)`);
        }
        changes.push({ section: 'Identity', field: header, old: oldVal || '(empty)', new: newVal });
        c[field] = newVal;
      }
    }
  }

  // ── Attributes ──
  if (!c.attributes) c.attributes = {};
  for (const [attr, pts] of Object.entries(excel.attributes)) {
    const ao = c.attributes[attr] || { dots: 1, bonus: 0 };
    const oldCp = ao.cp || 0, oldXp = ao.xp || 0, oldFree = ao.free || 0;
    ao.cp = pts.cp; ao.xp = pts.xp; ao.free = pts.free;
    ao.rule_key = ao.rule_key || ruleKey('attribute', attr);
    c.attributes[attr] = ao;
    if (oldCp !== pts.cp || oldXp !== pts.xp || oldFree !== pts.free) {
      changes.push({ section: 'Attributes', field: attr, old: `${oldCp}/${oldFree}/${oldXp}`, new: `${pts.cp}/${pts.free}/${pts.xp}` });
    }
  }

  // ── Skills ──
  if (!c.skills) c.skills = {};
  for (const [skill, pts] of Object.entries(excel.skills)) {
    const so = c.skills[skill] || { dots: 0, bonus: 0, specs: [], nine_again: false };
    const oldCp = so.cp || 0, oldXp = so.xp || 0, oldFree = so.free || 0;
    so.cp = pts.cp; so.xp = pts.xp; so.free = pts.free;
    so.rule_key = so.rule_key || ruleKey('skill', skill);
    c.skills[skill] = so;
    if (oldCp !== pts.cp || oldXp !== pts.xp || oldFree !== pts.free) {
      changes.push({ section: 'Skills', field: skill, old: `${oldCp}/${oldFree}/${oldXp}`, new: `${pts.cp}/${pts.free}/${pts.xp}` });
    }
  }

  // ── Disciplines ──
  if (!c.disciplines) c.disciplines = {};
  for (const [disc, pts] of Object.entries(excel.disciplines)) {
    const dObj = typeof c.disciplines[disc] === 'object' ? c.disciplines[disc] : { dots: c.disciplines[disc] || 0 };
    const oldCp = dObj.cp || 0, oldXp = dObj.xp || 0, oldFree = dObj.free || 0;
    dObj.cp = pts.cp; dObj.xp = pts.xp; dObj.free = pts.free;
    dObj.rule_key = dObj.rule_key ?? null;
    c.disciplines[disc] = dObj;
    if (oldCp !== pts.cp || oldXp !== pts.xp || oldFree !== pts.free) {
      changes.push({ section: 'Disciplines', field: disc, old: `${oldCp}/${oldFree}/${oldXp}`, new: `${pts.cp}/${pts.free}/${pts.xp}` });
    }
  }

  // ── Merits: match by name and apply points ──
  const merits = c.merits || [];

  // General merits from Excel — match against character merits to determine gen vs man
  const genMatched = new Set();
  for (const gm of excel.generalMerits) {
    // Try manoeuvre match first
    const manMatch = merits.find(m =>
      m.category === 'manoeuvre' && m.name === gm.name && !genMatched.has(merits.indexOf(m))
    );
    if (manMatch) {
      applyMeritPoints(manMatch, gm._manPts || { cp: 0, free: 0, xp: 0 }, changes, gm.name);
      genMatched.add(merits.indexOf(manMatch));
      continue;
    }
    // Try general merit match
    const genMatch = merits.find(m =>
      m.category === 'general' && m.name === gm.name && !genMatched.has(merits.indexOf(m))
    );
    if (genMatch) {
      applyMeritPoints(genMatch, gm._genPts || { cp: 0, free: 0, xp: 0 }, changes, gm.name);
      genMatched.add(merits.indexOf(genMatch));
      continue;
    }
    if (gm.name) warnings.push(`General merit "${gm.name}" not found on character`);
  }

  // Influence merits
  const inflPool = merits.filter(m => m.category === 'influence').slice();
  for (const im of excel.influenceMerits) {
    const match = inflPool.find(m => {
      if (m.name !== im.name) return false;
      if (!im.area) return true;
      const mArea = m.area || m.qualifier || '';
      return mArea.toLowerCase().includes(im.area.toLowerCase()) || im.area.toLowerCase().includes(mArea.toLowerCase());
    });
    if (match) {
      applyMeritPoints(match, im.points, changes, `${im.name}${im.area ? ' (' + im.area + ')' : ''}`);
      inflPool.splice(inflPool.indexOf(match), 1);
    } else if (im.name) {
      warnings.push(`Influence merit "${im.name}${im.area ? ' (' + im.area + ')' : ''}" not found on character`);
    }
  }

  // Domain merits
  for (const [name, pts] of Object.entries(excel.domainMerits)) {
    const match = merits.find(m => m.category === 'domain' && m.name === name);
    if (match) applyMeritPoints(match, pts, changes, name);
    else warnings.push(`Domain merit "${name}" not found on character`);
  }

  // Standing merits
  for (const [name, pts] of Object.entries(excel.standingMerits)) {
    const match = merits.find(m => m.category === 'standing' && m.name === name);
    if (match) applyMeritPoints(match, pts, changes, name);
    else warnings.push(`Standing merit "${name}" not found on character`);
  }

  // Set rule_key on all merits that don't have one
  for (const m of merits) {
    if (m.rule_key === undefined) m.rule_key = ruleKey('merit', m.name);
  }

  c.merits = merits;

  // ── XP log ──
  if (!c.xp_log) c.xp_log = { earned: {}, spent: {} };
  const oldSpent = c.xp_log.spent || {};
  const newSpent = excel.xpLog;
  for (const [k, v] of Object.entries(newSpent)) {
    if ((oldSpent[k] || 0) !== v) {
      changes.push({ section: 'XP Log', field: k, old: oldSpent[k] || 0, new: v });
    }
  }
  c.xp_log.spent = { ...oldSpent, ...newSpent };

  // Remove old parallel fields
  delete c.attr_creation; delete c.skill_creation; delete c.disc_creation; delete c.merit_creation;

  return { merged: c, changes, warnings, isNew };
}

function applyMeritPoints(merit, pts, changes, label) {
  const oldCp = merit.cp || 0, oldXp = merit.xp || 0, oldFree = merit.free || 0;
  merit.cp = pts.cp; merit.xp = pts.xp; merit.free = pts.free;
  if (oldCp !== pts.cp || oldXp !== pts.xp || oldFree !== pts.free) {
    changes.push({ section: 'Merits', field: label, old: `${oldCp}/${oldFree}/${oldXp}`, new: `${pts.cp}/${pts.free}/${pts.xp}` });
  }
}

function blankCharacter(name) {
  const NINE_ATTRS = ['Intelligence','Wits','Resolve','Strength','Dexterity','Stamina','Presence','Manipulation','Composure'];
  return {
    name: name || 'New Character',
    player: null, clan: null, covenant: null, bloodline: null,
    mask: null, dirge: null, court_title: null,
    blood_potency: 1, humanity: 7, humanity_base: 7,
    status: { city: 0, clan: 0, covenant: 0 },
    attributes: Object.fromEntries(NINE_ATTRS.map(a => [a, { dots: 1, bonus: 0, cp: 0, xp: 0, free: 0, rule_key: null }])),
    skills: {}, disciplines: {},
    merits: [], powers: [], fighting_styles: [], fighting_picks: [],
    touchstones: [], banes: [], ordeals: [],
    willpower: {}, aspirations: [],
    xp_log: { earned: {}, spent: {} },
  };
}
