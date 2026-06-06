/* Clan/Covenant ranking ballot (#624) — SHARED between the two status renderers.
 *
 * Players pick top-3 of their clan and covenant per cycle (1st/2nd/3rd, self-excluded,
 * distinct). Points 3/2/1 aggregate to an ST-only per-character total. This module is the
 * single source of truth for the ranking UI + wiring, imported by BOTH:
 *   - public/js/tabs/status-tab.js   (renderStatusTab — legacy player.js portal)
 *   - public/js/suite/status.js      (renderSuiteStatusTab — the live unified app, app.js)
 * so the feature renders identically wherever the Status tab is shown.
 */

import { apiGet, apiPut } from '../data/api.js';
import { esc, displayName, sortName } from '../data/helpers.js';
import { clanRowsFor, covenantRowsFor, resolveActiveChar } from '../data/status-data.js';

const LIVE_CYCLE_STATUSES = ['active', 'game', 'prep'];

function memberOptions(members, selectedId, activeId) {
  let h = `<option value="">— none —</option>`;
  for (const c of members) {
    if (String(c._id) === activeId) continue; // never offer yourself
    const id = String(c._id);
    h += `<option value="${esc(id)}"${id === selectedId ? ' selected' : ''}>${esc(displayName(c))}</option>`;
  }
  return h;
}

function renderRankingSlots(rank, label, members, ballotRanking, activeId) {
  const ords = { 1: '1st', 2: '2nd', 3: '3rd' };
  let h = `<div class="status-ranking-col"><div class="status-ranking-col-head">${label}</div>`;
  for (const slot of ['1', '2', '3']) {
    const sel = ballotRanking && ballotRanking[slot] ? String(ballotRanking[slot]) : '';
    h += `<label class="status-ranking-slot"><span class="status-ranking-ord">${ords[slot]}</span>`;
    h += `<select class="status-ranking-sel" data-rank="${rank}" data-slot="${slot}">${memberOptions(members, sel, activeId)}</select></label>`;
  }
  return h + `</div>`;
}

function renderRankingBallot(me, clanMembers, covMembers, ballot, activeId, hasCycle) {
  let h = `<div class="status-ranking-section">`;
  h += `<div class="status-section-head"><span class="status-section-title">Clan &amp; Covenant Ranking</span>`;
  h += `<span class="status-section-caps">your top 3 this cycle — seen only by Storytellers</span></div>`;
  if (!hasCycle) {
    h += `<p class="placeholder-msg status-empty">No active downtime cycle to rank in.</p></div>`;
    return h;
  }
  const b = ballot || {};
  h += `<div class="status-ranking-grid">`;
  h += renderRankingSlots('clan', `Clan${me.clan ? ' (' + esc(me.clan) + ')' : ''}`, clanMembers, b.clan_ranking, activeId);
  h += renderRankingSlots('covenant', `Covenant${me.covenant ? ' (' + esc(me.covenant) + ')' : ''}`, covMembers, b.covenant_ranking, activeId);
  h += `</div>`;
  h += `<div class="status-ranking-actions"><button class="btn status-ranking-save" type="button">Save Ranking</button><span class="status-ranking-msg" aria-live="polite"></span></div>`;
  return h + `</div>`;
}

function renderRankingAggregate(chars, agg) {
  const byId = new Map(chars.map(c => [String(c._id), c]));
  const list = (points) => {
    const rows = Object.entries(points || {})
      .map(([id, pts]) => ({ c: byId.get(id), pts }))
      .filter(r => r.c && r.pts > 0)
      .sort((a, b) => b.pts - a.pts || sortName(a.c).localeCompare(sortName(b.c)));
    if (!rows.length) return `<p class="placeholder-msg status-empty">No ballots cast yet.</p>`;
    let h = `<div class="status-ranking-agg-list">`;
    for (const r of rows) {
      h += `<div class="status-ranking-agg-row"><span class="status-ranking-agg-name">${esc(displayName(r.c))}</span><span class="status-ranking-agg-pts">${r.pts}</span></div>`;
    }
    return h + `</div>`;
  };
  let h = `<div class="status-ranking-section">`;
  h += `<div class="status-section-head"><span class="status-section-title">Ranking Points — this cycle</span>`;
  h += `<span class="status-section-caps">ST only · 1st=3 2nd=2 3rd=1</span></div>`;
  h += `<div class="status-ranking-agg-grid">`;
  h += `<div class="status-ranking-agg-col"><div class="status-ranking-col-head">Clan points</div>${list(agg.clan_points)}</div>`;
  h += `<div class="status-ranking-agg-col"><div class="status-ranking-col-head">Covenant points</div>${list(agg.covenant_points)}</div>`;
  return h + `</div></div>`;
}

