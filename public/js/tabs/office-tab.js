import { OFFICE_DATA, MERIT_DOT_CAPS } from './office-data.js';
import { esc, displayName } from '../data/helpers.js';
import { apiGet, apiPost, apiPut } from '../data/api.js';
import { calcCityStatus } from '../data/accessors.js';
import { charPicker, setCharPickerSources } from '../components/character-picker.js';
import { getCycles } from '../downtime/db.js';
import { currentCycleInGamePhase } from '../downtime/cycle-phase.js';
import { getRole } from '../auth/discord.js';

// otc.3: the fixed order the picker lists offices in. All five Court
// Positions, even 'Administrator' (which has no OFFICE_DATA entry yet — it
// still hits the existing pending-fallback branch below when selected).
export const OFFICE_CATEGORIES = ['Head of State', 'Primogen', 'Enforcer', 'Socialite', 'Administrator'];

/** ST-level access. 'dev' is a privacy-redacted ST role and is treated as ST
 *  everywhere in this codebase (see server/middleware/auth.js's isStRole). */
function _isST() {
  return getRole() === 'st' || getRole() === 'dev';
}

/**
 * oxp.3: builds the Manoeuvres list markup.
 *
 * An office's manoeuvres are bought one at a time in fixed rank order, so a
 * manoeuvre's rank IS its position in the array (index + 1) — see
 * content/rules/office-powers.md, which OFFICE_DATA already matches. Anything
 * above the office's current `rank` renders muted.
 *
 * @param rank        the office's current graduated rank, or null/undefined
 *                    when it is not known yet (the synchronous first render,
 *                    before _wireManoeuvreRank's fetch resolves) — in which
 *                    case nothing is muted.
 * @param isOwnOffice muting ONLY ever applies to the holder's own view. A
 *                    reference viewer (otc.3's browse-any-office mode) gets a
 *                    plain summary whose markup carries no purchase state at
 *                    all, so nothing leaks even to someone reading the DOM.
 */
export function manoeuvreListHtml(manoeuvres, rank, isOwnOffice) {
  const known = Number.isInteger(rank);
  return manoeuvres.map((m, i) => {
    const muted = isOwnOffice && known && (i + 1) > rank;
    let row = `<div class="office-manoeuvre${muted ? ' office-manoeuvre-unpurchased' : ''}">`;
    row += `<div class="office-manoeuvre-name">${esc(m.name)}</div>`;
    row += `<div class="office-manoeuvre-effect">${esc(m.effect)}</div>`;
    row += `</div>`;
    return row;
  }).join('');
}

/**
 * oxp.3: builds the graduated rank readout, plus the ST/dev-only +/- stepper.
 *
 * One control set per office, not per manoeuvre — this is a single graduated
 * value, not five independent purchases. Mirrors the Merit Suite's own dot
 * display and reuses its stepper classes verbatim.
 *
 * The rank is clamped here as well as at the only current call site. This is an
 * exported function, and `'●'.repeat(n)` throws a RangeError on a negative
 * count, so the safety cannot rest on every future caller remembering to clamp
 * first (Codex review, 2026-08-13).
 */
export function manoeuvreRankHtml(rank, count, isST) {
  const n = Math.max(0, Math.min(count, Math.trunc(rank) || 0));
  const display = '●'.repeat(n) + '○'.repeat(Math.max(0, count - n));
  let html = `<span class="office-manoeuvre-rank-label">Purchased</span>`;
  html += `<span class="office-manoeuvre-rank-dots">${esc(display)}</span>`;
  if (isST) {
    html += `<div class="cs-edit-stepper office-manoeuvre-rank-stepper">`;
    html += `<button class="cs-step-btn" data-manoeuvre-rank-up${n >= count ? ' disabled' : ''}>▲</button>`;
    html += `<button class="cs-step-btn" data-manoeuvre-rank-down${n <= 0 ? ' disabled' : ''}>▼</button>`;
    html += `</div>`;
  }
  return html;
}

