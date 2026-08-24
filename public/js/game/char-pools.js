/* Game app — character pools panel with tap-to-roll.
   Renders derived stats strip + tappable skill/discipline pool buttons
   above the read-only character sheet in t-editor. */

import {
  getAttrEffective, getAttrBonus, skTotal, skNineAgain,
  calcDefence, calcHealth, calcWillpowerMax, calcVitaeMax, calcSpeed,
} from '../data/accessors.js';
// Issue #879 (ADR-006 D4): roll calculator's derived-stats strip reads
// the armour-adjusted + overlay-modded defence.
import { defenceForDisplay } from '../data/equipment-derivation.js';
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

/**
 * PT dot-5 Rote eligibility for a given skill: asset skill + Professional
 * Training rating >= 5. Pure function of (character, skill name) — reused
 * by the skill-pool loop below and by app.js's Custom Pool builder (rlv.4,
 * review fix — AC5 promises the Rote badge applies to Custom Pools exactly
 * as it does to any named pool; this is what makes that literally true
 * rather than only true for pre-built skill-pool tiles).
 */
export function roteEligibleFor(char, skill) {
  if (!skill) return false;
  const ptMerit = (char.merits || []).find(m => m.name === 'Professional Training' && (m.rating || 0) >= 5);
  return !!(ptMerit && (ptMerit.asset_skills || []).includes(skill));
}

/**
 * Render the pools panel into el.
 * onTap(poolObj) is called when the ST taps a pool button.
 * poolObj: { total, label, attr, attrV, skill, skillV, resistance, pi }
 *
 * Review fix (rlv.4, Codex Pass 2): `pools` is scoped to this call, not a
 * module-level singleton. renderCharPools() is called for TWO independent,
 * simultaneously-mounted containers (#gcp-panel on the Sheets tab,
 * #roll-char-pools on the Roll tab), each potentially showing a different
 * character. A shared module-level array meant the container rendered
 * SECOND silently rewrote the array the FIRST container's already-attached
 * buttons still read from at click time — a stale button could resolve
 * against a different character's rebuilt pools (wrong pool loaded, or
 * `onTap(undefined)` if the stale index was now out of range). Confirmed
 * live before this fix: two characters with different pool counts, render
 * A into one container then B into another, click A's still-attached tile
 * — the click handler received `undefined`, not A's own pool. Closing over
 * a per-call local instead of a shared mutable makes each container's
 * buttons permanently correct regardless of what any other container
 * renders afterward.
 */
