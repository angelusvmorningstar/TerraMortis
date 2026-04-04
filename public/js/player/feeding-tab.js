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
import { esc, displayName } from '../data/helpers.js';
import { getAttrVal, skDots, skSpecStr } from '../data/accessors.js';
import { FEED_METHODS, TERRITORY_DATA } from './downtime-data.js';
import { SKILLS_MENTAL } from '../data/constants.js';
import { getRole } from '../auth/discord.js';

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
let rollResult = null;
let feedingRecord = null; // persisted feeding_rolls record from DB

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

  // Check for existing feeding roll (already rolled this cycle)
  // TODO: load from feeding_rolls collection when game cycles exist
  // For now, check localStorage as a simple lock
  const lockKey = `tm_feed_rolled_${char._id}`;
  const existing = localStorage.getItem(lockKey);
  if (existing) {
    try {
      const data = JSON.parse(existing);
      rollResult = data;
      feedingState = 'rolled';
      render();
      return;
    } catch { /* ignore */ }
  }

  // Try to load feeding declaration from latest downtime submission
  try {
    const subs = await apiGet('/api/downtime_submissions');
    const mySub = subs.find(s =>
      (s.character_id === char._id || s.character_id?.toString() === char._id?.toString()) &&
      s.status === 'submitted'
    );

    if (mySub?.responses?.['_feed_method']) {
      const methodId = mySub.responses['_feed_method'];
      declaredMethod = FEED_METHODS.find(m => m.id === methodId) || null;
      declaredDisc = mySub.responses['_feed_disc'] || '';
      declaredSpec = mySub.responses['_feed_spec'] || '';
      if (declaredMethod) {
        buildPool(declaredMethod, declaredDisc, declaredSpec);
        feedingState = 'ready';
      } else {
        feedingState = 'no_submission';
      }
    } else {
      feedingState = 'no_submission';
    }
  } catch {
    feedingState = 'no_submission';
  }

  render();
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

  const hasAoE = (c.merits || []).some(m => m.name?.toLowerCase() === 'area of expertise');
  const specBonus = specName && bestSpecs.includes(specName) ? (hasAoE ? 2 : 1) : 0;
  const discVal = (discName && c.disciplines?.[discName]) || 0;
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
  const isST = getRole() === 'st';
  let h = '<div class="feeding-wrap">';
  h += '<h3 class="feeding-title">Feeding: The Hunt</h3>';

  // ── LOADING ──
  if (feedingState === 'loading') {
    h += '<p class="placeholder-msg">Loading feeding data...</p>';
  }

  // ── READY (from downtime declaration) ──
  if (feedingState === 'ready' && declaredMethod) {
    h += '<div class="feeding-ready">';
    h += `<p class="feeding-method-label">Method: <strong>${esc(declaredMethod.name)}</strong></p>`;
    h += `<p class="feeding-method-desc">${esc(declaredMethod.desc)}</p>`;
    h += `<div class="feeding-pool-display">`;
    h += `<span class="feeding-pool-breakdown">${esc(poolBreakdown)}</span>`;
    h += `<span class="feeding-pool-total">${poolTotal} dice</span>`;
    h += '</div>';
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
        const availDiscs = m.discs.filter(d => currentChar.disciplines?.[d]);
        if (availDiscs.length) {
          h += '<div class="feeding-disc-row">';
          h += '<label>Discipline:</label>';
          h += '<select class="qf-select" id="feed-gen-disc">';
          h += '<option value="">None</option>';
          for (const d of availDiscs) {
            const dv = currentChar.disciplines[d];
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

    h += '<div class="feeding-result">';
    if (methodName) h += `<p class="feeding-method-label">Method: <strong>${esc(methodName)}</strong></p>`;
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
  container.querySelector('#feeding-reroll-btn')?.addEventListener('click', () => {
    const lockKey = `tm_feed_rolled_${currentChar._id}`;
    localStorage.removeItem(lockKey);
    rollResult = null;
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

function doFeedingRoll() {
  if (poolTotal <= 0) return;

  const cols = rollDice(poolTotal);
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

  // Persist to localStorage to lock (prevents re-rolling on refresh)
  // TODO: persist to API feeding_rolls collection when game cycles exist
  const lockKey = `tm_feed_rolled_${currentChar._id}`;
  localStorage.setItem(lockKey, JSON.stringify(rollResult));

  render();
}
