/* Status tab — hierarchical city / clan / covenant standing.
 *
 * Layout:
 *   City Status — full-width section with apex/high-seat/floor slot architecture
 *   Clan Status  │  Covenant Status  — two columns below, each with same slot arch
 *
 * Slot architecture (shared across all three views):
 *   Apex      — rank 5 (clan/cov) or city rank 10: single prominent card, shown even when vacant
 *   High seats — rank 4 (clan/cov) or city ranks 9–8: pair of cards, shown even when vacant
 *   Open floor — ranks below: compact scrollable rows
 *
 * Composite dot display (city only):
 *   ● innate (status.city stored value)
 *   ◐ title-derived bonus (from COURT_TITLE_BONUS map)
 */

import { apiGet } from '../data/api.js';
import { esc, displayName, sortName, clanIcon, covIcon, redactPlayer, discordAvatarUrl, isRedactMode } from '../data/helpers.js';

// ── Court title → city status bonus (Damnation City rules) ─────────────────
const COURT_TITLE_BONUS = {
  'Premier':       3, // Head of State
  'Seneschal':     3, // Head of State variant
  'Primogen':      2,
  'Harpy':         1, // Socialite
  'Enforcer':      1,
  'Sheriff':       1, // Enforcer variant
  'Hound':         1, // Enforcer sub-role
  'Administrator': 1,
  'Notary':        1, // Administrator variant
  'Regent':        0,
};

function titleBonus(c)         { return COURT_TITLE_BONUS[c.court_title] || 0; }
function effectiveCityStatus(c){ return (c.status?.city || 0) + titleBonus(c); }

// ── Avatar helper ────────────────────────────────────────────────────────────
function avatarUrl(c) {
  const pi = c._player_info || {};
  if (isRedactMode() || !pi.discord_id || !pi.discord_avatar) {
    if (isRedactMode()) return discordAvatarUrl(null, null);
    let h = 0;
    const s = String(c._id || c.name || '');
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return `https://cdn.discordapp.com/embed/avatars/${Math.abs(h) % 6}.png`;
  }
  return discordAvatarUrl(pi.discord_id, pi.discord_avatar, 64);
}

// ── Dot helpers ──────────────────────────────────────────────────────────────
// Plain dots — for clan and covenant views
function statusDots(n, max = 5) {
  const v = Math.max(0, Math.min(max, n | 0));
  return '\u25CF'.repeat(v) + '\u25CB'.repeat(max - v);
}

// Composite dots — city only: ● innate, ◐ title-derived, ○ empty
function cityStatusDots(c) {
  const innate = Math.max(0, Math.min(10, c.status?.city || 0));
  const bonus  = Math.min(10 - innate, titleBonus(c));
  const empty  = 10 - innate - bonus;
  return (
    `<span class="status-dot-innate">${'\u25CF'.repeat(innate)}</span>` +
    `<span class="status-dot-bonus">${'\u25D0'.repeat(bonus)}</span>` +
    `<span class="status-dot-empty">${'\u25CB'.repeat(empty)}</span>`
  );
}

// ── Compact floor row (unchanged from original) ───────────────────────────
function renderRow(c, val, rank, isMe) {
  return `<div class="status-row${isMe ? ' status-row-me' : ''}">
    <span class="status-rank">${rank}</span>
    <img class="status-avatar" src="${esc(avatarUrl(c))}" alt="" loading="lazy">
    <div class="status-name-wrap">
      <div class="status-name">${esc(displayName(c))}</div>
      ${c.player ? `<div class="status-player">${esc(redactPlayer(c.player))}</div>` : ''}
    </div>
    <span class="status-dots">${statusDots(val)}</span>
    <span class="status-val">${val}</span>
  </div>`;
}

// ── Slot cards ────────────────────────────────────────────────────────────────
function renderApexCard(c, activeId, valFn, dotsFn) {
  if (!c) {
    return `<div class="status-apex status-vacant"><span class="status-vacant-label">Vacant</span></div>`;
  }
  const isMe = String(c._id) === activeId;
  return `<div class="status-apex${isMe ? ' status-slot-me' : ''}">
    <img class="status-apex-avatar" src="${esc(avatarUrl(c))}" alt="" loading="lazy">
    <div class="status-apex-info">
      <div class="status-apex-name">${esc(displayName(c))}</div>
      ${c.player ? `<div class="status-apex-player">${esc(redactPlayer(c.player))}</div>` : ''}
      ${c.court_title ? `<div class="status-apex-title">${esc(c.court_title)}</div>` : ''}
    </div>
    <div class="status-apex-score">
      <div class="status-apex-dots">${dotsFn(c)}</div>
      <div class="status-apex-val">${valFn(c)}</div>
    </div>
  </div>`;
}

function renderHighSeatCard(c, activeId, valFn, dotsFn) {
  if (!c) {
    return `<div class="status-high status-vacant"><span class="status-vacant-label">Vacant</span></div>`;
  }
  const isMe = String(c._id) === activeId;
  return `<div class="status-high${isMe ? ' status-slot-me' : ''}">
    <img class="status-high-avatar" src="${esc(avatarUrl(c))}" alt="" loading="lazy">
    <div class="status-high-info">
      <div class="status-high-name">${esc(displayName(c))}</div>
      ${c.player ? `<div class="status-high-player">${esc(redactPlayer(c.player))}</div>` : ''}
      ${c.court_title ? `<div class="status-high-title">${esc(c.court_title)}</div>` : ''}
    </div>
    <div class="status-high-score">
      <div class="status-high-dots">${dotsFn(c)}</div>
      <div class="status-high-val">${valFn(c)}</div>
    </div>
  </div>`;
}

