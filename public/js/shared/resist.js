/* Shared resistance check calculation — parses and resolves resistance strings */

import state from '../suite/data.js';
import { getPool } from './pools.js';
import { getAttrEffective, skDots } from '../data/accessors.js';

// gdx-11 (#981, Task 3): exported so Custom Pool (Attribute chip group) can
// reuse this repo's one list rather than maintaining its own copy.
export const ATTRS = [
  'Intelligence', 'Wits', 'Resolve',
  'Presence', 'Manipulation', 'Composure',
  'Strength', 'Dexterity', 'Stamina'
];
// NOT exported (code review finding, Blind Hunter + Acceptance Auditor,
// independently): Custom Pool's skill chips use ALL_SKILLS from
// data/constants.js instead (the canonical list - this one still carries a
// legacy 'Socialize' duplicate ALL_SKILLS doesn't). Exporting this alongside
// ATTRS/DISC_ABBR was a dead export nothing imports; stays module-private,
// used only by this file's own parseResistance().
const SKILLS = [
  'Athletics', 'Brawl', 'Drive', 'Firearms', 'Larceny', 'Stealth', 'Survival', 'Weaponry',
  'Animal Ken', 'Empathy', 'Expression', 'Intimidation', 'Persuasion', 'Socialise', 'Socialize', 'Streetwise', 'Subterfuge',
  'Academics', 'Computer', 'Crafts', 'Investigation', 'Medicine', 'Occult', 'Politics', 'Science'
];
export const DISC_ABBR = {
  'Obf': 'Obfuscate', 'Aus': 'Auspex', 'Dom': 'Dominate',
  'Cel': 'Celerity', 'Maj': 'Majesty', 'Nig': 'Nightmare',
  'Pro': 'Protean', 'Res': 'Resilience', 'Vig': 'Vigour',
  'Ani': 'Animalism', 'Cru': 'Cruac', 'The': 'Theban'
};

/**
 * Parse a resistance string like "v Resolve + BP" or "- Composure + BP".
 * Returns { mode, tokens } or null.
 */