export function renderCharPools(el, char, onTap) {
  const pools = [];

  const defence = defenceForDisplay(char);
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

  // ── Vampire Mechanics (gdx-11, #981) ──
  // Originally gated behind the tm-use-new-dice-roller flag (v1's roll.js
  // never understood the pi.noWP/pi.willpower_cost fields every tile here
  // sets) — that flag and roll.js itself were both retired outright by
  // rlv.2, so roll-v2.js is now the only player roller and this section is
  // unconditional. The choice tiles push {opensPanel}, routed by app.js's
  // onTap callback to openPanel(mode).
  {
    let vmHtml = '';
    const VM_IMMEDIATE = [
      { label: 'Frenzy Resistance', a1: 'Resolve', a2: 'Composure' },
      { label: 'Riding the Wave', a1: 'Wits', a2: 'Composure' },
    ];
    for (const m of VM_IMMEDIATE) {
      // getAttrEffective already includes bonus dots + discipline enhancement
      // (accessors.js) - NOT added again here, unlike the pre-existing skill-
      // pool loop below (out of this story's scope to touch). AC8's own
      // Custom Pool formula uses getAttrEffective alone for the same reason.
      const v1 = getAttrEffective(char, m.a1);
      const v2 = getAttrEffective(char, m.a2);
      const total = v1 + v2;
      const idx = pools.length;
      // The second attribute is modelled via pi's generic `skill` field —
      // downstream (roll-v2.js's effline/spec/equipment-chip logic) only
      // ever reads it as a display label + a lookup key, and none of
      // Composure/Wits/Resolve resolve against any real skill's specs or
      // equipment domain, so this is a safe, zero-side-effect reuse rather
      // than inventing a second bespoke pi shape for a two-attribute pool.
      const pi = { total, attr: m.a1, attrV: v1, skill: m.a2, skillV: v2, discName: null, discV: 0, resistance: null, noWP: false };
      pools.push({ total, label: m.label, attr: m.a1, attrV: v1, skill: m.a2, skillV: v2, nineAgain: false, resistance: null, pi });
      vmHtml += poolBtn(m.label, total, ab(m.a1) + '+' + ab(m.a2), idx, false);
    }
    const VM_CHOICE = [
      { label: 'Lash Out', mode: 'lashout' },
      { label: 'Clash of Wills', mode: 'clash' },
      { label: 'Blood Bond Resistance', mode: 'bloodbond' },
    ];
    for (const m of VM_CHOICE) {
      const idx = pools.length;
      pools.push({ opensPanel: m.mode, label: m.label });
      vmHtml += choiceBtn(m.label, idx);
    }
    // gdx.12: third tile kind — {submitAction}, routed by app.js's onTap to
    // submitHumanityCheck() instead of openPanel()/loadPool(). No panel, no
    // roll — see the story's own "What this story is NOT" for why.
    {
      const idx = pools.length;
      pools.push({ submitAction: 'humanity_check', label: 'Humanity Check' });
      vmHtml += submitBtn('Humanity Check', idx);
    }
    h += '<div class="gcp-section-hd">Vampire Mechanics</div>';
    h += `<div class="gcp-pool-grid">${vmHtml}</div>`;
  }

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
    const roteEligible = roteEligibleFor(char, sk);
    // Check Air of Menace: adds Nightmare dots to Intimidation
    let meritBonus = 0, meritLabel = '';
    if (sk === 'Intimidation' && (char.merits || []).some(m => m.name === 'Air of Menace')) {
      meritBonus = char.disciplines?.Nightmare?.dots || 0;
      if (meritBonus > 0) meritLabel = 'AoM';
    }
    const poolTotal = total + meritBonus;
    const idx   = pools.length;
    pools.push({ total: poolTotal, label: sk, attr, attrV, skill: sk, skillV: skD, nineAgain: !!na, roteEligible, meritBonus, meritLabel, resistance: null, pi: null });
    const sub = ab(attr) + '+' + ab(sk) + (meritBonus ? '+' + meritLabel + '(' + meritBonus + ')' : '');
    skillHtml += poolBtn(sk, poolTotal, sub, idx, na, roteEligible);
  }
  // ── Discipline power pools (rollable only) ──
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
  (char.powers || []).filter(p => p.category === 'devotion' || p.category === 'rite' || p.category === 'pact')
    .forEach(p => derivedPowers.push(p));

  let discHtml = '';
  for (const pw of derivedPowers) {
    const pi = getPool(char, pw.name);
    if (!pi || pi.noRoll || pi.total === undefined) continue;
    const idx = pools.length;
    const discNa = pi.nineAgain || (pi.skill && skNineAgain(char, pi.skill));
    pools.push({ total: pi.total, label: pw.name, attr: pi.attr, attrV: pi.attrV, skill: pi.skill, skillV: pi.skillV, nineAgain: !!discNa, resistance: pi.resistance || null, pi });
    const sub = ab(pi.attr) + '+' + ab(pi.skill) + (pi.resistance ? ' vs ' + pi.resistance : '');
    discHtml += poolBtn(pw.name, pi.total, sub, idx, discNa);
  }

  // rlv.4 (#1039, D5): "+ Custom Pool" tile — an ad-hoc entry path for rolls
  // with no pre-built pool button. Opens a scoped panel (app.js's
  // openPanel('custom')) instead of rolling immediately, so onTap receives
  // {opensPanel} rather than a total/pi. Always available, even for a
  // character with zero non-zero skills and zero disciplines — Custom Pool
  // alone is reason enough to render the Pools section.
  const customIdx = pools.length;
  pools.push({ opensPanel: 'custom', label: '+ Custom Pool' });
  const customHtml = choiceBtn('+ Custom Pool', customIdx, true);

  // gdx-11 (#981, AC9): phone-density — first view after loading a
  // character defaults to COLLAPSED (previously expanded-by-default).
  // `stored === null` means the toggle has never been touched on this
  // device; an explicit prior '0' (user un-collapsed manually) still wins.
  if (skillHtml || discHtml || customHtml) {
    const storedCollapsed = localStorage.getItem('tm_pools_collapsed');
    const collapsed = storedCollapsed === null ? true : storedCollapsed === '1';
    h += `<button class="gcp-collapse-btn">${collapsed ? '▸' : '▾'} Pools</button>`;
    h += `<div class="gcp-pools-wrap${collapsed ? ' gcp-all-collapsed' : ''}">`;
    if (skillHtml) {
      h += '<div class="gcp-section-hd">Skill Pools</div>';
      h += `<div class="gcp-pool-grid">${skillHtml}</div>`;
    }
    if (discHtml) {
      h += '<div class="gcp-section-hd">Discipline Pools</div>';
      h += `<div class="gcp-pool-grid">${discHtml}</div>`;
    }
    if (customHtml) h += `<div class="gcp-pool-grid">${customHtml}</div>`;
    h += '</div>';
  }

  h += '</div>';
  el.innerHTML = h;

  el.querySelectorAll('.gcp-pool-btn').forEach(btn => {
    const idx = Number(btn.dataset.idx);
    // gdx.12: second arg (the tapped button element) is new — existing
    // onTap callbacks that only declare one parameter are unaffected. Lets
    // submitAction handling disable the tile immediately to prevent a
    // double-submit, without char-pools.js itself making any network call.
    btn.addEventListener('click', () => onTap(pools[idx], btn));
  });

  el.querySelector('.gcp-collapse-btn')?.addEventListener('click', () => {
    const wrap = el.querySelector('.gcp-pools-wrap');
    const nowCollapsed = !wrap.classList.contains('gcp-all-collapsed');
    wrap.classList.toggle('gcp-all-collapsed', nowCollapsed);
    el.querySelector('.gcp-collapse-btn').textContent = (nowCollapsed ? '▸' : '▾') + ' Pools';
    localStorage.setItem('tm_pools_collapsed', nowCollapsed ? '1' : '0');
  });
}

