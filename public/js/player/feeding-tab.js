/**
 * Feeding tab — one-shot feeding roll.
 *
 * If player submitted downtime: shows their declared method + calculated pool.
 * If no downtime: shows generic method selection.
 * One roll, then locked. STs can re-run.
 *
 * States: loading → ready → rolled | no_submission (generic picker)
 */

import { apiGet, apiPut } from '../data/api.js';
import { getGamePhaseCycle } from '../downtime/db.js';
import { esc, displayName, hasAoE } from '../data/helpers.js';
import { getAttrEffective as getAttrVal, skDots, skSpecStr } from '../data/accessors.js';
import { FEED_METHODS, TERRITORY_DATA } from './downtime-data.js';
import { SKILLS_MENTAL } from '../data/constants.js';
import { isSTRole } from '../auth/discord.js';

// Dice math (10-again)
function d10() { return Math.floor(Math.random() * 10) + 1; }
function mkDie(v) { return { v, s: v >= 8, x: v >= 10 }; }
function mkChain(rv) {
  const r = mkDie(rv); const ch = [];
  let l = r; while (l.x) { const c = mkDie(d10()); ch.push(c); l = c; }
  return { r, ch };
}
function rollDice(n) { const c = []; for (let i = 0; i < n; i++) c.push(mkChain(d10())); return c; }
function cntSuc(cols) { let s = 0; cols.forEach(col => { if (col.r.s) s++; col.ch.forEach(d => { if (d.s) s++; }); }); return s; }

let currentChar = null;
let container = null;
let feedingState = 'loading'; // loading | ready | rolled | no_submission
let declaredMethod = null; // FEED_METHODS entry from downtime submission
let declaredDisc = '';
let declaredSpec = '';
let selectedMethodId = ''; // for no_submission generic picker
let selectedDisc = '';
let selectedSpec = '';
let poolTotal = 0;
let poolBreakdown = '';
let stRote = false; // rote flag confirmed by ST in downtime processing
let rollResult = null;
let feedingRecord = null; // persisted feeding_rolls record from DB
let responseSubId = null; // submission _id for persisting player roll
let publishedFeedingText = null; // extracted Feeding section from published_outcome
let currentSub = null; // full submission doc for summary rendering

