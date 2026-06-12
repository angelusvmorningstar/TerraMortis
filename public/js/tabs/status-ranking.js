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

const SCORE_SESSION_KEY = 'tm_ranking_score_model';

// Reverse-map server Borda pts back to ballot slot (server uses 5/4/3/2/1 for slots 1-5)
const BORDA_TO_SLOT = { 5: 1, 4: 2, 3: 3, 2: 4, 1: 5 };

const SCORE_MODELS = {
  linear:       { label: 'Linear',   slotPts: { 1: 5, 2: 4, 3: 3, 4: 2, 5: 1 } },
  tiered:       { label: 'Tiered',   slotPts: { 1: 2, 2: 2, 3: 1, 4: 1, 5: 1 } },
  'first-only': { label: '1st Only', slotPts: { 1: 2, 2: 1, 3: 1, 4: 1, 5: 1 } },
  flat:         { label: 'Flat',     slotPts: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 } },
};
const MODEL_KEYS = ['linear', 'tiered', 'first-only', 'flat'];

// Re-score a server ranked aggregate using a different slot→pts mapping.
// Returns a new object; never mutates the original.
function applyScoreModel(agg, modelKey) {
  const { slotPts } = SCORE_MODELS[modelKey] || SCORE_MODELS.linear;

  function rescore(votes) {
    const newPts = {}, newVotes = {};
    for (const [cid, contributions] of Object.entries(votes || {})) {
      let total = 0;
      const newContribs = [];
      for (const { pts: bordaPts, voter } of contributions) {
        const slot  = BORDA_TO_SLOT[bordaPts] ?? 0;
        const newPt = slotPts[slot] ?? 0;
        total += newPt;
        if (newPt > 0) newContribs.push({ pts: newPt, voter });
      }
      newPts[cid]   = total;
      newVotes[cid] = newContribs.sort((a, b) => b.pts - a.pts);
    }
    return { pts: newPts, votes: newVotes };
  }

  const clan     = rescore(agg.clan_votes);
  const covenant = rescore(agg.covenant_votes);
  return {
    clan_points:          clan.pts,
    clan_votes:           clan.votes,
    clan_voter_count:     agg.clan_voter_count,
    covenant_points:      covenant.pts,
    covenant_votes:       covenant.votes,
    covenant_voter_count: agg.covenant_voter_count,
  };
}

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
  const ords = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th' };
  let h = `<div class="status-ranking-col"><div class="status-ranking-col-head">${label}</div>`;
  for (const slot of ['1', '2', '3', '4', '5']) {
    const sel = ballotRanking && ballotRanking[slot] ? String(ballotRanking[slot]) : '';
    h += `<label class="status-ranking-slot"><span class="status-ranking-ord">${ords[slot]}</span>`;
    h += `<select class="status-ranking-sel" data-rank="${rank}" data-slot="${slot}">${memberOptions(members, sel, activeId)}</select></label>`;
  }
  return h + `</div>`;
}

