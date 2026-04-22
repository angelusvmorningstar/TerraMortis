// ══════════════════════════════════════════════
//  Dice Roller Modal — contextual roller overlay
//  Opens pre-seeded from skill rows, discipline powers, devotions, etc.
//  Self-contained state — does not interfere with the Dice tab.
// ══════════════════════════════════════════════

import { d10, mkDie, mkChain, rollPool, cntSuc } from '../shared/dice.js';
import { getPool } from '../shared/pools.js';
import { getAttrEffective, skTotal, skNineAgain, skSpecs, getSkillObj } from '../data/accessors.js';
import { hasAoE, displayName } from '../data/helpers.js';
import { parseResistance, getResistTokenVal } from '../shared/resist.js';
import { SKILLS_MENTAL, SKILLS_PHYSICAL, SKILLS_SOCIAL, ALL_SKILLS } from '../data/constants.js';
import state from './data.js';   // only for reading rollChar / sheetChar

// Attribute groups by category
const ATTRS_MENTAL   = ['Intelligence', 'Wits', 'Resolve'];
const ATTRS_PHYSICAL = ['Strength', 'Dexterity', 'Stamina'];
const ATTRS_SOCIAL   = ['Presence', 'Manipulation', 'Composure'];
const ALL_ATTRS      = [...ATTRS_MENTAL, ...ATTRS_PHYSICAL, ...ATTRS_SOCIAL];

function skillCategory(skill) {
  if (SKILLS_MENTAL.includes(skill))   return 'Mental';
  if (SKILLS_PHYSICAL.includes(skill)) return 'Physical';
  if (SKILLS_SOCIAL.includes(skill))   return 'Social';
  return 'Mental';
}

function skillsInCategory(cat) {
  if (cat === 'Mental')   return SKILLS_MENTAL;
  if (cat === 'Physical') return SKILLS_PHYSICAL;
  if (cat === 'Social')   return SKILLS_SOCIAL;
  return ALL_SKILLS;
}
import { getRole } from '../auth/discord.js';

// ── Rules ordeal gate ──
// Dice roller is gated behind the Rules Mastery ordeal for players.
// STs always have access.
export function canRollDice(char) {
  if (getRole() === 'st' || getRole() === 'dev') return true;
  if (!char) return false;
  return (char.ordeals || []).some(o =>
    (o.name || '').toLowerCase() === 'rules' && o.complete
  );
}

// ── d10 icon — PNG image, inverted in dark mode via CSS ──
export const DICE_ICON_SVG = `<img class="dice-roll-icon" src="/assets/d10.png" alt="Roll" width="16" height="16">`;

// ── Default attribute for bare skill rolls ──
// Each skill maps to the "most common" attribute used with it.
// Player can adjust via +/- after opening.
const SKILL_DEFAULT_ATTR = {
  // Mental
  Academics: 'Intelligence', Computer: 'Intelligence', Crafts: 'Intelligence',
  Investigation: 'Wits', Medicine: 'Intelligence', Occult: 'Intelligence',
  Politics: 'Wits', Science: 'Intelligence',
  // Physical
  Athletics: 'Dexterity', Brawl: 'Strength', Drive: 'Dexterity',
  Firearms: 'Dexterity', Larceny: 'Dexterity', Stealth: 'Dexterity',
  Survival: 'Composure', Weaponry: 'Strength',
  // Social
  'Animal Ken': 'Composure', Empathy: 'Manipulation', Expression: 'Presence',
  Intimidation: 'Presence', Persuasion: 'Manipulation', Socialise: 'Presence',
  Streetwise: 'Manipulation', Subterfuge: 'Manipulation',
};

function unskilledPenalty(skill) {
  return SKILLS_MENTAL.includes(skill) ? -3 : -1;
}

// ── Modal state (independent of dice tab state) ──
let _ms = _freshState();
let _char = null;  // current character for skill pool recalculation
let _histKey = 'tm_dice_modal_hist';
let _hist = [];

function _freshState() {
  return { ps: 5, mod: 0, again: 10, rote: false, na: false, wp: false,
           pi: null, specBonuses: {}, lastResult: null,
           resistMode: null, resistParsed: null, resistChar: null, resistVal: 0 };
}

// ── History persistence ──
function _loadHist() {
  try { _hist = JSON.parse(localStorage.getItem(_histKey) || '[]'); } catch { _hist = []; }
}
function _saveHist() {
  try { localStorage.setItem(_histKey, JSON.stringify(_hist.slice(0, 30))); } catch { /* */ }
}

