/* Shared resistance check calculation — parses and resolves resistance strings */

import state from '../suite/data.js';
import { getPool } from './pools.js';
import { getAttrVal, skDots } from '../data/accessors.js';

const ATTRS = [
  'Intelligence', 'Wits', 'Resolve',
  'Presence', 'Manipulation', 'Composure',
  'Strength', 'Dexterity', 'Stamina'
];
const SKILLS = [
  'Athletics', 'Brawl', 'Drive', 'Firearms', 'Larceny', 'Stealth', 'Survival', 'Weaponry',
  'Animal Ken', 'Empathy', 'Expression', 'Intimidation', 'Persuasion', 'Socialise', 'Socialize', 'Streetwise', 'Subterfuge',
  'Academics', 'Computer', 'Crafts', 'Investigation', 'Medicine', 'Occult', 'Politics', 'Science'
];
const DISC_ABBR = {
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
    return { label: p, key: p, type: 'attr' };
  });
  return { mode, tokens };
}

/** Resolve a single resistance token's value from a character. */
export function getResistTokenVal(c, tok) {
  if (!c) return 0;
  if (tok.type === 'bp') return c.blood_potency || 0;
  if (tok.type === 'humanity') return c.humanity || 0;
  if (tok.type === 'attr') return getAttrVal(c, tok.key);
  if (tok.type === 'skill') return skDots(c, tok.key);
  if (tok.type === 'disc') return c.disciplines?.[tok.key] || 0;
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
    opt.value = n; opt.textContent = n;
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