function renderRankingBallot(me, clanMembers, covMembers, ballot, activeId, hasCycle) {
  let h = `<div class="status-ranking-section">`;
  h += `<div class="status-section-head"><span class="status-section-title">Clan &amp; Covenant Ranking</span>`;
  h += `<span class="status-section-caps">your top 5 this cycle — seen only by Storytellers</span></div>`;
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

// Returns Map<orgName, [{name, pts, votes}]> — ALL chars in that org, pts desc then alpha.
function buildOrgGroups(points, votes, chars, orgKey) {
  const orgs = new Map();
  for (const c of chars) {
    const org = c[orgKey];
    if (!org) continue;
    if (!orgs.has(org)) orgs.set(org, []);
    const label = c.moniker || c.name || '';
    const cid = String(c._id);
    orgs.get(org).push({
      name: label,
      pts: Number((points || {})[cid] || 0),
      votes: (votes || {})[cid] || [],
    });
  }
  for (const members of orgs.values())
    members.sort((a, b) => b.pts - a.pts || a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  return orgs;
}

function renderAggMemberList(members) {
  if (!members || !members.length) return `<p class="placeholder-msg status-empty">No members.</p>`;
  return members.map(m => {
    const nonZero = (m.votes || []).filter(v => v.pts > 0);
    const breakdown = nonZero.length > 0
      ? nonZero.map(v => `${esc(v.voter)}: ${v.pts}`).join(', ')
      : String(m.pts);
    return `<div class="rank-member-row"><span class="rank-member-name">${esc(m.name)} (${breakdown})</span><span class="rank-member-pts${m.pts === 0 ? ' zero' : ''}">${m.pts}</span></div>`;
  }).join('');
}

const ALL_MODE_KEYS = ['linear', 'tiered', 'first-only', 'flat', 'political'];
const MODE_LABELS   = { linear: 'Linear', tiered: 'Tiered', 'first-only': '1st Only', flat: 'Flat', political: 'Political' };

function renderRankingAggShell() {
  const stored    = sessionStorage.getItem(SCORE_SESSION_KEY) || 'linear';
  const activeKey = ALL_MODE_KEYS.includes(stored) ? stored : 'linear';

  let h = `<div class="status-ranking-section">`;
  h += `<div class="status-section-head">`;
  h += `<span class="status-section-title">Ranking Points — this cycle</span>`;
  h += `<span class="status-section-caps">ST only</span>`;
  h += `<div class="rank-mode-toggle">`;
  for (const key of ALL_MODE_KEYS)
    h += `<button class="rank-mode-btn${key === activeKey ? ' active' : ''}" data-mode="${key}">${MODE_LABELS[key]}</button>`;
  h += `</div></div>`;
  h += `<div class="rank-org-section"><div class="rank-org-label">Clan</div>`;
  h += `<div class="rank-pills" id="rank-clan-pills"></div>`;
  h += `<div class="rank-member-list" id="rank-clan-list"></div></div>`;
  h += `<div class="rank-org-section"><div class="rank-org-label">Covenant</div>`;
  h += `<div class="rank-pills" id="rank-cov-pills"></div>`;
  h += `<div class="rank-member-list" id="rank-cov-list"></div></div>`;
  return h + `</div>`;
}

function wireRankingAggregate(sectionEl, chars, rankedAgg, politicalAgg) {
  const stored    = sessionStorage.getItem(SCORE_SESSION_KEY) || 'linear';
  let activeKey   = ALL_MODE_KEYS.includes(stored) ? stored : 'linear';
  let activeClan  = null;
  let activeCov   = null;

  const clanPillsEl = sectionEl.querySelector('#rank-clan-pills');
  const clanListEl  = sectionEl.querySelector('#rank-clan-list');
  const covPillsEl  = sectionEl.querySelector('#rank-cov-pills');
  const covListEl   = sectionEl.querySelector('#rank-cov-list');

  function getAgg() {
    return activeKey === 'political' ? politicalAgg : applyScoreModel(rankedAgg, activeKey);
  }

  function refreshPills(pillsEl, listEl, groups, voterCount, activeOrgKey, onSelect) {
    const keys = [...groups.keys()].sort();
    pillsEl.innerHTML = keys.map(k => {
      const cnt = voterCount?.[k];
      const badge = cnt != null ? ` <span class="rank-voter-count">${cnt}</span>` : '';
      return `<button class="rank-pill${k === activeOrgKey ? ' active' : ''}" data-key="${esc(k)}">${esc(k)}${badge}</button>`;
    }).join('');
    pillsEl.querySelectorAll('.rank-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        pillsEl.querySelectorAll('.rank-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        onSelect(btn.dataset.key);
      });
    });
    listEl.innerHTML = renderAggMemberList(groups.get(activeOrgKey) || []);
  }

  function refresh() {
    const agg        = getAgg();
    const clanGroups = buildOrgGroups(agg.clan_points,     agg.clan_votes,     chars, 'clan');
    const covGroups  = buildOrgGroups(agg.covenant_points, agg.covenant_votes, chars, 'covenant');
    const firstClan  = [...clanGroups.keys()].sort()[0] || null;
    const firstCov   = [...covGroups.keys()].sort()[0]  || null;
    if (!activeClan || !clanGroups.has(activeClan)) activeClan = firstClan;
    if (!activeCov  || !covGroups.has(activeCov))   activeCov  = firstCov;

    refreshPills(clanPillsEl, clanListEl, clanGroups, agg.clan_voter_count, activeClan, key => {
      activeClan = key;
      clanListEl.innerHTML = renderAggMemberList(clanGroups.get(key) || []);
    });
    refreshPills(covPillsEl, covListEl, covGroups, agg.covenant_voter_count, activeCov, key => {
      activeCov = key;
      covListEl.innerHTML = renderAggMemberList(covGroups.get(key) || []);
    });
  }

  sectionEl.querySelectorAll('.rank-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeKey = btn.dataset.mode;
      sessionStorage.setItem(SCORE_SESSION_KEY, activeKey);
      sectionEl.querySelectorAll('.rank-mode-btn').forEach(b => b.classList.toggle('active', b === btn));
      refresh();
    });
  });

  refresh();
}