export function renderOfficeTab(el, char, chars = [], viewCategory) {
  if (!el || !char) { if (el) el.innerHTML = '<div class="dtl-empty">No character loaded.</div>'; return; }

  // oxp.3 render generation. Every render replaces el.innerHTML wholesale, so
  // every render invalidates the DOM nodes any in-flight async wiring captured.
  // Bumping a counter on `el` and re-checking it before each DOM write stops a
  // late-resolving fetch from painting the previous category's state into the
  // one now on screen (Codex review, 2026-08-13).
  //
  // The precedent for this guard is office-approvals.js's `_fetchGen`, which
  // keeps its counter at module scope because that module only ever drives one
  // root element. This tab's root is re-rendered repeatedly, and could in
  // principle be mounted more than once, so the counter is anchored to `el`
  // itself rather than to the module.
  el._officeManoeuvreGen = (el._officeManoeuvreGen || 0) + 1;

  // otc.3: any player can browse any office as reference, not just one they
  // hold. Default to the viewer's own held office; if they hold none, start
  // on Head of State rather than an empty state.
  const category = viewCategory || char.court_category || 'Head of State';
  const isOwnOffice = category === char.court_category;

  const data = OFFICE_DATA[category];
  const title = isOwnOffice ? esc(char.court_title || category) : esc(category);
  const role  = esc(category);

  let h = `<div class="office-tab">`;
  h += `<div class="office-header"><div class="office-title">${title}</div><div class="office-role">${role}</div></div>`;

  h += `<div class="office-category-picker">`;
  h += `<select class="form-select" id="office-category-select">`;
  for (const cat of OFFICE_CATEGORIES) {
    const sel = cat === category ? ' selected' : '';
    const mine = cat === char.court_category ? ' (yours)' : '';
    h += `<option value="${esc(cat)}"${sel}>${esc(cat)}${esc(mine)}</option>`;
  }
  h += `</select>`;
  h += `</div>`;

  if (!isOwnOffice) {
    h += `<div class="office-reference-banner">Reference view. Showing what this office grants, not your own.</div>`;
  }

  if (!data) {
    h += `<div class="dtl-empty">Office details for this role are pending.</div>`;
    h += `</div>`;
    el.innerHTML = h;
    _wireCategoryPicker(el, char, chars);
    return;
  }

  // Status Power
  h += `<div class="office-section">`;
  h += `<div class="office-section-hd">Status Power</div>`;
  h += `<div class="office-status-power">`;
  for (const para of data.statusPower) {
    h += `<p>${esc(para)}</p>`;
  }
  h += `</div>`;
  h += `</div>`;

  // Interactive status actions — HoS only (phase 1), and only when browsing
  // your OWN office. otc.3: a player browsing Head of State's reference must
  // never see or trigger this panel just because the category matches.
  if (category === 'Head of State' && isOwnOffice) {
    h += `<div class="office-section">`;
    h += `<div class="office-section-hd">Status Actions — this session</div>`;
    h += `<div class="office-budget-line">Loading…</div>`;
    h += `<div class="office-picker-mount"></div>`;
    h += `<div class="office-action-btns"></div>`;
    h += `<div class="office-action-msg" aria-live="polite"></div>`;
    h += `</div>`;
  }

  // Manoeuvres — oxp.3: an office's five manoeuvres are bought in fixed rank
  // order, so the list carries real purchase state for the holder rather than
  // implying all five are already available. The rank itself arrives async
  // (see _wireManoeuvreRank), so the first synchronous render passes a null
  // rank and mutes nothing; the mount below stays empty until it resolves.
  h += `<div class="office-section">`;
  h += `<div class="office-section-hd">Manoeuvres</div>`;
  h += `<div class="office-manoeuvre-rank" data-office-manoeuvre-rank-mount></div>`;
  h += `<div class="office-manoeuvre-list">${manoeuvreListHtml(data.manoeuvres, null, isOwnOffice)}</div>`;
  h += `</div>`;

  // Merits — real per-merit dot ratings (ST-editable), not a flat
  // "already granted" chip list. Epic OXP (full accrual/spend economy)
  // isn't built yet, but STs need to be able to hand-set dots ahead of
  // game — see the reference_office_powers_xp_economy memory.
  h += `<div class="office-section">`;
  h += `<div class="office-section-hd">Merit Suite</div>`;
  h += `<div class="office-merit-list" data-office-merit-mount>Loading…</div>`;
  h += `</div>`;

  h += `</div>`;
  el.innerHTML = h;
  _wireCategoryPicker(el, char, chars);
  _wireMeritDots(el, category, data.merits);
  _wireManoeuvreRank(el, category, data.manoeuvres, isOwnOffice);

  if (category === 'Head of State' && isOwnOffice) {
    _wireHosActions(el, char, chars);
  }
}

/** otc.3: the category picker is present on every render (own office or
 *  browsing, including the pending-fallback branch) — wiring is shared. */
function _wireCategoryPicker(el, char, chars) {
  if (typeof el.querySelector !== 'function') return; // plain-object test mocks have no real DOM
  const select = el.querySelector('#office-category-select');
  if (!select) return;
  select.addEventListener('change', () => {
    renderOfficeTab(el, char, chars, select.value);
  });
}

