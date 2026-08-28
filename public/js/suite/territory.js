/**
 * territory.js — Territory Bids tab (vanilla JS).
 *
 * Manages territory bidding, influence allocation, and resolution at the table.
 * No framework dependencies, no server: state lives in localStorage under
 * `tm_bids_v2`.
 *
 * The board starts EMPTY (TBID.1). TERRS is the static five-entry catalogue the
 * "Open Territory Bid" picker draws from; a territory only reaches
 * `state.territories` once its Regent has been confirmed. Resolved territories
 * stay on the board as a collapsed row, reopened through the same
 * Regent-confirm step.
 */

// ══════════════════════════════════════════════
//  CONSTANTS & DATA
// ══════════════════════════════════════════════

const TERRS = [
  { id: 'academy', name: 'The Academy', defaultRegent: 'Jack Fallow', ambience: 'Curated', ambienceMod: +3 },
  { id: 'dockyards', name: 'The Dockyards', defaultRegent: 'René St. Dominique', ambience: 'Settled', ambienceMod: 0 },
  { id: 'harbour', name: 'The Harbour', defaultRegent: 'Reed Justice', ambience: 'Untended', ambienceMod: -2 },
  { id: 'northshore', name: 'The North Shore', defaultRegent: 'Alice Vunder', ambience: 'Tended', ambienceMod: +2 },
  { id: 'secondcity', name: 'The Second City', defaultRegent: 'René Meyer', ambience: 'Tended', ambienceMod: +2 },
];

const KEY = 'tm_bids_v2';

/**
 * Persisted-payload version. Version 1 is the empty-startable board introduced
 * by TBID.1. A saved payload with NO schemaVersion but a populated
 * `territories` array predates that story: it is kept exactly as saved and
 * stamped on the next write, so shipping this change never wipes a board that
 * is mid-session on somebody's browser.
 */
const SCHEMA_VERSION = 1;

let _id = Date.now();
const uid = () => String(++_id);

// ══════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════

let state = null;
let modal = null;
let saving = false;
let _saveTimer = null;

function dflt() {
  return {
    phase: 'open',
    peek: false,
    territories: [],
  };
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && Array.isArray(s.territories)) {
      // Already on the current model: use it as saved.
      if (s.schemaVersion != null) return { ...dflt(), ...s };
      // Pre-TBID.1 save with a live board: grandfather it in, version stamped
      // on the next persist() rather than reseeding the old always-five shape.
      if (s.territories.length) return { ...dflt(), ...s, schemaVersion: SCHEMA_VERSION };
      // Pre-TBID.1 save with nothing on the board: nothing to preserve.
    }
  } catch (e) { /* ignore */ }
  return dflt();
}

function payload() {
  return {
    schemaVersion: SCHEMA_VERSION,
    phase: state.phase,
    peek: state.peek,
    territories: state.territories,
  };
}

function persist() {
  clearTimeout(_saveTimer);
  saving = true;
  render();
  _saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(payload()));
    } catch (e) { /* ignore */ }
    saving = false;
    render();
  }, 500);
}

// ══════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════

const _fuzz = {};
function peekInfo(n, bidId) {
  if (n <= 0) return { approx: 0 };
  if (!_fuzz[bidId]) _fuzz[bidId] = (Math.random() * 0.3) - 0.15;
  const approx = Math.max(0, Math.round(n * (1 + _fuzz[bidId])));
  return { approx };
}

