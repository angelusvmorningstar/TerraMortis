// ══════════════════════════════════════════════
//  Roll Tab UI — pool display, modifiers, dice animation, history
// ══════════════════════════════════════════════

import state from './data.js';

import { d10, mkDie, mkChain, rollPool, cntSuc } from '../shared/dice.js';
import { skSpecs, skNineAgain } from '../data/accessors.js';
import { hasAoE } from '../data/helpers.js';
import { getCatalogueEntry } from '../data/equipment-catalogue-cache.js';
import { isCombatGearWeaponShaped } from '../data/equipment-derivation.js';

// ── Imports from other suite modules (will exist once extracted) ──
// showResistSec / updResist live in shared/resist.js
import { showResistSec, updResist } from '../shared/resist.js';

// ── DOM helpers (will be provided by a ui module or inlined) ──
function closePanel() {
  const overlay = document.getElementById('panel-overlay');
  if (overlay) overlay.classList.remove('on');
}

function toast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => t.classList.remove('on'), 2500);
}

// ── LOAD POOL ──

export function loadPool(total, name, pi) {
  state.PS = Math.max(0, total);
  state.MOD = 0;
  state.specBonuses = {};
  state.activeEquipBonus = null;
  state.activeWeaponId = null;
  state.POOL_INFO = pi || null;
  // Auto-set 9-Again when the pool source grants it
  if (pi?.nineAgain) setAgain(9);
  else setAgain(10);
  // Reset Rote — player toggles manually (PT dot-5 costs 1 WP)
  if (state.ROTE) togMod('rote');
  showResistSec();
  updPool();
  const banner = document.getElementById('pool-banner');
  const cn = state.rollChar ? state.rollChar.name.split(' ')[0] : '';
  banner.textContent = cn ? cn + ' \u00B7 ' + name + ' \u00B7 ' + total + 'd' : name + ' \u00B7 ' + total + 'd';
  banner.classList.add('on');
  document.getElementById('sc-disc-lbl').textContent = '';
  document.getElementById('sc-disc-val').textContent = name;
  document.getElementById('sc-disc').classList.add('loaded');
  closePanel();
}

// ── EFFECTIVE POOL ──

export function effPool() {
  const wpBonus = state.WP ? 3 : 0;
  return state.RESIST_MODE === '-'
    ? Math.max(0, state.PS + state.MOD + wpBonus - state.RESIST_VAL)
    : state.PS + state.MOD + wpBonus;
}

// ── POOL / MOD ADJUSTMENTS ──

export function chgPool(d) {
  state.PS = Math.max(-5, Math.min(40, state.PS + d));
  updPool();
}

export function chgMod(d) {
  state.MOD = Math.max(-10, Math.min(10, state.MOD + d));
  updPool();
}

// ── UPDATE POOL DISPLAY ──