export async function renderFeedingTab(el, char) {
  currentChar = char;
  container = el;
  if (!el || !char) {
    if (el) el.innerHTML = '<p class="placeholder-msg">Select a character to view feeding.</p>';
    return;
  }

  feedingState = 'loading';
  rollResult = null;
  feedingRecord = null;
  declaredMethod = null;
  selectedMethodId = '';
  stRote = false;
  responseSubId = null;
  publishedFeedingText = null;
  currentSub = null;

  // Gate: only available once ST has opened the game phase
  let gameCycle = null;
  try { gameCycle = await getGamePhaseCycle(); } catch { /* offline */ }
  if (!gameCycle) {
    // Still show the split layout with last feeding result on right
    el.innerHTML = `<div class="tab-split">
      <div class="tab-split-left" id="feeding-left-pane"><p class="placeholder-msg">Feeding rolls open when the Storyteller opens the game phase.</p></div>
      <div class="tab-split-right" id="feeding-right-pane"></div>
    </div>`;
    container = document.getElementById('feeding-left-pane');
    renderFeedingHistoryPane(document.getElementById('feeding-right-pane'), char);
    return;
  }

  // Load submission first — it is the authoritative source for roll state
  let mySub = null;
  try {
    const subs = await apiGet('/api/downtime_submissions?cycle_id=' + gameCycle._id);
    mySub = subs.find(s =>
      (s.character_id === char._id || s.character_id?.toString() === char._id?.toString())
    ) || null;
  } catch { /* no submissions */ }

  if (mySub) {
    currentSub = mySub;
    responseSubId = mySub._id;

    // Extract feeding section from published outcome if available
    if (mySub.published_outcome) {
      const feedMatch = mySub.published_outcome.match(/##\s*Feeding\s*\n([\s\S]*?)(?=\n##\s|\s*$)/);
      if (feedMatch) publishedFeedingText = feedMatch[1].trim();
    }

    // Check DB-persisted player roll first
    if (mySub.feeding_roll_player) {
      rollResult = mySub.feeding_roll_player;
      feedingState = 'rolled';
      render();
      return;
    }
  }

  // Fall back to localStorage lock
  const lockKey = `tm_feed_rolled_${char._id}`;
  const existing = localStorage.getItem(lockKey);
  if (existing) {
    try {
      rollResult = JSON.parse(existing);
      feedingState = 'rolled';
      render();
      return;
    } catch { /* ignore */ }
  }

  // Load declared method for display (used in both paths below)
  if (mySub?.responses?.['_feed_method']) {
    const methodId = mySub.responses['_feed_method'];
    declaredMethod = FEED_METHODS.find(m => m.id === methodId) || null;
    declaredDisc = mySub.responses['_feed_disc'] || '';
    declaredSpec = mySub.responses['_feed_spec'] || '';
  }

  // Prefer ST-confirmed pool from downtime processing (feeding_roll.params)
  if (mySub?.feeding_roll?.params?.size) {
    poolTotal = mySub.feeding_roll.params.size;
    stRote = mySub.feeding_roll.params.rote || false;
    const roteLabel = stRote ? ' \u2014 Rote quality' : '';
    poolBreakdown = `ST confirmed: ${poolTotal} dice${roteLabel}`;
    feedingState = declaredMethod ? 'ready' : 'no_submission';
  } else if (declaredMethod) {
    buildPool(declaredMethod, declaredDisc, declaredSpec);
    feedingState = 'ready';
  } else {
    feedingState = 'no_submission';
  }

  // Set up split layout
  el.innerHTML = `<div class="tab-split">
    <div class="tab-split-left" id="feeding-left-pane"></div>
    <div class="tab-split-right" id="feeding-right-pane"></div>
  </div>`;
  container = document.getElementById('feeding-left-pane');
  renderFeedingHistoryPane(document.getElementById('feeding-right-pane'), char);

  render();
}

async function renderFeedingHistoryPane(el, char) {
  el.innerHTML = '<p class="placeholder-msg dt-hist-loading">Loading\u2026</p>';

  let allSubs = [], cycles = [];
  try {
    [allSubs, cycles] = await Promise.all([
      apiGet('/api/downtime_submissions'),
      apiGet('/api/downtime_cycles'),
    ]);
  } catch {
    el.innerHTML = '<p class="placeholder-msg">Could not load history.</p>';
    return;
  }

  const cycleMap = {};
  for (const c of cycles) cycleMap[String(c._id)] = c;

  const charId = String(char._id);
  // Only show closed/game cycles with published outcomes
  const charSubs = allSubs
    .filter(s => String(s.character_id) === charId && s.published_outcome)
    .sort((a, b) => (String(b._id) > String(a._id) ? 1 : -1));

  let h = '<div class="dt-hist-panel">';
  h += '<div class="dt-hist-title">Feeding Results</div>';

  if (!charSubs.length) {
    h += '<p class="placeholder-msg dt-hist-empty">No published feeding results yet.</p>';
  } else {
    for (const sub of charSubs) {
      const cycle = cycleMap[String(sub.cycle_id)];
      const label = cycle?.label || `Cycle ${String(sub.cycle_id).slice(-4)}`;

      // Extract just the Feeding section from the published outcome
      const feedMatch = sub.published_outcome.match(/##\s*Feeding\s*\n([\s\S]*?)(?=\n##\s|$)/);
      const feedingText = feedMatch ? feedMatch[1].trim() : null;

      h += `<div class="dt-hist-entry">`;
      h += `<div class="dt-hist-entry-head"><span class="dt-hist-cycle">${esc(label)}</span></div>`;
      if (feedingText) {
        h += `<div class="dt-hist-outcome">`;
        feedingText.split('\n').filter(Boolean).forEach(line => {
          h += `<p>${esc(line)}</p>`;
        });
        h += `</div>`;
      } else {
        h += `<div class="dt-hist-outcome"><p class="placeholder-msg">No feeding section recorded.</p></div>`;
      }
      h += `</div>`;
    }
  }

  h += '</div>';
  el.innerHTML = h;
}

function renderFeedingSummary() {
  // Only show summary for submitted downtimes (not drafts)
  if (!currentSub || currentSub.status !== 'submitted') return '';
  const r = currentSub.responses || {};
  let h = '<div class="feeding-summary">';

  // Blood types
  let bloodTypes = [];
  try { bloodTypes = JSON.parse(r['_feed_blood_types'] || '[]'); } catch { /* ignore */ }
  if (bloodTypes.length) {
    h += `<div class="feeding-sum-row"><span class="feeding-sum-label">Blood:</span> ${bloodTypes.map(b => esc(b)).join(', ')}</div>`;
  }

  // Territories
  let territories = {};
  try { territories = JSON.parse(r['feeding_territories'] || '{}'); } catch { /* ignore */ }
  const feedTerrs = Object.entries(territories)
    .filter(([, v]) => v === 'resident' || v === 'poach')
    .map(([k, v]) => {
      const t = TERRITORY_DATA.find(td => td.id === k || k.includes(td.id));
      const name = t ? t.name : k.replace(/_/g, ' ');
      return `${name} (${v})`;
    });
  if (feedTerrs.length) {
    h += `<div class="feeding-sum-row"><span class="feeding-sum-label">Territory:</span> ${feedTerrs.map(t => esc(t)).join(', ')}</div>`;
  }

  // Description
  if (r['feeding_description']) {
    h += `<div class="feeding-sum-row"><span class="feeding-sum-label">Description:</span> ${esc(r['feeding_description'])}</div>`;
  }

  // Rote + secondary hunt
  if (r['_feed_rote'] === 'yes') {
    h += '<div class="feeding-sum-rote">';
    h += '<span class="feeding-sum-label">Rote:</span> Project action dedicated to feeding';
    // Find the feed project slot
    for (let n = 1; n <= 4; n++) {
      if (r[`project_${n}_action`] === 'feed') {
        const method2 = r[`project_${n}_feed_method2`];
        if (method2) {
          const m2 = FEED_METHODS.find(fm => fm.id === method2);
          h += ` \u2014 Secondary method: <strong>${esc(m2?.name || method2)}</strong>`;
        }
        const projTerr = r[`project_${n}_territory`];
        if (projTerr) {
          const t = TERRITORY_DATA.find(td => td.id === projTerr);
          h += ` in <strong>${esc(t?.name || projTerr)}</strong>`;
        }
        const projDesc = r[`project_${n}_description`];
        if (projDesc) {
          h += `<div class="feeding-sum-sub">${esc(projDesc)}</div>`;
        }
        break;
      }
    }
    h += '</div>';
  }

  h += '</div>';
  return h;
}

function buildPool(method, discName, specName) {
  const c = currentChar;
  if (!c || !method) { poolTotal = 0; poolBreakdown = ''; return; }

  let bestA = '', bestAV = 0;
  for (const a of method.attrs) {
    const v = getAttrVal(c, a);
    if (v > bestAV) { bestAV = v; bestA = a; }
  }

  let bestS = '', bestSV = 0, bestSpecs = [];
  for (const s of method.skills) {
    const v = skDots(c, s);
    if (v > bestSV) { bestSV = v; bestS = s; bestSpecs = c.skills?.[s]?.specs || []; }
  }

  const specBonus = specName && bestSpecs.includes(specName) ? (hasAoE(c, specName) ? 2 : 1) : 0;
  const discVal = (discName && c.disciplines?.[discName]?.dots) || 0;
  const unskilled = bestSV === 0
    ? (method.skills.some(s => !SKILLS_MENTAL.includes(s)) ? -1 : -3)
    : 0;

  poolTotal = Math.max(0, bestAV + bestSV + discVal + specBonus + unskilled);

  const parts = [`${bestAV} ${bestA}`, `${bestSV} ${bestS}`];
  if (discVal) parts.push(`${discVal} ${discName}`);
  if (specBonus) parts.push(`${specBonus} ${specName}`);
  if (unskilled) parts.push(`\u2212${Math.abs(unskilled)} (unskilled)`);
  poolBreakdown = parts.join(' + ') + ` = ${poolTotal}`;
}

function render() {
  if (!container) return;
  const isST = isSTRole();
  let h = '<div class="feeding-wrap">';
  h += '<h3 class="feeding-title">Feeding: The Hunt</h3>';

  // ── LOADING ──
  if (feedingState === 'loading') {
    h += '<p class="placeholder-msg">Loading feeding data...</p>';
  }

  // ── READY (from downtime declaration) ──
  if (feedingState === 'ready' && declaredMethod) {
    h += '<div class="feeding-ready">';
    h += `<p class="feeding-method-label">Method: <strong>${esc(declaredMethod.name)}</strong>`;
    if (stRote) h += ' <span class="feeding-rote-badge">Rote</span>';
    h += '</p>';
    h += `<p class="feeding-method-desc">${esc(declaredMethod.desc)}</p>`;
    h += `<div class="feeding-pool-display">`;
    h += `<span class="feeding-pool-breakdown">${esc(poolBreakdown)}</span>`;
    h += `<span class="feeding-pool-total">${poolTotal} dice</span>`;
    h += '</div>';
    h += renderFeedingSummary();
    h += '<p class="feeding-warning">You only get one roll. Once you roll, you are committed to the result.</p>';
    h += `<button id="feeding-roll-btn" class="feeding-roll-btn">Roll Feeding (${poolTotal} dice)</button>`;
    h += '</div>';
  }

  // ── NO SUBMISSION (generic picker) ──
  if (feedingState === 'no_submission') {
    h += '<div class="feeding-no-sub">';
    h += '<p class="feeding-state-detail">No downtime feeding declaration found. Select a generic method below.</p>';
    h += '<div class="dt-feed-methods">';
    for (const m of FEED_METHODS) {
      if (m.id === 'other') continue; // no custom without downtime
      const sel = selectedMethodId === m.id ? ' dt-feed-sel' : '';
      h += `<button type="button" class="dt-feed-card${sel}" data-feed-method="${m.id}">`;
      h += `<div class="dt-feed-card-name">${esc(m.name)}</div>`;
      h += `<div class="dt-feed-card-desc">${esc(m.desc)}</div>`;
      h += '</button>';
    }
    h += '</div>';

    if (selectedMethodId) {
      const m = FEED_METHODS.find(fm => fm.id === selectedMethodId);
      if (m) {
        buildPool(m, selectedDisc, selectedSpec);

        // Discipline selector
        const availDiscs = m.discs.filter(d => currentChar.disciplines?.[d]?.dots);
        if (availDiscs.length) {
          h += '<div class="feeding-disc-row">';
          h += '<label>Discipline:</label>';
          h += '<select class="qf-select" id="feed-gen-disc">';
          h += '<option value="">None</option>';
          for (const d of availDiscs) {
            const dv = currentChar.disciplines[d].dots;
            const sel = selectedDisc === d ? ' selected' : '';
            h += `<option value="${esc(d)}"${sel}>${esc(d)} (${dv})</option>`;
          }
          h += '</select></div>';
        }

        h += `<div class="feeding-pool-display">`;
        h += `<span class="feeding-pool-breakdown">${esc(poolBreakdown)}</span>`;
        h += `<span class="feeding-pool-total">${poolTotal} dice</span>`;
        h += '</div>';
        h += '<p class="feeding-warning">You only get one roll. Once you roll, you are committed to the result.</p>';
        h += `<button id="feeding-roll-btn" class="feeding-roll-btn">Roll Feeding (${poolTotal} dice)</button>`;
      }
    }
    h += '</div>';
  }

  // ── ROLLED ──
  if (feedingState === 'rolled' && rollResult) {
    const { cols, successes, vessels, safeVitae, methodName } = rollResult;

    // Show ST-confirmed result if published
    if (publishedFeedingText) {
      h += `<div class="feeding-confirmed">`;
      h += `<div class="feeding-confirmed-head">&#x2713; Confirmed Result</div>`;
      h += `<p class="feeding-confirmed-body">${esc(publishedFeedingText)}</p>`;
      h += `</div>`;
    }

    h += '<div class="feeding-result">';
    if (methodName) h += `<p class="feeding-method-label">Method: <strong>${esc(methodName)}</strong></p>`;
    h += renderFeedingSummary();
    h += `<div class="feeding-suc">${successes}</div>`;
    h += `<div class="feeding-suc-label">success${successes !== 1 ? 'es' : ''}</div>`;

    h += '<div class="feeding-dice-row">';
    for (const col of cols) {
      for (const d of [col.r, ...col.ch]) {
        let cls = 'feed-die';
        if (d.s) cls += ' fd-s';
        if (d.v === 1) cls += ' fd-1';
        h += `<span class="${cls}">${d.v}</span>`;
      }
    }
    h += '</div>';

    if (vessels === 0) {
      h += '<p class="feeding-no-vessels">No vessels secured this hunt.</p>';
    } else {
      h += '<div class="feeding-vessels">';
      h += `<div class="feeding-v-num">${vessels}</div>`;
      h += `<div class="feeding-v-label">vessel${vessels !== 1 ? 's' : ''} available \u2014 <strong>${safeVitae} Vitae</strong> safe (2 per vessel)</div>`;
      h += '</div>';
      h += '<p class="feeding-overfeed-warn">Draining beyond safe vitae risks a Humanity check.</p>';
    }

    if (isST) {
      h += '<button id="feeding-reroll-btn" class="feeding-roll-btn" style="margin-top:16px;">Re-roll (ST)</button>';
    }

    h += '</div>';
  }

  h += '</div>';
  container.innerHTML = h;
  wireEvents();
}

function wireEvents() {
  if (!container) return;

  // Generic method selection
  container.querySelectorAll('[data-feed-method]').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedMethodId = btn.dataset.feedMethod;
      selectedDisc = '';
      selectedSpec = '';
      render();
    });
  });

  // Generic disc selector
  container.querySelector('#feed-gen-disc')?.addEventListener('change', e => {
    selectedDisc = e.target.value;
    render();
  });

  // Roll button
  container.querySelector('#feeding-roll-btn')?.addEventListener('click', doFeedingRoll);

  // ST re-roll
  container.querySelector('#feeding-reroll-btn')?.addEventListener('click', async () => {
    const lockKey = `tm_feed_rolled_${currentChar._id}`;
    localStorage.removeItem(lockKey);
    rollResult = null;
    // Clear DB lock
    if (responseSubId) {
      try { await apiPut(`/api/downtime_submissions/${responseSubId}`, { feeding_roll_player: null }); } catch { /* ignore */ }
    }
    // Reset to ready or no_submission
    if (declaredMethod) {
      feedingState = 'ready';
      buildPool(declaredMethod, declaredDisc, declaredSpec);
    } else {
      feedingState = 'no_submission';
    }
    render();
  });
}