// ── Build / get modal DOM ──
let _modalEl = null;

function _ensureModal() {
  if (_modalEl) return _modalEl;
  const div = document.createElement('div');
  div.id = 'dice-modal-overlay';
  div.innerHTML = `
    <div class="dm-box">
      <div class="dm-header">
        <span class="dm-title" id="dm-title">Dice Roller</span>
        <button class="dm-close" id="dm-close">&times;</button>
      </div>
      <div class="dm-pool-info" id="dm-pool-info"></div>
      <div class="dm-controls">
        <div class="dm-row">
          <div class="dm-ctrl">
            <div class="dm-lbl">Pool</div>
            <div class="dm-adj">
              <button class="dm-adj-btn" data-act="pool" data-d="-1">&minus;</button>
              <span class="dm-adj-val" id="dm-pool-val">5</span>
              <button class="dm-adj-btn" data-act="pool" data-d="1">+</button>
            </div>
          </div>
          <div class="dm-ctrl">
            <div class="dm-lbl">Modifier</div>
            <div class="dm-adj">
              <button class="dm-adj-btn" data-act="mod" data-d="-1">&minus;</button>
              <span class="dm-adj-val" id="dm-mod-val">0</span>
              <button class="dm-adj-btn" data-act="mod" data-d="1">+</button>
            </div>
          </div>
        </div>
        <div class="dm-eff" id="dm-eff">Effective: <b>5 dice</b></div>
        <div class="dm-specs" id="dm-specs"></div>
        <div class="dm-resist" id="dm-resist" style="display:none">
          <div class="dm-lbl" id="dm-resist-lbl">Resistance</div>
          <select class="dm-pool-sel" id="dm-resist-sel"><option value="">\u2014 select target \u2014</option></select>
          <div class="dm-resist-line" id="dm-resist-line"></div>
        </div>
        <div class="dm-row dm-again-row">
          <button class="dm-chip" id="dm-a8" data-act="again8">8-Again</button>
          <button class="dm-chip" id="dm-a9" data-act="again9">9-Again</button>
        </div>
        <div class="dm-row dm-mod-row">
          <button class="dm-chip" id="dm-rote" data-act="rote">Rote</button>
          <button class="dm-chip" id="dm-na" data-act="na">No Again</button>
          <button class="dm-chip dm-wp" id="dm-wp" data-act="wp">WP (+3)</button>
        </div>
      </div>
      <button class="dm-roll-btn" id="dm-roll-btn">Roll</button>
      <div class="dm-result" id="dm-result"></div>
      <div class="dm-dice-area" id="dm-dice-area"></div>
      <div class="dm-history">
        <div class="dm-hist-hdr">
          <span class="dm-hist-title">History</span>
          <button class="dm-hist-clr" id="dm-hist-clr">Clear</button>
        </div>
        <div class="dm-hist-list" id="dm-hist-list"></div>
      </div>
    </div>`;
  document.body.appendChild(div);
  _modalEl = div;

  // Wire events
  div.querySelector('#dm-close').addEventListener('click', closeDiceModal);
  div.addEventListener('click', e => { if (e.target === div) closeDiceModal(); });
  div.querySelector('#dm-roll-btn').addEventListener('click', _doRoll);
  div.querySelector('#dm-hist-clr').addEventListener('click', _clearHist);

  // Delegated clicks for chips and +/- buttons
  div.addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'pool') { _ms.ps = Math.max(0, Math.min(40, _ms.ps + parseInt(btn.dataset.d))); _updUI(); }
    else if (act === 'mod') { _ms.mod = Math.max(-10, Math.min(10, _ms.mod + parseInt(btn.dataset.d))); _updUI(); }
    else if (act === 'again8') { _ms.again = _ms.again === 8 ? 10 : 8; _updUI(); }
    else if (act === 'again9') { _ms.again = _ms.again === 9 ? 10 : 9; _updUI(); }
    else if (act === 'rote') { _ms.rote = !_ms.rote; _updUI(); }
    else if (act === 'na') { _ms.na = !_ms.na; _updUI(); }
    else if (act === 'wp') { _ms.wp = !_ms.wp; _updUI(); }
  });

  // Spec badge clicks (delegated)
  div.addEventListener('click', e => {
    const badge = e.target.closest('.dm-spec-badge');
    if (!badge) return;
    const name = badge.dataset.spec;
    const bonus = parseInt(badge.dataset.bonus, 10) || 0;
    if (_ms.specBonuses[name] !== undefined) {
      _ms.mod -= _ms.specBonuses[name];
      delete _ms.specBonuses[name];
    } else {
      _ms.mod += bonus;
      _ms.specBonuses[name] = bonus;
    }
    _updUI();
  });

  // Resistance target change
  div.querySelector('#dm-resist-sel')?.addEventListener('change', e => {
    const name = e.target.value;
    _ms.resistChar = name ? (state.chars || []).find(c => c.name === name) || null : null;
    _recalcResist();
    _updUI();
  });

  return div;
}