export function updPool() {
  const eff = effPool();
  const pv = document.getElementById('pval');
  pv.textContent = state.PS <= 0 ? 'Chance' : state.PS;
  pv.className = 'cval' + (state.PS <= 0 ? ' chance' : '');

  const mv = document.getElementById('mval');
  const mod = state.MOD;
  mv.textContent = mod === 0 ? '0' : mod > 0 ? '+' + mod : mod;
  mv.className = 'bval' + (mod > 0 ? ' pos' : mod < 0 ? ' neg' : '');

  const el = document.getElementById('effline');
  const pi = state.POOL_INFO;

  if (!pi || !pi.attr) {
    if (eff <= 0) {
      el.innerHTML = 'Effective pool: <span class="effpool-seg effpool-seg--neg">Chance die</span>';
    } else {
      el.innerHTML = 'Effective pool: <span>' + eff + (eff === 1 ? ' die' : ' dice') + '</span>';
    }
    return;
  }

  const segs = [];
  if (pi.attr) segs.push('<span class="effpool-seg">' + pi.attr + ' <b>' + pi.attrV + '</b></span>');
  if (pi.skill) segs.push('<span class="effpool-seg">' + pi.skill + ' <b>' + pi.skillV + '</b></span>');
  if (pi.unskilled) segs.push('<span class="effpool-seg effpool-seg--neg">unskilled <b>' + pi.unskilled + '</b></span>');
  if (pi.discName && pi.discV) segs.push('<span class="effpool-seg">' + pi.discName + ' <b>' + pi.discV + '</b></span>');
  if (pi.meritBonus && pi.meritLabel) segs.push('<span class="effpool-seg effpool-seg--merit">' + pi.meritLabel + ' <b>+' + pi.meritBonus + '</b></span>');
  if (pi.roteEligible && !state.ROTE) segs.push('<span class="effpool-seg effpool-seg--rote" onclick="togMod(\'rote\')" title="PT dot 5: spend 1 WP for Rote quality">Rote \u2713</span>');
  if (state.WP) segs.push('<span class="effpool-seg effpool-seg--wp">WP <b>+3</b></span>');
  if (state.RESIST_MODE === '-' && state.RESIST_VAL > 0) {
    segs.push('<span class="effpool-seg effpool-seg--resist">\u2212Resist <b>' + state.RESIST_VAL + '</b></span>');
  }

  let html = segs.join('<span class="effpool-sep"> + </span>');

  if (pi.skill && state.rollChar) {
    const rc = state.rollChar;
    const specs = skSpecs(rc, pi.skill);
    const na = skNineAgain(rc, pi.skill);
    if (specs.length) {
      html += '<div class="effpool-specs">' + specs.map(s => {
        const aoe = hasAoE(rc, s);
        const bonusN = na || aoe ? 2 : 1;
        const bonusLbl = na ? '2 (9-again)' : aoe ? '2 (AoE)' : '1';
        const isOn = state.specBonuses[s] !== undefined;
        const cls = 'effpool-spec' + (isOn ? ' on' : '');
        const safe = String(s).replace(/"/g, '&quot;');
        return `<span class="${cls}" data-spec="${safe}" data-bonus="${bonusN}" `
             + `onclick="togSpec(this)" title="Click to add this specialty's bonus to your modifier">`
             + `${s} <span class="effpool-spec-bonus">+${bonusLbl}</span></span>`;
      }).join('') + '</div>';
    }
  }

  // Equipment bonus chips (EQ-3): one-active-at-a-time gear bonuses
  if (pi.skill && state.rollChar) {
    const rc = state.rollChar;
    const equip = (rc.equipment || []).filter(item => {
      const entry = getCatalogueEntry(item.catalogue_id);
      // #752: 'active' is the strongest in-use state — treat it identically
      // to carried/worn for chip eligibility (Khepri's option (a) — preserves
      // 'active' as a semantically-stronger marker an ST may have already used).
      // EQC-1 (#1152): old 'equipment' bucket -> 'skill_gear', unchanged meaning.
      return entry && entry.bucket === 'skill_gear' &&
             entry.bonus_dice > 0 &&
             entry.skill_domain === pi.skill &&
             (item.state === 'carried' || item.state === 'worn' || item.state === 'active');
    });
    if (equip.length) {
      html += '<div class="effpool-specs">' + equip.map(item => {
        const entry = getCatalogueEntry(item.catalogue_id);
        const isOn = state.activeEquipBonus &&
                     state.activeEquipBonus.catalogueId === entry.id;
        const cls = 'effpool-spec' + (isOn ? ' on' : '');
        const safe = String(entry.id).replace(/"/g, '&quot;');
        return `<span class="${cls}" data-equip="${safe}" data-bonus="${entry.bonus_dice}" `
             + `onclick="togEquipChip(this)" title="${entry.name}">`
             + `${entry.name} <span class="effpool-spec-bonus">+${entry.bonus_dice}</span></span>`;
      }).join('') + '</div>';
    }
  }

  el.innerHTML = html;
  updWeaponRef();
}

// ── SPECIALTY TOGGLE ──
//
// Click handler for the specialty badges under the effective-pool line.
// Toggling a badge on adds its dice bonus to MOD; toggling off subtracts
// the same amount. The per-spec bonus is stored in state.specBonuses so
// we can reverse the exact amount even if the displayed bonus would be
// different at toggle-off time (e.g. character data changed mid-roll).

export function togSpec(badge) {
  if (!badge) return;
  const name = badge.dataset.spec;
  const bonus = parseInt(badge.dataset.bonus, 10) || 0;
  if (!name || !bonus) return;
  const existing = state.specBonuses[name];
  if (existing !== undefined) {
    state.MOD = state.MOD - existing;
    delete state.specBonuses[name];
  } else {
    state.MOD = state.MOD + bonus;
    state.specBonuses[name] = bonus;
  }
  updPool();
}

// ── EQUIPMENT CHIP TOGGLE (EQ-3) ──

export function togEquipChip(badge) {
  if (!badge) return;
  const id = badge.dataset.equip;
  const bonus = parseInt(badge.dataset.bonus, 10) || 0;
  if (!id || !bonus) return;

  if (state.activeEquipBonus && state.activeEquipBonus.catalogueId === id) {
    state.MOD -= state.activeEquipBonus.bonus;
    state.activeEquipBonus = null;
  } else {
    if (state.activeEquipBonus) {
      state.MOD -= state.activeEquipBonus.bonus;
    }
    state.MOD += bonus;
    state.activeEquipBonus = { catalogueId: id, bonus };
  }
  updPool();
}

// ── WEAPON REFERENCE PANEL (EQ-3) ──

const COMBAT_SKILLS = ['Weaponry', 'Brawl', 'Firearms', 'Archery'];

export function updWeaponRef() {
  const panel = document.getElementById('weapon-ref');
  if (!panel) return;

  // Capture live selection before rebuilding innerHTML
  const liveSel = document.getElementById('weapon-sel');
  if (liveSel && liveSel.value) state.activeWeaponId = liveSel.value;
  else if (liveSel && !liveSel.value) state.activeWeaponId = null;

  const pi = state.POOL_INFO;
  if (!pi || !pi.skill || !COMBAT_SKILLS.includes(pi.skill) || !state.rollChar) {
    panel.style.display = 'none';
    return;
  }
  const weapons = (state.rollChar.equipment || []).filter(item => {
    // #752: 'active' is the strongest in-use state — include it in weapon-ref
    // eligibility (matches the chip predicate above).
    const entry = getCatalogueEntry(item.catalogue_id);
    // EQC-1 (#1152): 'weapon' bucket merged into 'combat_gear'; weapon-shaped
    // is identified via the shared isCombatGearWeaponShaped predicate (review
    // patch: a single-field check missed legacy weapons whose weapon_type was
    // null but damage_mod/damage_type were populated).
    return entry && entry.bucket === 'combat_gear' && isCombatGearWeaponShaped(entry) &&
           (item.state === 'carried' || item.state === 'worn' || item.state === 'active');
  });
  if (!weapons.length) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = '';
  const prevId = state.activeWeaponId;

  const optionsHtml = weapons.map(item => {
    const e = getCatalogueEntry(item.catalogue_id);
    const sel = prevId === e.id ? ' selected' : '';
    return `<option value="${e.id}"${sel}>${e.name}</option>`;
  }).join('');

  let statsHtml = '';
  if (prevId) {
    const e = getCatalogueEntry(prevId);
    if (e) {
      const DMGTYPE = { lethal: 'Lethal', bashing: 'Bashing', aggravated: 'Aggravated' };
      const WPNTYPE = { melee: 'Melee', ranged: 'Ranged', thrown: 'Thrown' };
      const mod = e.damage_mod > 0 ? '+' + e.damage_mod : String(e.damage_mod);
      statsHtml = `<div class="trait-qual">`
               + `${mod} · ${DMGTYPE[e.damage_type] || e.damage_type} · ${WPNTYPE[e.weapon_type] || e.weapon_type}`
               + `</div>`;
    }
  }

  panel.innerHTML = `<div class="slabel">Weapon</div>`
    + `<select id="weapon-sel" class="resist-sel" onchange="updWeaponRef()">`
    + `<option value="">-- select --</option>${optionsHtml}</select>${statsHtml}`;
}

// ── AGAIN / MODIFIER TOGGLES ──

export function setAgain(v) {
  state.AGAIN = v;
  [8, 9].forEach(n => {
    const el = document.getElementById('a' + n);
    if (el) el.classList.toggle('on', n === v);
  });
}

export function togMod(m) {
  if (m === 'rote') {
    state.ROTE = !state.ROTE;
    document.getElementById('rote-c').classList.toggle('on', state.ROTE);
  } else if (m === 'wp') {
    state.WP = !state.WP;
    document.getElementById('wp-c').classList.toggle('on', state.WP);
    updPool();
  } else {
    state.NA = !state.NA;
    document.getElementById('na-c').classList.toggle('on', state.NA);
  }
}

// ── DIE DOM ELEMENTS ──

export function mkDieEl(d, delay, isX) {
  const el = document.createElement('div');
  // Exploding re-roll dice use the same success/fail colour as initial dice,
  // plus an 'ed' marker class for the chain connector styling.
  let cls = d.s ? 'die sd' : 'die fd';
  if (isX) cls += ' ed';
  if (d.x) cls += ' xd';
  el.className = cls;
  el.textContent = d.v;
  el.style.animationDelay = (delay * 40) + 'ms';
  return el;
}

export function mkColsEl(cols, base) {
  const w = document.createElement('div');
  w.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;';
  let delay = base;
  cols.forEach(col => {
    const ce = document.createElement('div');
    ce.className = 'dcol';
    ce.appendChild(mkDieEl(col.r, delay++, false));
    col.ch.forEach(child => {
      const conn = document.createElement('div');
      conn.className = 'xconn';
      ce.appendChild(conn);
      ce.appendChild(mkDieEl(child, delay++, true));
    });
    w.appendChild(ce);
  });
  return w;
}

// ── MAIN ROLL ──

export function doRoll() {
  const eff = effPool();
  const area = document.getElementById('dice-area');
  const hdr = document.getElementById('res-hdr');
  area.innerHTML = '';
  hdr.classList.remove('on');

  if (eff <= 0) {
    const v = d10();
    const suc = v === 10;
    const dram = v === 1;
    const cls = dram ? 'd' : suc ? 'e' : 'f';
    const lbl = dram ? 'Dramatic Failure' : suc ? 'Success (Chance)' : 'Failure (Chance)';
    const cnt = dram ? '\u2014' : suc ? '1' : '0';
    hdr.innerHTML = `<div><span class="rcnt ${cls}">${cnt}</span><span class="rlbl ${cls}">${lbl}</span></div><div class="rverd">Chance die</div>`;
    hdr.classList.add('on');
    const del = document.createElement('div');
    del.className = 'die cd';
    del.textContent = v;
    area.appendChild(del);
    addHist('Chance', cls, lbl, cnt, 'Chance die');
    return;
  }

  const cA = rollPool(eff);
  const cB = state.ROTE ? rollPool(eff) : null;
  const sA = cntSuc(cA);
  const sB = state.ROTE ? cntSuc(cB) : 0;
  let wC, wS, lC, lS;

  if (state.ROTE && sB > sA) {
    wC = cB; wS = sB; lC = cA; lS = sA;
  } else {
    wC = cA; wS = sA;
    if (state.ROTE) { lC = cB; lS = sB; }
  }

  const mods = [];
  if (state.WP) mods.push('WP +3');
  if (state.ROTE) mods.push('rote');
  if (state.NA) mods.push('no again');

  const pi = state.POOL_INFO;
  const verdParts = [];
  if (pi && pi.attr) {
    if (pi.attr) verdParts.push(pi.attr + ' ' + pi.attrV);
    if (pi.skill) verdParts.push(pi.skill + ' ' + pi.skillV);
    if (pi.unskilled) verdParts.push('unskilled ' + pi.unskilled);
    if (pi.discName && pi.discV) verdParts.push(pi.discName + ' ' + pi.discV);
  }
  const poolStr = verdParts.length ? verdParts.join(' + ') : eff + 'd10';
  const ag = state.AGAIN;
  const verd = `${poolStr} \u00B7 ${ag}-again${mods.length ? ' \u00B7 ' + mods.join(', ') : ''}`;

  // Contested roll
  if (state.RESIST_MODE === 'v' && state.RESIST_CHAR && state.RESIST_VAL > 0) {
    const cR = rollPool(state.RESIST_VAL);
    const sR = cntSuc(cR);
    const net = wS - sR;
    const won = net > 0;
    const draw = net === 0;
    const cls = won ? (net >= 5 ? 'e' : 's') : 'f';
    const outcome = won ? (net >= 5 ? 'Exceptional Success' : 'Success') : draw ? 'Draw (Failure)' : 'Failure';
    const rcName = state.rollChar ? state.rollChar.name.split(' ')[0] : 'Roll';
    const resistName = state.RESIST_CHAR.name.split(' ')[0];
    const resistLabel = pi ? pi.resistance : '';

    hdr.innerHTML = `<div><span class="rcnt ${cls}">${won ? net : wS}</span><span class="rlbl ${cls}">${outcome}</span></div><div class="rverd">${poolStr} vs ${resistName} ${resistLabel} \u00B7 ${wS} vs ${sR}</div>`;
    hdr.classList.add('on');

    const wb = document.createElement('div');
    wb.className = 'rote-blk win';
    wb.innerHTML = `<div class="rote-lbl">${rcName} \u2014 ${wS} success${wS !== 1 ? 'es' : ''}</div>`;
    wb.appendChild(mkColsEl(wC, 0));
    area.appendChild(wb);

    const rb = document.createElement('div');
    rb.className = 'rote-blk' + (won ? '' : ' win');
    rb.innerHTML = `<div class="rote-lbl">${resistName} (resistance) \u2014 ${sR} success${sR !== 1 ? 'es' : ''}</div>`;
    rb.appendChild(mkColsEl(cR, wC.length + 2));
    area.appendChild(rb);

    addHist(eff + 'd10', cls, outcome, won ? net : wS, verd);
    return;
  }

  // Standard roll result
  const exc = wS >= 5;
  const cls = wS === 0 ? 'f' : exc ? 'e' : 's';
  const lbl = wS === 0 ? 'Failure' : exc ? 'Exceptional Success' : 'Success';
  hdr.innerHTML = `<div><span class="rcnt ${cls}">${wS}</span><span class="rlbl ${cls}">${lbl}</span></div><div class="rverd">${verd}</div>`;
  hdr.classList.add('on');

  if (state.ROTE) {
    const wb = document.createElement('div');
    wb.className = 'rote-blk win';
    wb.innerHTML = `<div class="rote-lbl">Roll 1 \u2014 ${wS} success${wS !== 1 ? 'es' : ''} (selected)</div>`;
    wb.appendChild(mkColsEl(wC, 0));
    area.appendChild(wb);

    const lb = document.createElement('div');
    lb.className = 'rote-blk';
    lb.innerHTML = `<div class="rote-lbl">Roll 2 \u2014 ${lS} success${lS !== 1 ? 'es' : ''}</div>`;
    lb.appendChild(mkColsEl(lC, wC.length + 2));
    area.appendChild(lb);
  } else {
    area.appendChild(mkColsEl(wC, 0));
  }

  addHist(eff + 'd10', cls, lbl, wS, verd);

  // Auto-reset WP after rolling (one-time spend)
  if (state.WP) {
    state.WP = false;
    document.getElementById('wp-c')?.classList.remove('on');
    updPool();
  }
}

// ── ROLL HISTORY ──

export function addHist(pool, cls, lbl, cnt, verd) {
  const h = state.hist;
  h.unshift({ pool, lbl, cnt, cls, verd });
  if (h.length > 20) h.pop();
  state.hist = h;
  renderHist();
}

export function renderHist() {
  const l = document.getElementById('hlist');
  const h = state.hist;
  if (!h.length) {
    l.innerHTML = '<div class="hempty">No rolls yet</div>';
    return;
  }
  l.innerHTML = h.map(r =>
    `<div class="hitem"><span class="hmeta">${r.verd}</span><span class="hres ${r.cls}">${r.cnt} ${r.lbl}</span></div>`
  ).join('');
}

export function clrHist() {
  state.hist = [];
  renderHist();
}
