/* Unified Downtime tab — current cycle zone + past outcomes accordion. */

import { apiGet } from '../data/api.js';
import { esc } from '../data/helpers.js';
import { renderDowntimeTab } from './downtime-form.js';
import { renderOutcomeWithCards } from './story-tab.js';
import { isSTRole, getUser } from '../auth/discord.js';

export async function initDowntimeTab(el, char, territories = []) {
  el.innerHTML = '<p class="placeholder-msg">Loading\u2026</p>';

  let cycles = [], subs = [];
  try {
    [cycles, subs] = await Promise.all([
      apiGet('/api/downtime_cycles'),
      apiGet('/api/downtime_submissions'),
    ]);
    subs.forEach(s => {
      if (!s.published_outcome && s.st_review?.outcome_visibility === 'published') {
        s.published_outcome = s.st_review.outcome_text;
      }
    });
  } catch (err) {
    el.innerHTML = `<p class="placeholder-msg">Failed to load: ${esc(err.message)}</p>`;
    return;
  }

  const charId = String(char._id);
  const isST = isSTRole();
  const playerId = getUser()?.player_id ? String(getUser().player_id) : null;

  // Find the most relevant non-closed cycle (priority: active > game > prep > open)
  const LIVE_STATUSES = ['active', 'game', 'prep', 'open'];
  const activeCycle = cycles
    .filter(c => LIVE_STATUSES.includes(c.status))
    .sort((a, b) => LIVE_STATUSES.indexOf(a.status) - LIVE_STATUSES.indexOf(b.status))[0] || null;

  // Access gate: STs always pass; players need early access or auto_open_at reached or cycle is open
  const inEarlyAccess = playerId && (activeCycle?.early_access_player_ids || []).includes(playerId);
  const autoOpenPassed = activeCycle?.auto_open_at && new Date(activeCycle.auto_open_at) <= new Date();
  const cycleIsOpen = ['open', 'active'].includes(activeCycle?.status);
  const canAccess = isST || inEarlyAccess || autoOpenPassed || cycleIsOpen;
  const mySubs = subs.filter(s => String(s.character_id) === charId);
  const myActiveSub = activeCycle
    ? mySubs.find(s => String(s.cycle_id) === String(activeCycle._id)) || null
    : null;

  const cycleMap = {};
  for (const c of cycles) cycleMap[String(c._id)] = c.label || `Cycle ${String(c._id).slice(-4)}`;

  const publishedSubs = mySubs
    .filter(s => s.published_outcome)
    .sort((a, b) => (String(b._id) > String(a._id) ? 1 : -1));

  el.innerHTML = '';

  // ── Zone 1: Current Cycle ────────────────────────────────────────
  const currentZone = document.createElement('div');
  currentZone.className = 'dt-current-zone';

  if (activeCycle && !canAccess) {
    // DT not yet open for this player — show countdown or locked message
    if (activeCycle.auto_open_at) {
      const openDate = new Date(activeCycle.auto_open_at);
      const label = openDate.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      currentZone.innerHTML = `<div class="dt-state-card">
        <p class="dt-state-title">Downtimes opening soon</p>
        <p class="dt-state-body">Opens <strong>${esc(label)}</strong></p>
        <p class="dt-countdown" data-open-at="${esc(activeCycle.auto_open_at)}"></p>
      </div>`;
      _startCountdown(currentZone.querySelector('.dt-countdown'), openDate);
    } else {
      currentZone.innerHTML = `<div class="dt-state-card">
        <p class="dt-state-title">Downtimes are not yet open</p>
        <p class="dt-state-body">Your ST will open downtime submissions soon.</p>
      </div>`;
    }
  } else if (activeCycle) {
    const cycleLabel = activeCycle.label || `Cycle ${String(activeCycle._id).slice(-4)}`;
    const forceForm = location.hostname === 'localhost';
    if (!myActiveSub || forceForm) {
      if (!forceForm && window.innerWidth <= 600) {
        currentZone.innerHTML = '<div class="dt-mobile-notice">This form works best on desktop. <a href="/player" class="dt-mobile-notice-link">Open Player Portal</a></div>';
      } else {
        renderDowntimeTab(currentZone, char, territories, { singleColumn: true });
      }
    } else {
      currentZone.innerHTML = `<div class="dt-state-card">
        <p class="dt-state-title">${esc(cycleLabel)} — Submitted</p>
        <p class="dt-state-body">Your ST is processing your actions.</p>
      </div>`;
    }
  } else {
    const closedCycles = cycles
      .filter(c => c.status === 'closed' || c.status === 'complete')
      .sort((a, b) => (String(b._id) > String(a._id) ? 1 : -1));
    const recentClosed = closedCycles[0] || null;
    const myRecentSub = recentClosed
      ? mySubs.find(s => String(s.cycle_id) === String(recentClosed._id))
      : null;

    if (recentClosed && myRecentSub && !myRecentSub.published_outcome) {
      const label = recentClosed.label || `Cycle ${String(recentClosed._id).slice(-4)}`;
      currentZone.innerHTML = `<div class="dt-state-card">
        <p class="dt-state-title">${esc(label)}</p>
        <p class="dt-state-body">Your Storyteller is processing your actions. Check back soon.</p>
      </div>`;
    } else {
      currentZone.innerHTML = `<div class="dt-state-card dt-state-card--neutral">
        <p class="dt-state-body">No active downtime cycle. Check with your Storyteller.</p>
      </div>`;
    }
  }

  el.appendChild(currentZone);
}

