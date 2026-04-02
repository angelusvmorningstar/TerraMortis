/**
 * Merit utilities, prerequisite system, and power/discipline helpers.
 * Depends on constants and the MERITS_DB reference data.
 */

import {
  ATTR_NAMES, SKILL_NAMES, DISC_NAMES, COV_SHORT, CLAN_NAMES,
  SORCERY_THEMES, RITUAL_DISCS, INFLUENCE_SPHERES
} from '../data/constants.js';
import { MERITS_DB } from '../data/merits-db-data.js';

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

/** Look up a merit in MERITS_DB by name string (tries full key then base key). */
export function meritLookup(s) {
  const db = MERITS_DB;
  if (!db) return null;
  const k = meritKey(s);
  if (db[k]) return db[k];
  const kb = meritKeyBase(s);
  if (db[kb]) return db[kb];
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

/** Ensure merit_creation array is synced with merits array length. */
export function ensureMeritSync(c) {
  if (!c.merits) c.merits = [];
  if (!c.merit_creation) c.merit_creation = [];
  while (c.merit_creation.length < c.merits.length) c.merit_creation.push({ cp: 0, free: 0, xp: 0 });
  if (c.merit_creation.length > c.merits.length) c.merit_creation.length = c.merits.length;
}

/** Append a merit and sync creation records. */
export function addMerit(c, merit) {
  if (!c.merits) c.merits = [];
  c.merits.push(merit);
  ensureMeritSync(c);
}

/** Remove a merit by real index, splicing both arrays. */
export function removeMerit(c, realIdx) {
  if (realIdx < 0 || realIdx >= c.merits.length) return;
  c.merits.splice(realIdx, 1);
  if (c.merit_creation && realIdx < c.merit_creation.length) c.merit_creation.splice(realIdx, 1);
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
  return k ? (c.disciplines[k] || 0) : 0;
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
    if (DISC_NAMES.has(name) || name === 'cruác') return _getDiscDots(c, name) >= n || _getDiscDots(c, 'cruac') >= n;
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
 */
export function meritQualifies(c, prereqStr) {
  if (!prereqStr || prereqStr === '-') return true;
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
  const db = MERITS_DB;
  if (!db) return '<option value="">— loading —</option>';
  const excluded = new Set(['standing', 'invictus oath', 'style']);
  const domainNames = new Set(['safe place', 'haven', 'feeding grounds', 'herd']);
  const influenceNames = new Set(['allies', 'contacts', 'mentor', 'resources', 'retainer', 'staff', 'status']);
  const qualified = [];
  for (const [key, entry] of Object.entries(db)) {
    if (entry.special === 'standing') continue;
    if (entry.type && excluded.has(entry.type.toLowerCase())) continue;
    if (domainNames.has(key)) continue;
    if (influenceNames.has(key)) continue;
    if (!meritQualifies(c, entry.prereq || '')) continue;
    const label = key.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    qualified.push({ key, label });
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
  const db = MERITS_DB;
  if (!db) return '<option value="">— loading —</option>';
  const maxR = MCI_DOT_RATING[dotLevel] || 1;
  const qualified = [];
  for (const [key, entry] of Object.entries(db)) {
    if (entry.special === 'standing') continue;
    if (entry.type && ['style', 'invictus oath'].includes(entry.type.toLowerCase())) continue;
    if (!meritQualifies(c, entry.prereq || '')) continue;
    // Filter by rating: fixed-rating merits must match exactly, graduated must include maxR
    const rStr = entry.rating || '1';
    const parts = rStr.split(/[–\-—]/);
    const minR = parseInt(parts[0]) || 1;
    const maxMerit = parseInt(parts[parts.length - 1]) || minR;
    // For graduated (range): show if maxR falls within range
    // For fixed (single): show if merit rating == maxR
    if (parts.length > 1) { if (minR > maxR) continue; }
    else { if (minR !== maxR) continue; }
    const label = key.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    qualified.push({ key, label });
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
    return dev.p.some(p => (discs[p.disc] || 0) >= p.dots);
  }
  return dev.p.every(p => (discs[p.disc] || 0) >= p.dots);
}

/** Format a devotion's prerequisite list as a human-readable string. */
export function devPrereqStr(dev) {
  const parts = [];
  if (dev.bl) parts.push(dev.bl + ' only');
  if (dev.p && dev.p.length) parts.push(dev.p.map(p => p.disc + ' ' + p.dots).join(dev.or ? ' or ' : ', '));
  return parts.join('; ') || 'None';
}
