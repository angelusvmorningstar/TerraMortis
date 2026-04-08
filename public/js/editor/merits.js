/**
 * Merit utilities, prerequisite system, and power/discipline helpers.
 * Depends on constants and the rules cache (purchasable_powers API).
 */

import {
  ATTR_NAMES, SKILL_NAMES, DISC_NAMES, COV_SHORT, CLAN_NAMES,
  SORCERY_THEMES, RITUAL_DISCS, INFLUENCE_SPHERES
} from '../data/constants.js';
import { meetsPrereq as _meetsPrereq, prereqLabel as _prereqLabel } from '../data/prereq.js';
import { getRulesByCategory, getRuleByKey, getRulesDB } from '../data/loader.js';

// Re-export the new prereq engine for direct use by consumers
export { _meetsPrereq as meetsPrereq, _prereqLabel as prereqLabel };

/** Check if a merit is excluded by a merit the character already owns. */
function _isExcluded(c, meritName) {
  const owned = (c.merits || []).map(m => m.name.toLowerCase());
  // Check if any owned merit's exclusive list includes this candidate
  for (const m of (c.merits || [])) {
    const rule = getRuleByKey(m.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
    if (!rule || !rule.exclusive) continue;
    const excluded = rule.exclusive.split(',').map(s => s.trim().toLowerCase());
    if (excluded.includes(meritName.toLowerCase())) return rule.name;
  }
  return null;
}

/* ══════════════════════════════════════════════════════
   Merit string helpers
   ══════════════════════════════════════════════════════ */

/** Strip dot glyphs and pipe-suffix, returning the base merit name. */
export function meritBase(s) {
  return s.replace(/\s*[●○]+.*/,'').replace(/\s*\|.*/,'').trim();
}

/** Count filled-dot glyphs in a merit string. */
export function meritDotCount(s) {
  return (s.match(/●/g) || []).length;
}

/** Return the pipe-suffix portion, or null. */
export function meritSuffix(s) {
  const m = s.match(/\|\s*(.+)$/);
  return m ? m[1].trim() : null;
}

/** Lowercase key from the base name. */
export function meritKey(s) {
  return meritBase(s).toLowerCase();
}

/** Lowercase key with parenthetical qualifiers stripped. */
export function meritKeyBase(s) {
  return meritKey(s).replace(/\s*\([^)]*\)\s*/g,'').trim();
}

/**
 * If a merit has a single fixed rating (e.g. Viral Mythology = 3), returns that number.
 * Returns null for graduated/range merits (e.g. Allies 1-5).
 */
