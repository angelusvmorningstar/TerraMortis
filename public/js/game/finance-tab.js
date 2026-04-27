/**
 * finance-tab.js — Per-session finance view for coordinators and STs.
 *
 * Shows:
 *   - Session selector dropdown (all sessions, newest first)
 *   - Per-game panel: takings breakdown, expenses[], transfers[], balance, notes
 *   - Running totals panel: cumulative budget, games funded
 *
 * All edits auto-save to /api/game_sessions/:id via PUT.
 */

import { apiGet, apiPut } from '../data/api.js';
import { esc } from '../data/helpers.js';
import { readPayment } from './payment-helpers.js';

let _el = null;
let _sessions = [];
let _selectedId = null;
let _saveTimer = null;
let _pendingSession = null;

// ── Lifecycle ────────────────────────────────────────────────────────────────

export async function initFinanceTab(el) {
  _el = el;
  el.innerHTML = '<div class="fin-loading">Loading sessions…</div>';
  try {
    _sessions = await apiGet('/api/game_sessions');
    _sessions.sort((a, b) => (b.session_date || '').localeCompare(a.session_date || ''));
  } catch {
    el.innerHTML = '<div class="fin-empty">Could not load sessions.</div>';
    return;
  }
  if (!_sessions.length) {
    el.innerHTML = '<div class="fin-empty">No game sessions yet.</div>';
    return;
  }
  _selectedId = _selectedId || _sessions[0]._id;
  render();
}

// ── Derived calculations ────────────────────────────────────────────────────

function derivePayments(session) {
  const byMethod = { cash: 0, payid: 0, paypal: 0, exiles: 0 };
  const counts  = { cash: 0, payid: 0, paypal: 0, exiles: 0, waived: 0 };
  for (const entry of session.attendance || []) {
    const { method, amount } = readPayment(entry);
    if (!method) continue;
    counts[method] = (counts[method] || 0) + 1;
    if (byMethod[method] !== undefined) byMethod[method] += amount;
  }
  // Exiles is offset/credit, not real cash collected
  const collected = byMethod.cash + byMethod.payid + byMethod.paypal;
  return { byMethod, counts, collected };
}

