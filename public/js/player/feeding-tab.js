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
import { getAttrEffective as getAttrVal, skDots, skSpecStr, skNineAgain } from '../data/accessors.js';
import { FEED_METHODS, TERRITORY_DATA } from './downtime-data.js';
import { SKILLS_MENTAL } from '../data/constants.js';
import { isSTRole } from '../auth/discord.js';
import { domMeritContrib, effectiveInvictusStatus } from '../editor/domain.js';
import { trackerAdj, trackerRead } from '../game/tracker.js';

// Dice math (configurable again threshold: 10 = standard, 9 = 9-again, 8 = 8-again)
function d10() { return Math.floor(Math.random() * 10) + 1; }
function mkDie(v, again = 10)  { return { v, s: v >= 8, x: v >= again }; }
function mkChain(rv, again = 10) {
  const r = mkDie(rv, again); const ch = [];
  let l = r; while (l.x) { const c = mkDie(d10(), again); ch.push(c); l = c; }
  return { r, ch };
}
function rollDice(n, again = 10) { const c = []; for (let i = 0; i < n; i++) c.push(mkChain(d10(), again)); return c; }
function cntSuc(cols) { let s = 0; cols.forEach(col => { if (col.r.s) s++; col.ch.forEach(d => { if (d.s) s++; }); }); return s; }

let currentChar = null;
let container = null;
let feedingState = 'loading'; // loading | ready | rolled | no_submission | deferred
let declaredMethod = null; // FEED_METHODS entry from downtime submission
let declaredDisc = '';
let declaredSpec = '';
let selectedMethodId = ''; // for no_submission generic picker
let selectedDisc = '';
let selectedSpec = '';
let poolTotal = 0;
let poolBreakdown = '';
let stRote  = false; // rote flag confirmed by ST in downtime processing
let stAgain = 10;   // again threshold (8/9/10) confirmed by ST
let rollResult = null;
let vitaeAllocation = null; // array of ints after player confirms, or null
let feedingRecord = null; // persisted feeding_rolls record from DB
let responseSubId = null; // submission _id for persisting player roll
let publishedFeedingText = null; // extracted Feeding section from published_outcome
let stRollResult = null; // ST's roll from admin processing (feeding_roll)
let currentSub = null; // full submission doc for summary rendering
let vitateTally = null; // feeding_vitae_tally from ST processing