function total(bid) {
  return bid.backing.reduce((s, b) => s + b.amount, 0) + bid.rulerAdjust;
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function nameOpts(sel) {
  const names = window._charNames || [];
  return names.map(n => `<option value="${esc(n)}"${n === sel ? ' selected' : ''}>${esc(n)}</option>`).join('');
}

/**
 * Options for the open-flow Regent confirm. A territory's defaultRegent (and a
 * previous winner on a reopen) is not guaranteed to be in the loaded character
 * list, so it is carried as its own option rather than silently losing the
 * pre-fill.
 */
function regentOpts(sel) {
  const names = window._charNames || [];
  const extra = sel && !names.includes(sel)
    ? `<option value="${esc(sel)}" selected>${esc(sel)}</option>` : '';
  return `<option value="">(none)</option>${extra}${nameOpts(sel)}`;
}

function ut(tid, fn) {
  state.territories = state.territories.map(t => t.id === tid ? fn(t) : t);
  persist();
  render();
}

// ══════════════════════════════════════════════
//  ACTIONS (exposed on window for onclick)
// ══════════════════════════════════════════════

window.terrAdvance = function () {
  if (state.phase === 'open') state.phase = 'final';
  else if (state.phase === 'final') state.phase = 'reveal';
  persist(); render();
};

window.terrBack = function (to) {
  state.phase = to;
  persist(); render();
};

window.terrTogglePeek = function () {
  state.peek = !state.peek;
  persist(); render();
};

window.terrWipeBoard = function () {
  if (!confirm('Wipe the entire board? This removes all territories and bids.')) return;
  clearTimeout(_saveTimer);
  state = dflt();
  modal = null;
  saving = false;
  try { localStorage.setItem(KEY, JSON.stringify(payload())); } catch (e) { /* ignore */ }
  render();
};

window.terrSetRegent = function (tid, val) {
  ut(tid, t => ({ ...t, regent: val, regentInput: val }));
};

// ── Open flow: pick a territory, then confirm its Regent ──
//
// Deliberately NOT named terrOpenBidModal: that is the existing per-card
// "add a claimant's bid" modal for an already-open territory, and reusing the
// name would shadow it.

window.terrOpenTerritoryPicker = function () {
  modal = { type: 'pick' };
  render();
};

window.terrPickTerritory = function (tid) {
  if (state.territories.some(t => t.id === tid)) return;   // already in contest
  const def = TERRS.find(t => t.id === tid);
  if (!def) return;
  modal = { type: 'regent', tid, mode: 'open', regent: def.defaultRegent || '' };
  render();
};

window.terrReopen = function (tid) {
  const t = state.territories.find(x => x.id === tid);
  if (!t) return;
  const winner = t.bids.find(b => b.id === t.winnerId);
  modal = { type: 'regent', tid, mode: 'reopen', regent: (winner && winner.claimant) || t.regent || '' };
  render();
};

window.terrConfirmRegent = function (tid, regentName) {
  const name = (regentName || '').trim();
  if (!name) return;
  if (state.territories.some(t => t.id === tid)) {
    // Reopen: same entry, same position, bids cleared.
    state.territories = state.territories.map(t => t.id === tid
      ? { ...t, regent: name, regentInput: name, bids: [], resolved: false, winnerId: null }
      : t);
  } else {
    const def = TERRS.find(t => t.id === tid);
    if (!def) return;
    state.territories = [...state.territories,
      { ...def, regent: name, regentInput: name, bids: [], resolved: false, winnerId: null }];
  }
  modal = null;
  persist();
  render();
};

window.terrOpenBidModal = function (tid, tname) {
  modal = { type: 'bid', tid, tname };
  render();
};

window.terrOpenBackModal = function (tid, bidId) {
  modal = { type: 'back', tid, bid: bidId };
  render();
};

window.terrAddBid = function (tid, cl, sc) {
  ut(tid, t => {
    const newBid = { id: uid(), claimant: cl, seconder: sc, backing: [], rulerAdjust: 0 };
    const bids = [...t.bids, newBid];
    if (t.regent && !t.bids.some(b => b.claimant.trim().toLowerCase() === t.regent.trim().toLowerCase()) && cl.trim().toLowerCase() !== t.regent.trim().toLowerCase()) {
      const regBid = { id: uid(), claimant: t.regent, seconder: '(Regent \u2014 automatic)', backing: [], rulerAdjust: 0 };
      return { ...t, bids: [...bids, regBid] };
    }
    return { ...t, bids };
  });
};

window.terrRmBid = function (tid, bidId) {
  if (!confirm('Remove this bid?')) return;
  ut(tid, t => ({ ...t, bids: t.bids.filter(b => b.id !== bidId), resolved: false, winnerId: null }));
};

window.terrAddBack = function (tid, bidId, pl, amt) {
  ut(tid, t => ({ ...t, bids: t.bids.map(b => b.id === bidId ? { ...b, backing: [...b.backing, { id: uid(), player: pl, amount: amt }] } : b) }));
};

window.terrRmBack = function (tid, bidId, bkId) {
  ut(tid, t => ({ ...t, bids: t.bids.map(b => b.id === bidId ? { ...b, backing: b.backing.filter(x => x.id !== bkId) } : b) }));
};

window.terrAdj = function (tid, bidId, d) {
  ut(tid, t => ({ ...t, bids: t.bids.map(b => b.id === bidId ? { ...b, rulerAdjust: b.rulerAdjust + d } : b) }));
};

window.terrAdjReset = function (tid, bidId) {
  ut(tid, t => ({ ...t, bids: t.bids.map(b => b.id === bidId ? { ...b, rulerAdjust: 0 } : b) }));
};

window.terrResolve = function (tid) {
  ut(tid, t => {
    if (!t.bids.length) return t;
    let best = null, bs = -Infinity, bestName = null;
    t.bids.forEach(b => {
      const def = t.regent && b.claimant.trim().toLowerCase() === t.regent.trim().toLowerCase();
      const sc = total(b) + (def ? 3 : 0);
      if (sc > bs) { bs = sc; best = b.id; bestName = b.claimant.trim(); }
    });
    return { ...t, resolved: true, winnerId: best, regent: bestName || t.regent, regentInput: bestName || t.regentInput };
  });
};

window.terrCloseModal = function () {
  modal = null;
  render();
};

window.terrModalSubmit = function () {
  const m = modal;
  if (!m) return;
  if (m.type === 'regent') {
    const rg = (document.getElementById('modal-regent')?.value || '').trim();
    if (!rg) { document.getElementById('modal-err').textContent = 'Regent required.'; return; }
    window.terrConfirmRegent(m.tid, rg);
    return;
  }
  if (m.type === 'bid') {
    const cl = document.getElementById('modal-cl')?.value;
    const sc = document.getElementById('modal-sc')?.value;
    if (!cl) { document.getElementById('modal-err').textContent = 'Claimant required.'; return; }
    if (!sc) { document.getElementById('modal-err').textContent = 'Seconder required.'; return; }
    if (cl === sc) { document.getElementById('modal-err').textContent = 'Claimant and seconder must be different characters.'; return; }
    const terr = state.territories.find(t => t.id === m.tid);
    if (terr && terr.bids.some(b => b.claimant.trim().toLowerCase() === cl.trim().toLowerCase())) {
      document.getElementById('modal-err').textContent = cl.split(' ')[0] + ' already has a bid in this territory.'; return;
    }
    window.terrAddBid(m.tid, cl, sc);
  } else {
    const pl = document.getElementById('modal-pl')?.value;
    const am = parseInt(document.getElementById('modal-am')?.value);
    if (!pl) { document.getElementById('modal-err').textContent = 'Player name required.'; return; }
    if (!am || am < 1) { document.getElementById('modal-err').textContent = 'Enter a positive amount.'; return; }
    window.terrAddBack(m.tid, m.bid, pl, am);
  }
  modal = null;
  render();
};

window.terrOverlayClick = function (ev) {
  if (ev.target.classList.contains('overlay')) { modal = null; render(); }
};

// ══════════════════════════════════════════════
//  RENDER
// ══════════════════════════════════════════════

function renderBid(t, bid, i, scores, maxScore) {
  const def = t.regent && bid.claimant.trim().toLowerCase() === t.regent.trim().toLowerCase();
  const sc = scores[i];
  const isMax = sc === maxScore && sc > 0;
  const isWin = t.resolved && bid.id === t.winnerId;
  const isLose = t.resolved && bid.id !== t.winnerId;
  const { approx } = peekInfo(sc, bid.id);
  const cls = 'bid' + (isWin ? ' bid-win' : isLose ? ' bid-lose' : '');

  let backHtml = '';
  if (bid.backing.length > 0) {
    backHtml = `<div class="back-list">${bid.backing.map(bk => `
      <div class="back-row">
        <span class="back-name">${esc(bk.player)}</span>
        <div class="back-right">
          <span class="back-amt">+${bk.amount}</span>
          ${!t.resolved ? `<button class="back-del" onclick="terrRmBack('${t.id}','${bid.id}','${bk.id}')" title="Remove">\u00d7</button>` : ''}
        </div>
      </div>`).join('')}</div>`;
  }

  let rulerHtml = '';
  if (!t.resolved) {
    const avCls = bid.rulerAdjust > 0 ? 'av-pos' : bid.rulerAdjust < 0 ? 'av-neg' : 'av-zero';
    const valDisp = state.peek ? '\u00b7' : (bid.rulerAdjust >= 0 ? '+' : '') + bid.rulerAdjust;
    const valCls = state.peek ? 'av-zero' : avCls;
    const resetBtn = !state.peek && bid.rulerAdjust !== 0
      ? `<button class="btn-sm" onclick="terrAdjReset('${t.id}','${bid.id}')">Reset</button>` : '';
    rulerHtml = `<div class="ruler-row">
      <span class="ruler-lbl">Ruler's adj.</span>
      <button class="adj" onclick="terrAdj('${t.id}','${bid.id}',-1)">\u2212</button>
      <span class="adj-val ${valCls}">${valDisp}</span>
      <button class="adj" onclick="terrAdj('${t.id}','${bid.id}',1)">+</button>
      ${resetBtn}
    </div>`;
  }

  let actsHtml = '';
  if (!t.resolved) {
    actsHtml = `<div class="bid-acts">
      <button class="btn-primary btn-sm" onclick="terrOpenBackModal('${t.id}','${bid.id}')">+ Influence</button>
      <button class="btn-danger btn-sm" onclick="terrRmBid('${t.id}','${bid.id}')">Remove</button>
    </div>`;
  }

  const scoreCls = 'bid-score ' + (isWin ? 's-win' : isMax ? 's-lead' : '');
  const scoreVal = state.peek ? '~' + approx : sc;
  const scoreSub = state.peek ? 'approx.' : 'influence';

  return `<div class="${cls}">
    <div class="bid-head">
      <div>
        <div class="bid-claimant">${esc(bid.claimant)}</div>
        <div class="bid-seconder"><em>sec. </em>${esc(bid.seconder)}</div>
        ${def ? '<div class="defend-note">+3 regent defence</div>' : ''}
      </div>
      <div class="bid-score-block">
        <div class="${scoreCls}">${scoreVal}</div>
        <div class="bid-score-sub">${scoreSub}</div>
        ${isWin ? '<div class="win-badge">Winner</div>' : ''}
      </div>
    </div>
    ${backHtml}
    ${rulerHtml}
    ${actsHtml}
  </div>`;
}

function renderCard(t) {
  const scores = t.bids.map(b => {
    const def = t.regent && b.claimant.trim().toLowerCase() === t.regent.trim().toLowerCase();
    return total(b) + (def ? 3 : 0);
  });
  const maxScore = Math.max(0, ...scores);

  const ambCls = 'amb-mod ' + (t.ambienceMod > 0 ? 'amb-pos' : t.ambienceMod < 0 ? 'amb-neg' : 'amb-zero');
  const ambVal = t.ambienceMod > 0 ? '+' + t.ambienceMod : String(t.ambienceMod);

  let bidsHtml;
  if (t.bids.length === 0) {
    bidsHtml = '<div class="no-bids-msg">No bids declared yet.</div>';
  } else {
    bidsHtml = t.bids.map((bid, i) => renderBid(t, bid, i, scores, maxScore)).join('');
  }

  let footHtml = '';
  if (!t.resolved) {
    const resolveBtn = t.bids.length >= 1
      ? `<button class="btn-primary" onclick="terrResolve('${t.id}')">${t.bids.length === 1 ? 'Resolve (uncontested)' : 'Resolve'}</button>` : '';
    footHtml = `<div class="tc-foot">
      <button onclick="terrOpenBidModal('${t.id}','${esc(t.name)}')">+ Open Bid</button>
      ${resolveBtn}
    </div>`;
  }

  return `<div class="tc">
    <div class="tc-head">
      <span class="tc-name">${esc(t.name)}</span>
      ${t.regent ? `<span class="regent-tag">Regent: ${esc(t.regent)}</span>` : ''}
    </div>
    <div class="ambience-strip">
      <span class="amb-label">Ambience</span>
      <span class="amb-name">${esc(t.ambience || '\u2014')}</span>
      <span class="${ambCls}">${ambVal}</span>
      <span class="amb-hint">vitae feeding</span>
    </div>
    <div class="regent-row">
      <span class="regent-lbl">Regent:</span>
      <select class="regent-sel" onchange="terrSetRegent('${t.id}',this.value)">
        <option value="">\u2014 none \u2014</option>
        ${nameOpts(t.regent || '')}
      </select>
    </div>
    <div class="tc-body">${bidsHtml}</div>
    ${footHtml}
  </div>`;
}

/**
 * A resolved territory stays on the board, but collapsed: name, the Regent who
 * took it, a Resolved tag and a low-emphasis Reopen. No bid amounts, no
 * challenger list. Reopen goes back through the Regent-confirm step rather
 * than blindly re-arming, because a reopened territory may be contested by a
 * different Regent this time.
 */
function renderResolvedRow(t) {
  const winner = t.bids.find(b => b.id === t.winnerId);
  const holder = (winner && winner.claimant) || t.regent || '';
  return `<div class="tc tc-resolved trr">
    <div class="res-bar">
      <div class="trr-id">
        <span class="trr-name">${esc(t.name)}</span>
        <span class="trr-holder">${holder ? esc(holder) : 'No winner'}</span>
      </div>
      <div class="trr-acts">
        <span class="trr-tag">Resolved</span>
        <button class="btn-sm" onclick="terrReopen('${t.id}')">Reopen</button>
      </div>
    </div>
  </div>`;
}

/** Step 1 of the open flow: which territory is being contested. */
function renderPicker() {
  const tiles = TERRS.map(def => {
    const taken = state.territories.some(t => t.id === def.id);
    const modCls = 'amb-mod ' + (def.ambienceMod > 0 ? 'amb-pos' : def.ambienceMod < 0 ? 'amb-neg' : 'amb-zero');
    const modVal = def.ambienceMod > 0 ? '+' + def.ambienceMod : String(def.ambienceMod);
    return `<button type="button" class="pick-tile${taken ? ' pick-taken' : ''}"${taken ? ' disabled' : ''} onclick="terrPickTerritory('${def.id}')">
      <span class="pick-name">${esc(def.name)}</span>
      <span class="pick-amb">
        <span class="pick-amb-name">${esc(def.ambience || '')}</span>
        <span class="${modCls}">${modVal}</span>
      </span>
      ${taken ? '<span class="pick-tag">In Contest</span>' : ''}
    </button>`;
  }).join('');

  return `<div class="overlay" onclick="terrOverlayClick(event)">
    <div class="modal">
      <div class="modal-title">Open Territory Bid</div>
      <div class="modal-sub">Choose the territory now being contested.</div>
      <div class="pick-grid">${tiles}</div>
      <div class="modal-btns">
        <button onclick="terrCloseModal()">Cancel</button>
      </div>
    </div>
  </div>`;
}

/** Step 2 of the open flow, shared with Reopen: confirm or override the Regent. */
function renderRegentStep(m) {
  const def = TERRS.find(t => t.id === m.tid) || state.territories.find(t => t.id === m.tid);
  const reopening = m.mode === 'reopen';
  return `<div class="overlay" onclick="terrOverlayClick(event)">
    <div class="modal">
      <div class="modal-title">${reopening ? 'Reopen' : 'Confirm Regent'}: ${esc(def ? def.name : '')}</div>
      <div class="modal-sub">${reopening
        ? 'Reopening clears the recorded bids and puts this territory back into contest.'
        : 'Confirm who holds this territory. The Regent gets an automatic defence bid.'}</div>
      <div class="field"><label>Regent</label>
        <select id="modal-regent" class="form-select">${regentOpts(m.regent || '')}</select>
      </div>
      <div id="modal-err" class="modal-err"></div>
      <div class="modal-btns">
        <button onclick="terrCloseModal()">Cancel</button>
        <button class="btn-primary btn-sm" onclick="terrModalSubmit()">${reopening ? 'Reopen Bidding' : 'Open Bid'}</button>
      </div>
    </div>
  </div>`;
}

function renderModal() {
  if (!modal) return '';
  const m = modal;
  if (m.type === 'pick') return renderPicker();
  if (m.type === 'regent') return renderRegentStep(m);
  const terr = state.territories.find(t => t.id === m.tid);
  const bid = m.type === 'back' ? terr?.bids.find(b => b.id === m.bid) : null;
  const title = m.type === 'bid' ? 'New Bid \u2014 ' + esc(m.tname) : 'Add Influence \u2014 ' + esc(bid?.claimant || '');
  const sub = m.type === 'bid'
    ? 'Claimant and seconder must hold City Status 2 or higher.'
    : 'Enter the player committing influence to this bid.';

  let fieldsHtml;
  if (m.type === 'bid') {
    fieldsHtml = `
      <div class="field"><label>Claimant</label>
        <select id="modal-cl" class="form-select"><option value="">\u2014 select \u2014</option>${nameOpts('')}</select>
      </div>
      <div class="field"><label>Seconder</label>
        <select id="modal-sc" class="form-select"><option value="">\u2014 select \u2014</option>${nameOpts('')}</select>
      </div>`;
  } else {
    fieldsHtml = `
      <div class="field"><label>Player / Character</label>
        <select id="modal-pl" class="form-select"><option value="">\u2014 select \u2014</option>${nameOpts('')}</select>
      </div>
      <div class="field"><label>Influence Amount</label>
        <input id="modal-am" class="form-input" type="number" min="1" placeholder="0">
      </div>`;
  }

  const submitLabel = m.type === 'bid' ? 'Open Bid' : 'Add Influence';

  return `<div class="overlay" onclick="terrOverlayClick(event)">
    <div class="modal">
      <div class="modal-title">${title}</div>
      <div class="modal-sub">${sub}</div>
      ${fieldsHtml}
      <div id="modal-err" class="modal-err"></div>
      <div class="modal-btns">
        <button onclick="terrCloseModal()">Cancel</button>
        <button class="btn-primary btn-sm" onclick="terrModalSubmit()">${submitLabel}</button>
      </div>
    </div>
  </div>`;
}

function render() {
  const root = document.getElementById('terr-root');
  if (!root) return;
  const { phase, peek, territories } = state;
  const totBids = territories.reduce((s, t) => s + t.bids.length, 0);
  const totInf = territories.reduce((s, t) => s + t.bids.reduce((s2, b) => s2 + b.backing.reduce((s3, bk) => s3 + bk.amount, 0), 0), 0);
  const res = territories.filter(t => t.resolved).length;

  const phaseLbl = phase === 'open' ? 'Bidding Open' : phase === 'final' ? 'Final Commitments' : 'Tallies Revealed';
  const saveLbl = saving ? 'Saving\u2026' : 'Saved';
  const saveCls = saving ? 'save-busy' : 'save-ok';

  let advBtn = '';
  if (phase === 'open') advBtn = `<button class="btn-primary btn-sm" onclick="terrAdvance()">Call Final Commitments</button>`;
  else if (phase === 'final') advBtn = `<button class="btn-primary btn-sm" onclick="terrAdvance()">Reveal Tallies</button>`;

  let backBtns = '';
  if (phase === 'reveal') backBtns = `<button class="btn-sm" onclick="terrBack('final')">Back to Final Commitments</button>`;
  if (phase === 'final') backBtns = `<button class="btn-sm" onclick="terrBack('open')">Re-open Bidding</button>`;

  // Wipe Board is only offered once there is a board to wipe.
  const wipeBtn = territories.length
    ? `<button class="btn-danger btn-sm" onclick="terrWipeBoard()">Wipe Board</button>` : '';

  const boardHtml = territories.length
    ? territories.map(t => (t.resolved ? renderResolvedRow(t) : renderCard(t))).join('')
    : `<div class="terr-empty"><div class="terr-empty-msg">No territories are in contest. Open a territory bid to put one on the board.</div></div>`;

  root.innerHTML = `
    <div>
      <div class="toolbar">
        <div class="toolbar-l">
          <div class="phase-pill phase-${phase}"><span class="phase-dot"></span>${phaseLbl}</div>
          <span class="save-dot ${saveCls}">${saveLbl}</span>
        </div>
        <div class="toolbar-r">
          <button class="btn-primary btn-sm" onclick="terrOpenTerritoryPicker()">Open Territory Bid</button>
          ${advBtn}
          ${backBtns}
          ${wipeBtn}
        </div>
      </div>
      <div class="summary">
        <div class="sum-item"><div class="sum-val">${totBids}</div><div class="sum-lbl">Open Bids</div></div>
        <div class="sum-item"><div class="sum-val">${totInf}</div><div class="sum-lbl">Influence In</div></div>
        <div class="sum-item"><div class="sum-val">${res}/5</div><div class="sum-lbl">Resolved</div></div>
      </div>
      <div class="peek-strip">
        <div class="peek-info"><strong>Prince's Peek</strong> \u2014 show approximate tallies without revealing exact numbers</div>
        <label class="peek-toggle-label">
          <input type="checkbox" ${peek ? 'checked' : ''} onchange="terrTogglePeek()">
          ${peek ? 'Peek on (approximate)' : 'Peek off (exact)'}
        </label>
      </div>
      <div class="terr-grid">
        ${boardHtml}
      </div>
    </div>
    ${renderModal()}`;
}

// ══════════════════════════════════════════════
//  MOUNT
// ══════════════════════════════════════════════

let _terrMounted = false;

export function mountTerr() {
  if (_terrMounted) return;
  _terrMounted = true;
  state = load();
  render();
}