function deriveBalance(session) {
  const { collected } = derivePayments(session);
  const fin = session.finances || {};
  const expenseTotal = (fin.expenses || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const transferTotal = (fin.transfers || []).reduce((s, t) => s + (Number(t.amount) || 0), 0);
  return { collected, expenseTotal, transferTotal, balance: collected - expenseTotal - transferTotal };
}

function typicalVenueCost(sessions) {
  // _sessions is already newest-first; iterate as-is to return the most recent venue cost
  for (const s of sessions) {
    const venue = (s.finances?.expenses || []).find(e => e.category === 'venue');
    if (venue?.amount) return venue.amount;
  }
  // Fallback: largest single expense in the most recent session with any expense
  for (const s of sessions) {
    const exps = s.finances?.expenses || [];
    if (exps.length) return Math.max(...exps.map(e => Number(e.amount) || 0));
  }
  return 0;
}

// ── Render ──────────────────────────────────────────────────────────────────

function render() {
  if (!_el) return;
  const session = _sessions.find(s => String(s._id) === String(_selectedId)) || _sessions[0];
  if (!session) return;

  const { byMethod, counts, collected } = derivePayments(session);
  const { expenseTotal, transferTotal, balance } = deriveBalance(session);

  const sessionOpts = _sessions.map(s => {
    const label = (s.title ? s.title + ' — ' : '') + (s.session_date || 'Unknown');
    return `<option value="${esc(String(s._id))}"${String(s._id) === String(session._id) ? ' selected' : ''}>${esc(label)}</option>`;
  }).join('');

  const exp = session.finances?.expenses || [];
  const expHtml = exp.length
    ? exp.map((e, i) => _renderExpenseRow(e, i)).join('')
    : '<p class="fin-placeholder">No expenses recorded.</p>';

  const tr = session.finances?.transfers || [];
  const trHtml = tr.length
    ? tr.map((t, i) => _renderTransferRow(t, i)).join('')
    : '<p class="fin-placeholder">No transfers recorded.</p>';

  const notes = session.finances?.notes || '';

  // Running totals across all sessions
  const cumulative = _sessions.reduce((s, sess) => s + deriveBalance(sess).balance, 0);
  const venueCost = typicalVenueCost(_sessions);
  const gamesFunded = venueCost ? Math.floor(cumulative / venueCost) : 0;

  _el.innerHTML = `
    <div class="fin-header">
      <label class="fin-session-picker">Session:
        <select id="fin-session-sel">${sessionOpts}</select>
      </label>
    </div>

    <div class="fin-grid">
      <div class="fin-card">
        <div class="fin-card-title">Takings</div>
        <div class="fin-row"><span>Cash</span><span>$${byMethod.cash}</span></div>
        <div class="fin-row"><span>PayID</span><span>$${byMethod.payid}</span></div>
        <div class="fin-row"><span>PayPal</span><span>$${byMethod.paypal}</span></div>
        <div class="fin-row fin-row-dim"><span>Exiles (offset)</span><span>${counts.exiles}</span></div>
        <div class="fin-row fin-row-dim"><span>Waived</span><span>${counts.waived}</span></div>
        <div class="fin-row fin-row-total"><span>Collected</span><span>$${collected}</span></div>
      </div>

      <div class="fin-card">
        <div class="fin-card-title">Expenses</div>
        <div class="fin-list" id="fin-expenses">${expHtml}</div>
        <button class="fin-btn" id="fin-add-expense">+ Add expense</button>
        <div class="fin-row fin-row-total"><span>Total</span><span>$${expenseTotal}</span></div>
      </div>

      <div class="fin-card">
        <div class="fin-card-title">Transfers</div>
        <div class="fin-list" id="fin-transfers">${trHtml}</div>
        <button class="fin-btn" id="fin-add-transfer">+ Add transfer</button>
        <div class="fin-row fin-row-total"><span>Total</span><span>$${transferTotal}</span></div>
      </div>

      <div class="fin-card">
        <div class="fin-card-title">Balance</div>
        <div class="fin-balance ${balance >= 0 ? 'pos' : 'neg'}">$${balance}</div>
        <div class="fin-row fin-row-dim"><span>Collected − Expenses − Transfers</span></div>
      </div>

      <div class="fin-card fin-card-wide">
        <div class="fin-card-title">Notes</div>
        <textarea id="fin-notes" class="fin-notes" placeholder="Notes for this session…">${esc(notes)}</textarea>
      </div>
    </div>

    <div class="fin-totals">
      <div class="fin-totals-item">
        <span class="fin-totals-label">Cumulative budget</span>
        <span class="fin-totals-val${cumulative >= 0 ? ' pos' : ' neg'}">$${cumulative}</span>
      </div>
      <div class="fin-totals-item">
        <span class="fin-totals-label">Typical venue cost</span>
        <span class="fin-totals-val">${venueCost ? '$' + venueCost : '—'}</span>
      </div>
      <div class="fin-totals-item">
        <span class="fin-totals-label">Games funded</span>
        <span class="fin-totals-val">${gamesFunded}</span>
      </div>
    </div>
  `;

  wireEvents(session);
}

function _renderExpenseRow(e, i) {
  return `<div class="fin-item" data-kind="expense" data-idx="${i}">
    <input type="text"   class="fin-inp-cat"    data-field="category"  value="${esc(e.category || '')}"  placeholder="Category (e.g. venue)">
    <input type="number" class="fin-inp-amt"    data-field="amount"    value="${e.amount ?? ''}"        placeholder="$" min="0" step="1">
    <input type="date"   class="fin-inp-date"   data-field="date"      value="${esc((e.date || '').slice(0, 10))}">
    <input type="url"    class="fin-inp-proof"  data-field="proof_url" value="${esc(e.proof_url || '')}" placeholder="Proof URL">
    <button class="fin-rm-btn" data-kind="expense" data-idx="${i}" title="Remove">&times;</button>
  </div>`;
}

function _renderTransferRow(t, i) {
  return `<div class="fin-item" data-kind="transfer" data-idx="${i}">
    <input type="text"   class="fin-inp-to"     data-field="to"        value="${esc(t.to || '')}"        placeholder="To (e.g. Conan)">
    <input type="number" class="fin-inp-amt"    data-field="amount"    value="${t.amount ?? ''}"        placeholder="$" min="0" step="1">
    <input type="date"   class="fin-inp-date"   data-field="date"      value="${esc((t.date || '').slice(0, 10))}">
    <input type="url"    class="fin-inp-proof"  data-field="proof_url" value="${esc(t.proof_url || '')}" placeholder="Proof URL">
    <button class="fin-rm-btn" data-kind="transfer" data-idx="${i}" title="Remove">&times;</button>
  </div>`;
}

// ── Events ──────────────────────────────────────────────────────────────────

function wireEvents(session) {
  _el.querySelector('#fin-session-sel')?.addEventListener('change', e => {
    flushSave();
    _selectedId = e.target.value;
    render();
  });

  // Expense/transfer field edits
  _el.querySelectorAll('.fin-item input').forEach(inp => {
    inp.addEventListener('change', () => {
      const row = inp.closest('.fin-item');
      const kind = row.dataset.kind;
      const idx  = Number(row.dataset.idx);
      const field = inp.dataset.field;
      let value = inp.value;
      if (field === 'amount') value = Number(value) || 0;
      if ((field === 'date' || field === 'proof_url') && value === '') value = null;

      session.finances = session.finances || {};
      const arr = kind === 'expense' ? 'expenses' : 'transfers';
      session.finances[arr] = session.finances[arr] || [];
      session.finances[arr][idx] = { ...(session.finances[arr][idx] || {}), [field]: value };
      scheduleSave(session);
    });
  });

  // Add rows
  _el.querySelector('#fin-add-expense')?.addEventListener('click', () => {
    session.finances = session.finances || {};
    session.finances.expenses = session.finances.expenses || [];
    session.finances.expenses.push({ category: '', amount: 0 });
    scheduleSave(session);
    render();
  });

  _el.querySelector('#fin-add-transfer')?.addEventListener('click', () => {
    session.finances = session.finances || {};
    session.finances.transfers = session.finances.transfers || [];
    session.finances.transfers.push({ to: '', amount: 0 });
    scheduleSave(session);
    render();
  });

  // Remove rows
  _el.querySelectorAll('.fin-rm-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const kind = btn.dataset.kind;
      const idx  = Number(btn.dataset.idx);
      const arr  = kind === 'expense' ? 'expenses' : 'transfers';
      if (!session.finances?.[arr]) return;
      session.finances[arr].splice(idx, 1);
      scheduleSave(session);
      render();
    });
  });

  // Notes
  _el.querySelector('#fin-notes')?.addEventListener('input', e => {
    session.finances = session.finances || {};
    session.finances.notes = e.target.value;
    scheduleSave(session);
  });
}

// ── Save ────────────────────────────────────────────────────────────────────

function scheduleSave(session) {
  clearTimeout(_saveTimer);
  _pendingSession = session;
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    const s = _pendingSession;
    _pendingSession = null;
    doSave(s);
  }, 600);
}

// Synchronously fire any pending save. Called before session switch to prevent data loss.
function flushSave() {
  if (_saveTimer) {
    clearTimeout(_saveTimer);
    _saveTimer = null;
  }
  if (_pendingSession) {
    const s = _pendingSession;
    _pendingSession = null;
    doSave(s);
  }
}

async function doSave(session) {
  try {
    const { _id, ...body } = session;
    await apiPut('/api/game_sessions/' + _id, body);
  } catch (err) {
    console.warn('Finance save failed:', err.message);
  }
}