// ── Resistance handling ──

function _showResistSection() {
  const m = _modalEl;
  if (!m) return;
  const sec = m.querySelector('#dm-resist');
  const pi = _ms.pi;
  const r = pi?.resistance;
  if (!r) { sec.style.display = 'none'; _ms.resistMode = null; _ms.resistParsed = null; return; }
  const parsed = parseResistance(r);
  if (!parsed) { sec.style.display = 'none'; return; }
  _ms.resistMode = parsed.mode;
  _ms.resistParsed = parsed;
  sec.style.display = '';

  const lbl = m.querySelector('#dm-resist-lbl');
  if (lbl) lbl.textContent = parsed.mode === 'v' ? 'Contested \u2014 ' + r : 'Resistance \u2014 ' + r;

  // Populate target selector
  const sel = m.querySelector('#dm-resist-sel');
  const curVal = sel.value;
  sel.innerHTML = '<option value="">\u2014 select target \u2014</option>';
  (state.chars || []).filter(c => !c.retired).sort((a, b) =>
    (a.moniker || a.name).localeCompare(b.moniker || b.name)
  ).forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.name;
    opt.textContent = displayName(c);
    if (c.name === curVal) opt.selected = true;
    sel.appendChild(opt);
  });
  _recalcResist();
}

function _recalcResist() {
  const m = _modalEl;
  if (!m || !_ms.resistParsed || !_ms.resistChar) { _ms.resistVal = 0; return; }
  const parts = _ms.resistParsed.tokens.map(t => ({ ...t, val: getResistTokenVal(_ms.resistChar, t) }));
  _ms.resistVal = parts.reduce((s, t) => s + t.val, 0);
  const line = m.querySelector('#dm-resist-line');
  if (line) {
    const breakdown = parts.map(t => `${t.label} <b>${t.val}</b>`).join(' + ');
    const rName = displayName(_ms.resistChar).split(' ')[0];
    if (_ms.resistMode === 'v') {
      line.innerHTML = `${rName}: ${breakdown} = <span class="dm-resist-val">${_ms.resistVal} dice</span>`;
    } else {
      line.innerHTML = `${rName}: ${breakdown} = <span class="dm-resist-pen">\u2212${_ms.resistVal} from pool</span>`;
    }
  }
}

// ── Seed a skill pool from attribute + skill ──
function _seedSkillPool(c, attr, skill) {
  const attrV = getAttrEffective(c, attr);
  const skillV = skTotal(c, skill);
  const unskilled = skillV === 0 ? unskilledPenalty(skill) : 0;
  const nineAgain = skNineAgain(c, skill);
  const total = attrV + skillV + unskilled;

  _ms.ps = Math.max(0, total);
  _ms.mod = 0;
  _ms.specBonuses = {};
  _ms.pi = { attr, attrV, skill, skillV, unskilled: unskilled || null,
             discName: null, discV: 0, nineAgain, resistance: null };
  if (nineAgain) _ms.again = 9;
  else if (_ms.again === 9) _ms.again = 10;
}

// ── Effective pool ──
function _effPool() {
  const wpB = _ms.wp ? 3 : 0;
  const resistSub = _ms.resistMode === '-' ? _ms.resistVal : 0;
  return Math.max(0, _ms.ps + _ms.mod + wpB - resistSub);
}

// ── Open modal ──

/**
 * Open the dice modal pre-seeded with a pool.
 * @param {'skill'|'power'|'custom'} type
 * @param {string} name — skill name, power name, or custom label
 * @param {object} [char] — character object (defaults to rollChar/sheetChar)
 */