function wireRankingSave(el, voterId, cycleId) {
  const btn = el.querySelector('.status-ranking-save');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const msg = el.querySelector('.status-ranking-msg');
    const collect = (rank) => {
      const picks = {};
      el.querySelectorAll(`.status-ranking-sel[data-rank="${rank}"]`).forEach(s => { if (s.value) picks[s.dataset.slot] = s.value; });
      return picks;
    };
    const clan = collect('clan');
    const cov  = collect('covenant');
    const hasDup = (o) => { const v = Object.values(o); return v.length !== new Set(v).size; };
    if (hasDup(clan) || hasDup(cov)) { if (msg) msg.textContent = 'Each slot must be a different character.'; return; }
    if (msg) msg.textContent = 'Saving…';
    try {
      await apiPut('/api/ranking_ballots', { cycle_id: cycleId, voter_character_id: voterId, clan_ranking: clan, covenant_ranking: cov });
      if (msg) msg.textContent = 'Saved.';
    } catch (err) {
      if (msg) msg.textContent = 'Save failed: ' + (err.message || 'error');
    }
  });
}

async function resolveActiveCycleId() {
  try {
    const cycles = await apiGet('/api/downtime_cycles');
    const sorted = [...(cycles || [])].sort((a, b) => String(b._id).localeCompare(String(a._id)));
    const live = sorted.find(c => LIVE_CYCLE_STATUSES.includes(c.status));
    return live ? String(live._id) : null;
  } catch { return null; }
}

/**
 * Fetch the cycle + ballot/aggregate and append the ranking section to an
 * already-rendered Status-tab container, wiring the player save handler.
 * Player view → the ballot (own picks); ST view → the per-character points aggregate.
 * @param {HTMLElement} el          the status panel container (section appended to it)
 * @param {object} opts             { chars, activeChar, isST }
 */
export async function appendRankingSection(el, { chars, activeChar, isST }) {
  if (!el) return;
  const cycleId = await resolveActiveCycleId();
  let html = '';

  if (isST) {
    // ST aggregate is global (all characters' points) — no active char required.
    if (!cycleId) return; // no cycle → nothing to aggregate
    let agg = { clan_points: {}, covenant_points: {} };
    try { agg = await apiGet(`/api/ranking_ballots/aggregate?cycle_id=${encodeURIComponent(cycleId)}`); } catch { /* ignore */ }
    html = renderRankingAggregate(chars, agg);
  } else {
    if (!activeChar) return; // player ballot needs the voter
    const activeId = String(activeChar._id);
    const me = resolveActiveChar(chars, activeChar);
    const clanMembers = (me?.clan ? clanRowsFor(chars, me.clan, sortName) : []).map(r => r.c).filter(c => String(c._id) !== activeId);
    const covMembers  = (me?.covenant ? covenantRowsFor(chars, me.covenant, sortName) : []).map(r => r.c).filter(c => String(c._id) !== activeId);
    let ballot = null;
    if (cycleId) {
      try { ballot = await apiGet(`/api/ranking_ballots/mine?cycle_id=${encodeURIComponent(cycleId)}&voter=${encodeURIComponent(activeId)}`); } catch { /* ignore */ }
    }
    html = renderRankingBallot(me || activeChar, clanMembers, covMembers, ballot, activeId, !!cycleId);
  }

  if (!html) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  const node = wrap.firstElementChild;
  if (node) el.appendChild(node);
  if (!isST && cycleId && activeChar) wireRankingSave(el, String(activeChar._id), cycleId);
}
