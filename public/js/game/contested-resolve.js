/* crd.3b — the real room behind crd.2's door: the defender's own pool-builder
 * for a contested roll, replacing the honest "coming soon" placeholder this
 * file used to be.
 *
 * Entry contract, extended additively from crd.2's own (mirrors goTab(t) ->
 * goTab(t, ctx)'s own precedent rather than inventing a new calling shape):
 *
 *     goTab('contested-resolve', { challengeId })
 *       -> initContestedResolve(rootEl, ctx, chars)
 *
 * `chars` is the viewer's own full character list (crd.2's own
 * `suiteState.chars`, already resident in memory — no new GET is added here;
 * `app.js` already threads it into `initPendingQueue`, just not into this
 * module until now).
 *
 * Trust boundary (crd.3a, unchanged and unmodified by this story): every
 * aspect/Willpower/merit change calls the server's own PUT .../resolve and
 * displays exactly the `defender_pool` it returns. Nothing here recomputes or
 * guesses that number. The final commit calls the pre-existing, unmodified
 * PUT .../accept — the actual dice roll ALREADY happens server-side there
 * (crd.1), so this module never rolls its own dice. `mkColsEl` is imported
 * from roll-v2.js purely to RENDER the rolls the server already decided
 * (confirmed independent of that file's own pool-building `state` by reading
 * it directly; it builds each die internally, so no separate die-builder
 * import is needed here) — this module must never import `../shared/dice.js`'s
 * `rollPool`/`d10`, which would silently perform a SECOND, illegitimate
 * client-side roll alongside the server's real one.
 */

import { apiRaw } from '../data/api.js';
import { esc, redactCharName } from '../data/helpers.js';
import { ROLL_LABELS, getPendingChallenge, markChallengeResolved } from './pending-queue.js';
import { ensureLoaded, trackerRead } from './tracker.js';
import { mkColsEl } from '../suite/roll-v2.js';

const ASPECT_ATTR = { mental: 'Resolve', social: 'Composure', physical: 'Stamina' };
const ASPECT_ORDER = ['mental', 'social', 'physical'];
const ASPECT_LABEL = { mental: 'Mental', social: 'Social', physical: 'Physical' };
// crd.3a's own narrow, explicitly-named 2-merit lookup — mirrored here for
// DISPLAY filtering only. The server is the sole authority on whether a
// submitted id is actually honoured; this list existing in two places is a
// display concern, not a second trust boundary.
const RESOLVABLE_MERIT_KEYS = new Set(['indomitable', 'closed-book']);

let _rootEl = null;
let _resolveGen = 0;
// crd.3b code review (external Codex, Pass 1): bumped on every mount, checked
// after every awaited network call in _resolve/_accept/the WP-load callback.
// _resolveGen alone only orders resolves WITHIN one mount — a mount's own
// first resolve call after _resetState still has the SAME _resolveGen value
// a still-pending call from a PRIOR mount was issued under, so that stale
// call's `gen !== _resolveGen` check could pass by coincidence and paint a
// newer mount (even one for a different challenge) with an older mount's
// data. _accept had no such guard at all. _mountGen closes both gaps.
let _mountGen = 0;

const state = {
  challengeId: null,
  challenge:   null,
  character:   null,
  charsCount:  0,
  wpAvailable: 0,
  aspect:      null,
  wpOn:        false,
  meritIds:    new Set(),
  pool:        null,
  poolError:   null,
  resolving:   false,
  accepting:   false,
  outcome:     null,   // set once /accept succeeds
  acceptError: null,
};

function _attrEffective(character, attrName) {
  const a = character?.attributes?.[attrName];
  return (a?.dots || 0) + (a?.bonus || 0);
}

function _resetState(challengeId, challenge, character, charsCount) {
  _mountGen++;
  state.challengeId = challengeId;
  state.challenge   = challenge;
  state.character   = character;
  state.charsCount  = charsCount;
  state.wpAvailable = 0;
  state.aspect      = null;
  state.wpOn        = false;
  state.meritIds    = new Set();
  state.pool        = null;
  state.poolError   = null;
  state.resolving   = false;
  state.accepting   = false;
  state.outcome     = null;
  state.acceptError = null;
}