export function openDiceModal(type, name, char) {
  const c = char || state.rollChar || state.sheetChar;
  if (!c) return;
  if (!canRollDice(c)) return;

  _ms = _freshState();
  _loadHist();

  const modal = _ensureModal();
  const titleEl = modal.querySelector('#dm-title');
  const infoEl = modal.querySelector('#dm-pool-info');

  _char = c;

  if (type === 'power') {
    // Discipline power, devotion, rite — use getPool
    const pi = getPool(c, name);
    if (pi && !pi.noRoll && pi.total !== undefined) {
      _ms.ps = pi.total;
      _ms.pi = pi;
      if (pi.nineAgain) _ms.again = 9;
      titleEl.textContent = name;
      let info = '';
      if (pi.attr) info += pi.attr + ' ' + pi.attrV;
      if (pi.skill) info += ' + ' + pi.skill + ' ' + pi.skillV;
      if (pi.unskilled) info += ' <span class="dm-info-neg">unskilled ' + pi.unskilled + '</span>';
      if (pi.discName && pi.discV) info += ' + ' + pi.discName + ' ' + pi.discV;
      if (pi.cost) info += ' <span class="dm-info-dim">\u00B7 ' + pi.cost + '</span>';
      if (pi.resistance) info += ' <span class="dm-info-dim">\u00B7 vs ' + pi.resistance + '</span>';
      infoEl.innerHTML = info;
    } else {
      // No-roll power
      titleEl.textContent = name;
      _ms.ps = 0;
      infoEl.innerHTML = '<span class="dm-info-dim">No dice pool \u2014 adjust manually</span>';
      if (pi?.info?.c) infoEl.innerHTML += ' <span class="dm-info-dim">\u00B7 Cost: ' + pi.info.c + '</span>';
    }
  } else if (type === 'skill') {
    // Bare skill roll — default attribute + skill selectors
    const attr = SKILL_DEFAULT_ATTR[name] || 'Intelligence';
    _ms.skillType = 'skill';
    _seedSkillPool(c, attr, name);
    titleEl.textContent = name;

    // Render attribute + skill dropdowns
    const cat = skillCategory(name);
    const catSkills = skillsInCategory(cat);
    let info = '<div class="dm-pool-selectors">';
    info += '<select class="dm-pool-sel" id="dm-attr-sel">';
    ALL_ATTRS.forEach(a => {
      const v = getAttrEffective(c, a);
      info += `<option value="${a}"${a === attr ? ' selected' : ''}>${a} (${v})</option>`;
    });
    info += '</select>';
    info += '<span class="dm-pool-plus">+</span>';
    info += '<select class="dm-pool-sel" id="dm-skill-sel">';
    catSkills.forEach(s => {
      const v = skTotal(c, s);
      info += `<option value="${s}"${s === name ? ' selected' : ''}>${s} (${v})</option>`;
    });
    info += '</select>';
    info += '</div>';
    infoEl.innerHTML = info;

    // Wire change handlers
    infoEl.querySelector('#dm-attr-sel')?.addEventListener('change', e => {
      _seedSkillPool(_char, e.target.value, _ms.pi.skill);
      _updUI();
    });
    infoEl.querySelector('#dm-skill-sel')?.addEventListener('change', e => {
      const newSkill = e.target.value;
      _seedSkillPool(_char, _ms.pi.attr, newSkill);
      titleEl.textContent = newSkill;
      // Update attr dropdown values (attr dots may differ per context)
      const attrSel = infoEl.querySelector('#dm-attr-sel');
      if (attrSel) {
        [...attrSel.options].forEach(opt => {
          const v = getAttrEffective(_char, opt.value);
          opt.textContent = opt.value + ' (' + v + ')';
        });
      }
      _updUI();
    });
  } else {
    // Custom / manual
    titleEl.textContent = name || 'Dice Roller';
    infoEl.innerHTML = '';
  }

  _updUI();
  modal.classList.add('on');
  document.body.style.overflow = 'hidden';
}

export function closeDiceModal() {
  if (_modalEl) _modalEl.classList.remove('on');
  document.body.style.overflow = '';
}

