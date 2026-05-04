/* Player challenge initiation modal.
 * Opens when player taps "Challenge" from the game app.
 * Selects target character, roll type, and pool sizes.
 * POSTs to /api/contested_roll_requests to create the challenge.
 */

import { apiGet, apiPost } from '../data/api.js';
import { esc, displayName, dropdownName } from '../data/helpers.js';

const ROLL_TYPES = [
  { id: 'territory',  label: 'Territory Bid',      atkNote: 'Presence + Intimidation', defNote: 'Presence + Intimidation' },
  { id: 'social',     label: 'Social Manoeuvre',    atkNote: 'Presence + Persuasion',   defNote: 'Composure + Blood Potency' },
  { id: 'resistance', label: 'Resistance Check',    atkNote: 'Loaded pool',             defNote: 'Stamina + Resolve' },
  { id: 'custom',     label: 'Custom Roll',          atkNote: 'As agreed',               defNote: 'As agreed' },
];

let _chars = [];

// ── Public API ────────────────────────────────────────────────────────────────

export function openChallengeModal(activeChar) {
  _removeModal();
  _loadCharsAndRender(activeChar);
}

// ── Load + render ─────────────────────────────────────────────────────────────

async function _loadCharsAndRender(activeChar) {
  try {
    _chars = await apiGet('/api/characters/names');
  } catch { _chars = []; }

  _render(activeChar);
}

function _render(activeChar) {
  _removeModal();

  const charOptions = _chars
    .filter(c => String(c._id) !== String(activeChar._id))
    .map(c => `<option value="${esc(String(c._id))}" data-name="${esc(dropdownName(c))}">${esc(dropdownName(c))}</option>`)
    .join('');

  const typeOptions = ROLL_TYPES.map(t =>
    `<option value="${esc(t.id)}">${esc(t.label)}</option>`
  ).join('');

  const overlay = document.createElement('div');
  overlay.id = 'chi-overlay';
  overlay.className = 'ch-overlay';
  overlay.innerHTML = `
    <div class="ch-modal" id="chi-modal">
      <div class="ch-modal-hdr">Issue a Challenge</div>
      <div class="ch-modal-body">
        <div class="ch-field">
          <label class="ch-label">Target character</label>
          <select class="ch-select" id="chi-target">${charOptions}</select>
        </div>
        <div class="ch-field">
          <label class="ch-label">Roll type</label>
          <select class="ch-select" id="chi-type">${typeOptions}</select>
        </div>
        <div class="ch-field ch-pool-fields">
          <div>
            <label class="ch-label">Your pool (attacker)</label>
            <input class="ch-input" id="chi-atk-pool" type="number" min="0" max="30" value="3">
          </div>
          <div>
            <label class="ch-label">Their pool (defender)</label>
            <input class="ch-input" id="chi-def-pool" type="number" min="0" max="30" value="3">
          </div>
        </div>
        <div class="ch-field">
          <label class="ch-label">Power name <span class="ch-optional">(optional)</span></label>
          <input class="ch-input" id="chi-power" type="text" maxlength="80" placeholder="e.g. Face of the Beast">
        </div>
      </div>
      <div id="chi-type-note" class="ch-type-note"></div>
      <div id="chi-error" class="ch-error" style="display:none"></div>
      <div class="ch-modal-actions">
        <button class="ch-btn ch-btn-accept" id="chi-submit">Send Challenge</button>
        <button class="ch-btn ch-btn-decline" id="chi-cancel">Cancel</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const typeEl = document.getElementById('chi-type');
  typeEl.addEventListener('change', () => _updateTypeNote(typeEl.value));
  _updateTypeNote(typeEl.value);

  document.getElementById('chi-submit').addEventListener('click', () => _onSubmit(activeChar));
  document.getElementById('chi-cancel').addEventListener('click', _removeModal);
}

function _updateTypeNote(typeId) {
  const t = ROLL_TYPES.find(r => r.id === typeId);
  const el = document.getElementById('chi-type-note');
  if (el && t) el.textContent = `Attacker: ${t.atkNote} — Defender: ${t.defNote}`;
}

async function _onSubmit(activeChar) {
  const targetEl  = document.getElementById('chi-target');
  const typeEl    = document.getElementById('chi-type');
  const atkPoolEl = document.getElementById('chi-atk-pool');
  const defPoolEl = document.getElementById('chi-def-pool');
  const powerEl   = document.getElementById('chi-power');
  const errorEl   = document.getElementById('chi-error');
  const submitEl  = document.getElementById('chi-submit');

  const targetId   = targetEl?.value;
  const targetName = targetEl?.options[targetEl.selectedIndex]?.dataset?.name || '';
  const rollType   = typeEl?.value;
  const atkPool    = parseInt(atkPoolEl?.value, 10) || 0;
  const defPool    = parseInt(defPoolEl?.value, 10) || 0;
  const powerName  = powerEl?.value.trim() || undefined;

  if (!targetId) {
    if (errorEl) { errorEl.textContent = 'Select a target character.'; errorEl.style.display = ''; }
    return;
  }

  if (errorEl) errorEl.style.display = 'none';
  if (submitEl) { submitEl.disabled = true; submitEl.textContent = 'Sending...'; }

  try {
    await apiPost('/api/contested_roll_requests', {
      challenger_character_id:   String(activeChar._id),
      challenger_character_name: displayName(activeChar),
      target_character_id:       targetId,
      target_character_name:     targetName,
      roll_type:   rollType,
      challenger_pool: atkPool,
      defender_pool:   defPool,
      ...(powerName ? { power_name: powerName } : {}),
    });
    _removeModal();
    _showSentToast();
  } catch (err) {
    if (errorEl) { errorEl.textContent = err.message || 'Failed to send challenge.'; errorEl.style.display = ''; }
    if (submitEl) { submitEl.disabled = false; submitEl.textContent = 'Send Challenge'; }
  }
}

function _showSentToast() {
  const toast = document.createElement('div');
  toast.className = 'ch-toast';
  toast.textContent = 'Challenge sent.';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

function _removeModal() {
  document.getElementById('chi-overlay')?.remove();
}
