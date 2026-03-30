/**
 * main.js — Suite app entry point.
 *
 * Orchestrates initialisation, tab switching, character loading,
 * import banner, and picker panel. Registers all window-level functions
 * needed by inline onclick/onchange handlers in index.html.
 */

import state, { CHARS_DATA, DISC } from './data.js';
import { mountTerr } from './territory.js';
import {
  handleImport as _handleImport,
  handleDtImport as _handleDtImport,
  setImportCallbacks,
} from './import.js';
import { loadPool, chgPool, chgMod, updPool, setAgain, togMod, doRoll, clrHist, effPool } from './roll.js';
import { onSheetChar, renderSheet } from './sheet.js';
import { toggleExp, toggleDisc } from './sheet-helpers.js';
import { updResist, showResistSec } from '../shared/resist.js';
import { getPool } from '../shared/pools.js';
import {
  renderStOverview as _renderStOverview, stPickChar, stResetAll, stApplyDowntime,
  stDismiss, toast as _toast, togglePrestige, stLogDt
} from './tracker.js';
import { feedToggle, feedBuildPool, feedRoll, feedReset, feedAdjApply, feedApplyVitae, feedSelectMethod } from './tracker-feed.js';

// ══════════════════════════════════════════════
//  FORWARD REFERENCES
// ══════════════════════════════════════════════
// These functions live in the inline <script> block (not yet extracted).
// main.js calls them but they are defined on window by other code.
// We access them lazily so load order does not matter.

function renderStOverview() { _renderStOverview(); }
function toast(msg) { _toast(msg); }

// ══════════════════════════════════════════════
//  LOAD CHARS
// ══════════════════════════════════════════════

export function loadChars() {
  let data = CHARS_DATA;
  try {
    const stored = localStorage.getItem('tm_import_chars');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length) data = parsed;
    }
  } catch (e) { /* ignore */ }
  const chars = data.slice().sort((a, b) => a.name.localeCompare(b.name));
  state.chars = chars;
  window._charNames = chars.map(c => c.name);

  const sel = document.getElementById('char-sel');
  if (sel) {
    sel.innerHTML = '<option value="">\u2014 Select character \u2014</option>';
    chars.forEach(c => {
      const o = document.createElement('option');
      o.value = c.name;
      o.textContent = c.name;
      sel.appendChild(o);
    });
  }
  const ssel = document.getElementById('st-char-sel');
  if (ssel) {
    ssel.innerHTML = '<option value="">\u2014 Select character \u2014</option>';
    chars.forEach(c => {
      const o = document.createElement('option');
      o.value = c.name;
      o.textContent = c.name;
      ssel.appendChild(o);
    });
  }
  renderImportBanner();
}

// ══════════════════════════════════════════════
//  IMPORT BANNER
// ══════════════════════════════════════════════

export function renderImportBanner() {
  const el = document.getElementById('import-banner');
  if (!el) return;
  try {
    const meta = localStorage.getItem('tm_import_meta');
    if (meta) {
      const m = JSON.parse(meta);
      el.style.display = '';
      el.innerHTML = `<div class="import-banner"><span>Data imported from <b>${m.filename}</b> &mdash; ${m.count} characters &mdash; ${m.date}</span><button class="import-banner-clr" onclick="clearImport()" title="Clear import">\u00d7</button></div>`;
      return;
    }
  } catch (e) { /* ignore */ }
  el.style.display = 'none';
  el.innerHTML = '';
}

export function clearImport() {
  localStorage.removeItem('tm_import_chars');
  localStorage.removeItem('tm_import_meta');
  loadChars();
  renderStOverview();
  toast('Import cleared \u2014 using built-in data');
}

// ══════════════════════════════════════════════
//  TABS
// ══════════════════════════════════════════════

export function goTab(t) {
  document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nbtn').forEach(el => el.classList.remove('on'));
  document.getElementById('t-' + t).classList.add('active');
  document.getElementById('n-' + t).classList.add('on');
  if (t === 'territory') { mountTerr(); }
  if (t === 'st') { renderStOverview(); }
}

// ══════════════════════════════════════════════
//  PICKER PANEL
// ══════════════════════════════════════════════

