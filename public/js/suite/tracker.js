/**
 * tracker.js — Session Tracker tab: overview, reset, downtime, prestige.
 *
 * State helpers for per-character tracker persistence (localStorage).
 * Imports the feeding subsystem from tracker-feed.js.
 */


import state from './data.js';
import { displayName, redactPlayer } from '../data/helpers.js';
import { getAttrVal, influenceTotal, calcVitaeMax, calcWillpowerMax } from '../data/accessors.js';

// ══════════════════════════════════════════════
//  STATE HELPERS
// ══════════════════════════════════════════════

function stMaxVitae(c) { return calcVitaeMax(c); }

function stMaxWP(c) { return calcWillpowerMax(c); }

function stMaxInf(c) { return influenceTotal(c); }

function stGetTracker(c) {
  const key = 'tm_tracker_' + c.name;
  try {
    const s = JSON.parse(localStorage.getItem(key) || 'null');
    if (s) return s;
  } catch (e) { /* ignore parse errors */ }
  return { vitae: 0, wp: stMaxWP(c), inf: stMaxInf(c) };
}

function stSetTracker(c, state) {
  localStorage.setItem('tm_tracker_' + c.name, JSON.stringify(state));
}

function stGetDt(c) {
  try { return JSON.parse(localStorage.getItem('tm_dt_' + c.name) || '{}'); } catch (e) { return {}; }
}

function stSetDt(c, val) {
  localStorage.setItem('tm_dt_' + c.name, JSON.stringify(val));
}

// ══════════════════════════════════════════════
//  ACTIVE CHARACTER STATE
// ══════════════════════════════════════════════

let stActive = [];

/** Return the current active-character name list. */
function stGetActive() { return stActive; }

// ══════════════════════════════════════════════
//  TOAST
// ══════════════════════════════════════════════

let tTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(tTimer);
  tTimer = setTimeout(() => t.classList.remove('on'), 2500);
}

// ══════════════════════════════════════════════
//  SESSION MANAGEMENT
// ══════════════════════════════════════════════

function stResetAll() {
  const chars = state.chars;
  const targets = stActive.length
    ? stActive.map(n => chars.find(c => c.name === n)).filter(Boolean)
    : chars;
  targets.forEach(c => {
    stSetTracker(c, { vitae: 0, wp: stMaxWP(c), inf: stMaxInf(c) });
  });
  toast('All trackers reset');
  renderStOverview();
}

function stApplyDowntime() {
  const chars = state.chars;
  const targets = stActive.length
    ? stActive.map(n => chars.find(c => c.name === n)).filter(Boolean)
    : chars;
  let changed = 0;
  targets.forEach(c => {
    const dt = stGetDt(c);
    if (!dt.wp && !dt.vitae && !dt.inf) return;
    const cur = stGetTracker(c);
    const maxV = stMaxVitae(c), maxWP = stMaxWP(c), maxInf = stMaxInf(c);
    if (dt.wp)    cur.wp    = Math.max(0, Math.min(maxWP,  cur.wp    - (parseInt(dt.wp) || 0)));
    if (dt.vitae) cur.vitae = Math.max(0, Math.min(maxV,   cur.vitae - (parseInt(dt.vitae) || 0)));
    if (dt.inf)   cur.inf   = Math.max(0, Math.min(maxInf, cur.inf   - (parseInt(dt.inf) || 0)));
    stSetTracker(c, cur);
    stSetDt(c, {});
    changed++;
  });
  toast(changed ? 'Downtime applied & cleared' : 'No downtime logged');
  renderStOverview();
}

// ══════════════════════════════════════════════
//  PRESTIGE LEADERBOARD
// ══════════════════════════════════════════════

function renderPrestige() {
  const chars = state.chars;
  const el = document.getElementById('st-prestige');
  if (!el || !chars.length) return;
  const ranked = chars.map(c => {
    const st = c.status || {};
    const clan = st.clan || 0;
    const cov = st.covenant || 0;
    const prestige = clan + cov;
    const influence = influenceTotal(c);
    return { name: displayName(c), clan, cov, prestige, influence };
  }).sort((a, b) => b.prestige - a.prestige || b.influence - a.influence).slice(0, 6);

  const open = el.dataset.open === '1';
  el.innerHTML = `<div class="prestige-board">
    <button class="prestige-toggle" onclick="togglePrestige()">
      <span class="prestige-title">Prestige Leaderboard</span>
      <span class="prestige-arr" id="prestige-arr" style="transform:rotate(${open ? 90 : 0}deg)">›</span>
    </button>
    <div class="prestige-body" id="prestige-body" style="display:${open ? 'block' : 'none'}">
      <div class="prestige-row" style="padding:4px 12px">
        <span></span><span></span>
        <span class="prestige-col-hdr">Clan</span>
        <span class="prestige-col-hdr">Cov</span>
        <span class="prestige-col-hdr">Infl</span>
      </div>
      ${ranked.map((r, i) => `<div class="prestige-row">
        <span class="prestige-rank">${i + 1}</span>
        <span class="prestige-name">${r.name}</span>
        <span class="prestige-col${r.clan ? '' : ' dim'}">${r.clan || '—'}</span>
        <span class="prestige-col${r.cov ? '' : ' dim'}">${r.cov || '—'}</span>
        <span class="prestige-col${r.influence ? '' : ' dim'}">${r.influence || '—'}</span>
      </div>`).join('')}
    </div>
  </div>`;
}

