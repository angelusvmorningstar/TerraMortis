/* Game app — character pools panel with tap-to-roll.
   Renders derived stats strip + tappable skill/discipline pool buttons
   above the read-only character sheet in t-editor. */

import {
  getAttrEffective, getAttrBonus, skTotal, skNineAgain,
  calcDefence, calcHealth, calcWillpowerMax, calcVitaeMax, calcSpeed,
} from '../data/accessors.js';
import { getPool } from '../shared/pools.js';
import { getRulesByCategory } from '../data/loader.js';
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
  // Include PT dot-4 and MCI dot-3 bonus dots from applyDerivedMerits
  let skillHtml = '';
  for (const sk of SKILL_ORDER) {
    const skD = skTotal(char, sk);
    if (!skD) continue;
    const attr  = SKILL_ATTR[sk];
    const attrV = getAttrEffective(char, attr) + getAttrBonus(char, attr);
    const total = attrV + skD;
    // Check 9-Again from any source
    const na = skNineAgain(char, sk)
      || char._pt_nine_again_skills?.has(sk)
      || char._mci_dot3_skills?.has(sk)
      || char._ohm_nine_again_skills?.has(sk);
    // Check PT dot-5 Rote eligibility: asset skill + PT rating >= 5
    const ptMerit = (char.merits || []).find(m => m.name === 'Professional Training' && (m.rating || 0) >= 5);
    const roteEligible = !!(ptMerit && (ptMerit.asset_skills || []).includes(sk));
    // Check Air of Menace: adds Nightmare dots to Intimidation
    let meritBonus = 0, meritLabel = '';
    if (sk === 'Intimidation' && (char.merits || []).some(m => m.name === 'Air of Menace')) {
      meritBonus = char.disciplines?.Nightmare?.dots || 0;
      if (meritBonus > 0) meritLabel = 'AoM';
    }
    const poolTotal = total + meritBonus;
    const idx   = _pools.length;
    _pools.push({ total: poolTotal, label: sk, attr, attrV, skill: sk, skillV: skD, nineAgain: !!na, roteEligible, meritBonus, meritLabel, resistance: null, pi: null });
    const sub = ab(attr) + '+' + ab(sk) + (meritBonus ? '+' + meritLabel + '(' + meritBonus + ')' : '');
    skillHtml += poolBtn(sk, poolTotal, sub, idx, na, roteEligible);
  }
  if (skillHtml) {
    h += '<div class="gcp-section-hd">Skill Pools</div>';
    h += '<div class="gcp-pool-grid">' + skillHtml + '</div>';
  }

  // ── Discipline power pools (rollable only) ──
  // Derive from rules cache (same as the discipline selector panel in app.js).
  // c.powers with category=discipline is stale legacy data — ignore it.
  const allRules = getRulesByCategory('discipline');
  const discEntries = Object.entries(char.disciplines || {}).filter(([, v]) => (v?.dots || 0) > 0);
  const derivedPowers = [];
  for (const [disc, v] of discEntries) {
    const ruledPowers = allRules
      .filter(r => r.parent === disc && r.rank != null && r.rank <= v.dots)
      .sort((a, b) => a.rank - b.rank);
    if (ruledPowers.length) {
      ruledPowers.forEach(r => derivedPowers.push({ name: r.name, discipline: disc }));
    }
  }
  // Also include devotions, rites, pacts (character-specific picks — NOT discipline powers)
  (char.powers || []).filter(p => p.category === 'devotion' || p.category === 'rite' || p.category === 'pact')
    .forEach(p => derivedPowers.push(p));

  let discHtml = '';
  for (const pw of derivedPowers) {
    const pi = getPool(char, pw.name);
    if (!pi || pi.noRoll || pi.total === undefined) continue;
    const idx = _pools.length;
    const discNa = pi.nineAgain || (pi.skill && skNineAgain(char, pi.skill));
    _pools.push({ total: pi.total, label: pw.name, attr: pi.attr, attrV: pi.attrV, skill: pi.skill, skillV: pi.skillV, nineAgain: !!discNa, resistance: pi.resistance || null, pi });
    const sub = ab(pi.attr) + '+' + ab(pi.skill) + (pi.resistance ? ' vs ' + pi.resistance : '');
    discHtml += poolBtn(pw.name, pi.total, sub, idx, discNa);
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

function poolBtn(label, total, sub, idx, nineAgain, roteEligible) {
  const badges = (nineAgain ? '<span class="gcp-9a-badge">9</span>' : '')
               + (roteEligible ? '<span class="gcp-rote-badge">R</span>' : '');
  const cls = 'gcp-pool-btn' + (nineAgain ? ' gcp-9a' : '') + (roteEligible ? ' gcp-rote' : '');
  return `<button class="${cls}" data-idx="${idx}"><span class="gcp-pool-n">${total}</span>${badges}<span class="gcp-pool-lbl">${esc(label)}</span><span class="gcp-pool-sub">${esc(sub)}</span></button>`;
}