export function initContestedResolve(rootEl, ctx, chars = []) {
  if (!rootEl) return;

  const challengeId = ctx?.challengeId ? String(ctx.challengeId) : '';
  const challenge = challengeId ? getPendingChallenge(challengeId) : null;
  const character = challenge
    ? (chars || []).find(c => String(c._id) === String(challenge.target_character_id))
    : null;

  _resetState(challengeId, challenge, character, (chars || []).length);
  const myMount = _mountGen;
  _render(rootEl);

  if (character) {
    ensureLoaded(character).then(() => {
      // A stale mount (player navigated away and back, including to the SAME
      // challenge id, before this resolved) must not paint over a newer
      // mount's state — compared by mount generation, not challengeId, since
      // a remount of the identical challenge shares the same id.
      if (myMount !== _mountGen) return;
      state.wpAvailable = trackerRead(String(character._id))?.willpower ?? 0;
      _render(rootEl);
    });
  }

  if (rootEl !== _rootEl) {
    _rootEl = rootEl;
    rootEl.addEventListener('click', (e) => _onClick(e, rootEl));
  }
}

function _onClick(e, rootEl) {
  if (e.target.closest('[data-cr-back]')) {
    if (typeof window !== 'undefined' && typeof window.goTab === 'function') window.goTab('contested-queue');
    return;
  }
  if (state.accepting) return; // no interaction once a roll is in flight

  const aspectBtn = e.target.closest('[data-cr-aspect]');
  if (aspectBtn) {
    state.aspect = aspectBtn.dataset.crAspect;
    _resolve(rootEl);
    return;
  }

  const wpToggle = e.target.closest('[data-cr-wp]');
  if (wpToggle && !wpToggle.classList.contains('disabled')) {
    state.wpOn = !state.wpOn;
    _resolve(rootEl);
    return;
  }

  const meritBtn = e.target.closest('[data-cr-merit]');
  if (meritBtn) {
    const key = meritBtn.dataset.crMerit;
    if (state.meritIds.has(key)) state.meritIds.delete(key); else state.meritIds.add(key);
    _resolve(rootEl);
    return;
  }

  if (e.target.closest('[data-cr-accept]') && !e.target.closest('[data-cr-accept]').disabled) {
    _accept(rootEl);
  }
}

/** Calls crd.3a's own PUT .../resolve and displays exactly its returned
 *  defender_pool. Guarded against TWO distinct staleness sources (crd.3b code
 *  review, external Codex, Pass 1): _resolveGen orders overlapping resolve
 *  calls WITHIN one mount (matching this codebase's own established shape,
 *  e.g. office-tab.js's _officeManoeuvreGen); _mountGen additionally catches
 *  a call issued by an EARLIER mount landing after a newer mount (even one
 *  for a different challenge) has already taken over this same module state.
 *  Also guarded against apiRaw itself REJECTING (a thrown fetch, not just a
 *  non-OK response — e.g. a dropped connection) via try/catch/finally, so a
 *  network failure can never leave `resolving` latched true forever with no
 *  way for the player to recover. */
async function _resolve(rootEl) {
  if (!state.aspect) { state.pool = null; _render(rootEl); return; }

  const myMount = _mountGen;
  const gen = ++_resolveGen;
  state.resolving = true;
  _render(rootEl);

  let res;
  try {
    res = await apiRaw('PUT', `/api/contested_roll_requests/${state.challengeId}/resolve`, {
      defender_aspect:    state.aspect,
      defender_wp_spent:  state.wpOn,
      defender_merit_ids: Array.from(state.meritIds),
    });
  } catch {
    res = { ok: false, body: { message: 'Could not reach the server, try again.' } };
  }

  if (myMount !== _mountGen || gen !== _resolveGen) return; // superseded
  state.resolving = false;
  if (res.ok) {
    state.pool = res.body.defender_pool;
    state.poolError = null;
  } else {
    state.pool = null;
    state.poolError = res.body?.message || 'Could not update your pool.';
  }
  _render(rootEl);
}

/** Calls the EXISTING, unmodified PUT .../accept (crd.1). The actual dice
 *  roll already happened server-side; this only renders what comes back.
 *  Deliberately has NO client-side gate on whether a pool has been resolved
 *  yet (AC7: "adds no client-side gating duplicate of that guard") — the
 *  route's own `defender_pool == null` 409 is what protects this, surfaced
 *  here exactly like any other accept failure. Same _mountGen/try-catch
 *  guarding as _resolve, for the same reasons. */
