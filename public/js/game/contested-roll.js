/* Game app — contested roll overlay.
   Three roll types with pre-loaded character pools and auto-logging. */

import suiteState from '../suite/data.js';
import { getAttrEffective, getAttrBonus, skDots, skBonus } from '../data/accessors.js';
import { displayName, esc } from '../data/helpers.js';
import { apiPost } from '../data/api.js';
import { mkDieEl, mkColsEl } from '../suite/roll.js';

// ── Roll type definitions ──

const TYPES = {
  territory: {
    label:    'Territory Bid',
    atkPool:  c => aval(c,'Presence') + sk(c,'Intimidation'),
    atkLabel: 'Pre+Itm',
    defPool:  c => aval(c,'Presence') + sk(c,'Intimidation'),
    defLabel: 'Pre+Itm',
  },
  social: {
    label:    'Social Manoeuvre',
    atkPool:  c => aval(c,'Presence') + sk(c,'Persuasion'),
    atkLabel: 'Pre+Per',
    defPool:  c => aval(c,'Composure') + (c.blood_potency || 0),
    defLabel: 'Com+BP',
  },
  resistance: {
    label:    'Resistance Check',
    atkPool:  () => (suiteState.rollChar ? suiteState.PS || 0 : 0),
    atkLabel: 'Loaded pool',
    defPool:  c => aval(c,'Stamina') + aval(c,'Resolve'),
    defLabel: 'Sta+Res',
  },
};

function aval(c, attr) { return getAttrEffective(c, attr) + getAttrBonus(c, attr); }
function sk(c, skill)  { return skDots(c, skill) + skBonus(c, skill); }

// ── Module state ──

let _type = 'territory';
let _atk  = { name: '', pool: 0 };
let _def  = { name: '', pool: 0 };

// ── Inline contested dice roller — always 10-again, ignores Roll tab state ──

function rollContested(n) {
  const cols = [];
  for (let i = 0; i < Math.max(0, n); i++) {
    const v = d10();
    const r = { v, s: v >= 8, x: v === 10 };
    const ch = [];
    let last = r;
    while (last.x) { const cv = d10(); last = { v: cv, s: cv >= 8, x: cv === 10 }; ch.push(last); }
    cols.push({ r, ch });
  }
  return cols;
}

function d10() { return Math.floor(Math.random() * 10) + 1; }

function countSuc(cols) {
  let s = 0;
  for (const col of cols) {
    if (col.r.s) s++;
    for (const d of col.ch) if (d.s) s++;
  }
  return s;
}

// ── Overlay open / close ──

export function openContestedRoll() {
  const overlay = document.getElementById('cr-overlay');
  if (!overlay) return;
  _type = 'territory';
  _atk  = { name: '', pool: 0 };
  _def  = { name: '', pool: 0 };
  overlay.style.display = 'flex';
  renderForm();
}

export function closeContestedRoll() {
  const overlay = document.getElementById('cr-overlay');
  if (overlay) overlay.style.display = 'none';
}

// ── Interaction handlers (exposed to window via app.js) ──

export function crSetType(type) {
  _type = type;
  _atk.pool = _atk.name ? TYPES[type].atkPool(findChar(_atk.name)) : 0;
  _def.pool = _def.name ? TYPES[type].defPool(findChar(_def.name)) : 0;
  renderForm();
}

export function crSetChar(side, name) {
  const s = side === 'atk' ? _atk : _def;
  s.name = name;
  const c = findChar(name);
  s.pool = c ? TYPES[_type][side === 'atk' ? 'atkPool' : 'defPool'](c) : 0;
  // Update pool display only (keep full form intact)
  const els = document.querySelectorAll('.cr-pool-n');
  const el  = els[side === 'atk' ? 0 : 1];
  if (el) el.textContent = s.pool;
}

export function crAdjPool(side, delta) {
  const s = side === 'atk' ? _atk : _def;
  s.pool = Math.max(0, s.pool + delta);
  const els = document.querySelectorAll('.cr-pool-n');
  const el  = els[side === 'atk' ? 0 : 1];
  if (el) el.textContent = s.pool;
}

export function crRoll() {
  const atkCols = rollContested(_atk.pool);
  const defCols = rollContested(_def.pool);
  const atkSuc  = countSuc(atkCols);
  const defSuc  = countSuc(defCols);
  const atkName = _atk.name || 'Attacker';
  const defName = _def.name || 'Defender';

  let outcome, margin;
  if (atkSuc > defSuc)      { outcome = 'attacker'; margin = atkSuc - defSuc; }
  else if (defSuc > atkSuc) { outcome = 'defender'; margin = defSuc - atkSuc; }
  else                       { outcome = 'draw';     margin = 0; }

  renderResultDOM({ atkCols, defCols, atkSuc, defSuc, atkName, defName, outcome, margin });
  logResult(atkName, defName, atkSuc, defSuc, outcome, margin);
}