function rollDiceRote(n) {
  // Roll twice, take the best result (WoD rote quality)
  const r1 = rollDice(n), r2 = rollDice(n);
  return cntSuc(r1) >= cntSuc(r2) ? r1 : r2;
}

async function doFeedingRoll() {
  if (poolTotal <= 0) return;

  const cols = stRote ? rollDiceRote(poolTotal) : rollDice(poolTotal);
  const successes = cntSuc(cols);
  const methodName = declaredMethod?.name || FEED_METHODS.find(m => m.id === selectedMethodId)?.name || 'Unknown';

  rollResult = {
    cols,
    successes,
    vessels: successes,
    safeVitae: successes * 2,
    methodName,
    pool: poolTotal,
    breakdown: poolBreakdown,
    rolledAt: new Date().toISOString(),
  };

  feedingState = 'rolled';

  // Persist to localStorage as fallback
  const lockKey = `tm_feed_rolled_${currentChar._id}`;
  localStorage.setItem(lockKey, JSON.stringify(rollResult));

  // Persist to DB submission record (primary lock source)
  if (responseSubId) {
    try {
      await apiPut(`/api/downtime_submissions/${responseSubId}`, { feeding_roll_player: rollResult });
    } catch { /* localStorage fallback already set */ }
  }

  render();
}