function togglePrestige() {
  const el = document.getElementById('st-prestige');
  if (!el) return;
  const open = el.dataset.open === '1';
  el.dataset.open = open ? '0' : '1';
  renderPrestige();
}

// ══════════════════════════════════════════════
//  ST OVERVIEW RENDER
// ══════════════════════════════════════════════

function renderStOverview() {
  const chars = state.chars;
  renderPrestige();
  const list = document.getElementById('st-char-list');
  const emptyMsg = document.getElementById('st-empty-msg');
  const sel = document.getElementById('st-char-sel');
  if (!list) return;

  if (sel && stActive.length) sel.value = stActive[0];

  list.innerHTML = '';
  if (emptyMsg) emptyMsg.style.display = stActive.length ? 'none' : 'block';

  stActive.forEach(name => {
    const c = chars.find(x => x.name === name);
    if (!c) return;
    const t = stGetTracker(c);
    const dt = stGetDt(c);
    const maxV = stMaxVitae(c), maxWP = stMaxWP(c), maxInf = stMaxInf(c);
    const slug = c.name.replace(/[^a-z0-9]/gi, '');
    const escapedName = c.name.replace(/'/g, "\\'");

    const row = document.createElement('div');
    row.className = 'st-char-row';
    row.innerHTML = `
      <div class="st-char-hdr">
        <div style="flex:1;min-width:0;">
          <div class="st-char-name">${displayName(c)}</div>
          <div class="st-char-meta">${c.clan || ''}${c.bloodline ? ' · ' + c.bloodline : ''} · ${c.covenant || ''}</div>
        </div>
        <div class="st-char-meta" style="margin-right:6px;">${redactPlayer(c.player || '')}</div>
        <button class="st-char-dismiss" onclick="stDismiss('${escapedName}')">✕</button>
      </div>
      <div class="st-char-trackers">
        <div class="st-tracker-cell">
          <div class="st-tracker-lbl">Vitae</div>
          <div class="st-tracker-val vitae-val" id="stv-v-${slug}">${t.vitae}</div>
          <div class="st-tracker-max">/ ${maxV}</div>
        </div>
        <div class="st-tracker-cell">
          <div class="st-tracker-lbl">Willpower</div>
          <div class="st-tracker-val wp-val" id="stv-w-${slug}">${t.wp}</div>
          <div class="st-tracker-max">/ ${maxWP}</div>
        </div>
        <div class="st-tracker-cell">
          <div class="st-tracker-lbl">Influence</div>
          <div class="st-tracker-val inf-val" id="stv-i-${slug}">${t.inf}</div>
          <div class="st-tracker-max">/ ${maxInf}</div>
        </div>
      </div>
      <div class="st-dt-row">
        <div class="st-dt-lbl">Downtime</div>
        <div class="st-dt-inputs">
          <div class="st-dt-field">
            <label>Vitae spent</label>
            <input type="number" min="0" placeholder="0" value="${dt.vitae || ''}"
              oninput="stLogDt('${escapedName}','vitae',this.value)">
          </div>
          <div class="st-dt-field">
            <label>WP spent</label>
            <input type="number" min="0" placeholder="0" value="${dt.wp || ''}"
              oninput="stLogDt('${escapedName}','wp',this.value)">
          </div>
          <div class="st-dt-field">
            <label>Influence spent</label>
            <input type="number" min="0" placeholder="0" value="${dt.inf || ''}"
              oninput="stLogDt('${escapedName}','inf',this.value)">
          </div>
        </div>
      </div>
    `;
    list.appendChild(row);
  });
}

// ══════════════════════════════════════════════
//  DOWNTIME LOGGING & CHARACTER SELECTION
// ══════════════════════════════════════════════

function stLogDt(name, field, val) {
  const chars = state.chars;
  const c = chars.find(x => x.name === name);
  if (!c) return;
  const dt = stGetDt(c);
  dt[field] = val === '' ? 0 : parseInt(val) || 0;
  stSetDt(c, dt);
}

function stPickChar(name) {
  stActive = name ? [name] : [];
  renderStOverview();
}

function stDismiss(name) {
  stActive = [];
  const sel = document.getElementById('st-char-sel');
  if (sel) sel.value = '';
  const fs = document.getElementById('feed-section');
  if (fs) fs.style.display = 'none';
  renderStOverview();
}

// ══════════════════════════════════════════════
//  EXPORTS
// ══════════════════════════════════════════════

export {
  // State helpers
  stMaxVitae,
  stMaxWP,
  stMaxInf,
  stGetTracker,
  stSetTracker,
  stGetDt,
  stSetDt,
  stGetActive,

  // Toast
  toast,

  // Session management
  stResetAll,
  stApplyDowntime,
  renderPrestige,
  togglePrestige,
  renderStOverview,
  stLogDt,
  stPickChar,
  stDismiss
};
