/* combat-tab.js — ST scene-level combat management tool.
 *
 * Session-persistent via sessionStorage key 'tm_combat_scene'.
 * Damage writes use trackerAdj() → existing PUT /api/tracker_state/:id.
 * No new MongoDB collections.
 */

import suiteState from '../suite/data.js';
import { getAttrEffective, calcDefence, calcHealth } from '../data/accessors.js';
import { esc } from '../data/helpers.js';
import { trackerAdj, trackerRead } from './tracker.js';
import { loadPool, doRoll } from '../suite/roll.js';

const SESSION_KEY = 'tm_combat_scene';
const d10 = () => Math.floor(Math.random() * 10) + 1;

// ── State ─────────────────────────────────────────────────────────────────────
let _el = null;
let _scene = null; // { combatants: [...], round: 1, activeIdx: 0 }

function _save() {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(_scene)); } catch { /* ignore */ }
}

function _load() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}

function _clearScene() {
  _scene = null;
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function skDots(c, skill) {
  return c.skills?.[skill]?.dots || 0;
}

function aval(c, attr) {
  return getAttrEffective(c, attr);
}

function _initPool(c) { return aval(c, 'Dexterity') + aval(c, 'Composure'); }

function _attackPools(c) {
  const pools = [];
  const brawl = aval(c, 'Strength') + skDots(c, 'Brawl');
  const weap  = aval(c, 'Strength') + skDots(c, 'Weaponry');
  const fire  = aval(c, 'Dexterity') + skDots(c, 'Firearms');
  if (brawl > 0) pools.push({ label: 'Brawl',    pool: brawl, attr: 'Strength',  skill: 'Brawl',    dmg: 'B' });
  if (weap  > 0) pools.push({ label: 'Weaponry', pool: weap,  attr: 'Strength',  skill: 'Weaponry', dmg: 'L' });
  if (fire  > 0) pools.push({ label: 'Firearms', pool: fire,  attr: 'Dexterity', skill: 'Firearms', dmg: 'L' });
  return pools;
}

function _combatantFromChar(c) {
  const id = String(c._id);
  const ts = trackerRead(id) || {};
  return {
    charId: id,
    name: c.moniker || c.name,
    initiative: null,
    initBase: _initPool(c),
    defence: calcDefence(c),
    defenceUsed: false,
    maxHp: calcHealth(c),
    attackPools: _attackPools(c),
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export function initCombatTab(el) {
  _el = el;
  _scene = _load();
  render();
}

function rollInitiative() {
  if (!_scene) return;
  _scene.combatants.forEach(cb => {
    cb.initiative = cb.initBase + d10();
    cb.defenceUsed = false;
  });
  _scene.combatants.sort((a, b) => {
    if (b.initiative !== a.initiative) return b.initiative - a.initiative;
    return b.initBase - a.initBase;
  });
  _scene.activeIdx = 0;
  _scene.round = 1;
  _save();
  render();
}

function nextRound() {
  if (!_scene) return;
  _scene.round++;
  _scene.activeIdx = 0;
  _scene.combatants.forEach(cb => { cb.defenceUsed = false; });
  _save();
  render();
}

function nextTurn() {
  if (!_scene) return;
  const alive = _scene.combatants.filter(cb => !_isIncap(cb));
  const curActive = _scene.combatants[_scene.activeIdx];
  const curAliveIdx = alive.indexOf(curActive);
  const nextAlive = alive[(curAliveIdx + 1) % alive.length];
  _scene.activeIdx = _scene.combatants.indexOf(nextAlive);
  _save();
  render();
}

function toggleDefence(charId) {
  if (!_scene) return;
  const cb = _scene.combatants.find(c => c.charId === charId);
  if (cb) { cb.defenceUsed = !cb.defenceUsed; _save(); render(); }
}

function removeCombatant(charId) {
  if (!_scene) return;
  _scene.combatants = _scene.combatants.filter(c => c.charId !== charId);
  if (_scene.activeIdx >= _scene.combatants.length) _scene.activeIdx = 0;
  _save();
  render();
}

function endCombat() {
  _clearScene();
  render();
}

async function applyDmg(charId, field, delta) {
  await trackerAdj(charId, field, delta);
  render();
}

function quickRoll(charId, pool, label) {
  const c = (suiteState.chars || []).find(x => String(x._id) === charId);
  if (!c) return;
  suiteState.rollChar = c;
  loadPool(pool, label, { total: pool });
  // Navigate to dice tab to show the roll
  if (window.goTab) window.goTab('dice');
}

function _isIncap(cb) {
  const ts = trackerRead(cb.charId);
  if (!ts) return false;
  const dmg = (ts.bashing || 0) + (ts.lethal || 0) + (ts.aggravated || 0);
  return dmg >= cb.maxHp;
}

// ── Render ────────────────────────────────────────────────────────────────────

function render() {
  if (!_el) return;
  if (!_scene || !_scene.combatants.length) {
    renderSetup();
  } else if (_scene.combatants[0].initiative === null) {
    renderPreRoll();
  } else {
    renderRound();
  }
}

function renderSetup() {
  const chars = (suiteState.chars || []).filter(c => !c.retired).sort((a, b) =>
    (a.moniker || a.name).localeCompare(b.moniker || b.name)
  );
  let h = '<div class="cbt-wrap"><div class="cbt-setup">';
  h += '<div class="cbt-setup-title">Select combatants</div>';
  h += '<div class="cbt-char-grid">';
  chars.forEach(c => {
    const id = String(c._id);
    h += `<button class="cbt-char-btn" onclick="combatAddChar('${esc(id)}')">${esc(c.moniker || c.name)}</button>`;
  });
  h += '</div>';
  h += '<div class="cbt-selected-list" id="cbt-selected"><p class="cbt-hint">No combatants selected</p></div>';
  h += '<button class="cbt-roll-init-btn" id="cbt-start-btn" style="display:none" onclick="combatStart()">Roll Initiative</button>';
  h += '</div></div>';
  _el.innerHTML = h;
  _scene = { combatants: [], round: 0, activeIdx: 0 };
}

function renderPreRoll() {
  let h = '<div class="cbt-wrap">';
  h += `<div class="cbt-header"><span class="cbt-round-lbl">Combatants ready</span><div class="cbt-actions"><button class="cbt-roll-init-btn" onclick="combatRollInit()">Roll Initiative</button><button class="cbt-end-btn" onclick="combatEnd()">End Combat</button></div></div>`;
  h += '<div class="cbt-list">';
  _scene.combatants.forEach(cb => {
    const c = (suiteState.chars || []).find(x => String(x._id) === cb.charId);
    h += `<div class="cbt-row"><span class="cbt-init-slot">—</span><span class="cbt-name">${esc(cb.name)}</span><span class="cbt-def">DEF ${cb.defence}</span><button class="cbt-rm-btn" onclick="combatRemove('${esc(cb.charId)}')">✕</button></div>`;
  });
  h += '</div></div>';
  _el.innerHTML = h;
}

function renderRound() {
  const active = _scene.combatants[_scene.activeIdx];
  let h = '<div class="cbt-wrap">';
  h += `<div class="cbt-header"><span class="cbt-round-lbl">Round ${_scene.round}</span><div class="cbt-actions"><button class="cbt-next-btn" onclick="combatNextTurn()">Next Turn</button><button class="cbt-round-btn" onclick="combatNextRound()">Next Round</button><button class="cbt-end-btn" onclick="combatEnd()">End Combat</button></div></div>`;
  h += '<div class="cbt-list">';

  _scene.combatants.forEach((cb, idx) => {
    const isActive = idx === _scene.activeIdx;
    const incap = _isIncap(cb);
    const ts = trackerRead(cb.charId) || {};
    const dmg = (ts.bashing || 0) + (ts.lethal || 0) + (ts.aggravated || 0);
    const hp = cb.maxHp;
    const defLabel = cb.defenceUsed ? `<span class="cbt-def-used">DEF used</span>` : `<span class="cbt-def">DEF ${cb.defence}</span>`;

    // Health boxes
    let boxes = '';
    for (let i = 0; i < Math.min(hp, 15); i++) {
      let cls = 'cbt-box';
      if (i < (ts.aggravated || 0)) cls += ' cbt-agg';
      else if (i < (ts.aggravated || 0) + (ts.lethal || 0)) cls += ' cbt-let';
      else if (i < dmg) cls += ' cbt-bash';
      boxes += `<span class="${cls}"></span>`;
    }

    // Attack pool buttons
    let poolBtns = '';
    cb.attackPools.forEach(ap => {
      poolBtns += `<button class="cbt-pool-btn" onclick="combatQuickRoll('${esc(cb.charId)}',${ap.pool},'${esc(ap.label)}')">${ap.label} ${ap.pool}d</button>`;
    });

    // Damage controls
    const dmgCtrl = `<div class="cbt-dmg-ctrl">
      <span class="cbt-dmg-lbl">Dmg:</span>
      <button class="cbt-dmg-btn bash" onclick="combatDmg('${esc(cb.charId)}','bashing',1)">+B</button>
      <button class="cbt-dmg-btn let" onclick="combatDmg('${esc(cb.charId)}','lethal',1)">+L</button>
      <button class="cbt-dmg-btn agg" onclick="combatDmg('${esc(cb.charId)}','aggravated',1)">+A</button>
      <button class="cbt-dmg-btn heal" onclick="combatDmg('${esc(cb.charId)}','bashing',-1)">−</button>
    </div>`;

    h += `<div class="cbt-row${isActive ? ' cbt-active' : ''}${incap ? ' cbt-incap' : ''}">
      <div class="cbt-row-top">
        <span class="cbt-init-slot">${cb.initiative}</span>
        <span class="cbt-name">${esc(cb.name)}${incap ? ' <span class="cbt-incap-lbl">Incapacitated</span>' : ''}</span>
        <span class="cbt-hp-boxes">${boxes}</span>
        ${defLabel}
        <button class="cbt-def-toggle" onclick="combatToggleDef('${esc(cb.charId)}')" title="Toggle defence used">${cb.defenceUsed ? '↩' : '🛡'}</button>
      </div>
      <div class="cbt-row-bot">${poolBtns}${dmgCtrl}</div>
    </div>`;
  });

  h += '</div></div>';
  _el.innerHTML = h;
}

// ── Window-exposed functions ──────────────────────────────────────────────────

window.combatAddChar = function(charId) {
  if (!_scene) _scene = { combatants: [], round: 0, activeIdx: 0 };
  if (_scene.combatants.find(c => c.charId === charId)) return;
  const c = (suiteState.chars || []).find(x => String(x._id) === charId);
  if (!c) return;
  _scene.combatants.push(_combatantFromChar(c));
  _save();
  // Update selected list
  const selEl = document.getElementById('cbt-selected');
  const startBtn = document.getElementById('cbt-start-btn');
  if (selEl) {
    selEl.innerHTML = _scene.combatants.map(cb =>
      `<span class="cbt-sel-chip">${esc(cb.name)} <button onclick="combatRemove('${esc(cb.charId)}')">✕</button></span>`
    ).join('');
  }
  if (startBtn) startBtn.style.display = _scene.combatants.length >= 1 ? '' : 'none';
};

window.combatStart = function() {
  if (!_scene || !_scene.combatants.length) return;
  renderPreRoll();
};

window.combatRollInit = function() { rollInitiative(); };
window.combatNextRound = function() { nextRound(); };
window.combatNextTurn = function() { nextTurn(); };
window.combatEnd = function() { endCombat(); };
window.combatRemove = function(id) { removeCombatant(id); };
window.combatToggleDef = function(id) { toggleDefence(id); };
window.combatDmg = function(id, field, delta) { applyDmg(id, field, delta); };
window.combatQuickRoll = function(id, pool, label) { quickRoll(id, pool, label); };
