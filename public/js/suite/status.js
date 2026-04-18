/* Suite status tab — city / covenant / clan standings.
 *
 * Ported from public/js/player/status-tab.js.
 * Differences from the player portal version:
 *   - Exported function is renderSuiteStatusTab(el) — reads suiteState.rollChar
 *     and getRole() internally rather than taking activeChar/isST as params.
 *   - Section order: city → covenants (full-width) → clans (full-width), all
 *     single-column. No horizontal splits used in the rendered HTML.
 *   - Called fresh on every tab open; no caching.
 */

import { apiGet } from '../data/api.js';
import { esc, displayName, sortName, clanIcon, covIcon, redactPlayer, discordAvatarUrl, isRedactMode } from '../data/helpers.js';
import { calcCityStatus } from '../data/accessors.js';
import { CITY_STATUS_APPELLATIONS } from '../data/constants.js';
import suiteState from './data.js';
import { getRole } from '../auth/discord.js';

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
function statusDots(n, max = 5) {
  const v = Math.max(0, Math.min(max, n | 0));
  return '\u25CF'.repeat(v) + '\u25CB'.repeat(max - v);
}

// ── Bracket chip (avatar + name) ─────────────────────────────────────────────
function renderChip(c, isMe) {
  return `<div class="status-chip${isMe ? ' status-chip-me' : ''}">
    <img class="status-chip-avatar" src="${esc(avatarUrl(c))}" alt="" loading="lazy">
    <span class="status-chip-name">${esc(displayName(c))}</span>
  </div>`;
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
  h += renderTierRow(10, byVal.get(10) || [], activeId, dotsFn, true);
  h += renderTierRow(9,  byVal.get(9)  || [], activeId, dotsFn, true);
  h += renderTierRow(8,  byVal.get(8)  || [], activeId, dotsFn, true);
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

// ── Covenant / Clan section (single-column, same slot arch) ──────────────────
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
    h += renderTierRow(5, byVal.get(5) || [], activeId, dotsFn);
    h += renderTierRow(4, byVal.get(4) || [], activeId, dotsFn);
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
export async function renderSuiteStatusTab(el) {
  if (!el) return;
  el.innerHTML = '<p class="placeholder-msg">Loading\u2026</p>';

  let chars;
  try {
    chars = await apiGet('/api/characters/status');
  } catch (err) {
    el.innerHTML = `<p class="placeholder-msg">Failed to load: ${esc(err.message)}</p>`;
    return;
  }

  const activeChar = suiteState.rollChar || null;
  const activeId   = activeChar ? String(activeChar._id) : '';
  const isST       = getRole() === 'st';

  let h = renderCitySection(chars, activeId);

  if (isST) {
    // All covenants, then all clans — each full-width, stacked
    const covenants = [...new Set(chars.map(c => c.covenant).filter(Boolean))].sort();
    for (const cov of covenants) {
      const rows = chars
        .filter(c => c.covenant === cov)
        .map(c => ({ c, val: c.status?.covenant || 0 }))
        .sort((a, b) => b.val - a.val || sortName(a.c).localeCompare(sortName(b.c)));
      h += renderStatusSection(cov, covIcon(cov, 18), rows, activeId, '');
    }
    const clans = [...new Set(chars.map(c => c.clan).filter(Boolean))].sort();
    for (const clan of clans) {
      const rows = chars
        .filter(c => c.clan === clan)
        .map(c => ({ c, val: c.status?.clan || 0 }))
        .sort((a, b) => b.val - a.val || sortName(a.c).localeCompare(sortName(b.c)));
      h += renderStatusSection(clan, clanIcon(clan, 18), rows, activeId, '');
    }
  } else {
    // Player: their covenant first, then their clan
    const covRows = activeChar
      ? chars.filter(c => c.covenant && c.covenant === activeChar.covenant)
            .map(c => ({ c, val: c.status?.covenant || 0 }))
            .sort((a, b) => b.val - a.val || sortName(a.c).localeCompare(sortName(b.c)))
      : [];
    const clanRows = activeChar
      ? chars.filter(c => c.clan && c.clan === activeChar.clan)
            .map(c => ({ c, val: c.status?.clan || 0 }))
            .sort((a, b) => b.val - a.val || sortName(a.c).localeCompare(sortName(b.c)))
      : [];
    h += renderStatusSection(
      activeChar?.covenant || 'No covenant',
      activeChar?.covenant ? covIcon(activeChar.covenant, 18) : '',
      covRows, activeId,
      activeChar?.covenant ? 'No other members in your covenant.' : 'No character selected.'
    );
    h += renderStatusSection(
      activeChar?.clan || 'No clan',
      activeChar?.clan ? clanIcon(activeChar.clan, 18) : '',
      clanRows, activeId,
      activeChar?.clan ? 'No other members in your clan.' : 'No character selected.'
    );
  }

  el.innerHTML = h;
}