/** Render past outcomes accordion into a target element. Standalone — can be
 *  called independently of the downtime form tab. */
export async function renderPastOutcomes(el, char) {
  if (!el || !char) return;
  el.innerHTML = '';

  let cycles = [], subs = [];
  try {
    [cycles, subs] = await Promise.all([
      apiGet('/api/downtime_cycles'),
      apiGet('/api/downtime_submissions'),
    ]);
    subs.forEach(s => {
      if (!s.published_outcome && s.st_review?.outcome_visibility === 'published') {
        s.published_outcome = s.st_review.outcome_text;
      }
    });
  } catch { return; }

  const charId = String(char._id);
  const cycleMap = {};
  for (const c of cycles) cycleMap[String(c._id)] = c.label || `Cycle ${String(c._id).slice(-4)}`;

  const publishedSubs = subs
    .filter(s => String(s.character_id) === charId && s.published_outcome)
    .sort((a, b) => (String(b._id) > String(a._id) ? 1 : -1));

  if (!publishedSubs.length) return;

  let h = '<h3 class="dt-history-heading">Past Outcomes</h3>';
  for (const sub of publishedSubs) {
    const label = cycleMap[String(sub.cycle_id)] || 'Unknown Cycle';
    const dateStr = _cycleDate(sub, cycles);
    h += `<details class="dt-history-row">`;
    h += `<summary class="dt-history-summary">`;
    h += `<span class="dt-history-label">${esc(label)}</span>`;
    if (dateStr) h += `<span class="dt-history-date">${esc(dateStr)}</span>`;
    h += `<span class="dt-history-status">Outcome published</span>`;
    h += `</summary>`;
    h += `<div class="dt-history-body">`;
    h += renderOutcomeWithCards(sub);
    h += `</div>`;
    h += `</details>`;
  }
  el.innerHTML = h;
}

function _cycleDate(sub, cycles) {
  const cycle = cycles.find(c => String(c._id) === String(sub.cycle_id));
  if (!cycle) return '';
  const raw = cycle.closed_at || cycle.deadline_at;
  if (!raw) return '';
  return new Date(raw).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
}

let _countdownInterval = null;
function _startCountdown(el, openDate) {
  if (_countdownInterval) clearInterval(_countdownInterval);
  const update = () => {
    if (!el || !el.isConnected) { clearInterval(_countdownInterval); return; }
    const diff = openDate - new Date();
    if (diff <= 0) { el.textContent = 'Opening now — refresh the page.'; clearInterval(_countdownInterval); return; }
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    el.textContent = (d > 0 ? d + 'd ' : '') + h + 'h ' + m + 'm ' + s + 's';
  };
  update();
  _countdownInterval = setInterval(update, 1000);
}
