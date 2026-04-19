/* Unified Downtime tab — current cycle zone + past outcomes accordion. */

import { apiGet } from '../data/api.js';
import { esc } from '../data/helpers.js';
import { renderDowntimeTab } from './downtime-form.js';
import { renderOutcomeWithCards } from './story-tab.js';

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
  const activeCycle = cycles.find(c => c.status === 'open' || c.status === 'active') || null;
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

  if (activeCycle) {
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

  // ── Zone 2: Past Outcomes accordion ─────────────────────────────
  if (!publishedSubs.length) return;

  const historyZone = document.createElement('div');
  historyZone.className = 'dt-history-zone';

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

  historyZone.innerHTML = h;
  el.appendChild(historyZone);
}

function _cycleDate(sub, cycles) {
  const cycle = cycles.find(c => String(c._id) === String(sub.cycle_id));
  if (!cycle) return '';
  const raw = cycle.closed_at || cycle.deadline_at;
  if (!raw) return '';
  return new Date(raw).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
}