async function _accept(rootEl) {
  const myMount = _mountGen;
  state.accepting = true;
  state.acceptError = null;
  _render(rootEl);

  let res;
  try {
    res = await apiRaw('PUT', `/api/contested_roll_requests/${state.challengeId}/accept`, {});
  } catch {
    res = { ok: false, body: { message: 'Could not reach the server, try again.' } };
  }

  if (myMount !== _mountGen) return; // superseded by a later mount
  state.accepting = false;
  if (res.ok) {
    state.outcome = res.body.outcome;
    markChallengeResolved(state.challengeId);
  } else {
    state.acceptError = res.body?.message || 'Could not roll, try again.';
  }
  _render(rootEl);
}

function _render(rootEl) {
  rootEl.innerHTML = _html();
  if (state.outcome) {
    const wrap = rootEl.querySelector('[data-cr-defender-rolls]');
    if (wrap) wrap.appendChild(mkColsEl(state.outcome.defender.rolls, 0));
    const awrap = rootEl.querySelector('[data-cr-attacker-rolls]');
    if (awrap) awrap.appendChild(mkColsEl(state.outcome.attacker.rolls, state.outcome.defender.rolls.length));
  }
}

function _missingDataHtml() {
  return `
    <div class="stm-audit-root">
      <header class="stm-audit-head"><h2>Resolve Challenge</h2></header>
      <p class="ch-desc">This challenge can't be resolved right now, it may already have been
        handled, or you may need to refresh the Challenges list.</p>
      <div class="ch-modal-actions cq-actions">
        <button type="button" class="ch-btn ch-btn-decline" data-cr-back>Back to Challenges</button>
      </div>
    </div>`;
}

// Reuses roll-v2.js's own contested-roll verdict chrome (.rcnt/.rlbl/.rverd,
// .rote-blk/.rote-lbl) — the same classes that file's own RESIST_MODE feature
// already uses for a two-sided dice display, so a player sees one consistent
// verdict language across the whole app rather than a second one invented
// here.
function _outcomeVerdict() {
  const o = state.outcome;
  const cls = o.outcome === 'defender' ? 's' : o.outcome === 'attacker' ? 'f' : 'e';
  const label = o.outcome === 'defender' ? 'You Won' : o.outcome === 'attacker' ? 'You Lost' : 'Draw';
  return `
    <div class="ch-modal-body">
      <div><span class="rcnt ${cls}">${esc(String(o.margin))}</span><span class="rlbl ${cls}">${esc(label)}</span></div>
      <div class="rverd">${esc(String(o.defender.successes))} successes vs ${esc(String(o.attacker.successes))}</div>
    </div>
    <div class="rote-blk win">
      <div class="rote-lbl">You: ${esc(String(o.defender.successes))} success${o.defender.successes !== 1 ? 'es' : ''}</div>
      <div data-cr-defender-rolls></div>
    </div>
    <div class="rote-blk">
      <div class="rote-lbl">${esc(redactCharName(o.attacker.name || 'Challenger'))}: ${esc(String(o.attacker.successes))} success${o.attacker.successes !== 1 ? 'es' : ''}</div>
      <div data-cr-attacker-rolls></div>
    </div>
    <div class="ch-modal-actions cq-actions">
      <button type="button" class="ch-btn ch-btn-decline" data-cr-back>Back to Challenges</button>
    </div>`;
}

