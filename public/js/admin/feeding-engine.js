/**
 * Feeding test engine for admin Engine domain.
 * Self-contained: character data, pool building, rolling, vitae application.
 */

import { esc, displayName, dropdownName } from '../data/helpers.js';
import { getAttrEffective as getAttrVal, skDots, skTotal, calcVitaeMax } from '../data/accessors.js';
import { SKILLS_MENTAL } from '../data/constants.js';

// ── Dice math (10-again, no state coupling) ──

function d10() { return Math.floor(Math.random() * 10) + 1; }
function mkDie(v) { return { v, s: v >= 8, x: v >= 10 }; }
function mkChain(rv) {
  const r = mkDie(rv); const ch = [];
  let l = r; while (l.x) { const c = mkDie(d10()); ch.push(c); l = c; }
  return { r, ch };
}
function rollDice(n) { const c = []; for (let i = 0; i < n; i++) c.push(mkChain(d10())); return c; }
function cntSuc(cols) { let s = 0; cols.forEach(col => { if (col.r.s) s++; col.ch.forEach(d => { if (d.s) s++; }); }); return s; }

// ── Constants ──

const FEED_METHODS = [
  { id: 'seduction', name: 'Seduction', desc: 'Lure a vessel close', attrs: ['Presence', 'Manipulation'], skills: ['Empathy', 'Socialise', 'Persuasion'], discs: ['Majesty', 'Dominate'] },
  { id: 'stalking', name: 'Stalking', desc: 'Prey on a target unseen', attrs: ['Dexterity', 'Wits'], skills: ['Stealth', 'Athletics'], discs: ['Protean', 'Obfuscate'] },
  { id: 'force', name: 'By Force', desc: 'Overpower and drain', attrs: ['Strength'], skills: ['Brawl', 'Weaponry'], discs: ['Vigour', 'Nightmare'] },
  { id: 'familiar', name: 'Familiar Face', desc: 'Exploit an existing acquaintance', attrs: ['Manipulation', 'Presence'], skills: ['Persuasion', 'Subterfuge'], discs: ['Dominate', 'Majesty'] },
  { id: 'intimidation', name: 'Intimidation', desc: 'Compel through fear', attrs: ['Strength', 'Manipulation'], skills: ['Intimidation', 'Subterfuge'], discs: ['Nightmare', 'Dominate'] },
];

const FEED_TERRS = [
  { id: '', name: 'No territory', ambienceMod: 0 },
  { id: 'academy', name: 'The Academy', ambience: 'Curated', ambienceMod: +3 },
  { id: 'dockyards', name: 'The Dockyards', ambience: 'Settled', ambienceMod: 0 },
  { id: 'harbour', name: 'The Harbour', ambience: 'Untended', ambienceMod: -2 },
  { id: 'northshore', name: 'The North Shore', ambience: 'Tended', ambienceMod: +2 },
  { id: 'secondcity', name: 'The Second City', ambience: 'Tended', ambienceMod: +2 },
];

// ── State ──

let chars = [];
let feedChar = null;
let feedMethod = null;
let feedTerrId = '';
let feedDiscName = '';
let feedResult = null;   // { cols, suc, poolN }
let applyAmount = 0;     // vitae to apply (adjustable)

// ── Tracker persistence (localStorage, same keys as suite tracker) ──

function getTracker(c) {
  try {
    const s = JSON.parse(localStorage.getItem('tm_tracker_' + c.name) || 'null');
    if (s) return s;
  } catch { /* ignore */ }
  const maxWP = (c.attributes?.Resolve?.dots || 0) + (c.attributes?.Composure?.dots || 0);
  return { vitae: 0, wp: maxWP, inf: 0 };
}

function setTracker(c, state) {
  localStorage.setItem('tm_tracker_' + c.name, JSON.stringify(state));
}

// ── Init ──

export function initFeedingEngine(allChars) {
  chars = allChars.filter(c => !c.retired);
  render();
}

// ── Pool calc ──

function buildPool() {
  if (!feedChar || !feedMethod) return null;
  const m = feedMethod;

  let bestAttrVal = 0, bestAttrName = '';
  for (const a of m.attrs) {
    const v = getAttrVal(feedChar, a);
    if (v > bestAttrVal) { bestAttrVal = v; bestAttrName = a; }
  }

  let bestSkillVal = 0, bestSkillName = '', bestSkillSpec = '';
  for (const s of m.skills) {
    const v = skTotal(feedChar, s);
    if (v > bestSkillVal) {
      bestSkillVal = v; bestSkillName = s;
      const sk = feedChar.skills?.[s];
      bestSkillSpec = sk?.specs?.length ? sk.specs.join(', ') : '';
    }
  }

  const terr = FEED_TERRS.find(t => t.id === feedTerrId) || FEED_TERRS[0];
  const ambMod = terr.ambienceMod || 0;
  const discVal = (feedDiscName && feedChar.disciplines?.[feedDiscName]?.dots) || 0;
  const unskilled = bestSkillVal === 0
    ? (m.skills.some(s => !SKILLS_MENTAL.includes(s)) ? -1 : -3)
    : 0;
  const total = Math.max(0, bestAttrVal + bestSkillVal + discVal + ambMod + unskilled);

  return { bestAttrName, bestAttrVal, bestSkillName, bestSkillVal, bestSkillSpec, discVal, discName: feedDiscName, ambMod, ambience: terr.ambience || '', unskilled, total };
}

