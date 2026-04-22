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
 * City status dots displayed out of 10 (status.city is the combined total).
 */

import { apiGet } from '../data/api.js';
import { esc, displayName, sortName, clanIcon, covIcon, redactPlayer, discordAvatarUrl, isRedactMode } from '../data/helpers.js';
import { calcCityStatus } from '../data/accessors.js';
import { CITY_STATUS_APPELLATIONS } from '../data/constants.js';

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

// City dots — out of 10, using effective city status (base + court title bonus)
function cityStatusDots(c) {
  return statusDots(calcCityStatus(c), 10);
}

// ── Bracket chip (avatar + name, no per-row dots/rank) ───────────────────────
function renderChip(c, isMe) {
  return `<div class="status-chip${isMe ? ' status-chip-me' : ''}">
    <img class="status-chip-avatar" src="${esc(avatarUrl(c))}" alt="" loading="lazy">
    <span class="status-chip-name">${esc(displayName(c))}</span>
  </div>`;
}

// ── Bracket section: one header + chip row per distinct value ─────────────────
function renderBrackets(groups, activeId, dotsFn) {
  let h = `<div class="status-brackets">`;
  for (const { val, chars } of groups) {
    h += `<div class="status-bracket">`;
    h += `<div class="status-bracket-head">`;
    h += `<span class="status-bracket-dots">${dotsFn(val)}</span>`;
    h += `<span class="status-bracket-val">${val}</span>`;
    h += `</div>`;
    h += `<div class="status-bracket-chips">`;
    for (const c of chars) h += renderChip(c, String(c._id) === activeId);
    h += `</div>`;
    h += `</div>`;
  }
  h += `</div>`;
  return h;
}

