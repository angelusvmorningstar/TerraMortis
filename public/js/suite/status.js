/* Suite status tab — city / covenant / clan standings.
 *
 * Ported from public/js/player/status-tab.js.
 * Differences from the player portal version:
 *   - Exported function is renderSuiteStatusTab(el) — reads suiteState.rollChar
 *     and getRole() internally rather than taking activeChar/isST as params.
 *   - Section order: city → covenants (full-width) → clans (full-width), all
 *     single-column. No horizontal splits used in the rendered HTML.
 *   - Called fresh on every tab open; no caching.
 *   - In ST mode, city chips are clickable — opens an edit popup (feat.16).
 */

import { apiGet, apiPut } from '../data/api.js';
import { esc, displayName, sortName, clanIcon, covIcon, redactPlayer, discordAvatarUrl, isRedactMode } from '../data/helpers.js';
import { calcCityStatus } from '../data/accessors.js';
import { CITY_STATUS_APPELLATIONS } from '../data/constants.js';
import suiteState, { CITY_SVG, OTHER_SVG } from './data.js';
import { getRole } from '../auth/discord.js';

// ── Module-level state ───────────────────────────────────────────────────────
let _statusTabEl  = null;   // stored for re-renders after edits
let _lastChars    = null;   // last fetched status chars, for popup lookup
let _editPopupEl  = null;   // current edit popup element

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
  return '<span class="pointed"></span>'.repeat(v) + '<span class="pointed hollow"></span>'.repeat(max - v);
}

// ── Chip renderers ───────────────────────────────────────────────────────────
function renderChip(c, isMe) {
  return `<div class="status-chip${isMe ? ' status-chip-me' : ''}">
    <img class="status-chip-avatar" src="${esc(avatarUrl(c))}" alt="" loading="lazy">
    <span class="status-chip-name">${esc(displayName(c))}</span>
  </div>`;
}

// City chip — in ST mode, clickable to open edit popup
function renderCityChip(c, isMe, isST) {
  const id = esc(String(c._id));
  const click = isST ? ` onclick="suiteStatusOpenEdit('${id}')"` : '';
  return `<div class="status-chip${isMe ? ' status-chip-me' : ''}${isST ? ' status-chip-st' : ''}"${click}>
    <img class="status-chip-avatar" src="${esc(avatarUrl(c))}" alt="" loading="lazy">
    <span class="status-chip-name">${esc(displayName(c))}</span>
  </div>`;
}

// ── Fixed-tier bracket row ────────────────────────────────────────────────────
function renderTierRow(val, chars, activeId, dotsFn, showAppellation = false, isCityST = false) {
  // Skip empty tiers — don't show "Vacant" rows
  if (!chars.length) return '';
  const hasMe = chars.some(c => String(c._id) === activeId);
  let h = `<div class="status-bracket status-bracket-fixed${hasMe ? ' status-bracket-me' : ''}">`;
  h += `<div class="status-bracket-head">`;
  h += `<span class="status-bracket-dots">${dotsFn(val)}</span>`;
  h += `<span class="status-bracket-val">${val}</span>`;
  if (showAppellation) h += `<span class="status-bracket-appellation">${CITY_STATUS_APPELLATIONS[val] || ''}</span>`;
  h += `</div>`;
  h += `<div class="status-bracket-chips">`;
  for (const c of chars) {
    h += isCityST
      ? renderCityChip(c, String(c._id) === activeId, true)
      : renderChip(c, String(c._id) === activeId);
  }
  h += `</div>`;
  h += `</div>`;
  return h;
}

// ── City Status section (full-width) ─────────────────────────────────────────
function cityVal(c) { return calcCityStatus(c); }