// ── Render ──

function render() {
  const el = document.getElementById('feeding-engine');
  if (!el) return;

  const pool = buildPool();

  let h = '<div class="fe-wrap">';
  h += '<div class="slabel">Feeding Test</div>';

  // Character selector
  h += '<select class="de-sc-btn" id="fe-char" style="width:100%;margin-bottom:10px;">';
  h += '<option value="">Character</option>';
  for (const c of chars) {
    const sel = feedChar && feedChar._id === c._id ? ' selected' : '';
    h += `<option value="${esc(c._id)}"${sel}>${esc(dropdownName(c))}</option>`;
  }
  h += '</select>';

  if (feedChar) {
    // Current vitae display
    const tracker = getTracker(feedChar);
    const maxV = calcVitaeMax(feedChar);
    h += '<div class="fe-vitae-bar">';
    h += `<span class="fe-vitae-label">Current Vitae</span>`;
    h += `<span class="fe-vitae-val">${tracker.vitae} / ${maxV}</span>`;
    h += '</div>';

    // Territory selector
    h += '<select class="de-pb-sel" id="fe-terr" style="width:100%;margin-bottom:10px;">';
    for (const t of FEED_TERRS) {
      const sel = feedTerrId === t.id ? ' selected' : '';
      const label = t.id ? `${t.name} \u2014 ${t.ambience} (${t.ambienceMod > 0 ? '+' : ''}${t.ambienceMod})` : t.name;
      h += `<option value="${esc(t.id)}"${sel}>${esc(label)}</option>`;
    }
    h += '</select>';

    // Method cards
    h += '<div class="fe-methods">';
    for (const m of FEED_METHODS) {
      const sel = feedMethod?.id === m.id ? ' selected' : '';
      h += `<button class="feed-method-card${sel}" data-feed-method="${m.id}">`;
      h += `<div class="feed-method-name">${esc(m.name)}</div>`;
      h += `<div class="feed-method-desc">${esc(m.desc)}</div>`;
      h += '</button>';
    }
    h += '</div>';

    // Discipline selector (relevant to method, that char knows)
    if (feedMethod) {
      const availDiscs = feedMethod.discs.filter(d => feedChar.disciplines?.[d]?.dots);
      h += '<div class="fe-disc-row">';
      h += '<span class="feed-disc-lbl">Discipline</span>';
      h += '<select class="de-pb-sel" id="fe-disc" style="flex:1;">';
      h += '<option value="">None</option>';
      for (const d of availDiscs) {
        const dots = feedChar.disciplines[d].dots;
        const sel = feedDiscName === d ? ' selected' : '';
        h += `<option value="${esc(d)}"${sel}>${esc(d)} (${dots})</option>`;
      }
      h += '</select></div>';
    }

    // Pool breakdown
    if (pool) {
      h += '<div class="feed-pool-box">';
      h += '<div class="feed-pool-breakdown">';
      h += `<span>${pool.bestAttrVal}</span> ${esc(pool.bestAttrName)}`;
      h += `<br>+ <span>${pool.bestSkillVal}</span> ${esc(pool.bestSkillName)}`;
      if (pool.bestSkillSpec) h += ` <span class="feed-dim">[${esc(pool.bestSkillSpec)}]</span>`;
      if (pool.discVal) h += `<br>+ <span>${pool.discVal}</span> ${esc(pool.discName)}`;
      if (pool.ambMod !== 0) h += `<br>${pool.ambMod > 0 ? '+ ' : '\u2212 '}<span>${Math.abs(pool.ambMod)}</span> Ambience (${esc(pool.ambience)})`;
      if (pool.unskilled) h += `<br>\u2212 <span>${Math.abs(pool.unskilled)}</span> <span class="feed-dim">(unskilled)</span>`;
      h += '</div>';
      h += '<div class="feed-pool-total">';
      h += `<div class="feed-pool-n">${pool.total}</div>`;
      h += '<span class="feed-pool-lbl">dice</span>';
      h += '</div></div>';

      // Roll button
      h += '<button class="feed-roll-btn" id="fe-roll">Hunt</button>';
    }

    // Result
    if (feedResult) {
      h += renderResult();
    }
  }

  h += '</div>';
  el.innerHTML = h;
  wireEvents();
}