export async function renderFeedingTab(el, char) {
  currentChar = char;
  container = el;
  if (!el || !char) {
    if (el) el.innerHTML = '<p class="placeholder-msg">Select a character to view feeding.</p>';
    return;
  }

  feedingState = 'loading';
  rollResult = null;
  vitaeAllocation = null;
  feedingRecord = null;
  declaredMethod = null;
  selectedMethodId = '';
  stRote  = false;
  stAgain = 10;
  responseSubId = null;
  publishedFeedingText = null;
  stRollResult = null;
  currentSub = null;
  vitateTally = null;

  // Fetch live territory ambience from DB (used by computeVitateTally)
  let liveTerrDocs = [];
  try { liveTerrDocs = await apiGet('/api/territories'); } catch { /* fall back to hardcoded */ }

  // Find active cycle for feeding:
  // Primary: game phase cycle (ST has opened the session).
  // Fallback: most recent cycle where this character's narrative has been published
  //   (ST has pushed their outcome — feeding is wired up even before game phase opens).
  let activeCycle = null;
  try { activeCycle = await getGamePhaseCycle(); } catch { /* offline */ }

  let mySub = null;

  if (!activeCycle) {
    // Check if narrative has been published for this character (feeding wired up by ST push)
    try {
      const [allCycles, allSubs] = await Promise.all([
        apiGet('/api/downtime_cycles'),
        apiGet('/api/downtime_submissions'),
      ]);
      allSubs.forEach(s => {
        if (!s.published_outcome && s.st_review?.outcome_visibility === 'published') {
          s.published_outcome = s.st_review.outcome_text;
        }
      });
      const charId = String(char._id);
      const publishedSub = allSubs
        .filter(s => String(s.character_id) === charId && s.published_outcome)
        .sort((a, b) => (String(b._id) > String(a._id) ? 1 : -1))[0] || null;
      if (publishedSub) {
        activeCycle = allCycles.find(c => String(c._id) === String(publishedSub.cycle_id)) || null;
        mySub = publishedSub; // already have it — skip the follow-up fetch
      }
    } catch { /* ignore */ }
  }

  if (!activeCycle) {
    // No game phase and no published submission — feeding is not yet available
    el.innerHTML = `<div class="tab-split">
      <div class="tab-split-left" id="feeding-left-pane"><p class="placeholder-msg">Feeding rolls open when the Storyteller opens the game phase.</p></div>
      <div class="tab-split-right" id="feeding-right-pane"></div>
    </div>`;
    container = document.getElementById('feeding-left-pane');
    renderFeedingHistoryPane(document.getElementById('feeding-right-pane'), char);
    return;
  }

  // Load submission — skip if already loaded from published fallback above
  if (!mySub) {
    try {
      const subs = await apiGet('/api/downtime_submissions?cycle_id=' + activeCycle._id);
      mySub = subs.find(s =>
        (s.character_id === char._id || s.character_id?.toString() === char._id?.toString())
      ) || null;
    } catch { /* no submissions */ }
  }

  if (mySub) {
    // Promote st_review → published_outcome for ST portal views
    if (!mySub.published_outcome && mySub.st_review?.outcome_visibility === 'published') {
      mySub.published_outcome = mySub.st_review.outcome_text;
    }
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
      if (mySub.feeding_vitae_allocation) {
        vitaeAllocation = mySub.feeding_vitae_allocation;
      }
      vitateTally = mySub.feeding_vitae_tally || computeVitateTally(char, mySub, liveTerrDocs);
      render();
      return;
    }

    // Check deferred flag (player chose to see STs at game)
    if (mySub.feeding_deferred) {
      feedingState = 'deferred';
      render();
      return;
    }
  }

  // Load declared method for display (used in both paths below)
  if (mySub?.responses?.['_feed_method']) {
    const methodId = mySub.responses['_feed_method'];
    declaredMethod = FEED_METHODS.find(m => m.id === methodId) || null;
    declaredDisc = mySub.responses['_feed_disc'] || '';
    declaredSpec = mySub.responses['_feed_spec'] || '';
  }

  // Capture ST roll result and vitae tally if present
  if (mySub?.feeding_roll?.successes != null) {
    stRollResult = mySub.feeding_roll;
  }
  // Use ST-persisted tally if available; otherwise compute locally from char data
  vitateTally = mySub?.feeding_vitae_tally || computeVitateTally(char, mySub, liveTerrDocs);

  // Prefer ST-confirmed pool from downtime processing.
  // Priority 1: feeding_roll.params (ST rolled on behalf of player — has exact size)
  // Priority 2: feeding_review.pool_validated (ST validated pool — parse size from expression)
  // Fallback: buildPool() from player's declared method
  if (mySub?.feeding_roll?.params?.size) {
    poolTotal = mySub.feeding_roll.params.size;
    stRote  = mySub.feeding_roll.params.rote  || false;
    stAgain = mySub.feeding_roll.params.again ?? 10;
    const roteLabel = stRote ? ' \u2014 Rote quality' : '';
    poolBreakdown = `ST confirmed: ${poolTotal} dice${roteLabel}`;
    feedingState = 'ready';
  } else if (mySub?.feeding_review?.pool_status === 'validated' && mySub.feeding_review.pool_validated) {
    const rev = mySub.feeding_review;
    const sizeMatch = rev.pool_validated.match(/=\s*(\d+)\s*$/);
    if (sizeMatch) {
      poolTotal = parseInt(sizeMatch[1], 10);
      // Include spec bonus from ST processing — pool_mod_spec is applied at
      // roll time in the admin panel but was missing here, causing a mismatch
      // between what the ST rolls and what the player sees/rolls.
      poolTotal += (rev.pool_mod_spec || 0);
      stRote  = mySub.st_review?.feeding_rote || false;
      stAgain = rev.eight_again ? 8 : rev.nine_again ? 9 : 10;
      const specInfo = (rev.active_feed_specs?.length)
        ? ` + ${rev.active_feed_specs.join(', ')} +${rev.pool_mod_spec}`
        : '';
      const roteLabel = stRote ? ' \u2014 Rote quality' : '';
      const againLabel = stAgain === 8 ? ' \u2014 8-Again' : stAgain === 9 ? ' \u2014 9-Again' : '';
      poolBreakdown = `ST confirmed: ${rev.pool_validated}${specInfo}${roteLabel}${againLabel}`;
      feedingState = 'ready';
    } else if (declaredMethod) {
      buildPool(declaredMethod, declaredDisc, declaredSpec);
      feedingState = 'ready';
    } else {
      feedingState = 'no_submission';
    }
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
    // Promote st_review → published_outcome for ST portal views
    allSubs.forEach(s => {
      if (!s.published_outcome && s.st_review?.outcome_visibility === 'published') {
        s.published_outcome = s.st_review.outcome_text;
      }
    });
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

function renderStRollResult() {
  if (!stRollResult) return '';
  const suc = stRollResult.successes ?? 0;
  const exc = stRollResult.exceptional || suc >= 5;
  const again = stRollResult.params?.again ?? 10;
  const againLabel = again === 8 ? '8-Again' : again === 9 ? '9-Again' : '';
  const rote = stRollResult.params?.rote;
  const pool = stRollResult.params?.size ?? 0;
  const cls = suc === 0 ? 'feeding-st-roll-fail' : exc ? 'feeding-st-roll-exc' : 'feeding-st-roll-suc';

  let h = `<div class="feeding-st-roll">`;
  h += `<div class="feeding-st-roll-head">ST Roll Result</div>`;
  h += `<div class="feeding-st-roll-body">`;
  h += `<span class="feeding-st-roll-dice">${pool} dice`;
  if (againLabel) h += ` \u00B7 ${againLabel}`;
  if (rote) h += ' \u00B7 Rote';
  h += '</span>';
  h += `<span class="feeding-st-roll-result ${cls}">${suc} success${suc !== 1 ? 'es' : ''}`;
  if (exc && suc > 0) h += ' (exceptional)';
  h += '</span>';

  // Show individual dice if stored
  if (stRollResult.dice_string) {
    h += `<span class="feeding-st-roll-detail">${esc(stRollResult.dice_string)}</span>`;
  }

  h += '</div></div>';
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

  const na = bestS ? skNineAgain(c, bestS) : false;
  const specBonus = specName && bestSpecs.includes(specName) ? ((na || hasAoE(c, specName)) ? 2 : 1) : 0;
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

// ── Compute vitae tally from character + submission data ──────────────────────
// Used when feeding_vitae_tally hasn't been saved by the ST yet (ready state).
// Returns the same shape as feeding_vitae_tally.
// liveTerrDocs: array from /api/territories — overrides hardcoded TERRITORY_DATA ambienceMod
function computeVitateTally(char, sub, liveTerrDocs = []) {
  if (!char) return null;

  // Herd: effective dots (cp + free + free_mci + xp + SSJ/Flock bonuses)
  const herd = domMeritContrib(char, 'Herd');

  // Oath of Fealty: covenant status dots (only if character has the pact)
  const hasOoF = (char.powers || []).some(p => p.category === 'pact' && p.name === 'Oath of Fealty');
  const oath_of_fealty = hasOoF ? effectiveInvictusStatus(char) : 0;

  // Ghoul retainers: count Retainer merits with 'ghoul' qualifier
  const ghouls = (char.merits || []).filter(m =>
    m.name === 'Retainer' && (m.area || m.qualifier || '').toLowerCase().includes('ghoul')
  ).length;

  // Merge live territory docs over hardcoded defaults — live values take precedence
  const effectiveTerrs = TERRITORY_DATA.map(t => {
    const live = liveTerrDocs.find(d => d.id === t.id);
    return live ? { ...t, ambience: live.ambience ?? t.ambience, ambienceMod: live.ambienceMod ?? t.ambienceMod } : t;
  });

  // Ambience: best territory among player-declared feeding territories
  let ambience = -4; // Barrens default
  let ambience_territory = 'Barrens';
  if (sub?.responses?.feeding_territories) {
    try {
      const grid = JSON.parse(sub.responses.feeding_territories);
      for (const [tid, status] of Object.entries(grid)) {
        if (status !== 'resident' && status !== 'poach') continue;
        const td = effectiveTerrs.find(t => t.id === tid || tid.startsWith(t.id));
        if (td?.ambienceMod != null && td.ambienceMod > ambience) {
          ambience = td.ambienceMod;
          ambience_territory = td.name;
        }
      }
    } catch { /* ignore */ }
  }

  // Rite cost and manual adjustment from ST-saved feeding_review
  const rev = sub?.feeding_review || {};
  const rite_cost = rev.vitae_rite_cost  ?? 0;
  const manual    = rev.vitae_mod_manual ?? 0;

  const autoSum   = herd + oath_of_fealty + ambience - ghouls;
  const total_bonus = Math.max(0, autoSum + manual - rite_cost);

  return { herd, ambience, ambience_territory, oath_of_fealty, ghouls, rite_cost, manual, total_bonus };
}

// ── Render vitae breakdown card ───────────────────────────────────────────────
function renderVitaeTallyCard(tally, vessels = null) {
  if (!tally) return '';
  let h = '<div class="fvt-card">';
  h += '<div class="fvt-title">Vitae Sources</div>';
  if (vessels !== null) h += `<div class="fvt-row"><span class="fvt-label">Vessels (from roll)</span><span class="fvt-val">${vessels}</span></div>`;
  if (tally.herd)         h += `<div class="fvt-row fvt-pos"><span class="fvt-label">Herd</span><span class="fvt-val">+${tally.herd}</span></div>`;
  if (tally.oath_of_fealty) h += `<div class="fvt-row fvt-pos"><span class="fvt-label">Oath of Fealty</span><span class="fvt-val">+${tally.oath_of_fealty}</span></div>`;
  if (tally.ambience != null && tally.ambience !== 0) {
    const lbl = tally.ambience_territory ? `Ambience (${tally.ambience_territory})` : 'Ambience';
    const cls = tally.ambience > 0 ? ' fvt-pos' : ' fvt-neg';
    const sign = tally.ambience > 0 ? '+' : '';
    h += `<div class="fvt-row${cls}"><span class="fvt-label">${esc(lbl)}</span><span class="fvt-val">${sign}${tally.ambience}</span></div>`;
  }
  if (tally.ghouls)    h += `<div class="fvt-row fvt-neg"><span class="fvt-label">Ghoul retainers</span><span class="fvt-val">\u2212${tally.ghouls}</span></div>`;
  if (tally.rite_cost) h += `<div class="fvt-row fvt-neg"><span class="fvt-label">Rite costs</span><span class="fvt-val">\u2212${tally.rite_cost}</span></div>`;
  if (tally.manual)    h += `<div class="fvt-row${tally.manual > 0 ? ' fvt-pos' : ' fvt-neg'}"><span class="fvt-label">Adjustment</span><span class="fvt-val">${tally.manual > 0 ? '+' : ''}${tally.manual}</span></div>`;
  h += '<div class="fvt-divider"></div>';
  h += `<div class="fvt-row fvt-total"><span class="fvt-label">Bonus vitae</span><span class="fvt-val">+${tally.total_bonus}</span></div>`;
  h += '</div>';
  return h;
}

function fvcConseqText(v) {
  if (v <= 2) return 'Safe';
  if (v === 3) return 'Drained';
  if (v <= 5) return 'Serious injury';
  if (v === 6) return 'Critical';
  return 'Fatal';
}

function fvcConseqClass(v) {
  if (v <= 2) return 'fvc-safe';
  if (v === 3) return 'fvc-drained';
  if (v <= 5) return 'fvc-serious';
  return 'fvc-critical';
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
    if (stRote)    h += ' <span class="feeding-rote-badge">Rote</span>';
    if (stAgain === 9) h += ' <span class="feeding-again-badge">9-Again</span>';
    if (stAgain === 8) h += ' <span class="feeding-again-badge">8-Again</span>';
    h += '</p>';
    h += `<p class="feeding-method-desc">${esc(declaredMethod.desc)}</p>`;
    h += `<div class="feeding-pool-display">`;
    h += `<span class="feeding-pool-breakdown">${esc(poolBreakdown)}</span>`;
    h += `<span class="feeding-pool-total">${poolTotal} dice</span>`;
    h += '</div>';
    h += renderFeedingSummary();
    h += renderVitaeTallyCard(vitateTally);
    h += renderStRollResult();
    if (!stRollResult) {
      h += '<p class="feeding-warning">You only get one roll. Once you roll, you are committed to the result.</p>';
      h += `<button id="feeding-roll-btn" class="feeding-roll-btn">Roll Feeding (${poolTotal} dice)</button>`;
    }
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

    // "See Storytellers" defer path — always available until roll or defer chosen
    h += '<div class="feeding-defer-row">';
    h += '<span class="feeding-defer-or">or</span>';
    h += '<button id="feeding-defer-btn" class="feeding-defer-btn">See Storytellers at Start of Game</button>';
    h += '</div>';

    h += '</div>';
  }

  // ── DEFERRED ──
  if (feedingState === 'deferred') {
    h += '<div class="feeding-deferred-msg">See your Storytellers at the start of game.</div>';
  }

  // ── ROLLED ──
  if (feedingState === 'rolled' && rollResult) {
    const { cols, successes, vessels, safeVitae, methodName, dramaticFailure } = rollResult;

    // Show ST-confirmed result if published
    if (publishedFeedingText) {
      h += `<div class="feeding-confirmed">`;
      h += `<div class="feeding-confirmed-head">&#x2713; Confirmed Result</div>`;
      h += `<p class="feeding-confirmed-body">${esc(publishedFeedingText)}</p>`;
      h += `</div>`;
    }

    // Player Feedback (player_facing_note from feeding_review — read directly,
    // as it is not embedded in the ## Feeding section of published_outcome)
    const feedingNote = currentSub?.feeding_review?.player_facing_note?.trim();
    if (feedingNote) {
      h += `<div class="proj-card-feedback"><span class="proj-card-feedback-label">ST Note</span>${esc(feedingNote)}</div>`;
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

    // ── Vitae breakdown card ──
    h += renderVitaeTallyCard(vitateTally, vessels);

    if (dramaticFailure) {
      h += '<div class="feeding-dramatic">Dramatic failure \u2014 see your Storyteller at game before feeding.</div>';
    } else if (vessels === 0) {
      h += '<p class="feeding-no-vessels">No vessels secured this hunt.</p>';
    } else {
      const bonusVitae = vitateTally?.total_bonus ?? 0;
      const allocated = vitaeAllocation && vitaeAllocation.length === vessels;
      h += `<div class="feeding-vessels-grid" id="feeding-vessels-grid">`;
      for (let i = 0; i < vessels; i++) {
        h += `<div class="feeding-vessel-card" data-vessel-idx="${i}">`;
        h += `<span class="fvc-label">Vessel ${i + 1}</span>`;
        if (allocated) {
          const sv = vitaeAllocation[i];
          h += `<span class="fvc-val">${sv} vitae</span>`;
          h += `<span class="fvc-consequence ${fvcConseqClass(sv)}">${fvcConseqText(sv)}</span>`;
        } else {
          h += `<select class="fvc-select" id="fvc-sel-${i}" data-vessel-idx="${i}">`;
          h += '<option value="">\u2014</option>';
          h += '<option value="1">1 vitae \u2014 Safe</option>';
          h += '<option value="2">2 vitae \u2014 Safe</option>';
          h += '<option value="3">3 vitae \u2014 Drained (medical care needed)</option>';
          h += '<option value="4">4 vitae \u2014 Serious injury</option>';
          h += '<option value="5">5 vitae \u2014 Serious injury</option>';
          h += '<option value="6">6 vitae \u2014 Critical (near death)</option>';
          h += '<option value="7">7 vitae \u2014 Fatal</option>';
          h += '</select>';
          h += `<span class="fvc-consequence" id="fvc-con-${i}"></span>`;
        }
        h += '</div>';
      }
      h += '</div>';
      if (allocated) {
        const vesselTotal = vitaeAllocation.reduce((a, b) => a + b, 0);
        const grandTotal  = vesselTotal + (vitateTally?.total_bonus ?? 0);
        if (vitateTally?.total_bonus) {
          h += `<div class="fvc-total">Vessel vitae: <strong>${vesselTotal}</strong> + Bonus: <strong>+${vitateTally.total_bonus}</strong> = <strong>${grandTotal}</strong> total</div>`;
        } else {
          h += `<div class="fvc-total">Total Vitae: <strong>${vesselTotal}</strong></div>`;
        }
        h += '<div class="fvc-alloc-badge">\u2713 Allocation recorded</div>';
      } else {
        if (bonusVitae) {
          h += `<div class="fvc-total">Vessel vitae: <span id="fvc-total-val">0</span> + Bonus: <strong>+${bonusVitae}</strong> = <span id="fvc-grand-val">${bonusVitae}</span> total</div>`;
        } else {
          h += `<div class="fvc-total">Total Vitae: <span id="fvc-total-val">0</span></div>`;
        }
        h += `<p class="feeding-overfeed-warn">Draining beyond safe vitae (${safeVitae}) risks a Humanity check.</p>`;
        h += '<button id="fvc-confirm" class="qf-btn qf-btn-submit" disabled>Confirm Allocation</button>';
      }
    }

    h += '</div>';

    // ── ST CONFIRM PANEL ──
    if (isST) {
      const stVesselTotal = vitaeAllocation
        ? vitaeAllocation.reduce((a, b) => a + b, 0)
        : safeVitae;
      const stBonus = vitateTally?.total_bonus ?? 0;
      const stDefault = stVesselTotal + stBonus;
      h += `<div class="feed-st-confirm">`;
      h += `<div class="feed-st-confirm-lbl">Confirm vitae gained:</div>`;
      h += `<div class="feed-st-confirm-lbl feed-inf-row">Influence spent last cycle: <input type="number" id="feed-inf-spent" class="feed-inf-input" min="0" value="0" placeholder="0"></div>`;
      if (stBonus) {
        h += `<div class="feed-st-vitae-total">Vessel vitae: <strong>${stVesselTotal}</strong> + Bonus: <strong>+${stBonus}</strong> = <strong>${stDefault}</strong> total</div>`;
      } else {
        h += `<div class="feed-st-vitae-total">Vessel vitae: <strong>${stVesselTotal}</strong></div>`;
      }
      h += `<div class="feed-confirm-controls">`;
      h += `<button class="feed-adj" id="feed-confirm-adj-down">\u2212</button>`;
      h += `<span class="feed-confirm-val" id="feed-confirm-n">${stDefault}</span>`;
      h += `<button class="feed-adj" id="feed-confirm-adj-up">+</button>`;
      h += `</div>`;
      h += `<button class="feed-confirm-btn" id="feed-confirm-btn">Confirm Feed</button>`;
      h += `</div>`;
    }
  }

  // ── ST OVERRIDE PANEL ──
  if (isST && feedingState !== 'loading') {
    if (feedingState === 'deferred') {
      h += '<div class="feeding-st-override">';
      h += '<span class="feeding-st-label">ST Override</span>';
      h += '<button id="feeding-release-btn" class="feeding-roll-btn">Release Roll (ST)</button>';
      h += '</div>';
    } else if (feedingState === 'rolled') {
      h += '<div class="feeding-st-override">';
      h += '<span class="feeding-st-label">ST Override</span>';
      h += '<button id="feeding-reroll-btn" class="feeding-roll-btn">Reset Roll (ST)</button>';
      h += '</div>';
    }
  }

  h += '</div>';
  container.innerHTML = h;
  wireEvents();
  if (isST && feedingState === 'rolled' && currentChar) {
    loadInfluenceSpend(String(currentChar._id));
  }
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

  // Vessel allocation selectors
  container.querySelectorAll('.fvc-select').forEach(sel => {
    sel.addEventListener('change', updateVesselUI);
  });

  // Confirm allocation
  container.querySelector('#fvc-confirm')?.addEventListener('click', doConfirmAllocation);

  // Roll button
  container.querySelector('#feeding-roll-btn')?.addEventListener('click', doFeedingRoll);

  // ST re-roll
  container.querySelector('#feeding-reroll-btn')?.addEventListener('click', async () => {
    rollResult = null;
    vitaeAllocation = null;
    if (responseSubId) {
      try {
        await apiPut(`/api/downtime_submissions/${responseSubId}`, {
          feeding_roll_player: null,
          feeding_vitae_allocation: null,
          feeding_deferred: null,
        });
      } catch { /* ignore */ }
    }
    if (declaredMethod) {
      feedingState = 'ready';
      buildPool(declaredMethod, declaredDisc, declaredSpec);
    } else {
      feedingState = 'no_submission';
    }
    render();
  });

  // ST release (deferred → ready)
  container.querySelector('#feeding-release-btn')?.addEventListener('click', async () => {
    if (!responseSubId) return;
    try {
      await apiPut(`/api/downtime_submissions/${responseSubId}`, {
        feeding_deferred: null,
        feeding_roll_player: null,
        feeding_vitae_allocation: null,
      });
      if (declaredMethod) {
        feedingState = 'ready';
        buildPool(declaredMethod, declaredDisc, declaredSpec);
      } else {
        feedingState = 'no_submission';
      }
      render();
    } catch {
      alert('Could not release — please try again.');
    }
  });

  // ST confirm feed
  container.querySelector('#feed-confirm-adj-down')?.addEventListener('click', () => {
    const el = container.querySelector('#feed-confirm-n');
    if (el) el.textContent = Math.max(0, (parseInt(el.textContent) || 0) - 1);
  });
  container.querySelector('#feed-confirm-adj-up')?.addEventListener('click', () => {
    const el = container.querySelector('#feed-confirm-n');
    if (el) el.textContent = (parseInt(el.textContent) || 0) + 1;
  });
  container.querySelector('#feed-confirm-btn')?.addEventListener('click', async () => {
    if (!currentChar) return;
    const charId = String(currentChar._id);
    const n = parseInt(container.querySelector('#feed-confirm-n')?.textContent) || 0;

    const btn = container.querySelector('#feed-confirm-btn');
    if (btn) { btn.textContent = 'Saving\u2026'; btn.disabled = true; }

    let vitaeOk = false;
    // Write vitae directly to API — trackerAdj needs suiteState.chars which is
    // empty in player.html context
    try {
      await apiPut('/api/tracker_state/' + charId, { vitae: n });
      vitaeOk = true;
    } catch (err) {
      console.error('Tracker vitae write failed:', err);
    }

    // Influence is localStorage-only; write directly (same origin as game app)
    const infEl = container.querySelector('#feed-inf-spent');
    const infSpent = infEl ? (parseInt(infEl.value) || 0) : 0;
    if (infSpent > 0) {
      try {
        const key = 'tm_tracker_local_' + charId;
        const local = JSON.parse(localStorage.getItem(key) || '{}');
        local.inf = Math.max(0, (local.inf ?? 0) - infSpent);
        localStorage.setItem(key, JSON.stringify(local));
      } catch { /* ignore */ }
    }

    if (btn) {
      if (vitaeOk) {
        const infLine = infSpent > 0 ? ` \u00B7 Inf \u2212${infSpent}` : '';
        btn.textContent = `\u2713 Vitae ${n}${infLine}`;
        btn.style.background = 'var(--green2, #4a7c59)';
        btn.style.color = 'var(--bg)';
      } else {
        btn.textContent = 'Save failed \u2014 retry';
        btn.style.background = 'var(--crim)';
        btn.style.color = '#fff';
        btn.disabled = false;
      }
    }
  });

  // Defer button
  container.querySelector('#feeding-defer-btn')?.addEventListener('click', async () => {
    if (!responseSubId) return;
    try {
      await apiPut(`/api/downtime_submissions/${responseSubId}`, { feeding_deferred: true });
      feedingState = 'deferred';
      render();
    } catch {
      alert('Could not save — please try again.');
    }
  });
}

function updateVesselUI() {
  const sels = Array.from(container.querySelectorAll('.fvc-select'));
  let total = 0, allFilled = true;
  sels.forEach(sel => {
    const idx = sel.dataset.vesselIdx;
    const conEl = container.querySelector(`#fvc-con-${idx}`);
    if (sel.value) {
      const v = parseInt(sel.value, 10);
      total += v;
      if (conEl) { conEl.textContent = fvcConseqText(v); conEl.className = `fvc-consequence ${fvcConseqClass(v)}`; }
    } else {
      allFilled = false;
      if (conEl) { conEl.textContent = ''; conEl.className = 'fvc-consequence'; }
    }
  });
  const totalEl = container.querySelector('#fvc-total-val');
  if (totalEl) totalEl.textContent = total;
  const grandEl = container.querySelector('#fvc-grand-val');
  if (grandEl) grandEl.textContent = total + (vitateTally?.total_bonus ?? 0);
  const confirmBtn = container.querySelector('#fvc-confirm');
  if (confirmBtn) confirmBtn.disabled = !allFilled || sels.length === 0;
}

async function doConfirmAllocation() {
  const sels = Array.from(container.querySelectorAll('.fvc-select'));
  const alloc = sels.map(s => parseInt(s.value, 10));
  if (alloc.some(v => isNaN(v))) return;

  if (responseSubId) {
    try {
      await apiPut(`/api/downtime_submissions/${responseSubId}`, { feeding_vitae_allocation: alloc });
    } catch {
      return; // leave selectors interactive on failure
    }
  }
  vitaeAllocation = alloc;
  render();
}

function rollDiceRote(n, again = 10) {
  const r1 = rollDice(n, again), r2 = rollDice(n, again);
  return cntSuc(r1) >= cntSuc(r2) ? r1 : r2;
}

async function doFeedingRoll() {
  if (poolTotal <= 0) return;

  const cols = stRote ? rollDiceRote(poolTotal, stAgain) : rollDice(poolTotal, stAgain);
  const successes = cntSuc(cols);
  const methodName = declaredMethod?.name || FEED_METHODS.find(m => m.id === selectedMethodId)?.name || 'Unknown';
  const usedDisc = !!(declaredDisc || selectedDisc);

  rollResult = {
    cols,
    successes,
    vessels: successes,
    safeVitae: successes * 2,
    methodName,
    pool: poolTotal,
    again: stAgain,
    breakdown: poolBreakdown,
    rolledAt: new Date().toISOString(),
    dramaticFailure: usedDisc && successes === 0,
  };

  feedingState = 'rolled';

  // Persist to DB (sole lock source — no localStorage)
  if (responseSubId) {
    try {
      await apiPut(`/api/downtime_submissions/${responseSubId}`, { feeding_roll_player: rollResult });
    } catch {
      alert('Roll saved locally but could not be recorded to the server. Please refresh and try again, or contact your Storyteller.');
    }
  }

  render();
}

// ── ST: Influence spend pre-fill ──
async function loadInfluenceSpend(charId) {
  const el = container?.querySelector('#feed-inf-spent');
  if (!el) return;
  try {
    const subs = await apiGet('/api/downtime_submissions');
    const latest = subs
      .filter(s => String(s.character_id) === charId && s.st_review?.influence_spent != null)
      .sort((a, b) => (String(b._id) > String(a._id) ? 1 : -1))[0];
    el.value = latest ? String(latest.st_review.influence_spent) : '0';
  } catch {
    el.value = '0';
  }
}