/** Fetches current merit dots for every office category and renders this
 *  category's merit suite with real dot ratings. STs (and dev, which is
 *  treated as ST everywhere per this codebase's own equivalence) get +/-
 *  stepper controls; everyone else sees a read-only dot display. Mirrors
 *  _wireHosActions's own fetch-then-render-into-mount pattern below. */
async function _wireMeritDots(el, category, meritNames) {
  if (typeof el.querySelector !== 'function') return; // plain-object test mocks have no real DOM
  const mount = el.querySelector('[data-office-merit-mount]');
  if (!mount) return;

  let dotsByCategory;
  try {
    dotsByCategory = await apiGet('/api/office_merit_dots');
  } catch {
    mount.innerHTML = '<p class="dtl-empty">Could not load merit dots.</p>';
    return;
  }

  const dots = dotsByCategory[category] || {};
  const isST = _isST();

  const rowsHtml = meritNames.map((merit) => {
    const n = dots[merit] || 0;
    const cap = MERIT_DOT_CAPS[merit] || 5;
    const dotsDisplay = '●'.repeat(n) + '○'.repeat(Math.max(0, cap - n));
    let row = `<div class="office-merit-row">`;
    row += `<span class="office-merit-chip">${esc(merit)}</span>`;
    row += `<span class="office-merit-dots">${esc(dotsDisplay)}</span>`;
    if (isST) {
      row += `<div class="cs-edit-stepper office-merit-stepper">`;
      row += `<button class="cs-step-btn" data-merit-up="${esc(merit)}"${n >= cap ? ' disabled' : ''}>▲</button>`;
      row += `<button class="cs-step-btn" data-merit-down="${esc(merit)}"${n <= 0 ? ' disabled' : ''}>▼</button>`;
      row += `</div>`;
    }
    row += `</div>`;
    return row;
  }).join('');

  mount.innerHTML = rowsHtml;

  if (isST) {
    mount.querySelectorAll('[data-merit-up]').forEach((btn) => {
      btn.addEventListener('click', () => _adjustMeritDots(el, category, meritNames, btn.dataset.meritUp, 1));
    });
    mount.querySelectorAll('[data-merit-down]').forEach((btn) => {
      btn.addEventListener('click', () => _adjustMeritDots(el, category, meritNames, btn.dataset.meritDown, -1));
    });
  }
}

async function _adjustMeritDots(el, category, meritNames, merit, delta) {
  // Re-fetch fresh rather than trusting DOM state — another ST could have
  // changed this since the row was last rendered.
  let dotsByCategory;
  try { dotsByCategory = await apiGet('/api/office_merit_dots'); } catch { return; }
  const current = (dotsByCategory[category] || {})[merit] || 0;
  const cap = MERIT_DOT_CAPS[merit] || 5;
  const next = Math.max(0, Math.min(cap, current + delta));
  if (next === current) return;

  try {
    await apiPut(`/api/office_merit_dots/${encodeURIComponent(category)}`, { merit, dots: next });
  } catch {
    return; // silent no-op on failure — the displayed value simply stays put
  }
  await _wireMeritDots(el, category, meritNames);
}

/** oxp.3: fetches this office's current manoeuvre rank, mutes the manoeuvres
 *  above it (own-office view only), and renders the rank readout plus the
 *  ST/dev-only stepper. Mirrors _wireMeritDots's fetch-then-render-into-mount
 *  pattern, and like it is deliberately NOT gated on isOwnOffice for the ST —
 *  an ST needs to set an office's purchase state while browsing it as
 *  reference, before anyone even holds it. */
