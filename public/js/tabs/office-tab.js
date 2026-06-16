import { OFFICE_DATA } from './office-data.js';
import { esc, displayName } from '../data/helpers.js';
import { apiGet, apiPost } from '../data/api.js';
import { calcCityStatus } from '../data/accessors.js';
import { charPicker, setCharPickerSources } from '../components/character-picker.js';

export function renderOfficeTab(el, char, chars = []) {
  if (!el || !char) { if (el) el.innerHTML = '<div class="dtl-empty">No character loaded.</div>'; return; }
  if (!char.court_category) { el.innerHTML = '<div class="dtl-empty">No office held.</div>'; return; }

  const data = OFFICE_DATA[char.court_category];
  const title = esc(char.court_title || char.court_category);
  const role  = esc(char.court_category);

  let h = `<div class="office-tab">`;
  h += `<div class="office-header"><div class="office-title">${title}</div><div class="office-role">${role}</div></div>`;

  if (!data) {
    h += `<div class="dtl-empty">Office details for this role are pending.</div>`;
    h += `</div>`;
    el.innerHTML = h;
    return;
  }

  // Status Power
  h += `<div class="office-section">`;
  h += `<div class="office-section-hd">Status Power</div>`;
  h += `<div class="office-status-power">${esc(data.statusPower)}</div>`;
  h += `</div>`;

  // Interactive status actions — HoS only (phase 1)
  if (char.court_category === 'Head of State') {
    h += `<div class="office-section">`;
    h += `<div class="office-section-hd">Status Actions — this session</div>`;
    h += `<div class="office-budget-line">Loading…</div>`;
    h += `<div class="office-picker-mount"></div>`;
    h += `<div class="office-action-btns"></div>`;
    h += `<div class="office-action-msg" aria-live="polite"></div>`;
    h += `</div>`;
  }

  // Manoeuvres
  h += `<div class="office-section">`;
  h += `<div class="office-section-hd">Manoeuvres <span style="font-size:10px;opacity:.6">(each costs 1 Influence)</span></div>`;
  h += `<div class="office-manoeuvre-list">`;
  for (const m of data.manoeuvres) {
    h += `<div class="office-manoeuvre">`;
    h += `<div class="office-manoeuvre-name">${esc(m.name)}</div>`;
    h += `<div class="office-manoeuvre-effect">${esc(m.effect)}</div>`;
    h += `</div>`;
  }
  h += `</div></div>`;

  // Merits
  h += `<div class="office-section">`;
  h += `<div class="office-section-hd">Granted Merits</div>`;
  h += `<div class="office-merit-list">`;
  for (const merit of data.merits) {
    h += `<span class="office-merit-chip">${esc(merit)}</span>`;
  }
  h += `</div></div>`;

  h += `</div>`;
  el.innerHTML = h;

  if (char.court_category === 'Head of State') {
    _wireHosActions(el, char, chars);
  }
}

async function _wireHosActions(el, char, chars) {
  const budgetLine  = el.querySelector('.office-budget-line');
  const pickerMount = el.querySelector('.office-picker-mount');
  const btnArea     = el.querySelector('.office-action-btns');
  const msgEl       = el.querySelector('.office-action-msg');

  // Fetch current game session
  let session = null;
  try { session = await apiGet('/api/office_actions/latest_session'); } catch { /* ignore */ }
  const sessionId = session ? String(session._id) : null;

  // Load prior actions by this actor this session
  let priorActions = [];
  if (sessionId) {
    try {
      priorActions = await apiGet(
        `/api/office_actions?game_session_id=${encodeURIComponent(sessionId)}&actor_id=${encodeURIComponent(String(char._id))}`,
      );
    } catch { /* ignore */ }
  }

  const budget = calcCityStatus(char);

  function paidUsed() {
    return priorActions.filter(a => a.action_type === 'raise' || a.action_type === 'lower').length;
  }

  function renderBudget() {
    if (!sessionId) {
      budgetLine.textContent = `${budget} actions available per session — no active game session found`;
      budgetLine.className = 'office-budget-line';
      return;
    }
    const remaining = Math.max(0, budget - paidUsed());
    budgetLine.textContent = `${remaining} of ${budget} actions remaining this session`;
    budgetLine.className = 'office-budget-line' + (remaining === 0 ? ' exhausted' : '');
  }
  renderBudget();

  // Character picker
  const activeId   = String(char._id);
  const nonRetired = chars.filter(c => !c.retired);
  setCharPickerSources({ all: nonRetired, attendees: [] });

  let selectedChar = null;

  const pickerEl = charPicker({
    scope:       'all',
    cardinality: 'single',
    initial:     null,
    placeholder: 'Search character…',
    excludeIds:  [activeId],
    onChange: (sel) => {
      selectedChar = sel ? nonRetired.find(c => String(c._id) === sel.id) : null;
      renderButtons();
    },
  });
  pickerMount.appendChild(pickerEl);

  function renderButtons() {
    btnArea.innerHTML = '';
    if (!selectedChar || !sessionId) return;

    const targetStatus = selectedChar.status?.city || 0;
    const alreadyPaid  = priorActions.some(
      a => a.target_id === String(selectedChar._id) &&
           (a.action_type === 'raise' || a.action_type === 'lower'),
    );
    const paidLeft = Math.max(0, budget - paidUsed());

    const makeBtn = (label, actionType, disabled, title) => {
      const btn = document.createElement('button');
      btn.className = 'btn office-action-btn';
      btn.textContent = label;
      btn.disabled = !!disabled;
      if (title) btn.title = title;
      btn.addEventListener('click', () => doAction(actionType));
      return btn;
    };

    // Paid raise/lower — only when target has at least 1 dot (otherwise grant_first applies)
    if (targetStatus > 0 && targetStatus < 10) {
      const raiseTitle = alreadyPaid ? 'Already acted on this character this session' : undefined;
      btnArea.appendChild(makeBtn('Raise', 'raise', alreadyPaid || paidLeft <= 0, raiseTitle));
    }
    if (targetStatus > 1) {
      const lowerTitle = alreadyPaid ? 'Already acted on this character this session' : undefined;
      btnArea.appendChild(makeBtn('Lower', 'lower', alreadyPaid || paidLeft <= 0, lowerTitle));
    }

    // Free actions
    if (targetStatus === 0) {
      btnArea.appendChild(makeBtn('Grant First Dot', 'grant_first', false));
    }
    if (targetStatus === 1) {
      btnArea.appendChild(makeBtn('Strip Last Dot', 'strip_last', false));
    }
  }

  async function doAction(actionType) {
    if (!selectedChar || !sessionId) return;
    msgEl.textContent = 'Saving…';
    try {
      const result = await apiPost('/api/office_actions', {
        game_session_id: sessionId,
        actor_id:        String(char._id),
        target_id:       String(selectedChar._id),
        action_type:     actionType,
      });
      // Update local state so buttons and budget refresh without a reload
      if (selectedChar.status) selectedChar.status.city = result.new_status;
      else selectedChar.status = { city: result.new_status };
      priorActions.push(result.action);
      msgEl.textContent = `Done — ${displayName(selectedChar)} is now status ${result.new_status}.`;
      renderBudget();
      renderButtons();
    } catch (err) {
      msgEl.textContent = err.message || 'Action failed.';
    }
  }
}