// ── Update all UI elements ──
function _updUI() {
  const m = _modalEl;
  if (!m) return;

  // Pool / mod values
  const pv = m.querySelector('#dm-pool-val');
  pv.textContent = _ms.ps <= 0 ? 'Chance' : _ms.ps;
  pv.className = 'dm-adj-val' + (_ms.ps <= 0 ? ' chance' : '');

  const mv = m.querySelector('#dm-mod-val');
  const mod = _ms.mod;
  mv.textContent = mod === 0 ? '0' : mod > 0 ? '+' + mod : String(mod);
  mv.className = 'dm-adj-val' + (mod > 0 ? ' pos' : mod < 0 ? ' neg' : '');

  // Effective pool
  const eff = _effPool();
  const effEl = m.querySelector('#dm-eff');
  if (eff <= 0) {
    effEl.innerHTML = 'Effective: <b class="dm-chance">Chance die</b>';
  } else {
    effEl.innerHTML = 'Effective: <b>' + eff + (eff === 1 ? ' die' : ' dice') + '</b>';
  }

  // Again chips
  m.querySelector('#dm-a8').classList.toggle('on', _ms.again === 8);
  m.querySelector('#dm-a9').classList.toggle('on', _ms.again === 9);

  // Modifier chips
  m.querySelector('#dm-rote').classList.toggle('on', _ms.rote);
  m.querySelector('#dm-na').classList.toggle('on', _ms.na);
  m.querySelector('#dm-wp').classList.toggle('on', _ms.wp);

  // Specialty badges
  const specEl = m.querySelector('#dm-specs');
  const pi = _ms.pi;
  const c = state.rollChar || state.sheetChar;
  if (pi?.skill && c) {
    const specs = skSpecs(c, pi.skill);
    if (specs.length) {
      const na = skNineAgain(c, pi.skill);
      specEl.innerHTML = specs.map(s => {
        const aoe = hasAoE(c, s);
        const bonusN = na || aoe ? 2 : 1;
        const bonusLbl = na ? '2 (9\u2011again)' : aoe ? '2 (AoE)' : '1';
        const isOn = _ms.specBonuses[s] !== undefined;
        return `<span class="dm-spec-badge${isOn ? ' on' : ''}" data-spec="${s}" data-bonus="${bonusN}">${s} <span class="dm-spec-bonus">+${bonusLbl}</span></span>`;
      }).join('');
    } else {
      specEl.innerHTML = '';
    }
  } else {
    specEl.innerHTML = '';
  }

  // Rote eligibility hint
  const roteEl = m.querySelector('#dm-rote');
  if (pi?.roteEligible && !_ms.rote) {
    roteEl.classList.add('dm-rote-eligible');
    roteEl.title = 'PT dot 5: spend 1 WP for Rote quality';
  } else {
    roteEl.classList.remove('dm-rote-eligible');
    roteEl.title = '';
  }

  // Resistance section
  _showResistSection();

  // History
  _renderHist();
}

