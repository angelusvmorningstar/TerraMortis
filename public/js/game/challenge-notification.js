/* Player-to-player contested roll notifications.
 * Polls /api/contested_roll_requests/mine every 10s.
 * Shows a modal when an incoming challenge is detected.
 * Dice are rolled server-side on accept; result is displayed client-side.
 */

import { apiGet, apiPut } from '../data/api.js';
import { esc } from '../data/helpers.js';
import { mkDieEl, mkColsEl } from '../suite/roll.js';

const POLL_MS = 10_000;

let _pollTimer  = null;
let _shown      = new Set(); // challenge IDs already shown to avoid repeat modals

const ROLL_LABELS = {
  territory:  'Territory Bid',
  social:     'Social Manoeuvre',
  resistance: 'Resistance Check',
  custom:     'Custom Roll',
};

// ── Public API ────────────────────────────────────────────────────────────────

export function startChallengePoller() {
  if (_pollTimer) return; // already running
  _poll();
  _pollTimer = setInterval(_poll, POLL_MS);
}

export function stopChallengePoller() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
}

// ── Polling ───────────────────────────────────────────────────────────────────

async function _poll() {
  let challenges;
  try {
    challenges = await apiGet('/api/contested_roll_requests/mine');
  } catch { return; }

  _updateBadge(challenges.length);

  for (const c of challenges) {
    const id = String(c._id);
    if (!_shown.has(id)) {
      _shown.add(id);
      _showIncomingModal(c);
      break; // show one at a time
    }
  }
}

function _updateBadge(count) {
  const badge = document.getElementById('more-badge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = '';
  } else {
    badge.textContent = '';
    badge.style.display = 'none';
  }
}

// ── Incoming challenge modal ───────────────────────────────────────────────────

function _showIncomingModal(challenge) {
  _removeModal();

  const rollLabel = ROLL_LABELS[challenge.roll_type] || challenge.roll_type;
  const powerLine = challenge.power_name
    ? `<span class="ch-power">${esc(challenge.power_name)}</span>`
    : '';

  const overlay = document.createElement('div');
  overlay.id = 'ch-modal-overlay';
  overlay.className = 'ch-overlay';
  overlay.innerHTML = `
    <div class="ch-modal" id="ch-modal">
      <div class="ch-modal-hdr">Incoming Challenge</div>
      <div class="ch-modal-body">
        <p class="ch-desc">
          <strong>${esc(challenge.challenger_character_name)}</strong>
          challenges you to a <strong>${esc(rollLabel)}</strong>${powerLine ? ' using ' + powerLine : ''}.
        </p>
        <div class="ch-pools">
          <div class="ch-pool-row">
            <span class="ch-pool-lbl">Their pool</span>
            <span class="ch-pool-val">${challenge.challenger_pool}</span>
          </div>
          <div class="ch-pool-row">
            <span class="ch-pool-lbl">Your pool</span>
            <span class="ch-pool-val">${challenge.defender_pool}</span>
          </div>
        </div>
      </div>
      <div class="ch-modal-actions">
        <button class="ch-btn ch-btn-accept" id="ch-accept">Accept</button>
        <button class="ch-btn ch-btn-decline" id="ch-decline">Decline</button>
      </div>
      <div id="ch-result" class="ch-result" style="display:none"></div>
      <div id="ch-error" class="ch-error" style="display:none"></div>
    </div>`;

  document.body.appendChild(overlay);

  document.getElementById('ch-accept').addEventListener('click', () => _onAccept(challenge));
  document.getElementById('ch-decline').addEventListener('click', () => _onDecline(challenge));
}

async function _onAccept(challenge) {
  const acceptBtn  = document.getElementById('ch-accept');
  const declineBtn = document.getElementById('ch-decline');
  const errorEl    = document.getElementById('ch-error');
  if (acceptBtn)  { acceptBtn.disabled  = true; acceptBtn.textContent  = 'Rolling...'; }
  if (declineBtn) { declineBtn.disabled = true; }
  if (errorEl)    { errorEl.style.display = 'none'; }

  try {
    const result = await apiPut(`/api/contested_roll_requests/${challenge._id}/accept`, {});
    _showResult(result.outcome);
    _updateBadge(0);
  } catch (err) {
    if (errorEl) {
      errorEl.textContent = err.message || 'Failed to resolve roll.';
      errorEl.style.display = '';
    }
    if (acceptBtn)  { acceptBtn.disabled  = false; acceptBtn.textContent  = 'Accept'; }
    if (declineBtn) { declineBtn.disabled = false; }
  }
}

async function _onDecline(challenge) {
  const declineBtn = document.getElementById('ch-decline');
  const acceptBtn  = document.getElementById('ch-accept');
  if (declineBtn) { declineBtn.disabled = true; declineBtn.textContent = 'Declining...'; }
  if (acceptBtn)  { acceptBtn.disabled  = true; }

  try {
    await apiPut(`/api/contested_roll_requests/${challenge._id}/decline`, {});
  } catch { /* non-fatal */ }
  _removeModal();
}

function _showResult(outcome) {
  const actionsEl = document.getElementById('ch-modal-actions');
  const resultEl  = document.getElementById('ch-result');
  if (actionsEl) actionsEl.style.display = 'none';
  if (!resultEl) return;

  const { attacker, defender, outcome: outStr, margin } = outcome;

  let h = '';
  h += _diceRowHtml(attacker.name, attacker.rolls, attacker.successes);
  h += _diceRowHtml(defender.name, defender.rolls, defender.successes);

  if (outStr === 'draw') {
    h += `<div class="ch-outcome ch-draw">DRAW</div>`;
  } else {
    const winner = outStr === 'attacker' ? attacker.name : defender.name;
    h += `<div class="ch-outcome ch-win">${esc(winner.split(' ')[0].toUpperCase())} WINS${margin > 0 ? ' by ' + margin : ''}</div>`;
  }

  h += `<button class="ch-btn ch-btn-close" id="ch-close">Close</button>`;

  resultEl.innerHTML = h;
  resultEl.style.display = '';

  document.getElementById('ch-close')?.addEventListener('click', _removeModal);
}

function _diceRowHtml(name, rolls, suc) {
  const div = document.createElement('div');
  div.className = 'ch-dice-row';
  const lbl = document.createElement('span');
  lbl.className = 'ch-dice-lbl';
  lbl.textContent = name;
  div.appendChild(lbl);

  if (rolls && rolls.length) {
    try { div.appendChild(mkColsEl(rolls, 0)); } catch { /* mkColsEl unavailable */ }
  }

  const sucEl = document.createElement('span');
  sucEl.className = 'ch-suc';
  sucEl.textContent = suc + ' suc';
  div.appendChild(sucEl);

  const wrapper = document.createElement('div');
  wrapper.appendChild(div);
  return wrapper.innerHTML;
}

function _removeModal() {
  document.getElementById('ch-modal-overlay')?.remove();
}