function renderCitySection(chars, activeId, isST = false) {
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
  if (isST) h += `<span class="status-section-caps">1@10 · 2@9 · 2@8 · 3@7 · 3@6 · 4@5 · 4@4 · open</span>`;
  h += `</div>`;

  h += `<div class="status-brackets">`;
  h += renderTierRow(10, byVal.get(10) || [], activeId, dotsFn, true, isST);
  h += renderTierRow(9,  byVal.get(9)  || [], activeId, dotsFn, true, isST);
  h += renderTierRow(8,  byVal.get(8)  || [], activeId, dotsFn, true, isST);
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
      h += renderTierRow(val, chars, activeId, dotsFn, true, isST);
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
  if (getRole() === 'st') h += `<span class="status-section-caps">1@5 · 2@4 · open</span>`;
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

// ── Edit popup helpers ────────────────────────────────────────────────────────
function _buildEditPopup(c) {
  const base  = c.status?.city || 0;
  const total = cityVal(c);
  const bonus = total - base;
  const id    = esc(String(c._id));
  const totalLine = bonus > 0
    ? `Total: ${total} (base ${base} + ${bonus})`
    : `Total: ${total}`;
  return `<div class="cs-edit-overlay" id="cs-edit-overlay" onclick="if(event.target===this)suiteStatusCloseEdit()">
    <div class="cs-edit-panel">
      <button class="cs-edit-close" onclick="suiteStatusCloseEdit()">\u00D7</button>
      <img class="cs-edit-avatar" src="${esc(avatarUrl(c))}" alt="" loading="lazy">
      <div class="cs-edit-name">${esc(displayName(c))}</div>
      <div class="cs-edit-stepper">
        <button class="cs-step-btn" onclick="suiteStatusAdjustCity('${id}',1)"${base >= 10 ? ' disabled' : ''}>\u25B2</button>
        <div class="cs-edit-val" id="cs-edit-val">${base}</div>
        <button class="cs-step-btn" onclick="suiteStatusAdjustCity('${id}',-1)"${base <= 0 ? ' disabled' : ''}>\u25BC</button>
      </div>
      <div class="cs-edit-total" id="cs-edit-total">${esc(totalLine)}</div>
      <div class="cs-edit-err" id="cs-edit-err" style="display:none"></div>
    </div>
  </div>`;
}

function _updateEditPopup(c, errMsg) {
  if (!_editPopupEl) return;
  const base  = c.status?.city || 0;
  const total = cityVal(c);
  const bonus = total - base;
  const totalLine = bonus > 0
    ? `Total: ${total} (base ${base} + ${bonus})`
    : `Total: ${total}`;
  const valEl  = _editPopupEl.querySelector('#cs-edit-val');
  const totEl  = _editPopupEl.querySelector('#cs-edit-total');
  const errEl  = _editPopupEl.querySelector('#cs-edit-err');
  const btns   = _editPopupEl.querySelectorAll('.cs-step-btn');
  if (valEl) valEl.textContent = base;
  if (totEl) totEl.textContent = totalLine;
  if (errEl) { errEl.textContent = errMsg || ''; errEl.style.display = errMsg ? '' : 'none'; }
  if (btns[0]) btns[0].disabled = base >= 10;
  if (btns[1]) btns[1].disabled = base <= 0;
}

// ── Exported popup handlers (exposed on window in app.js) ────────────────────
export function suiteStatusOpenEdit(charId) {
  const c = (_lastChars || []).find(ch => String(ch._id) === charId);
  if (!c) return;
  suiteStatusCloseEdit();
  const div = document.createElement('div');
  div.innerHTML = _buildEditPopup(c);
  _editPopupEl = div.firstElementChild;
  document.body.appendChild(_editPopupEl);
}

export function suiteStatusCloseEdit() {
  _editPopupEl?.remove();
  _editPopupEl = null;
}

export async function suiteStatusAdjustCity(charId, delta) {
  const c = (_lastChars || []).find(ch => String(ch._id) === charId);
  if (!c) return;
  const oldVal = c.status?.city || 0;
  const newVal = Math.max(0, Math.min(10, oldVal + delta));
  if (newVal === oldVal) return;

  // Optimistic update
  c.status = c.status || {};
  c.status.city = newVal;
  _updateEditPopup(c);

  try {
    await apiPut('/api/characters/' + charId, { status: { ...(c.status || {}), city: newVal } });
  } catch (err) {
    c.status.city = oldVal;
    _updateEditPopup(c, 'Save failed');
    return;
  }

  if (_statusTabEl) renderSuiteStatusTab(_statusTabEl);
}

// ── Main render ──────────────────────────────────────────────────────────────
export async function renderSuiteStatusTab(el) {
  if (!el) return;
  _statusTabEl = el;
  el.innerHTML = '<p class="placeholder-msg">Loading\u2026</p>';

  let chars;
  try {
    chars = await apiGet('/api/characters/status');
  } catch (err) {
    el.innerHTML = `<p class="placeholder-msg">Failed to load: ${esc(err.message)}</p>`;
    return;
  }

  _lastChars = chars;

  const activeChar = suiteState.rollChar || null;
  const activeId   = activeChar ? String(activeChar._id) : '';
  const isST       = getRole() === 'st';

  // ── Compact personal status row ──
  let h = '';
  if (activeChar) {
    const st = activeChar.status || {};
    const cityV = calcCityStatus(activeChar);
    const covV = (st.covenant || 0) - (activeChar._ots_covenant_bonus || 0);
    const clanV = st.clan || 0;
    h += `<div class="status-summary">`;
    h += `<div class="status-summary-pip"><div class="status-summary-shape">${CITY_SVG}<span class="status-summary-n">${cityV}</span></div><span class="status-summary-lbl">City</span></div>`;
    if (activeChar.covenant) {
      h += `<div class="status-summary-pip"><div class="status-summary-shape">${OTHER_SVG}<span class="status-summary-n">${covV}</span></div><span class="status-summary-lbl">${esc(activeChar.covenant)}</span></div>`;
    }
    if (activeChar.clan) {
      h += `<div class="status-summary-pip"><div class="status-summary-shape">${OTHER_SVG}<span class="status-summary-n">${clanV}</span></div><span class="status-summary-lbl">${esc(activeChar.clan)}</span></div>`;
    }
    h += `</div>`;
    // Other covenant standings — compact secondary line
    const COV_SHORT = {
      'Carthian Movement': 'Carthian', 'Circle of the Crone': 'Crone',
      'Invictus': 'Invictus', 'Lancea et Sanctum': 'Lance',
    };
    const covStandings = activeChar.covenant_standings || {};
    const ownCovLabel = COV_SHORT[activeChar.covenant] || null;
    const otherCovs = Object.entries(covStandings).filter(([label, val]) => val && label !== ownCovLabel);
    if (otherCovs.length) {
      h += `<div class="status-summary-other">${otherCovs.map(([label, val]) =>
        `<span class="status-summary-other-item">${esc(label)} <b>${val}</b></span>`
      ).join(' \u00B7 ')}</div>`;
    }
  }

  // Build the three hierarchy sections as separate cards for the carousel
  const cityCard = renderCitySection(chars, activeId, isST);
  let covCard = '', clanCard = '';

  if (isST) {
    const covenants = [...new Set(chars.map(c => c.covenant).filter(Boolean))].sort();
    for (const cov of covenants) {
      const rows = chars
        .filter(c => c.covenant === cov)
        .map(c => ({ c, val: (c.status?.covenant || 0) - (c._ots_covenant_bonus || 0) }))
        .sort((a, b) => b.val - a.val || sortName(a.c).localeCompare(sortName(b.c)));
      covCard += renderStatusSection(cov, covIcon(cov, 18), rows, activeId, '');
    }
    const clans = [...new Set(chars.map(c => c.clan).filter(Boolean))].sort();
    for (const clan of clans) {
      const rows = chars
        .filter(c => c.clan === clan)
        .map(c => ({ c, val: c.status?.clan || 0 }))
        .sort((a, b) => b.val - a.val || sortName(a.c).localeCompare(sortName(b.c)));
      clanCard += renderStatusSection(clan, clanIcon(clan, 18), rows, activeId, '');
    }
  } else {
    const covRows = activeChar
      ? chars.filter(c => c.covenant && c.covenant === activeChar.covenant)
            .map(c => ({ c, val: (c.status?.covenant || 0) - (c._ots_covenant_bonus || 0) }))
            .sort((a, b) => b.val - a.val || sortName(a.c).localeCompare(sortName(b.c)))
      : [];
    const clanRows = activeChar
      ? chars.filter(c => c.clan && c.clan === activeChar.clan)
            .map(c => ({ c, val: c.status?.clan || 0 }))
            .sort((a, b) => b.val - a.val || sortName(a.c).localeCompare(sortName(b.c)))
      : [];
    covCard = renderStatusSection(
      activeChar?.covenant || 'No covenant',
      activeChar?.covenant ? covIcon(activeChar.covenant, 18) : '',
      covRows, activeId,
      activeChar?.covenant ? 'No other members in your covenant.' : 'No character selected.'
    );
    clanCard = renderStatusSection(
      activeChar?.clan || 'No clan',
      activeChar?.clan ? clanIcon(activeChar.clan, 18) : '',
      clanRows, activeId,
      activeChar?.clan ? 'No other members in your clan.' : 'No character selected.'
    );
  }

  // Swipeable carousel for City / Covenant / Clan tables
  const labels = ['City', 'Covenant', 'Clan'];
  h += `<div class="attr-carousel-badges">${labels.map((l, i) =>
    `<span class="attr-carousel-badge status-carousel-badge${i === 0 ? ' active' : ''}" data-carousel-idx="${i}">${l}</span>`
  ).join('')}</div>`;
  h += `<div class="attr-skills-carousel" id="status-carousel">`;
  h += `<div class="attr-skills-card">${cityCard}</div>`;
  h += `<div class="attr-skills-card">${covCard}</div>`;
  h += `<div class="attr-skills-card">${clanCard}</div>`;
  h += `</div>`;

  el.innerHTML = h;

  // Wire carousel badge indicators + tap-to-scroll
  const carousel = el.querySelector('#status-carousel');
  const badges = el.querySelectorAll('.status-carousel-badge');
  const cards = carousel ? carousel.querySelectorAll('.attr-skills-card') : [];
  if (carousel && badges.length && cards.length) {
    carousel.addEventListener('scroll', () => {
      const cardWidth = cards[0].offsetWidth;
      const idx = Math.round(carousel.scrollLeft / cardWidth);
      badges.forEach((b, i) => b.classList.toggle('active', i === idx));
    }, { passive: true });
    badges.forEach((badge, i) => {
      badge.addEventListener('click', () => {
        cards[i]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      });
    });
  }
}