function statChip(label, value) {
  return `<div class="gcp-stat"><span class="gcp-stat-v">${value}</span><span class="gcp-stat-l">${esc(label)}</span></div>`;
}

// rlv.4 / gdx-11 — a "choice" tile: opens a scoped panel instead of rolling
// immediately, so there is no dice total to show yet. `wide` spans the full
// grid row (used for the "+ Custom Pool" tile only).
function choiceBtn(label, idx, wide) {
  const cls = 'gcp-pool-btn gcp-choice' + (wide ? ' gcp-choice-wide' : '');
  return `<button class="${cls}" data-idx="${idx}"><span class="gcp-pool-n gcp-choice-arrow">›</span><span class="gcp-pool-lbl">${esc(label)}</span><span class="gcp-pool-sub">tap to choose</span></button>`;
}

// gdx.12: a "submit" tile — posts a pending request immediately, no panel,
// no dice total. Visually the same chrome as choiceBtn (reuse .gcp-choice)
// but distinct subtitle copy so it doesn't falsely promise a choice panel.
function submitBtn(label, idx) {
  return `<button class="gcp-pool-btn gcp-choice" data-idx="${idx}"><span class="gcp-pool-n gcp-choice-arrow">✓</span><span class="gcp-pool-lbl">${esc(label)}</span><span class="gcp-pool-sub">tap to submit</span></button>`;
}

function poolBtn(label, total, sub, idx, nineAgain, roteEligible) {
  const badges = (nineAgain ? '<span class="gcp-9a-badge">9</span>' : '')
               + (roteEligible ? '<span class="gcp-rote-badge">R</span>' : '');
  const cls = 'gcp-pool-btn' + (nineAgain ? ' gcp-9a' : '') + (roteEligible ? ' gcp-rote' : '');
  return `<button class="${cls}" data-idx="${idx}"><span class="gcp-pool-n">${total}</span>${badges}<span class="gcp-pool-lbl">${esc(label)}</span><span class="gcp-pool-sub">${esc(sub)}</span></button>`;
}