// ── Render helpers ──

function findChar(name) {
  return (suiteState.chars || []).find(c => c.name === name) || null;
}

function charOptions(selectedName) {
  const opts = ['<option value="">\u2014 select \u2014</option>'];
  for (const c of (suiteState.chars || [])) {
    const sel = c.name === selectedName ? ' selected' : '';
    opts.push(`<option value="${esc(c.name)}"${sel}>${esc(displayName(c))}</option>`);
  }
  return opts.join('');
}

function renderForm() {
  const box = document.getElementById('cr-box');
  if (!box) return;
  const ti = TYPES[_type];
  box.innerHTML = `
    <div class="cr-hdr">
      <span class="cr-title">Contested Roll</span>
      <button class="cr-close" onclick="closeContestedRoll()">&#10005;</button>
    </div>
    <div class="cr-types">
      ${Object.entries(TYPES).map(([id,t]) =>
        `<button class="cr-type-btn${_type===id?' on':''}" onclick="crSetType('${id}')">${esc(t.label)}</button>`
      ).join('')}
    </div>
    <div class="cr-sides">
      <div class="cr-side">
        <div class="cr-side-hd">Attacker</div>
        <select class="cr-sel" onchange="crSetChar('atk',this.value)">${charOptions(_atk.name)}</select>
        <div class="cr-pool-row">
          <button class="cr-adj" onclick="crAdjPool('atk',-1)">&#8722;</button>
          <span class="cr-pool-n">${_atk.pool}</span>
          <button class="cr-adj" onclick="crAdjPool('atk',1)">+</button>
        </div>
        <div class="cr-pool-sub">${esc(ti.atkLabel)}</div>
      </div>
      <div class="cr-side">
        <div class="cr-side-hd">Defender</div>
        <select class="cr-sel" onchange="crSetChar('def',this.value)">${charOptions(_def.name)}</select>
        <div class="cr-pool-row">
          <button class="cr-adj" onclick="crAdjPool('def',-1)">&#8722;</button>
          <span class="cr-pool-n">${_def.pool}</span>
          <button class="cr-adj" onclick="crAdjPool('def',1)">+</button>
        </div>
        <div class="cr-pool-sub">${esc(ti.defLabel)}</div>
      </div>
    </div>
    <button class="cr-roll-btn" onclick="crRoll()">Roll Both</button>
    <div id="cr-result" class="cr-result"></div>`;
}

function renderResultDOM({ atkCols, defCols, atkSuc, defSuc, atkName, defName, outcome, margin }) {
  const el = document.getElementById('cr-result');
  if (!el) return;
  el.innerHTML = '';

  function diceRow(name, cols, suc, base) {
    const row = document.createElement('div');
    row.className = 'cr-dice-row';
    const lbl = document.createElement('span');
    lbl.className = 'cr-dice-lbl';
    lbl.textContent = name;
    row.appendChild(lbl);
    row.appendChild(mkColsEl(cols, base));
    const sucEl = document.createElement('span');
    sucEl.className = 'cr-suc';
    sucEl.textContent = suc + ' suc';
    row.appendChild(sucEl);
    return row;
  }

  el.appendChild(diceRow(atkName, atkCols, atkSuc, 0));
  el.appendChild(diceRow(defName, defCols, defSuc, atkCols.length + 2));

  const banner = document.createElement('div');
  if (outcome === 'draw') {
    banner.className = 'cr-outcome cr-draw';
    banner.textContent = 'DRAW';
  } else {
    const winner = outcome === 'attacker' ? atkName : defName;
    banner.className = 'cr-outcome cr-win';
    banner.textContent = winner.split(' ')[0].toUpperCase() + ' WINS' + (margin > 0 ? ' by ' + margin : '');
  }
  el.appendChild(banner);
}

async function logResult(atkName, defName, atkSuc, defSuc, outcome, margin) {
  try {
    await apiPost('/api/session_logs', {
      session_date: new Date().toISOString().slice(0, 10),
      type:         'contested_roll',
      roll_type:    _type,
      roll_label:   TYPES[_type].label,
      attacker:     { name: atkName, pool: _atk.pool, successes: atkSuc },
      defender:     { name: defName, pool: _def.pool, successes: defSuc },
      outcome,
      margin,
      timestamp:    new Date().toISOString(),
    });
  } catch { /* log failure is non-fatal */ }
}