function renderResult() {
  const { cols, suc, poolN } = feedResult;
  const vessels = suc;
  const safeVitae = vessels * 2;

  let h = '<div class="feed-result-box">';
  h += '<div class="feed-suc-row"><div>';
  h += `<div class="feed-suc">${suc}</div>`;
  h += `<div class="feed-suc-lbl">success${suc !== 1 ? 'es' : ''} \u2014 ${poolN} dice</div>`;
  h += '</div></div>';

  // Dice
  h += '<div class="feed-dice-row">';
  for (const col of cols) {
    for (const d of [col.r, ...col.ch]) {
      let cls = 'feed-die';
      if (d.s) cls += ' fd-s';
      if (d.v === 1) cls += ' fd-1';
      h += `<span class="${cls}">${d.v}</span>`;
    }
  }
  h += '</div></div>';

  // Vessels and vitae
  if (vessels === 0) {
    h += '<div class="feed-vessel-row" style="padding:12px 14px;">';
    h += '<div class="feed-v-lbl">No vessels secured this hunt.</div>';
    h += '</div>';
  } else {
    h += '<div class="feed-vessel-row" style="padding:12px 14px 8px;">';
    h += `<div class="feed-v-num">${vessels}</div>`;
    h += `<div class="feed-v-lbl">vessel${vessels !== 1 ? 's' : ''} available \u00B7 <b>${safeVitae} Vitae</b> safe (2 per vessel)</div>`;
    h += '</div>';

    // Apply controls
    const tracker = getTracker(feedChar);
    const maxV = calcVitaeMax(feedChar);
    const headroom = maxV - tracker.vitae;

    h += '<div class="fe-apply-section">';
    h += '<div class="feed-apply-lbl">Apply vitae gained</div>';
    h += '<div class="feed-apply-controls">';
    h += '<button class="feed-adj" id="fe-adj-down">\u2212</button>';
    h += `<span class="feed-adj-val" id="fe-apply-n">${applyAmount}</span>`;
    h += '<button class="feed-adj" id="fe-adj-up">+</button>';
    h += `<span class="feed-apply-cap">(max safe: ${safeVitae} \u00B7 headroom: ${headroom})</span>`;
    h += '</div>';

    if (applyAmount > safeVitae) {
      h += '<div class="fe-warn">\u26A0 Draining beyond safe vitae \u2014 Humanity check required</div>';
    }

    h += `<button class="feed-apply-btn" id="fe-apply">Apply ${applyAmount} Vitae to ${esc(displayName(feedChar))}</button>`;
    h += '</div>';
  }

  return h;
}

// ── Events ──

function wireEvents() {
  const $ = id => document.getElementById(id);

  $('fe-char')?.addEventListener('change', e => {
    feedChar = e.target.value ? chars.find(c => c._id === e.target.value) : null;
    feedMethod = null; feedDiscName = ''; feedResult = null; applyAmount = 0;
    render();
  });

  $('fe-terr')?.addEventListener('change', e => {
    feedTerrId = e.target.value;
    feedResult = null; applyAmount = 0;
    render();
  });

  $('fe-disc')?.addEventListener('change', e => {
    feedDiscName = e.target.value;
    feedResult = null; applyAmount = 0;
    render();
  });

  $('fe-roll')?.addEventListener('click', () => {
    const pool = buildPool();
    if (!pool || pool.total <= 0) return;
    const cols = rollDice(pool.total);
    const suc = cntSuc(cols);
    feedResult = { cols, suc, poolN: pool.total };
    applyAmount = Math.min(suc * 2, calcVitaeMax(feedChar) - getTracker(feedChar).vitae);
    applyAmount = Math.max(0, applyAmount);
    render();
  });

  $('fe-adj-down')?.addEventListener('click', () => {
    applyAmount = Math.max(0, applyAmount - 1);
    $('fe-apply-n').textContent = applyAmount;
    updateApplyBtn();
  });

  $('fe-adj-up')?.addEventListener('click', () => {
    // Allow going above safe vitae (but show warning)
    const maxV = calcVitaeMax(feedChar);
    const headroom = maxV - getTracker(feedChar).vitae;
    applyAmount = Math.min(headroom, applyAmount + 1);
    $('fe-apply-n').textContent = applyAmount;
    updateApplyBtn();
  });

  $('fe-apply')?.addEventListener('click', () => {
    if (!feedChar || applyAmount <= 0) return;
    const tracker = getTracker(feedChar);
    const maxV = calcVitaeMax(feedChar);
    const newV = Math.min(maxV, tracker.vitae + applyAmount);
    const gained = newV - tracker.vitae;
    tracker.vitae = newV;
    setTracker(feedChar, tracker);
    feedResult = null;
    applyAmount = 0;
    render();
  });

  document.querySelectorAll('#feeding-engine [data-feed-method]').forEach(btn => {
    btn.addEventListener('click', () => {
      feedMethod = FEED_METHODS.find(m => m.id === btn.dataset.feedMethod);
      feedDiscName = '';
      feedResult = null; applyAmount = 0;
      render();
    });
  });
}

function updateApplyBtn() {
  const btn = document.getElementById('fe-apply');
  if (btn && feedChar) {
    btn.textContent = `Apply ${applyAmount} Vitae to ${displayName(feedChar)}`;
  }
  // Show/hide warning
  const safeVitae = (feedResult?.suc || 0) * 2;
  const warnEl = document.querySelector('.fe-warn');
  if (warnEl) {
    warnEl.style.display = applyAmount > safeVitae ? '' : 'none';
  }
}