export function meritFixedRating(name) {
  // Try rules cache first
  const slug = (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const rule = getRuleByKey(slug);
  if (rule) {
    if (!rule.rating_range) return null;
    if (rule.rating_range[0] === rule.rating_range[1]) return rule.rating_range[0];
    return null; // range merit
  }
  return null;
}

/** Look up a merit by name string. Tries rules cache first, falls back to MERITS_DB. */
export function meritLookup(s) {
  // Try rules cache (unified schema)
  const slug = (s || '').toLowerCase().replace(/\s*[●○]+.*/,'').replace(/\s*\|.*/,'').trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const rule = getRuleByKey(slug);
  if (rule) return { desc: rule.description, prereq: rule.prereq, rating: rule.rating_range ? `${rule.rating_range[0]}–${rule.rating_range[1]}` : null, type: rule.parent, sub_category: rule.sub_category, _rule: rule };
  return null;
}

/* ══════════════════════════════════════════════════════
   Merit array helpers (operate on character objects)
   ══════════════════════════════════════════════════════ */

/**
 * Find a merit by category and filtered index, returning both the merit
 * object and its real index in c.merits.
 */
export function meritByCategory(c, category, filteredIdx) {
  const filtered = (c.merits || []).filter(m => m.category === category);
  const m = filtered[filteredIdx];
  if (!m) return { merit: null, realIdx: -1 };
  return { merit: m, realIdx: c.merits.indexOf(m) };
}

/** Ensure every merit has inline creation fields (v3). */
export function ensureMeritSync(c) {
  if (!c.merits) c.merits = [];
  for (const m of c.merits) {
    if (m.cp === undefined) m.cp = 0;
    if (m.xp === undefined) m.xp = 0;
    if (m.free === undefined) m.free = 0;
    if (m.free_mci === undefined) m.free_mci = 0;
    if (m.free_vm === undefined) m.free_vm = 0;
    if (m.free_lk === undefined) m.free_lk = 0;
    if (m.free_ohm === undefined) m.free_ohm = 0;
    if (m.free_inv === undefined) m.free_inv = 0;
    if (m.free_pt === undefined) m.free_pt = 0;
    if (m.free_mdb === undefined) m.free_mdb = 0;
  }
}

/** Append a merit with inline creation defaults. */
export function addMerit(c, merit) {
  if (!c.merits) c.merits = [];
  if (merit.cp === undefined) merit.cp = 0;
  if (merit.xp === undefined) merit.xp = 0;
  if (merit.free === undefined) merit.free = 0;
  if (merit.free_mci === undefined) merit.free_mci = 0;
  if (merit.free_vm === undefined) merit.free_vm = 0;
  if (merit.free_lk === undefined) merit.free_lk = 0;
  if (merit.free_ohm === undefined) merit.free_ohm = 0;
  if (merit.free_inv === undefined) merit.free_inv = 0;
  if (merit.free_pt === undefined) merit.free_pt = 0;
  if (merit.free_mdb === undefined) merit.free_mdb = 0;
  if (merit.rule_key === undefined) merit.rule_key = null;
  c.merits.push(merit);
}

/** Remove a merit by real index. */
export function removeMerit(c, realIdx) {
  if (realIdx < 0 || realIdx >= c.merits.length) return;
  c.merits.splice(realIdx, 1);
}

/* ══════════════════════════════════════════════════════
   Internal dot-lookup helpers (for prerequisite checks)
   ══════════════════════════════════════════════════════ */

function _getAttrDots(c, name) {
  const k = Object.keys(c.attributes || {}).find(a => a.toLowerCase() === name);
  return k ? (c.attributes[k].dots || 0) : 0;
}

function _getSkillDots(c, name) {
  const k = Object.keys(c.skills || {}).find(s => s.toLowerCase() === name);
  return k ? (c.skills[k].dots || 0) : 0;
}

function _getDiscDots(c, name) {
  const n = name.toLowerCase();
  const k = Object.keys(c.disciplines || {}).find(d => d.toLowerCase() === n);
  return k ? (c.disciplines[k]?.dots || 0) : 0;
}

function _getMeritRating(c, name) {
  const n = name.toLowerCase();
  const m = (c.merits || []).find(m => m.name.toLowerCase() === n);
  return m ? (m.rating || 1) : 0;
}

function _getCovStatus(c, covShort) {
  const fullName = COV_SHORT[covShort.toLowerCase()] || covShort;
  if ((c.covenant || '').toLowerCase() === fullName.toLowerCase()) return c.status?.covenant || 0;
  const standings = c.covenant_standings || {};
  const k = Object.keys(standings).find(k => k.toLowerCase() === covShort.toLowerCase() || standings[k] === covShort);
  return k ? standings[k] : 0;
}

/* ══════════════════════════════════════════════════════
   Prerequisite system
   ══════════════════════════════════════════════════════ */

/**
 * Check a single prerequisite token against a character.
 * Returns true if the character meets the requirement.
 */
export function checkSinglePrereq(c, token) {
  token = token.trim();
  if (!token || token === 'None' || token === '-') return true;

  // "No X Status"
  const noStatus = /^No\s+(\w+)\s+Status$/i.exec(token);
  if (noStatus) {
    const cov = noStatus[1];
    return _getCovStatus(c, cov) === 0;
  }

  // "City Status N"
  const cityStatus = /^City\s+Status\s+(\d+)$/i.exec(token);
  if (cityStatus) return (c.status?.city || 0) >= parseInt(cityStatus[1]);

  // "Clan Status N" or "[ClanName] Status N"
  const clanStatus = /^(?:Clan\s+)?(\w+)\s+Status\s+(\d+)$/i.exec(token);
  if (clanStatus) {
    const word = clanStatus[1].toLowerCase();
    const n = parseInt(clanStatus[2]);
    if (word === 'clan') return (c.status?.clan || 0) >= n;
    if (COV_SHORT[word]) return _getCovStatus(c, word) >= n;
    return _getCovStatus(c, word) >= n;
  }

  // "Humanity < N"
  const humLt = /^Humanity\s*<\s*(\d+)$/i.exec(token);
  if (humLt) return (c.humanity || 7) < parseInt(humLt[1]);

  // "X Bloodline" or "Bloodline X"
  if (/bloodline/i.test(token)) {
    const bl = (c.bloodline || '').toLowerCase();
    return bl && token.toLowerCase().includes(bl);
  }

  // Clan name alone
  if (CLAN_NAMES.has(token.toLowerCase())) return (c.clan || '').toLowerCase() === token.toLowerCase();

  // Specialisation references — too complex to verify, pass
  if (/speciali[sz]/i.test(token)) return true;

  // "Attribute N" / "Skill N" / "Discipline N" / "Merit N"
  const withNum = /^(.+?)\s+(\d+)$/.exec(token);
  if (withNum) {
    const name = withNum[1].trim().toLowerCase();
    const n = parseInt(withNum[2]);
    if (ATTR_NAMES.has(name)) return _getAttrDots(c, name) >= n;
    if (SKILL_NAMES.has(name)) return _getSkillDots(c, name) >= n;
    const nameNorm = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (DISC_NAMES.has(name) || DISC_NAMES.has(nameNorm)) return _getDiscDots(c, name) >= n || _getDiscDots(c, nameNorm) >= n;
    // Merit as prereq e.g. "Safe Place 1", "Contacts 2"
    return _getMeritRating(c, name) >= n;
  }

  // Token without number — presence check
  const nameLow = token.toLowerCase();
  if (ATTR_NAMES.has(nameLow)) return _getAttrDots(c, nameLow) > 0;
  if (SKILL_NAMES.has(nameLow)) return _getSkillDots(c, nameLow) > 0;
  if (DISC_NAMES.has(nameLow)) return _getDiscDots(c, nameLow) > 0;
  // Inequality operators — just pass
  if (/[≤≥<>]/.test(token)) return true;
  // Merit name without number — permissive fallback
  return _getMeritRating(c, nameLow) > 0 || true;
}

/**
 * Check a full prerequisite string (comma-separated AND, "or"-separated OR).
 * If the rules cache is available, looks up the structured prereq tree and
 * delegates to meetsPrereq(). Falls back to regex parsing if cache unavailable.
 */
export function meritQualifies(c, prereqStr, structuredPrereq) {
  if (!prereqStr || prereqStr === '-') return true;

  // If a structured prereq tree was passed directly, use the new engine
  if (structuredPrereq !== undefined) {
    return _meetsPrereq(c, structuredPrereq);
  }

  // Fallback: regex-based parsing for legacy callers
  const andParts = prereqStr.split(/\s*,\s*/);
  return andParts.every(part => {
    const orParts = part.split(/\s+or\s+/i);
    return orParts.some(t => checkSinglePrereq(c, t.trim()));
  });
}

/**
 * Build <option> HTML for a merit select dropdown, filtered by prerequisites.
 * Excludes standing, domain, and influence merits (those have dedicated UI).
 */
export function buildMeritOptions(c, currentName) {
  // Try rules cache first
  const rulesDB = getRulesByCategory('merit');
  const qualified = [];

  if (rulesDB.length) {
    // Rules cache available — use structured data
    for (const rule of rulesDB) {
      if (rule.sub_category !== 'general') continue;
      if (rule.parent && ['Style', 'Invictus Oath', 'Carthian Law'].includes(rule.parent)) continue;
      if (!_meetsPrereq(c, rule.prereq)) continue;
      const excl = _isExcluded(c, rule.name);
      if (excl && rule.name.toLowerCase() !== (currentName || '').toLowerCase()) continue;
      qualified.push({ key: rule.name.toLowerCase(), label: rule.name });
    }
  } else {
    return '<option value="">— rules loading —</option>';
  }
  qualified.sort((a, b) => a.label.localeCompare(b.label));
  const curLow = (currentName || '').toLowerCase();
  const esc = _esc;
  let opts = '<option value="">' + (currentName ? '' : '— select merit —') + '</option>';
  if (currentName && !qualified.some(q => q.key === curLow)) {
    opts += '<option value="' + esc(currentName) + '" selected>' + esc(currentName) + '</option>';
  }
  for (const { key, label } of qualified) {
    const sel = key === curLow || label.toLowerCase() === curLow ? ' selected' : '';
    opts += '<option value="' + esc(label) + '"' + sel + '>' + esc(label) + '</option>';
  }
  return opts;
}

/**
 * Build <option> HTML for MCI grant dropdown — includes influence and domain merits.
 * Filters by prerequisites and dot-level rating.
 * MCI dot ratings: dot 1-2 = 1-dot merits, dot 3 = 2-dot, dot 4-5 = 3-dot.
 * Graduated merits (rating range) appear if their min ≤ dotRating.
 * @param {object} c - character
 * @param {number} dotLevel - 0-indexed MCI dot level
 * @param {string} currentName - currently selected merit name
 */
const MCI_DOT_RATING = [1, 1, 2, 3, 3];
export function buildMCIGrantOptions(c, dotLevel, currentName) {
  const maxR = MCI_DOT_RATING[dotLevel] || 1;
  const qualified = [];

  // Try rules cache first
  const rulesDB = getRulesByCategory('merit');
  if (rulesDB.length) {
    for (const rule of rulesDB) {
      if (rule.sub_category === 'standing') continue;
      if (rule.parent && ['Style', 'Invictus Oath', 'Carthian Law'].includes(rule.parent)) continue;
      if (!_meetsPrereq(c, rule.prereq)) continue;
      if (_isExcluded(c, rule.name) && rule.name.toLowerCase() !== (currentName || '').toLowerCase()) continue;
      const rr = rule.rating_range;
      if (rr) {
        if (rr[0] === rr[1]) { if (rr[0] !== maxR) continue; }
        else { if (rr[0] > maxR) continue; }
      } else { if (1 !== maxR) continue; }
      qualified.push({ key: rule.name.toLowerCase(), label: rule.name });
    }
  } else {
    return '<option value="">— rules loading —</option>';
  }
  qualified.sort((a, b) => a.label.localeCompare(b.label));
  const curLow = (currentName || '').toLowerCase();
  let opts = '<option value="">' + (currentName ? '' : '— select merit —') + '</option>';
  if (currentName && !qualified.some(q => q.key === curLow)) {
    opts += '<option value="' + _esc(currentName) + '" selected>' + _esc(currentName) + '</option>';
  }
  for (const { key, label } of qualified) {
    const sel = key === curLow || label.toLowerCase() === curLow ? ' selected' : '';
    opts += '<option value="' + _esc(label) + '"' + sel + '>' + _esc(label) + '</option>';
  }
  return opts;
}

/**
 * Build <option> HTML for Fucking Thief — all 1-dot merits, ignoring prerequisites.
 * Includes all categories since FT can steal covenant-restricted advantages.
 */
export function buildFThiefOptions(currentName) {
  const qualified = [];

  // Try rules cache first
  const rulesDB = getRulesByCategory('merit');
  if (rulesDB.length) {
    for (const rule of rulesDB) {
      if (rule.sub_category === 'standing') continue;
      const rr = rule.rating_range;
      const minR = rr ? rr[0] : 1;
      if (minR > 1) continue;
      if (rr && rr[0] === rr[1] && rr[0] !== 1) continue;
      qualified.push({ key: rule.name.toLowerCase(), label: rule.name });
    }
  } else {
    return '<option value="">— rules loading —</option>';
  }
  qualified.sort((a, b) => a.label.localeCompare(b.label));
  const curLow = (currentName || '').toLowerCase();
  let opts = '<option value="">' + (currentName ? '' : '— choose stolen merit —') + '</option>';
  if (currentName && !qualified.some(q => q.key === curLow)) {
    opts += '<option value="' + _esc(currentName) + '" selected>' + _esc(currentName) + '</option>';
  }
  for (const { key, label } of qualified) {
    const sel = key === curLow || label.toLowerCase() === curLow ? ' selected' : '';
    opts += '<option value="' + _esc(label) + '"' + sel + '>' + _esc(label) + '</option>';
  }
  return opts;
}

/* ── Inline HTML escape (avoids circular dependency on a helpers module) ── */
function _esc(s) {
  return s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ══════════════════════════════════════════════════════
   Power / discipline helpers
   ══════════════════════════════════════════════════════ */

/** Filter a powers array to those belonging to a specific discipline. */
export function powersForDisc(powers, discName) {
  if (!powers) return [];
  if (SORCERY_THEMES.includes(discName)) {
    return powers.filter(p => p.name && p.name.includes('| ' + discName));
  }
  if (RITUAL_DISCS.includes(discName)) {
    return powers.filter(p => p.name && (p.name.startsWith(discName) || p.name.includes('| ' + discName)));
  }
  return powers.filter(p => {
    if (!p.name) return false;
    const n = p.name.split('|')[0].trim().split(/\s+/);
    return n[0] === discName || (n.length > 1 && n.slice(0, -1).join(' ') === discName);
  });
}

/** Return powers not attributable to any known discipline on the character. */
export function otherPowers(c) {
  const allSorcery = [...SORCERY_THEMES, ...RITUAL_DISCS];
  const discNames = Object.keys(c.disciplines || {});
  return (c.powers || []).filter(p => {
    if (!p.name) return false;
    const key = p.name.split('|')[0].trim().replace(/\s*[●○]+$/, '').replace(/\s+\d+$/, '');
    if (SORCERY_THEMES.includes(key.split(' ').pop())) return false;
    if (allSorcery.some(d => p.name.startsWith(d))) return false;
    return !discNames.some(d => key === d || key.startsWith(d + ' '));
  });
}

/** Check whether a character meets a devotion's discipline prerequisites. */
export function meetsDevPrereqs(c, dev) {
  if (dev.bl && (c.bloodline || '') !== dev.bl) return false;
  const discs = c.disciplines || {};
  if (!dev.p || !dev.p.length) return true;
  if (dev.or) {
    return dev.p.some(p => (discs[p.disc]?.dots || 0) >= p.dots);
  }
  return dev.p.every(p => (discs[p.disc]?.dots || 0) >= p.dots);
}

/** Format a devotion's prerequisite list as a human-readable string. */
export function devPrereqStr(dev) {
  const parts = [];
  if (dev.bl) parts.push(dev.bl + ' only');
  if (dev.p && dev.p.length) parts.push(dev.p.map(p => p.disc + ' ' + p.dots).join(dev.or ? ' or ' : ', '));
  return parts.join('; ') || 'None';
}
