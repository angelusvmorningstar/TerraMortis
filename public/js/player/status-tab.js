/* Status tab — ranked clan and covenant standing lists.
 *
 * Two-column layout:
 *   Left  column: all characters sharing the active character's clan,
 *                 ranked by status.clan (desc).
 *   Right column: all characters sharing the active character's covenant,
 *                 ranked by status.covenant (desc).
 *
 * Shows each character's Discord avatar (from their linked player record),
 * character name and player name. The active character is highlighted in
 * both lists so the viewer can see their own standing at a glance.
 */

import { apiGet } from '../data/api.js';
import { esc, displayName, sortName, clanIcon, covIcon, redactPlayer, discordAvatarUrl, isRedactMode } from '../data/helpers.js';

function avatarUrl(c) {
  const pi = c._player_info || {};
  // In dev mode this returns a generic black square regardless of the
  // underlying data. In normal mode it returns the real CDN avatar, or a
  // deterministic per-character default silhouette when the player has no
  // custom avatar set.
  if (isRedactMode() || !pi.discord_id || !pi.discord_avatar) {
    if (isRedactMode()) return discordAvatarUrl(null, null);
    // Deterministic default silhouette (0–5) keyed to the character id
    let h = 0;
    const s = String(c._id || c.name || '');
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return `https://cdn.discordapp.com/embed/avatars/${Math.abs(h) % 6}.png`;
  }
  return discordAvatarUrl(pi.discord_id, pi.discord_avatar, 64);
}

function statusDots(n) {
  const v = Math.max(0, Math.min(5, n | 0));
  return '\u25CF'.repeat(v) + '\u25CB'.repeat(5 - v);
}

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

function renderColumn(heading, headingIcon, rows, activeId, placeholder) {
  let h = '<div class="status-col">';
  h += `<div class="status-col-head">${headingIcon} <span>${esc(heading)}</span></div>`;
  if (!rows.length) {
    h += `<p class="placeholder-msg status-empty">${esc(placeholder)}</p>`;
  } else {
    rows.forEach((r, i) => {
      h += renderRow(r.c, r.val, i + 1, String(r.c._id) === activeId);
    });
  }
  h += '</div>';
  return h;
}

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

  // Rank within the active character's clan
  const clanRows = chars
    .filter(c => c.clan && c.clan === activeChar.clan)
    .map(c => ({ c, val: c.status?.clan || 0 }))
    .sort((a, b) => b.val - a.val || sortName(a.c).localeCompare(sortName(b.c)));

  // Rank within the active character's covenant
  const covRows = chars
    .filter(c => c.covenant && c.covenant === activeChar.covenant)
    .map(c => ({ c, val: c.status?.covenant || 0 }))
    .sort((a, b) => b.val - a.val || sortName(a.c).localeCompare(sortName(b.c)));

  let h = '<div class="status-split">';
  h += renderColumn(
    activeChar.clan || 'No clan',
    activeChar.clan ? clanIcon(activeChar.clan, 18) : '',
    clanRows,
    activeId,
    activeChar.clan ? 'No other members in your clan.' : 'Your character has no clan set.'
  );
  h += renderColumn(
    activeChar.covenant || 'No covenant',
    activeChar.covenant ? covIcon(activeChar.covenant, 18) : '',
    covRows,
    activeId,
    activeChar.covenant ? 'No other members in your covenant.' : 'Your character has no covenant set.'
  );
  h += '</div>';

  el.innerHTML = h;
}
