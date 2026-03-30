// ══════════════════════════════════════════════
//  Sheet Helpers — display helpers, toggles, expandable rows
// ══════════════════════════════════════════════

import state from './data.js';
import {
  MERITS_DB, SORCERY_THEMES, RITUAL_DISCS
} from './data.js';
import { getAttrVal, getAttrBonus as _getAttrBonus, skDots, skSpecs, skSpecStr } from '../data/accessors.js';

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
  return getAttrVal(c, a);
}

export function getAttrBonus(c, a) {
  return _getAttrBonus(c, a);
}

export function skillDots(v) {
  return v ? (v.dots || 0) : 0;
}

export function skillSpec(v) {
  return v ? (v.specs || []).join(', ') : '';
}

// ── Merit parsing ──

/**
 * Merit helpers — accept either a v2 merit object or a legacy string.
 * v2 objects: { category, name, rating, area, qualifier, ... }
 * Legacy strings: "Allies ●●●" or "Library (Occult) ●●|description"
 */
export function meritBase(m) {
  if (typeof m === 'object' && m !== null) {
    const base = m.name || '';
    return m.area ? `${base} (${m.area})` : (m.qualifier ? `${base} (${m.qualifier})` : base);
  }
  return m.replace(/\s*[\u25CF\u25CB]+.*/,'').replace(/\s*\|.*/,'').trim();
}

export function meritDotCount(m) {
  if (typeof m === 'object' && m !== null) return m.rating || 0;
  return (m.match(/\u25CF/g) || []).length;
}

export function meritSuffix(m) {
  if (typeof m === 'object' && m !== null) return m.manoeuvre || null;
  const match = m.match(/\|\s*(.+)$/);
  return match ? match[1].trim() : null;
}

export function meritKey(m) {
  return meritBase(m).toLowerCase();
}

export function meritKeyBase(m) {
  return meritKey(m).replace(/\s*\([^)]*\)\s*/g, '').trim();
}

export function meritLookup(m) {
  const k = meritKey(m);
  if (MERITS_DB[k]) return MERITS_DB[k];
  const kb = meritKeyBase(m);
  if (MERITS_DB[kb]) return MERITS_DB[kb];
  return null;
}

// ── Power helpers ──

export function powersForDisc(powers, discName) {
  // v2 powers have category/discipline fields
  return powers.filter(p => {
    if (p.discipline === discName) return true;
    // Fallback for legacy pipe-delimited name matching
    if (SORCERY_THEMES.includes(discName)) {
      return p.name.includes('| ' + discName) || p.name.startsWith(discName);
    }
    if (RITUAL_DISCS.includes(discName)) {
      return p.name.startsWith(discName + ' |') ||
        p.name.startsWith(discName + '|') ||
        p.name.includes('| ' + discName + ' ') ||
        p.name.toLowerCase().startsWith(discName.toLowerCase() + ' \u25CF') ||
        p.name.toLowerCase().startsWith(discName.toLowerCase() + '\u25CF');
    }
    return p.name === discName ||
      p.name.startsWith(discName + ' ') ||
      p.name.startsWith(discName + '|');
  });
}

export function otherPowers(c) {
  // v2: devotions, rites, pacts have their own category
  return (c.powers || []).filter(p =>
    p.category === 'devotion' || p.category === 'rite' || p.category === 'pact'
  );
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
