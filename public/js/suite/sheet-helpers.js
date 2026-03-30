// ══════════════════════════════════════════════
//  Sheet Helpers — display helpers, toggles, expandable rows
// ══════════════════════════════════════════════

import state from './data.js';
import {
  MERITS_DB, SORCERY_THEMES, RITUAL_DISCS
} from './data.js';

// ── Dot display ──

export function dots(n) {
  return '\u25CF'.repeat(Math.max(0, n || 0));
}

export function dotsWithBonus(base, bonus) {
  const b = Math.max(0, base || 0), x = Math.max(0, bonus || 0);
  if (!x) return dots(b);
  return '\u25CF'.repeat(b) + '<span style="color:rgba(220,200,150,.45);letter-spacing:2.5px">\u25CB'.repeat(x) + '</span>';
}

export function getAttrDots(c, a) {
  const raw = c.attributes ? c.attributes[a] : 0;
  return typeof raw === 'object' ? (raw.dots || 0) : (raw || 0);
}

export function getAttrBonus(c, a) {
  const raw = c.attributes ? c.attributes[a] : 0;
  return typeof raw === 'object' ? (raw.bonus_dots || 0) : 0;
}

export function skillDots(v) {
  return typeof v === 'object' ? (v.dots || 0) : (v || 0);
}

export function skillSpec(v) {
  return typeof v === 'object' ? (v.spec || '') : '';
}

// ── Merit parsing ──

export function meritBase(s) {
  return s.replace(/\s*[\u25CF\u25CB]+.*/,'').replace(/\s*\|.*/,'').trim();
}

export function meritDotCount(s) {
  return (s.match(/\u25CF/g) || []).length;
}

export function meritSuffix(s) {
  const m = s.match(/\|\s*(.+)$/);
  return m ? m[1].trim() : null;
}

export function meritKey(s) {
  return meritBase(s).toLowerCase();
}

export function meritKeyBase(s) {
  return meritKey(s).replace(/\s*\([^)]*\)\s*/g, '').trim();
}

export function meritLookup(s) {
  const k = meritKey(s);
  if (MERITS_DB[k]) return MERITS_DB[k];
  // Strip parenthetical qualifier and try again: "library (occult)" -> "library"
  const kb = meritKeyBase(s);
  if (MERITS_DB[kb]) return MERITS_DB[kb];
  return null;
}

// ── Power helpers ──

export function powersForDisc(powers, discName) {
  if (SORCERY_THEMES.includes(discName)) {
    return powers.filter(p => p.name.includes('| ' + discName) || p.name.startsWith(discName));
  }
  if (RITUAL_DISCS.includes(discName)) {
    return powers.filter(p =>
      p.name.startsWith(discName + ' |') ||
      p.name.startsWith(discName + '|') ||
      p.name.includes('| ' + discName + ' ') ||
      p.name.toLowerCase().startsWith(discName.toLowerCase() + ' \u25CF') ||
      p.name.toLowerCase().startsWith(discName.toLowerCase() + '\u25CF')
    );
  }
  return powers.filter(p =>
    p.name === discName ||
    p.name.startsWith(discName + ' ') ||
    p.name.startsWith(discName + '|')
  );
}

export function otherPowers(c) {
  const all = Object.keys(c.disciplines || {});
  const allSorcery = [...SORCERY_THEMES, ...RITUAL_DISCS];
  return (c.powers || []).filter(p => !all.some(d => {
    if (allSorcery.includes(d)) {
      if (SORCERY_THEMES.includes(d)) return p.name.includes('| ' + d);
      return p.name.startsWith(d + ' |') || p.name.startsWith(d + '|') || p.name.includes('| ' + d + ' ');
    }
    return p.name === d || p.name.startsWith(d + ' ') || p.name.startsWith(d + '|');
  }));
}

// ── Toggle expand ──

export function toggleExp(id) {
  const row = document.getElementById('exp-row-' + id);
  const body = document.getElementById('exp-body-' + id);
  if (!row || !body) return;
  const wasOpen = state.openExpId === id;
  // Close any open
  if (state.openExpId !== null) {
    const or = document.getElementById('exp-row-' + state.openExpId);
    const ob = document.getElementById('exp-body-' + state.openExpId);
    if (or) or.classList.remove('open');
    if (ob) ob.classList.remove('visible');
  }
  state.openExpId = null;
  if (!wasOpen) {
    row.classList.add('open');
    body.classList.add('visible');
    state.openExpId = id;
  }
}

// ── Toggle discipline drawer ──

export function toggleDisc(id) {
  const row = document.getElementById('disc-row-' + id);
  const drawer = document.getElementById('disc-drawer-' + id);
  if (!row || !drawer) return;
  const isOpen = row.classList.contains('open');
  row.classList.toggle('open', !isOpen);
  drawer.classList.toggle('visible', !isOpen);
}

// ── Build expandable row HTML ──

export function expRow(id, lbl, val, bodyHtml) {
  return `<div class="exp-row" id="exp-row-${id}" onclick="toggleExp('${id}')">
    ${lbl ? `<span class="exp-lbl labeled">${lbl}</span>` : ''}
    <span class="exp-val">${val}</span>
    <span class="exp-arr">\u203A</span>
  </div>
  <div class="exp-body" id="exp-body-${id}">${bodyHtml}</div>`;
}

// ── Expose to inline onclick handlers in rendered HTML ──
window.toggleExp = toggleExp;
window.toggleDisc = toggleDisc;