// ── Roll ──
function _doRoll() {
  // Temporarily override shared dice state for mkDie/mkChain (they read state.AGAIN, state.NA)
  const savedAgain = state.AGAIN;
  const savedNA = state.NA;
  state.AGAIN = _ms.again;
  state.NA = _ms.na;

  const eff = _effPool();
  const resultEl = _modalEl.querySelector('#dm-result');
  const diceEl = _modalEl.querySelector('#dm-dice-area');
  diceEl.innerHTML = '';

  try {
    if (eff <= 0) {
      const v = d10();
      const suc = v === 10;
      const dram = v === 1;
      const cls = dram ? 'd' : suc ? 'e' : 'f';
      const lbl = dram ? 'Dramatic Failure' : suc ? 'Success (Chance)' : 'Failure (Chance)';
      const cnt = dram ? '\u2014' : suc ? '1' : '0';
      resultEl.innerHTML = `<span class="dm-rcnt ${cls}">${cnt}</span><span class="dm-rlbl ${cls}">${lbl}</span>`;
      resultEl.className = 'dm-result on';
      const del = document.createElement('div');
      del.className = 'die cd';
      del.textContent = v;
      diceEl.appendChild(del);
      _addHist('Chance', cls, lbl, cnt);
      return;
    }

    const cA = rollPool(eff);
    const cB = _ms.rote ? rollPool(eff) : null;
    const sA = cntSuc(cA);
    const sB = _ms.rote ? cntSuc(cB) : 0;
    let wC, wS, lC, lS;
    if (_ms.rote && sB > sA) { wC = cB; wS = sB; lC = cA; lS = sA; }
    else { wC = cA; wS = sA; if (_ms.rote) { lC = cB; lS = sB; } }

    // Contested roll (v mode with a selected target)
    if (_ms.resistMode === 'v' && _ms.resistChar && _ms.resistVal > 0) {
      const cR = rollPool(_ms.resistVal);
      const sR = cntSuc(cR);
      const net = wS - sR;
      const won = net > 0;
      const draw = net === 0;
      const cls = won ? (net >= 5 ? 'e' : 's') : 'f';
      const outcome = won ? (net >= 5 ? 'Exceptional Success' : 'Success') : draw ? 'Draw (Failure)' : 'Failure';
      const rName = displayName(_ms.resistChar).split(' ')[0];
      resultEl.innerHTML = `<span class="dm-rcnt ${cls}">${won ? net : wS}</span><span class="dm-rlbl ${cls}">${outcome}</span>`;
      resultEl.className = 'dm-result on';

      const wb = document.createElement('div');
      wb.className = 'rote-blk win';
      wb.innerHTML = `<div class="rote-lbl">You \u2014 ${wS} success${wS !== 1 ? 'es' : ''}</div>`;
      wb.appendChild(_mkColsEl(wC, 0));
      diceEl.appendChild(wb);

      const rb = document.createElement('div');
      rb.className = 'rote-blk' + (won ? '' : ' win');
      rb.innerHTML = `<div class="rote-lbl">${rName} \u2014 ${sR} success${sR !== 1 ? 'es' : ''}</div>`;
      rb.appendChild(_mkColsEl(cR, wC.length + 2));
      diceEl.appendChild(rb);

      _addHist(eff + 'd10', cls, outcome, won ? net : wS);
    } else {
      // Standard (non-contested) roll
      const exc = wS >= 5;
      const cls = wS === 0 ? 'f' : exc ? 'e' : 's';
      const lbl = wS === 0 ? 'Failure' : exc ? 'Exceptional Success' : 'Success';
      resultEl.innerHTML = `<span class="dm-rcnt ${cls}">${wS}</span><span class="dm-rlbl ${cls}">${lbl}</span>`;
      resultEl.className = 'dm-result on';

      if (_ms.rote) {
        const wb = document.createElement('div');
        wb.className = 'rote-blk win';
        wb.innerHTML = `<div class="rote-lbl">Roll 1 \u2014 ${wS} success${wS !== 1 ? 'es' : ''} (selected)</div>`;
        wb.appendChild(_mkColsEl(wC, 0));
        diceEl.appendChild(wb);
        const lb = document.createElement('div');
        lb.className = 'rote-blk';
        lb.innerHTML = `<div class="rote-lbl">Roll 2 \u2014 ${lS} success${lS !== 1 ? 'es' : ''}</div>`;
        lb.appendChild(_mkColsEl(lC, wC.length + 2));
        diceEl.appendChild(lb);
      } else {
        diceEl.appendChild(_mkColsEl(wC, 0));
      }

      _addHist(eff + 'd10', cls, lbl, wS);
    }

    // Auto-reset WP
    if (_ms.wp) { _ms.wp = false; _updUI(); }

  } finally {
    // Restore shared state
    state.AGAIN = savedAgain;
    state.NA = savedNA;
  }
}

// ── Die DOM helpers (mirrors roll.js but local) ──
function _mkDieEl(d, delay, isX) {
  const el = document.createElement('div');
  let cls = d.s ? 'die sd' : 'die fd';
  if (isX) cls += ' ed';
  if (d.x) cls += ' xd';
  el.className = cls;
  el.textContent = d.v;
  el.style.animationDelay = (delay * 40) + 'ms';
  return el;
}

function _mkColsEl(cols, base) {
  const w = document.createElement('div');
  w.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;justify-content:center;';
  let delay = base;
  cols.forEach(col => {
    const ce = document.createElement('div');
    ce.className = 'dcol';
    ce.appendChild(_mkDieEl(col.r, delay++, false));
    col.ch.forEach(child => {
      const conn = document.createElement('div');
      conn.className = 'xconn';
      ce.appendChild(conn);
      ce.appendChild(_mkDieEl(child, delay++, true));
    });
    w.appendChild(ce);
  });
  return w;
}

// ── History ──
function _addHist(pool, cls, lbl, cnt) {
  const pi = _ms.pi;
  const title = _modalEl?.querySelector('#dm-title')?.textContent || 'Roll';
  _hist.unshift({ title, pool, cls, lbl, cnt, ts: Date.now() });
  if (_hist.length > 30) _hist.length = 30;
  _saveHist();
  _renderHist();
}

function _renderHist() {
  const el = _modalEl?.querySelector('#dm-hist-list');
  if (!el) return;
  if (!_hist.length) { el.innerHTML = '<div class="dm-hist-empty">No rolls yet</div>'; return; }
  el.innerHTML = _hist.map(r =>
    `<div class="dm-hist-item"><span class="dm-hist-name">${r.title}</span><span class="dm-hist-res ${r.cls}">${r.cnt} ${r.lbl}</span></div>`
  ).join('');
}

function _clearHist() {
  _hist = [];
  _saveHist();
  _renderHist();
}