function wireDuplicateGuard(el, rank) {
  const selects = [...el.querySelectorAll(`.status-ranking-sel[data-rank="${rank}"]`)];
  function refresh() {
    selects.forEach(sel => {
      const others = new Set(selects.filter(s => s !== sel).map(s => s.value).filter(Boolean));
      sel.querySelectorAll('option').forEach(opt => {
        if (!opt.value) return;
        opt.disabled = others.has(opt.value);
      });
    });
  }
  selects.forEach(sel => sel.addEventListener('change', refresh));
  refresh();
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

  if (isST) {
    if (!cycleId) return;
    let rankedAgg    = { clan_points: {}, covenant_points: {} };
    let politicalAgg = { clan_points: {}, covenant_points: {} };
    try {
      [rankedAgg, politicalAgg] = await Promise.all([
        apiGet(`/api/ranking_ballots/aggregate?cycle_id=${encodeURIComponent(cycleId)}&mode=ranked`),
        apiGet(`/api/ranking_ballots/aggregate?cycle_id=${encodeURIComponent(cycleId)}&mode=political`),
      ]);
    } catch { /* ignore */ }
    const wrap = document.createElement('div');
    wrap.innerHTML = renderRankingAggShell();
    const node = wrap.firstElementChild;
    if (node) { el.appendChild(node); wireRankingAggregate(node, chars, rankedAgg, politicalAgg); }
  } else {
    if (!activeChar) return;
    const activeId = String(activeChar._id);
    const me = resolveActiveChar(chars, activeChar);
    const clanMembers = (me?.clan ? clanRowsFor(chars, me.clan, sortName) : []).map(r => r.c).filter(c => String(c._id) !== activeId);
    const covMembers  = (me?.covenant ? covenantRowsFor(chars, me.covenant, sortName) : []).map(r => r.c).filter(c => String(c._id) !== activeId);
    let ballot = null;
    if (cycleId) {
      try { ballot = await apiGet(`/api/ranking_ballots/mine?cycle_id=${encodeURIComponent(cycleId)}&voter=${encodeURIComponent(activeId)}`); } catch { /* ignore */ }
    }
    const html = renderRankingBallot(me || activeChar, clanMembers, covMembers, ballot, activeId, !!cycleId);
    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    const node = wrap.firstElementChild;
    if (node) el.appendChild(node);
    if (cycleId && activeChar) {
      wireRankingSave(el, activeId, cycleId);
      wireDuplicateGuard(el, 'clan');
      wireDuplicateGuard(el, 'covenant');
    }
  }
}