export function openPanel(mode) {
  state.panelMode = mode;
  const body = document.getElementById('panel-body');
  const title = document.getElementById('panel-title');
  body.innerHTML = '';

  if (mode === 'char') {
    title.textContent = 'Select Character';
    state.chars.forEach(c => {
      const el = document.createElement('div');
      el.className = 'panel-item';
      el.innerHTML = `<div><div class="pi-main">${c.name}</div><div class="pi-sub">${c.clan || ''} \u00B7 ${c.covenant || ''}</div></div><div class="pi-badge">${c.player || ''}</div>`;
      el.addEventListener('click', () => { pickChar(c); closePanel(); });
      body.appendChild(el);
    });
  } else if (mode === 'disc') {
    title.textContent = 'Select Discipline';
    if (!state.rollChar) {
      body.innerHTML = '<div class="hempty" style="padding:24px 16px;">Select a character first</div>';
    } else {
      const powers = state.rollChar.powers || [];
      const groups = {};
      powers.forEach(p => {
        const pi = getPool(state.rollChar, p.name);
        let disc = 'Other';
        if (p.name.includes('|')) {
          const prefix = p.name.split('|')[0];
          const di = prefix.search(/[\u25CF\u25CB]/);
          disc = di > 0 ? prefix.substring(0, di).trim() : prefix.trim();
          if (disc === 'Blood Sorcery') {
            const rest = p.name.split('|')[1].trim();
            const tm = rest.match(/^(Creation|Destruction|Divination|Protection|Transmutation)/);
            disc = tm ? tm[1] + ' (Sorcery)' : 'Blood Sorcery';
          }
        } else {
          const di = p.name.search(/[\u25CF\u25CB]/);
          disc = di > 0 ? p.name.substring(0, di).trim() : 'Other';
        }
        if (!groups[disc]) groups[disc] = [];
        let dispName = p.name;
        if (p.name.includes('|')) dispName = p.name.split('|')[1].trim();
        dispName = dispName.replace(/\s*[\u25CF\u25CB]+\s*$/, '').trim() || dispName;
        groups[disc].push({ raw: p.name, disp: dispName, pi });
      });

      Object.entries(groups).forEach(([disc, items]) => {
        const sec = document.createElement('div');
        sec.className = 'panel-section';
        sec.textContent = disc;
        body.appendChild(sec);
        items.forEach(({ raw, disp, pi }) => {
          const el = document.createElement('div');
          el.className = 'panel-item';
          const hasRoll = pi && !pi.noRoll && pi.total !== undefined;
          let poolEl = '<div class="pi-pool nr">\u2014</div>';
          if (hasRoll) poolEl = '<div class="pi-pool">' + pi.total + '</div>';
          let subStr = '';
          if (hasRoll) subStr = pi.attr + ' + ' + pi.skill + (pi.resistance ? ' \u00B7 vs ' + pi.resistance : '');
          else if (pi && pi.noRoll && pi.info && pi.info.c) subStr = 'Cost: ' + pi.info.c;
          else if (pi && pi.info && pi.info.c) subStr = 'Cost: ' + pi.info.c;
          el.innerHTML = '<div><div class="pi-main">' + disp + '</div>' + (subStr ? '<div class="pi-sub">' + subStr + '</div>' : '') + '</div>' + poolEl;
          el.addEventListener('click', () => {
            if (hasRoll) { loadPool(pi.total, disp, pi); }
            else { toast(disp + ' \u2014 no roll'); closePanel(); }
          });
          body.appendChild(el);
        });
      });
    }
  }

  document.getElementById('panel-overlay').classList.add('on');
  requestAnimationFrame(() => requestAnimationFrame(() =>
    document.getElementById('panel').style.transform = 'translateY(0)'
  ));
}

export function closePanel() {
  const overlay = document.getElementById('panel-overlay');
  if (overlay) overlay.classList.remove('on');
  state.panelMode = null;
}

export function overlayClick(e) {
  if (e.target === document.getElementById('panel-overlay')) closePanel();
}

export function pickChar(c) {
  state.rollChar = c;
  const valEl = document.getElementById('sc-char-val');
  const lblEl = document.getElementById('sc-char-lbl');
  lblEl.textContent = '';
  valEl.textContent = c.name.split(' ')[0];
  document.getElementById('sc-char').classList.add('loaded');
  document.getElementById('sc-disc-lbl').textContent = 'Discipline';
  document.getElementById('sc-disc-val').textContent = '';
  document.getElementById('sc-disc').classList.remove('loaded');
  document.getElementById('pool-banner').classList.remove('on');
  state.POOL_INFO = null;
  state.RESIST_CHAR = null;
  state.RESIST_VAL = 0;
  state.RESIST_MODE = null;
  const sec = document.getElementById('resist-sec');
  if (sec) sec.style.display = 'none';
}

// ══════════════════════════════════════════════
//  WINDOW REGISTRATION
// ══════════════════════════════════════════════
// HTML onclick/onchange attributes reference these as global functions.

Object.assign(window, {
  // Navigation
  goTab, openPanel, closePanel, overlayClick, pickChar,
  // Data
  loadChars, renderImportBanner, clearImport,
  // Roll tab
  chgPool, chgMod, updPool, setAgain, togMod, doRoll, clrHist, loadPool, effPool,
  // Sheet tab
  onSheetChar, renderSheet, toggleExp, toggleDisc,
  // Resistance
  updResist, showResistSec,
  // Tracker tab
  renderStOverview, stPickChar, stResetAll, stApplyDowntime,
  stDismiss, toast, togglePrestige, stLogDt,
  // Feeding
  feedToggle, feedBuildPool, feedRoll, feedReset, feedAdjApply, feedApplyVitae, feedSelectMethod,
  // Import
  handleImport: _handleImport, handleDtImport: _handleDtImport,
  // Territory
  mountTerr, _mountTerr: mountTerr,
});

// ══════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════

// Wire up import callbacks so import.js can trigger app-level actions
setImportCallbacks({
  loadChars,
  renderStOverview,
  toast,
});

// Boot the app
loadChars();
