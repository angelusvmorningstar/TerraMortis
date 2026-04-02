/**
 * Feeding tab — one-shot feeding roll after ST sign-off.
 *
 * Flow:
 * 1. Player submits downtime with feeding method/territory declaration
 * 2. STs process downtimes, approve feeding pools, affect ambience
 * 3. STs activate new game cycle → feeding rolls become available
 * 4. Player opens this tab, sees their approved pool, rolls once
 * 5. Player sees results: successes, vessels, vitae, overfeed decision
 *
 * States: unavailable → ready → rolled
 */

import { esc, displayName } from '../data/helpers.js';
import { FEED_METHODS } from './downtime-data.js';

// Dice math (10-again)
function d10() { return Math.floor(Math.random() * 10) + 1; }
function mkDie(v) { return { v, s: v >= 8, x: v >= 10 }; }
function mkChain(rv) {
  const r = mkDie(rv); const ch = [];
  let l = r; while (l.x) { const c = mkDie(d10()); ch.push(c); l = c; }
  return { r, ch };
}
function rollPool(n) { const c = []; for (let i = 0; i < n; i++) c.push(mkChain(d10())); return c; }
function cntSuc(cols) { let s = 0; cols.forEach(col => { if (col.r.s) s++; col.ch.forEach(d => { if (d.s) s++; }); }); return s; }

let currentChar = null;
let feedingState = 'unavailable'; // unavailable | ready | rolled
let approvedPool = null; // { method, pool, breakdown } — set by ST via game cycle
let rollResult = null; // { cols, successes, vessels, safeVitae }

export function renderFeedingTab(container, char) {
  currentChar = char;
  if (!container || !char) {
    if (container) container.innerHTML = '<p class="placeholder-msg">Select a character to view feeding.</p>';
    return;
  }

  // TODO: Check game cycle state from API to determine if feeding is available
  // For now, show the unavailable state with explanation
  // In future: apiGet('/api/game_cycles/current') → check if feeding_open === true
  // and if this character has already rolled → feedingState = 'rolled'

  render(container);
}

function render(container) {
  let h = '<div class="feeding-wrap">';
  h += '<h3 class="feeding-title">Feeding: The Hunt</h3>';

  if (feedingState === 'unavailable') {
    h += '<div class="feeding-state-msg">';
    h += '<p>Feeding rolls are not yet available.</p>';
    h += '<p class="feeding-state-detail">The feeding roll opens after STs have processed downtimes and activated a new game cycle. Once available, you will see your approved dice pool here and can make your one feeding roll.</p>';
    h += '<div class="feeding-flow">';
    h += '<div class="feeding-flow-step done"><span class="feeding-flow-num">1</span><span>Submit downtime with feeding method</span></div>';
    h += '<div class="feeding-flow-step"><span class="feeding-flow-num">2</span><span>STs process downtimes and approve pools</span></div>';
    h += '<div class="feeding-flow-step"><span class="feeding-flow-num">3</span><span>STs activate new game cycle</span></div>';
    h += '<div class="feeding-flow-step"><span class="feeding-flow-num">4</span><span>Roll your feeding here (one chance)</span></div>';
    h += '</div>';
    h += '</div>';
  }

  if (feedingState === 'ready' && approvedPool) {
    h += '<div class="feeding-ready">';
    h += `<p class="feeding-method-label">Approved method: <strong>${esc(approvedPool.method)}</strong></p>`;
    h += `<div class="feeding-pool-display">`;
    h += `<span class="feeding-pool-breakdown">${esc(approvedPool.breakdown)}</span>`;
    h += `<span class="feeding-pool-total">${approvedPool.pool} dice</span>`;
    h += '</div>';
    h += '<p class="feeding-warning">You only get one roll. Once you roll, you are committed to the result.</p>';
    h += '<button id="feeding-roll-btn" class="feeding-roll-btn">Roll Feeding</button>';
    h += '</div>';
  }

  if (feedingState === 'rolled' && rollResult) {
    const { cols, successes, vessels, safeVitae } = rollResult;

    // Dice display
    h += '<div class="feeding-result">';
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
      h += `<div class="feeding-vessels">`;
      h += `<div class="feeding-v-num">${vessels}</div>`;
      h += `<div class="feeding-v-label">vessel${vessels !== 1 ? 's' : ''} available — <strong>${safeVitae} Vitae</strong> safe (2 per vessel)</div>`;
      h += '</div>';
      h += '<p class="feeding-overfeed-warn">Draining beyond safe vitae risks a Humanity check.</p>';
    }
    h += '</div>';
  }

  h += '</div>';
  container.innerHTML = h;
  wireEvents(container);
}

function wireEvents(container) {
  container.querySelector('#feeding-roll-btn')?.addEventListener('click', () => {
    if (!approvedPool || feedingState !== 'ready') return;
    const cols = rollPool(approvedPool.pool);
    const successes = cntSuc(cols);
    rollResult = {
      cols,
      successes,
      vessels: successes,
      safeVitae: successes * 2,
    };
    feedingState = 'rolled';
    // TODO: persist roll result to API so it can't be re-rolled
    render(container);
  });
}

/**
 * Set the feeding state externally (called when game cycle data is loaded).
 * @param {'unavailable'|'ready'|'rolled'} state
 * @param {Object} [pool] - { method, pool, breakdown } for 'ready' state
 * @param {Object} [result] - { cols, successes, vessels, safeVitae } for 'rolled' state
 */
export function setFeedingState(state, pool, result) {
  feedingState = state;
  if (pool) approvedPool = pool;
  if (result) rollResult = result;
}