export function parseResistance(r) {
  if (!r) return null;
  r = r.trim();
  let mode, rest;
  if (r.startsWith('v ')) { mode = 'v'; rest = r.slice(2).trim(); }
  else if (r.startsWith('- ')) { mode = '-'; rest = r.slice(2).trim(); }
  else return null;
  rest = rest.replace(/^highest\s+/i, '').replace(/\w+'\s*s\s+/, '');
  const tokens = rest.split('+').map(s => s.trim()).filter(Boolean).map(p => {
    if (p === 'BP' || p === 'Blood Potency') return { label: 'BP', key: 'blood_potency', type: 'bp' };
    if (p === 'Humanity') return { label: 'Humanity', key: 'humanity', type: 'humanity' };
    if (ATTRS.includes(p)) return { label: p, key: p, type: 'attr' };
    if (SKILLS.includes(p)) return { label: p, key: p, type: 'skill' };
    if (DISC_ABBR[p]) return { label: DISC_ABBR[p], key: DISC_ABBR[p], type: 'disc' };
    // Code review finding (Acceptance Auditor): DISC_ABBR only covers the 10
    // base-clan/ritual disciplines. gdx-11's Clash of Wills feeds a real
    // character's OWN chosen discipline name through this same pipeline, and
    // this campaign's live data has non-core disciplines (Creation,
    // Divination, Protection) DISC_ABBR was never meant to enumerate. A token
    // this fallback can't identify was silently resolved as type:'attr',
    // which getResistTokenVal reads via getAttrEffective(c, p) - always 0 for
    // a non-attribute name, exactly the same silent-zero either way, so
    // resolving it as type:'disc' instead cannot regress any currently-
    // working resistance string; it only fixes the case where the
    // unrecognised token genuinely IS a discipline name.
    return { label: p, key: p, type: 'disc' };
  });
  return { mode, tokens };
}

/**
 * gdx-11 (#981, AC3) — pure pool+cost builder for Lash Out, extracted so the
 * Kindred/Mortal -> willpower_cost mapping is unit-testable without booting
 * app.js (which has import-time side effects unsafe for a test environment
 * - registerEditCallbacks() and friends run at module load). app.js's
 * openPanel('lashout') click handler is the only real caller.
 */
export function lashOutPool(char, attr, kindred) {
  const bp = char?.blood_potency || 0;
  const attrV = getAttrEffective(char, attr);
  const total = attrV + bp;
  return {
    total,
    pi: {
      total, attr, attrV, skill: null, skillV: 0, discName: null, discV: 0,
      resistance: 'v ' + attr + ' + BP',
      willpower_cost: kindred ? 1 : 0,
      noWP: false,
    },
  };
}

/**
 * gdx-11 (#981, AC5) — pure pool+cost builder for Blood Bond Resistance,
 * same reasoning as lashOutPool above (unit-testable without booting
 * app.js). Code review finding (Blind Hunter + Edge Case Hunter,
 * independently): the original inline pi at the app.js call site set
 * noWP:true but never willpower_cost:1, so the "1 WP to attempt" this
 * mechanic's own AC5 promises was never actually charged. Extracting this
 * as its own function is what makes that regression provable — see
 * server/tests/gdx-11-vampire-mechanics-quick-actions.test.js.
 */
export function bloodBondPool(char, vitae, attempts) {
  const bp = char?.blood_potency || 0;
  const total = Math.max(0, bp - vitae - attempts);
  return {
    total,
    pi: {
      total, attr: 'Blood Potency', attrV: bp, skill: null, skillV: 0,
      discName: null, discV: 0, resistance: null,
      noWP: true, willpower_cost: 1,
    },
  };
}

/** Resolve a single resistance token's value from a character. */
export function getResistTokenVal(c, tok) {
  if (!c) return 0;
  if (tok.type === 'bp') return c.blood_potency || 0;
  if (tok.type === 'humanity') return c.humanity || 0;
  if (tok.type === 'attr') return getAttrEffective(c, tok.key);
  if (tok.type === 'skill') return skDots(c, tok.key);
  if (tok.type === 'disc') return c.disciplines?.[tok.key]?.dots || 0;
  return 0;
}

/**
 * Show or hide the resistance section based on current POOL_INFO.
 * Reads/writes state.RESIST_CHAR, state.RESIST_MODE, state.RESIST_VAL.
 * Calls updResist() to compute the final value.
 */
export function showResistSec() {
  const sec = document.getElementById('resist-sec');
  if (!sec) return;
  const r = state.POOL_INFO?.resistance;
  state.RESIST_CHAR = null;
  state.RESIST_VAL = 0;
  state.RESIST_MODE = null;
  if (!r) { sec.style.display = 'none'; return; }
  const parsed = parseResistance(r);
  if (!parsed) { sec.style.display = 'none'; return; }
  state.RESIST_MODE = parsed.mode;
  sec.style.display = '';
  const lbl = document.getElementById('resist-lbl');
  if (lbl) lbl.textContent = parsed.mode === 'v' ? 'Resistance \u2014 ' + r : 'Resistance \u2014 ' + r;
  const sel = document.getElementById('resist-sel');
  const cur = sel.value;
  sel.innerHTML = '<option value="">\u2014 select target \u2014</option>';
  (window._charNames || []).slice().sort().forEach(n => {
    const opt = document.createElement('option');
    opt.value = n; opt.textContent = (window._charDisplayMap || {})[n] || n;
    if (n === cur) opt.selected = true;
    sel.appendChild(opt);
  });
  updResist();
}

/**
 * Recompute resistance value from the selected target character.
 * Updates state.RESIST_CHAR, state.RESIST_VAL, and the DOM breakdown.
 * Calls updPool() on window to refresh the effective pool display.
 */
export function updResist() {
  const sel = document.getElementById('resist-sel');
  const name = sel?.value || '';
  state.RESIST_CHAR = name ? state.chars.find(c => c.name === name) || null : null;
  const r = state.POOL_INFO?.resistance;
  const parsed = r ? parseResistance(r) : null;
  const line = document.getElementById('resist-line');
  if (!parsed || !state.RESIST_CHAR) {
    state.RESIST_VAL = 0;
    if (line) line.innerHTML = '';
    if (typeof window.updPool === 'function') window.updPool();
    return;
  }
  const parts = parsed.tokens.map(t => ({ ...t, val: getResistTokenVal(state.RESIST_CHAR, t) }));
  state.RESIST_VAL = parts.reduce((s, t) => s + t.val, 0);
  if (line) {
    const breakdown = parts.map(t => `${t.label} <b>${t.val}</b>`).join(' + ');
    if (parsed.mode === 'v') {
      line.innerHTML = `${breakdown} = <span class="rv-win">${state.RESIST_VAL} dice</span>`;
    } else {
      line.innerHTML = `${breakdown} = <span class="rv-pen">\u2212${state.RESIST_VAL} to pool</span>`;
    }
  }
  if (typeof window.updPool === 'function') window.updPool();
}