async function _wireManoeuvreRank(el, category, manoeuvres, isOwnOffice) {
  if (typeof el.querySelector !== 'function') return; // plain-object test mocks have no real DOM

  // Captured before the first await. If a later render (a category switch)
  // bumps the counter while this fetch is in flight, every DOM write below is
  // abandoned rather than applied to markup that now belongs to another office.
  const gen   = el._officeManoeuvreGen;
  const stale = () => gen !== el._officeManoeuvreGen;

  const mount  = el.querySelector('[data-office-manoeuvre-rank-mount]');
  const listEl = el.querySelector('.office-manoeuvre-list');
  if (!mount && !listEl) return;

  const isST = _isST();
  // A non-ST browsing someone else's office is entitled to nothing but the
  // plain summary (AC2), so there is no reason to fetch purchase state at all.
  if (!isOwnOffice && !isST) return;

  let ranksByCategory;
  try {
    ranksByCategory = await apiGet('/api/office_manoeuvre_rank');
  } catch {
    if (stale()) return;
    // Do not leave the list in its optimistic first-render state. That render
    // passes rank null, which mutes nothing, so a silent failure would show the
    // holder five active-looking manoeuvres while the real rank is unknown and
    // may be zero (Codex review, 2026-08-13). Saying so is more honest than
    // guessing in either direction.
    if (isOwnOffice && listEl) {
      listEl.innerHTML = '<p class="dtl-empty">Could not load purchase state.</p>';
    }
    if (mount) mount.innerHTML = '<span class="dtl-empty">Could not load manoeuvre rank.</span>';
    return;
  }
  if (stale()) return;

  const count = manoeuvres.length;
  const rank  = Math.max(0, Math.min(count, Number(ranksByCategory[category]) || 0));

  // Muting is own-office only — the reference view's markup never gains the
  // class, whatever the stored rank.
  if (isOwnOffice && listEl) {
    listEl.innerHTML = manoeuvreListHtml(manoeuvres, rank, true);
  }

  if (!mount) return;
  mount.innerHTML = manoeuvreRankHtml(rank, count, isST);

  if (isST) {
    mount.querySelectorAll('[data-manoeuvre-rank-up]').forEach((btn) => {
      btn.addEventListener('click', () => _adjustManoeuvreRank(el, category, manoeuvres, isOwnOffice, 1));
    });
    mount.querySelectorAll('[data-manoeuvre-rank-down]').forEach((btn) => {
      btn.addEventListener('click', () => _adjustManoeuvreRank(el, category, manoeuvres, isOwnOffice, -1));
    });
  }
}

async function _adjustManoeuvreRank(el, category, manoeuvres, isOwnOffice, delta) {
  // Send the STEP, never a computed absolute value. Reading the rank here and
  // PUTting `current + delta` looks safe but is a read-then-write race: two
  // overlapping adjustments both read the same starting rank and both write the
  // same next one, losing a step (Codex review, 2026-08-13). The server applies
  // the delta and the clamp atomically instead, so overlapping steps converge.
  const gen = el._officeManoeuvreGen;

  try {
    await apiPut(`/api/office_manoeuvre_rank/${encodeURIComponent(category)}/step`, { delta });
  } catch {
    return; // silent no-op on failure — the displayed value simply stays put
  }
  // The viewer may have switched category while the write was in flight;
  // re-rendering now would paint this office's rank into that one's markup.
  if (gen !== el._officeManoeuvreGen) return;
  await _wireManoeuvreRank(el, category, manoeuvres, isOwnOffice);
}

async function _wireHosActions(el, char, chars) {
  const budgetLine  = el.querySelector('.office-budget-line');
  const pickerMount = el.querySelector('.office-picker-mount');
  const btnArea     = el.querySelector('.office-action-btns');
  const msgEl       = el.querySelector('.office-action-msg');

  // Fetch current game session (budget grouping) and the live game-phase
  // cycle. otc.2: Status Actions only fire while a game is actually live.
  // Uses currentCycleInGamePhase directly (not db.js's getGamePhaseCycle,
  // which reads phase via deriveCycleStatus's legacy-fallback derivation) so
  // the client identifies "the current cycle" and reads its phase by the
  // EXACT same canonical-only rule as the server (Codex review finding,
  // 2026-08-12: the two disagreed on legacy/desynchronised documents when
  // routed through different readers). Deliberately not getFeedingCycle,
  // which is broader (prep|game) and gates feeding, not Status Actions.
  let session = null;
  try { session = await apiGet('/api/office_actions/latest_session'); } catch { /* ignore */ }
  const sessionId = session ? String(session._id) : null;

  let liveCycle = null;
  try { liveCycle = currentCycleInGamePhase(await getCycles()); } catch { /* ignore */ }

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
    if (!liveCycle) {
      budgetLine.textContent = 'Available once the game session opens';
      budgetLine.className = 'office-budget-line';
      return;
    }
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
    if (!liveCycle || !selectedChar || !sessionId) return;

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
    if (!liveCycle || !selectedChar || !sessionId) return;
    msgEl.textContent = 'Submitting…';
    try {
      // oaq.2: submitting no longer applies the action — it creates a
      // pending record for ST review. Nothing about selectedChar's status
      // or the budget display changes here; both only move once an ST
      // accepts, which the client learns about on its next fetch of
      // priorActions (GET /api/office_actions only ever returns APPLIED
      // actions, never pending ones — see office-actions.js's GET / route),
      // not from this response.
      await apiPost('/api/office_actions', {
        game_session_id: sessionId,
        actor_id:        String(char._id),
        target_id:       String(selectedChar._id),
        action_type:     actionType,
      });
      msgEl.textContent = `Submitted — ${displayName(selectedChar)}'s ${actionType.replace('_', ' ')} is pending ST review.`;
      renderButtons();
    } catch (err) {
      msgEl.textContent = err.message || 'Action failed.';
    }
  }
}