function _html() {
  if (!state.challenge || !state.character) return _missingDataHtml();
  if (state.outcome) {
    return `
      <div class="stm-audit-root">
        <header class="stm-audit-head"><h2>Resolve Challenge</h2><p class="stm-audit-sub">The dice are rolled.</p></header>
        ${_outcomeVerdict()}
      </div>`;
  }

  const c = state.challenge;
  const character = state.character;

  const identity = state.charsCount > 1
    ? `<div class="cr-identity-banner">Defending as <strong>${esc(redactCharName(c.target_character_name || character.name || 'your character'))}</strong></div>`
    : '';

  const aspectHtml = ASPECT_ORDER.map(a => {
    const attr = ASPECT_ATTR[a];
    const val = _attrEffective(character, attr);
    return `<button type="button" data-cr-aspect="${a}" class="${state.aspect === a ? 'on' : ''}">
      ${ASPECT_LABEL[a]}<span class="cr-aspect-attr">${attr} · ${val}</span>
    </button>`;
  }).join('');

  const wpDisabled = state.wpAvailable <= 0;
  const wpNote = wpDisabled
    ? 'No Willpower available.'
    : `${state.wpAvailable} Willpower available. A Resistance roll gets +2, not the usual +3.`;

  const merits = (character.merits || []).filter(m => RESOLVABLE_MERIT_KEYS.has(m.rule_key));
  const meritHtml = merits.length
    ? `<div class="cr-merit-row">${merits.map(m => {
        const on = state.meritIds.has(m.rule_key);
        const bonus = m.rule_key === 'indomitable' ? 2 : (m.rating || 0);
        return `<button type="button" data-cr-merit="${esc(m.rule_key)}" class="cr-merit-chip${on ? ' on' : ''}">
          ${esc(m.name)} <span class="cr-merit-bonus">+${bonus}</span>
        </button>`;
      }).join('')}</div>`
    : `<p class="derived-note">This character has no merits that apply to a contested roll yet.</p>`;

  const poolDisplay = state.poolError
    ? `<span class="cr-pool-error">${esc(state.poolError)}</span>`
    : `${state.pool == null ? '-' : esc(String(state.pool))}<span class="cr-pool-unit">${state.pool === 1 ? 'die' : 'dice'}</span>`;

  // AC7: deliberately NOT gated on state.pool != null — the route's own
  // defender_pool == null 409 (crd.1) is what protects this, and this story
  // adds no client-side duplicate of that guard (crd.3b code review,
  // external Codex, Pass 3a). Gating here would make that 409 unreachable
  // from this screen.
  const canAccept = !state.resolving && !state.accepting;

  return `
    <div class="stm-audit-root">
      <header class="stm-audit-head"><h2>Resolve Challenge</h2><p class="stm-audit-sub">Build your resistance pool, then roll.</p></header>
      <div class="cq-resolve-body">
        ${identity}
        <div class="ch-pools">
          <div class="ch-pool-row"><span class="ch-pool-lbl">Challenger</span><span class="ch-pool-val">${esc(redactCharName(c.challenger_character_name || 'Someone'))}</span></div>
          <div class="ch-pool-row"><span class="ch-pool-lbl">Contest</span><span class="ch-pool-val">${esc(ROLL_LABELS[c.roll_type] || c.roll_type || 'Contested Roll')}</span></div>
          <div class="ch-pool-row"><span class="ch-pool-lbl">Their pool</span><span class="ch-pool-val">${esc(String(c.challenger_pool))} dice</span></div>
        </div>
        <div>
          <div class="form-section-title">How do you resist?</div>
          <div class="cr-aspect-seg" data-cr-aspect-seg>${aspectHtml}</div>
        </div>
        <div>
          <div class="form-section-title">Willpower</div>
          <button type="button" data-cr-wp class="cr-wp-toggle${state.wpOn ? ' on' : ''}${wpDisabled ? ' disabled' : ''}">
            <span>Spend a point of Willpower</span><span class="cr-wp-bonus">+2 dice</span>
          </button>
          <p class="derived-note">${esc(wpNote)}</p>
        </div>
        <div>
          <div class="form-section-title">Merits</div>
          ${meritHtml}
        </div>
        <div class="cr-pool-preview">
          <span class="cr-pool-label">Your pool</span>
          <span class="cr-pool-value">${poolDisplay}</span>
        </div>
        ${state.acceptError ? `<p class="cr-pool-error">${esc(state.acceptError)}</p>` : ''}
        <div class="ch-modal-actions cq-actions">
          <button type="button" class="ch-btn ch-btn-decline" data-cr-back>Back</button>
          <button type="button" class="ch-btn ch-btn-accept" data-cr-accept ${canAccept ? '' : 'disabled'}>
            ${state.accepting ? 'Rolling…' : (state.pool == null ? 'Choose how to resist' : `Roll ${state.pool} ${state.pool === 1 ? 'Die' : 'Dice'}`)}
          </button>
        </div>
      </div>
    </div>`;
}
