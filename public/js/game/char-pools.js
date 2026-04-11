/* Game app — character pools panel with tap-to-roll.
   Renders derived stats strip + tappable skill/discipline pool buttons
   above the read-only character sheet in t-editor. */

import {
  getAttrEffective, getAttrBonus, skDots, skBonus,
  calcDefence, calcHealth, calcWillpowerMax, calcVitaeMax, calcSpeed,
} from '../data/accessors.js';
import { getPool } from '../shared/pools.js';
import { esc } from '../data/helpers.js';

// Primary attribute for each skill (most common pool pairing)
const SKILL_ATTR = {
  Academics: 'Intelligence', 'Animal Ken': 'Presence',  Athletics:    'Strength',
  Brawl:     'Strength',    Computer:    'Intelligence', Crafts:       'Intelligence',
  Drive:     'Dexterity',   Empathy:     'Wits',         Expression:   'Presence',
  Firearms:  'Dexterity',   Intimidation:'Presence',    Investigation:'Wits',
  Larceny:   'Dexterity',   Medicine:    'Intelligence', Occult:       'Intelligence',
  Persuasion:'Manipulation', Politics:   'Intelligence', Science:      'Intelligence',
  Socialise: 'Presence',    Stealth:     'Dexterity',   Streetwise:   'Wits',
  Subterfuge:'Manipulation', Survival:   'Wits',         Weaponry:     'Strength',
};

const SKILL_ORDER = [
  'Athletics','Brawl','Firearms','Weaponry','Stealth','Drive','Larceny','Survival',
  'Academics','Investigation','Medicine','Occult','Politics','Science','Computer','Crafts',
  'Animal Ken','Empathy','Expression','Intimidation','Persuasion','Socialise','Streetwise','Subterfuge',
];

// Short abbreviations for pool breakdown sub-labels (no clashes)
const ABBR = {
  Intelligence:'Int', Wits:'Wit', Resolve:'Res',
  Strength:'Str', Dexterity:'Dex', Stamina:'Sta',
  Presence:'Pre', Manipulation:'Man', Composure:'Com',
  Academics:'Aca', 'Animal Ken':'AK', Athletics:'Ath',
  Brawl:'Bwl', Computer:'Cmp', Crafts:'Cft',
  Drive:'Drv', Empathy:'Emp', Expression:'Exp',
  Firearms:'Frm', Intimidation:'Itm', Investigation:'Inv',
  Larceny:'Lrc', Medicine:'Med', Occult:'Occ',
  Persuasion:'Per', Politics:'Pol', Science:'Sci',
  Socialise:'Soc', Stealth:'Sth', Streetwise:'Swd',
  Subterfuge:'Sub', Survival:'Srv', Weaponry:'Wpn',
};

function ab(s) { return ABBR[s] || (s || '').slice(0, 3); }

// Module-level pool store — avoids JSON-in-attribute hacks
let _pools = [];

/**
 * Render the pools panel into el.
 * onTap(poolObj) is called when the ST taps a pool button.
 * poolObj: { total, label, attr, attrV, skill, skillV, resistance, pi }
 */
export function renderCharPools(el, char, onTap) {
  _pools = [];

  const defence = calcDefence(char);
  const hp      = calcHealth(char);
  const wp      = calcWillpowerMax(char);
  const vitae   = calcVitaeMax(char);
  const speed   = calcSpeed(char);

  let h = '<div class="gcp-wrap">';

  // ── Derived stats strip ──
  h += '<div class="gcp-stats">';
  h += statChip('Defence',   defence);
  h += statChip('Health',    hp);
  h += statChip('Willpower', wp);
  h += statChip('Vitae Max', vitae);
  h += statChip('Speed',     speed);
  h += '</div>';

  // ── Skill pools (only non-zero skills) ──
  let skillHtml = '';
  for (const sk of SKILL_ORDER) {
    const skD = skDots(char, sk) + skBonus(char, sk);
    if (!skD) continue;
    const attr  = SKILL_ATTR[sk];
    const attrV = getAttrEffective(char, attr) + getAttrBonus(char, attr);
    const total = attrV + skD;
    const idx   = _pools.length;
    _pools.push({ total, label: sk, attr, attrV, skill: sk, skillV: skD, resistance: null, pi: null });
    skillHtml += poolBtn(sk, total, ab(attr) + '+' + ab(sk), idx);
  }
  if (skillHtml) {
    h += '<div class="gcp-section-hd">Skill Pools</div>';
    h += '<div class="gcp-pool-grid">' + skillHtml + '</div>';
  }

  // ── Discipline power pools (rollable only) ──
  const powers = (char.powers || []).filter(p => p.name);
  let discHtml = '';
  for (const pw of powers) {
    const pi = getPool(char, pw.name);
    if (!pi || pi.noRoll || pi.total === undefined) continue;
    const idx = _pools.length;
    _pools.push({ total: pi.total, label: pw.name, attr: pi.attr, attrV: pi.attrV, skill: pi.skill, skillV: pi.skillV, resistance: pi.resistance || null, pi });
    const sub = ab(pi.attr) + '+' + ab(pi.skill) + (pi.resistance ? ' vs ' + pi.resistance : '');
    discHtml += poolBtn(pw.name, pi.total, sub, idx);
  }
  if (discHtml) {
    h += '<div class="gcp-section-hd">Discipline Pools</div>';
    h += '<div class="gcp-pool-grid">' + discHtml + '</div>';
  }

  h += '</div>';
  el.innerHTML = h;

  el.querySelectorAll('.gcp-pool-btn').forEach(btn => {
    const idx = Number(btn.dataset.idx);
    btn.addEventListener('click', () => onTap(_pools[idx]));
  });
}

function statChip(label, value) {
  return `<div class="gcp-stat"><span class="gcp-stat-v">${value}</span><span class="gcp-stat-l">${esc(label)}</span></div>`;
}

function poolBtn(label, total, sub, idx) {
  return `<button class="gcp-pool-btn" data-idx="${idx}"><span class="gcp-pool-n">${total}</span><span class="gcp-pool-lbl">${esc(label)}</span><span class="gcp-pool-sub">${esc(sub)}</span></button>`;
}