// ── Fixed-tier bracket row (always shown, vacant if empty) ────────────────────
function renderTierRow(val, chars, activeId, dotsFn, showAppellation = false) {
  let h = `<div class="status-bracket status-bracket-fixed">`;
  h += `<div class="status-bracket-head">`;
  h += `<span class="status-bracket-dots">${dotsFn(val)}</span>`;
  h += `<span class="status-bracket-val">${val}</span>`;
  if (showAppellation) h += `<span class="status-bracket-appellation">${CITY_STATUS_APPELLATIONS[val] || ''}</span>`;
  h += `</div>`;
  h += `<div class="status-bracket-chips">`;
  if (chars.length) {
    for (const c of chars) h += renderChip(c, String(c._id) === activeId);
  } else {
    h += `<span class="status-vacant-chip">Vacant</span>`;
  }
  h += `</div>`;
  h += `</div>`;
  return h;
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
function cityVal(c) { return calcCityStatus(c); }

function renderCitySection(chars, activeId) {
  const sorted = [...chars].sort((a, b) =>
    cityVal(b) - cityVal(a) ||
    sortName(a).localeCompare(sortName(b))
  );

  const byVal = new Map();
  for (const c of sorted) {
    const v = cityVal(c);
    if (!byVal.has(v)) byVal.set(v, []);
    byVal.get(v).push(c);
  }

  const dotsFn = v => statusDots(v, 10);

  let h = `<div class="status-city-section">`;
  h += `<div class="status-section-head">`;
  h += `<span class="status-section-title">City Status</span>`;
  h += `<span class="status-section-caps">1@10 · 2@9 · 2@8 · 3@7 · 3@6 · 4@5 · 4@4 · open</span>`;
  h += `</div>`;

  h += `<div class="status-brackets">`;
  // Fixed upper tiers always shown
  h += renderTierRow(10, byVal.get(10) || [], activeId, dotsFn, true);
  h += renderTierRow(9,  byVal.get(9)  || [], activeId, dotsFn, true);
  h += renderTierRow(8,  byVal.get(8)  || [], activeId, dotsFn, true);
  // Floor — all remaining values
  const floorChars = sorted.filter(c => cityVal(c) < 8);
  if (floorChars.length) {
    const groups = [];
    for (const c of floorChars) {
      const v = cityVal(c);
      const last = groups[groups.length - 1];
      if (last && last.val === v) last.chars.push(c);
      else groups.push({ val: v, chars: [c] });
    }
    for (const { val, chars } of groups) {
      h += renderTierRow(val, chars, activeId, dotsFn, true);
    }
  }
  h += `</div>`;

  h += `</div>`;
  return h;
}

// ── Clan / Covenant section (column, with slot arch) ─────────────────────────
function renderStatusSection(heading, headingIcon, rows, activeId, placeholder) {
  const byVal = new Map();
  for (const r of rows) {
    if (!byVal.has(r.val)) byVal.set(r.val, []);
    byVal.get(r.val).push(r.c);
  }

  const dotsFn = v => statusDots(v, 5);

  let h = `<div class="status-col">`;
  h += `<div class="status-col-head">${headingIcon} <span>${esc(heading)}</span>`;
  h += `<span class="status-section-caps">1@5 · 2@4 · open</span>`;
  h += `</div>`;

  if (!rows.length) {
    h += `<p class="placeholder-msg status-empty">${esc(placeholder)}</p>`;
  } else {
    h += `<div class="status-brackets">`;
    // Fixed upper tiers always shown
    h += renderTierRow(5, byVal.get(5) || [], activeId, dotsFn);
    h += renderTierRow(4, byVal.get(4) || [], activeId, dotsFn);
    // Floor
    const floorRows = rows.filter(r => r.val < 4);
    if (floorRows.length) {
      const groups = [];
      for (const r of floorRows) {
        const last = groups[groups.length - 1];
        if (last && last.val === r.val) last.chars.push(r.c);
        else groups.push({ val: r.val, chars: [r.c] });
      }
      for (const { val, chars } of groups) {
        h += renderTierRow(val, chars, activeId, dotsFn);
      }
    }
    h += `</div>`;
  }

  h += `</div>`;
  return h;
}

// ── Main render ──────────────────────────────────────────────────────────────
export async function renderStatusTab(el, activeChar, isST = false) {
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
  let h = renderCitySection(chars, activeId);

  if (isST) {
    // ST view: all clans and all covenants, each as its own column
    const clans     = [...new Set(chars.map(c => c.clan).filter(Boolean))].sort();
    const covenants = [...new Set(chars.map(c => c.covenant).filter(Boolean))].sort();

    h += `<div class="status-group-head">By Clan</div>`;
    h += `<div class="status-multi-split">`;
    for (const clan of clans) {
      const rows = chars
        .filter(c => c.clan === clan)
        .map(c => ({ c, val: c.status?.clan || 0 }))
        .sort((a, b) => b.val - a.val || sortName(a.c).localeCompare(sortName(b.c)));
      h += renderStatusSection(clan, clanIcon(clan, 18), rows, activeId, '');
    }
    h += `</div>`;

    h += `<div class="status-group-head">By Covenant</div>`;
    h += `<div class="status-multi-split">`;
    for (const cov of covenants) {
      const rows = chars
        .filter(c => c.covenant === cov)
        .map(c => ({ c, val: (c.status?.covenant?.[c.covenant] || 0) - (c._ots_covenant_bonus || 0) }))
        .sort((a, b) => b.val - a.val || sortName(a.c).localeCompare(sortName(b.c)));
      h += renderStatusSection(cov, covIcon(cov, 18), rows, activeId, '');
    }
    h += `</div>`;
  } else {
    // Player view: only active character's clan and covenant
    const clanRows = chars
      .filter(c => c.clan && c.clan === activeChar.clan)
      .map(c => ({ c, val: c.status?.clan || 0 }))
      .sort((a, b) => b.val - a.val || sortName(a.c).localeCompare(sortName(b.c)));

    const covRows = chars
      .filter(c => c.covenant && c.covenant === activeChar.covenant)
      .map(c => ({ c, val: (c.status?.covenant?.[c.covenant] || 0) - (c._ots_covenant_bonus || 0) }))
      .sort((a, b) => b.val - a.val || sortName(a.c).localeCompare(sortName(b.c)));

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
  }

  el.innerHTML = h;
}