// ── City Status section (full-width) ─────────────────────────────────────────
function renderCitySection(chars, activeId) {
  const sorted = [...chars].sort((a, b) =>
    effectiveCityStatus(b) - effectiveCityStatus(a) ||
    sortName(a).localeCompare(sortName(b))
  );

  const apexChar  = sorted.find(c => effectiveCityStatus(c) === 10) || null;
  const highChars = sorted.filter(c => { const v = effectiveCityStatus(c); return v >= 8 && v < 10; }).slice(0, 4);
  const floorChars = sorted.filter(c => effectiveCityStatus(c) < 8);

  // Always show at least 2 high-seat placeholders; keep pairs even
  const highSlots = [...highChars];
  while (highSlots.length < 2) highSlots.push(null);
  if (highSlots.length % 2 !== 0) highSlots.push(null);

  const dotsFn = c => cityStatusDots(c);
  const valFn  = c => effectiveCityStatus(c);

  let h = `<div class="status-city-section">`;
  h += `<div class="status-section-head">`;
  h += `<span class="status-section-title">City Status</span>`;
  h += `<span class="status-section-caps">1@10 · 2@9 · 2@8 · 3@7 · 3@6 · 4@5 · 4@4 · open</span>`;
  h += `</div>`;

  h += `<div class="status-apex-row">${renderApexCard(apexChar, activeId, valFn, dotsFn)}</div>`;

  h += `<div class="status-high-row">`;
  for (const c of highSlots) h += renderHighSeatCard(c, activeId, valFn, dotsFn);
  h += `</div>`;

  if (floorChars.length) {
    h += `<div class="status-floor">`;
    floorChars.forEach((c, i) => {
      h += renderRow(c, effectiveCityStatus(c), i + 1, String(c._id) === activeId);
    });
    h += `</div>`;
  }

  h += `</div>`;
  return h;
}

// ── Clan / Covenant section (column, with slot arch) ─────────────────────────
function renderStatusSection(heading, headingIcon, rows, activeId, placeholder) {
  const apexChar  = rows.find(r => r.val === 5)?.c || null;
  const highChars = rows.filter(r => r.val === 4).map(r => r.c);
  const floorRows = rows.filter(r => r.val < 4);

  const valMap = new Map(rows.map(r => [String(r.c._id), r.val]));
  const valFn  = c => valMap.get(String(c._id)) || 0;
  const dotsFn = c => statusDots(valFn(c), 5);

  const highSlots = [...highChars];
  while (highSlots.length < 2) highSlots.push(null);

  let h = `<div class="status-col">`;
  h += `<div class="status-col-head">${headingIcon} <span>${esc(heading)}</span>`;
  h += `<span class="status-section-caps">1@5 · 2@4 · open</span>`;
  h += `</div>`;

  if (!rows.length) {
    h += `<p class="placeholder-msg status-empty">${esc(placeholder)}</p>`;
  } else {
    h += `<div class="status-apex-row status-apex-row--col">${renderApexCard(apexChar, activeId, valFn, dotsFn)}</div>`;

    h += `<div class="status-high-row">`;
    for (const c of highSlots) h += renderHighSeatCard(c, activeId, valFn, dotsFn);
    h += `</div>`;

    if (floorRows.length) {
      h += `<div class="status-floor">`;
      floorRows.forEach((r, i) => {
        h += renderRow(r.c, r.val, i + 1, String(r.c._id) === activeId);
      });
      h += `</div>`;
    }
  }

  h += `</div>`;
  return h;
}

// ── Main render ──────────────────────────────────────────────────────────────
export async function renderStatusTab(el, activeChar) {
  if (!el) return;
  if (!activeChar) {
    el.innerHTML = '<p class="placeholder-msg">Select a character first.</p>';
    return;
  }

  el.innerHTML = '<p class="placeholder-msg">Loading\u2026</p>';

  let chars;
  try {
    chars = await apiGet('/api/characters/status');
  } catch (err) {
    el.innerHTML = `<p class="placeholder-msg">Failed to load status data: ${esc(err.message)}</p>`;
    return;
  }

  const activeId = String(activeChar._id);

  const clanRows = chars
    .filter(c => c.clan && c.clan === activeChar.clan)
    .map(c => ({ c, val: c.status?.clan || 0 }))
    .sort((a, b) => b.val - a.val || sortName(a.c).localeCompare(sortName(b.c)));

  const covRows = chars
    .filter(c => c.covenant && c.covenant === activeChar.covenant)
    .map(c => ({ c, val: c.status?.covenant || 0 }))
    .sort((a, b) => b.val - a.val || sortName(a.c).localeCompare(sortName(b.c)));

  let h = renderCitySection(chars, activeId);

  h += `<div class="status-split">`;
  h += renderStatusSection(
    activeChar.clan || 'No clan',
    activeChar.clan ? clanIcon(activeChar.clan, 18) : '',
    clanRows,
    activeId,
    activeChar.clan ? 'No other members in your clan.' : 'Your character has no clan set.'
  );
  h += renderStatusSection(
    activeChar.covenant || 'No covenant',
    activeChar.covenant ? covIcon(activeChar.covenant, 18) : '',
    covRows,
    activeId,
    activeChar.covenant ? 'No other members in your covenant.' : 'Your character has no covenant set.'
  );
  h += `</div>`;

  el.innerHTML = h;
}
