/**
 * Praxis Claim board - the ST's live tap-to-assign board for Praxis night
 * (Epic PRAX, story prax.2).
 *
 * ═══ ST-ONLY, PERMANENTLY ═══
 *
 * Reached only through admin.html's existing ST-only sidebar and auth gate,
 * the same posture as every other admin domain, and every route it calls is
 * `requireRole('st')` server-side (see server/routes/praxis-sessions.js's own
 * header). There is deliberately NO extra client-side role check here: adding
 * one would imply this module could ever be mounted somewhere player-reachable,
 * which is exactly the thing the epic's locked ruling forbids.
 *
 * ═══ PURE CONSUMER ═══
 *
 * Every route used here shipped in prax.1 and is untouched by this story. This
 * module opens and withdraws claims, assigns and unassigns supporters, and
 * refetches on the `praxis_session` WS frame. It does not resolve a winner
 * (prax.4a/prax.4b own that) and never calls a resolve route, because none
 * exists yet.
 *
 * ═══ THE TALLY IS NEVER STORED ═══
 *
 * The board document persists only claims and support assignments. Every number
 * on screen is computed at render time from live character + territory data via
 * `calcCityStatus()`, never read off the document. `setStatusTerritories()` is
 * therefore primed from `/api/territories` BEFORE any tally is computed -
 * `calcCityStatus` resolves the regent-ambience component out of that
 * module-local store, so an unprimed store silently costs claimants their
 * regency bonus rather than failing loudly.
 *
 * ═══ REUSED BY prax.3 ═══
 *
 * prax.3 adds the People's Harpy tally by reusing this component with the other
 * weighting. The tally literal lives in ONE constant at the top of this file
 * rather than inlined at each call site, so that story parameterises it instead
 * of hunting for string literals. Nothing here refuses a character who is
 * standing in both tallies at once - that is a supported state, not an
 * oversight (see prax.1's own POST /claims comment).
 */

import { apiGet, apiPost, apiPut, apiDelete, apiRaw } from '../data/api.js';
import { esc, displayName } from '../data/helpers.js';
import { calcCityStatus, setStatusTerritories } from '../data/accessors.js';
import { resolveHeldSeat } from '../data/office-seat-resolve.js';

/** The tally this board writes. prax.3's own parameter hook - see the header. */
const TALLY = 'praxis';
/** How the tally is named in UI copy. */
const TALLY_LABEL = 'Praxis';

/**
 * The seat label that makes a claimant's win vacate their current office.
 * Matched against `office_seats.seat_label`, not against `court_category`:
 * Socialite has TWO live seats ('Harpy' and "People's Harpy") whose holders'
 * character documents are indistinguishable, which is the whole reason the
 * office_seats collection exists (see server/schemas/office_seat.schema.js).
 */
const PEOPLES_HARPY_SEAT_LABEL = "People's Harpy";

/**
 * A chapter's declared phase, duplicated from cycle-views.js's own
 * `declaredPhase`/`declaresPhase` pair rather than imported. Small per-view
 * selection logic is kept local in this repo (cycle-views.js, downtime-views.js
 * and roll-feed.js all carry their own); a shared import for four lines of
 * filter-and-sort would couple this board to the Cycle tab's own evolution for
 * no gain. Deliberately NARROW, matching that file: no `status` fallback.
 */
const PHASES = ['game', 'downtime', 'processing', 'prep'];

/**
 * The 24-hex lower-case character id shape. Mirrors `SEAT_ID_PATTERN` as used by
 * server/routes/praxis-sessions.js's own `attendeePool()`, which filters the
 * attendance array by exactly this test after lower-casing. The two must agree:
 * an id this board offered but the server rejected would read to the ST as the
 * app losing a tap.
 */
const CHAR_ID_PATTERN = /^[a-f0-9]{24}$/;

// ── Module state ─────────────────────────────────────────────────────────────

let _rootEl = null;
// Flips true on the first initPraxisView call and never back. Guards the WS
// callback: before the domain has been opened there is nothing to paint into,
// the same reason roll-feed.js's own `_initialized` guard exists.
let _initialised = false;
let _wired = false;

let _charsById = new Map();
let _seats = [];
let _chapter = null;
let _session = null;      // the game_sessions doc linked to _chapter, or null
let _attendees = [];      // lower-cased character ids of everyone marked attended
let _board = null;        // the praxis_sessions doc, or null when none is open
let _sheetFor = null;     // character id the bottom sheet is open for, or null
let _status = '';         // transient status line under the header
let _loadError = '';
let _busy = false;

// ── Pure helpers (no DOM, no fetch - kept exported for direct coverage) ───────

/** Does this chapter document declare a phase? */
export function declaresPhase(ch) {
  const p = ch?.phase || ch?.game_phase || null;
  return !!p && PHASES.includes(p);
}

/**
 * A chapter with no declared phase is closed only once its projects phase has
 * been signed off - the one branch of `deriveCycleStatus`'s own 'closed'
 * determination that can still apply after `declaresPhase` has been checked
 * first (every `game_phase`-driven branch there implies a declared phase).
 */
export function isClosedChapter(ch) {
  return !!ch?.phase_signoff?.projects;
}

const byGameNumberDesc = (a, b) => (b?.game_number || 0) - (a?.game_number || 0);

/**
 * The chapter this board belongs to: the highest-game_number chapter carrying a
 * declared phase, else the highest-game_number chapter that is not closed.
 * `game_number` is THE ordering field - never `_id`/creation order, which is
 * proven wrong for game order in this data.
 */
export function resolveChapter(chapters) {
  const list = (Array.isArray(chapters) ? chapters : []).filter(Boolean);
  const phased = list.filter(declaresPhase).sort(byGameNumberDesc)[0];
  if (phased) return phased;
  return list.filter(ch => !isClosedChapter(ch)).sort(byGameNumberDesc)[0] || null;
}

/**
 * The attendee pool for a chapter, from the linked session's attendance array.
 *
 * A deliberate mirror of server/routes/praxis-sessions.js's `attendeePool()`,
 * down to the `attended === true` strict check, the lower-casing and the 24-hex
 * filter. Read that function before changing this one: a board that offered an
 * attendee the server's own check would reject shows the ST a chip whose every
 * tap fails.
 */
export function attendeeIdsFromSession(session) {
  return (session?.attendance || [])
    .filter(a => a && a.attended === true)
    .map(a => String(a?.character_id || '').toLowerCase())
    .filter(id => CHAR_ID_PATTERN.test(id));
}

/**
 * Who is still tappable in the pool strip: every attendee who is neither
 * already supporting somebody nor standing as a claimant themselves.
 *
 * Claimants are excluded as well as supporters. The locked mockup shows the
 * pool and the claimant list as disjoint, and a claimant left in the strip would
 * render on the board twice and offer a "open a claim" tap the server answers
 * with a 409.
 */
export function unassignedPool(attendeeIds, support, claims) {
  const assigned = new Set(Object.keys(support || {}).map(k => String(k).toLowerCase()));
  const standing = new Set((claims || [])
    .filter(Boolean)
    .map(c => String(c.character_id || '').toLowerCase()));
  return (attendeeIds || []).filter(id => !assigned.has(id) && !standing.has(id));
}

// ── Board accessors ──────────────────────────────────────────────────────────

function claims() {
  return (_board?.[TALLY]?.claims || []).filter(Boolean);
}

function support() {
  return _board?.[TALLY]?.support || {};
}

function charFor(id) {
  return _charsById.get(String(id || '').toLowerCase()) || null;
}

function nameFor(id) {
  const c = charFor(id);
  return c ? displayName(c) : String(id || 'Unknown');
}

/** City Status for one character, computed live. Zero for an unknown id. */
function statusFor(id) {
  const c = charFor(id);
  return c ? (calcCityStatus(c) || 0) : 0;
}

/**
 * A claimant's live tally: their own City Status plus that of every character
 * currently assigned to support them. Derived here every render, never stored.
 */
function tallyFor(claimantId) {
  const key = String(claimantId).toLowerCase();
  let total = statusFor(key);
  for (const [supporterId, assignedTo] of Object.entries(support())) {
    if (String(assignedTo).toLowerCase() === key) total += statusFor(supporterId);
  }
  return total;
}

/** Everyone currently supporting this claimant, in a stable name order. */
function supportersOf(claimantId) {
  const key = String(claimantId).toLowerCase();
  return Object.entries(support())
    .filter(([, assignedTo]) => String(assignedTo).toLowerCase() === key)
    .map(([supporterId]) => String(supporterId).toLowerCase())
    .sort((a, b) => nameFor(a).localeCompare(nameFor(b)));
}

// ── Entry point ──────────────────────────────────────────────────────────────

/**
 * Called from admin.js's switchDomain when the Praxis domain activates.
 * Idempotent: a second visit refreshes the roster and refetches everything.
 *
 * @param {Array<object>} chars the admin app's already-loaded character roster.
 *   Reused rather than refetched - this is the same array switchDomain hands
 *   initCycleView and initRollFeed, and a second characters endpoint is exactly
 *   what AC8 rules out.
 */
export async function initPraxisView(chars) {
  _rootEl = document.getElementById('praxis-content');
  if (!_rootEl) return;

  _charsById = new Map((chars || [])
    .filter(Boolean)
    .map(c => [String(c._id).toLowerCase(), c]));

  _initialised = true;
  _sheetFor = null;
  _status = '';
  _wire();

  _rootEl.innerHTML = '<p class="placeholder">Loading…</p>';
  await loadAll();
  render();
}

/**
 * Called from admin.js's `onPraxisUpdate` WS callback with the board's own
 * session_id. No-ops until the domain has been opened at least once this
 * session, and ignores a frame for a DIFFERENT board than the one on screen.
 *
 * A frame that arrives while no board is loaded is NOT ignored: it most likely
 * means another ST just opened the board for this chapter, so the chapter-scoped
 * GET is re-run either way and the empty state resolves itself.
 */
export async function onPraxisUpdate(sessionId) {
  if (!_initialised || !_rootEl || !_chapter) return;
  if (_board && String(_board._id) !== String(sessionId)) return;
  await refetchBoard();
  render();
}

// ── Data loading ─────────────────────────────────────────────────────────────

async function loadAll() {
  _loadError = '';
  _chapter = null;
  _session = null;
  _attendees = [];
  _board = null;

  let chapters, sessions, seats, territories;
  try {
    [chapters, sessions, seats, territories] = await Promise.all([
      apiGet('/api/chapters'),
      apiGet('/api/game_sessions'),
      apiGet('/api/office_seats').catch(() => []),
      apiGet('/api/territories').catch(() => null),
    ]);
  } catch (err) {
    _loadError = err?.message || 'Failed to load Praxis data.';
    return;
  }

  // Primed BEFORE any calcCityStatus() call below. A failed territories fetch
  // deliberately leaves the existing store alone (admin.js primes it at boot)
  // rather than wiping it to an empty list, which would silently drop every
  // regent's ambience bonus from the tally.
  if (Array.isArray(territories)) setStatusTerritories(territories);

  _seats = Array.isArray(seats) ? seats : [];
  _chapter = resolveChapter(chapters);
  if (!_chapter) return;

  _session = (Array.isArray(sessions) ? sessions : [])
    .find(s => s && s.chapter_id && String(s.chapter_id) === String(_chapter._id)) || null;
  _attendees = attendeeIdsFromSession(_session);

  await refetchBoard();
}

async function refetchBoard() {
  if (!_chapter) return;
  try {
    // prax.1's GET answers `null`, not a 404, when no board has been opened for
    // this chapter - the normal state on every chapter until an ST opens one.
    const doc = await apiGet(`/api/praxis_sessions?chapter_id=${encodeURIComponent(String(_chapter._id))}`);
    // Anything that is not a single board document is treated as "no board".
    // Without this an unexpected array (a mis-mounted route, a stub) renders as
    // a truthy, permanently claim-less board the ST cannot get past.
    _board = (doc && typeof doc === 'object' && !Array.isArray(doc)) ? doc : null;
  } catch (err) {
    _loadError = err?.message || 'Failed to load the Praxis board.';
  }
}

// ── Write actions ────────────────────────────────────────────────────────────

/**
 * Run one write, then re-read the board from the server and re-render.
 *
 * The refetch is not optional and must never become a local DOM patch: the
 * tally is derived from server state, so a locally-moved chip would show a
 * number the server does not agree with until the next reload.
 */
async function write(fn) {
  if (_busy) return;
  _busy = true;
  _status = '';
  try {
    await fn();
  } catch (err) {
    _status = err?.message || 'That change could not be saved.';
  } finally {
    _busy = false;
  }
  await refetchBoard();
  render();
}

/**
 * Open a board for this chapter.
 *
 * A 409 is NOT an error here. Two STs opening the board in the same instant is
 * an ordinary Praxis-night race, and prax.1 names the winner's id in the
 * response body precisely so the loser can fall straight through to a read. The
 * chapter-scoped GET below resolves both outcomes identically, so the race
 * loser sees the board rather than a failure they cannot act on.
 */
async function openBoard() {
  if (_busy || !_chapter) return;
  _busy = true;
  _status = '';
  try {
    const res = await apiRaw('POST', '/api/praxis_sessions', { chapter_id: String(_chapter._id) });
    if (!res.ok && res.status !== 409) {
      _status = res.body?.message || 'The board could not be opened.';
    }
  } catch (err) {
    _status = err?.message || 'The board could not be opened.';
  } finally {
    _busy = false;
  }
  await refetchBoard();
  render();
}

function openClaim(characterId) {
  if (!_board) return;
  _sheetFor = null;
  return write(() => apiPost(
    `/api/praxis_sessions/${encodeURIComponent(String(_board._id))}/claims`,
    { tally: TALLY, character_id: characterId },
  ));
}

function assignSupport(supporterId, claimantId) {
  if (!_board) return;
  _sheetFor = null;
  return write(() => apiPut(
    `/api/praxis_sessions/${encodeURIComponent(String(_board._id))}/support`,
    // `claimant_character_id` is always present, never omitted - prax.1 treats
    // an absent key as a 400 and an explicit null as "return to the pool", and
    // the two must not be confusable.
    { tally: TALLY, supporter_character_id: supporterId, claimant_character_id: claimantId },
  ));
}

function unassignSupport(supporterId) {
  if (!_board) return;
  return write(async () => {
    await apiPut(
      `/api/praxis_sessions/${encodeURIComponent(String(_board._id))}/support`,
      { tally: TALLY, supporter_character_id: supporterId, claimant_character_id: null },
    );
    _status = `${nameFor(supporterId)} returned to the pool.`;
  });
}

/**
 * Withdraw a claim. No confirm modal, deliberately: this tool's established
 * ethos is two taps and no confirm, and a mis-tap is recoverable - the claim
 * can simply be reopened. The supporter cascade is server-side (prax.1 AC6);
 * this only reports how many the server released, because after the write
 * nothing records that count any more.
 */
function withdrawClaim(claimantId) {
  if (!_board) return;
  return write(async () => {
    const res = await apiDelete(
      `/api/praxis_sessions/${encodeURIComponent(String(_board._id))}`
      + `/claims/${encodeURIComponent(claimantId)}?tally=${encodeURIComponent(TALLY)}`,
    );
    const n = Number(res?.supporters_released) || 0;
    _status = `Claim withdrawn. ${n} supporter${n === 1 ? '' : 's'} returned to the pool.`;
  });
}

// ── Rendering ────────────────────────────────────────────────────────────────

function render() {
  if (!_rootEl) return;

  if (_loadError && !_chapter) {
    _rootEl.innerHTML = `<div class="praxis-board"><p class="pb-note">${esc(_loadError)}</p></div>`;
    return;
  }
  if (!_chapter) {
    _rootEl.innerHTML = '<div class="praxis-board"><p class="pb-note">'
      + 'No chapter to open a Praxis board against.</p></div>';
    return;
  }

  _rootEl.innerHTML = `<div class="praxis-board">${renderHead()}${
    _board ? renderPopulated() : renderEmpty()
  }</div>`;
}

function chapterCaption() {
  const parts = [];
  parts.push(_chapter.game_number != null
    ? `Chapter ${_chapter.game_number}`
    : (_chapter.label || 'Chapter'));
  if (_session?.session_date) parts.push(`${_session.session_date} session`);
  return parts.join(' · ');
}

function renderHead() {
  const live = _board ? '<span class="pb-live"><span class="dot"></span>Live</span>' : '';
  const status = _status ? `<div class="pb-status">${esc(_status)}</div>` : '';
  return `<div class="pb-head">
      <div><span class="pb-title">${esc(TALLY_LABEL)} Claim</span><span class="pb-chapter">${esc(chapterCaption())}</span></div>
      ${live}
    </div>${status}`;
}

function renderEmpty() {
  return `<div class="pb-empty">
      <p>No ${esc(TALLY_LABEL)} board is open for this chapter yet.</p>
      <button type="button" class="btn-open" data-praxis-action="open-board">Open ${esc(TALLY_LABEL)} Claim</button>
    </div>`;
}

function renderPopulated() {
  const pool = unassignedPool(_attendees, support(), claims());
  const noSession = !_session
    ? '<p class="pb-note">No game session is linked to this chapter yet, so there is no attendee list to claim from.</p>'
    : '';

  return `${noSession}
    <div class="pool-label">Not yet assigned (tap to support or open a claim)</div>
    <div class="pool-strip">${pool.map(renderPoolChip).join('')}</div>
    <div class="claimants-label"><span class="pool-label pool-label--inline">Claimants</span></div>
    <div class="claimants">${
      claims().length
        ? claims().map(renderClaimCard).join('')
        : '<p class="pb-note">No claims open yet. Tap anyone above to open one.</p>'
    }</div>
    ${_sheetFor ? renderSheet() : ''}`;
}

function renderPoolChip(id) {
  return `<button type="button" class="char-chip" data-praxis-action="pool-chip" data-char-id="${esc(id)}">${esc(nameFor(id))}</button>`;
}

/**
 * The claimant's secondary badge, checked live against office data rather than
 * read off the board document. `resolveHeldSeat` is the shared, confirmed-only
 * holder resolution (oxp.7) - no second office lookup is hand-rolled here.
 */
function renderBadge(claimantId) {
  const c = charFor(claimantId);
  if (!c) return '';
  const seat = resolveHeldSeat(c, _seats);
  if (seat && String(seat.seat_label || '') === PEOPLES_HARPY_SEAT_LABEL) {
    return '<div class="claim-badge amber">People&rsquo;s Harpy &middot; vacates on win</div>';
  }
  if (c.court_category === 'Primogen') {
    return '<div class="claim-badge neutral">Primogen &middot; keeps seat</div>';
  }
  return '';
}

function renderClaimCard(claim) {
  const id = String(claim.character_id).toLowerCase();
  const supporters = supportersOf(id);
  return `<div class="claim-card" data-claimant-id="${esc(id)}">
      <div class="claim-head">
        <div>
          <div class="claim-name">${esc(nameFor(id))}</div>
          ${renderBadge(id)}
        </div>
        <div class="claim-tally">${esc(tallyFor(id))}<span class="lbl">status</span></div>
      </div>
      ${supporters.length
        ? `<div class="claim-supporters">${supporters.map(sid => renderSupportChip(sid)).join('')}</div>`
        : '<div class="claim-empty-supporters">No supporters yet.</div>'}
      <div class="claim-actions">
        <button type="button" class="claim-withdraw" data-praxis-action="withdraw" data-claimant-id="${esc(id)}">Withdraw claim</button>
      </div>
    </div>`;
}

function renderSupportChip(supporterId) {
  return `<span class="support-chip">${esc(nameFor(supporterId))}<button type="button" class="withdraw-x" data-praxis-action="unassign" data-char-id="${esc(supporterId)}" title="Return ${esc(nameFor(supporterId))} to the pool" aria-label="Return ${esc(nameFor(supporterId))} to the pool">&times;</button></span>`;
}

/**
 * The bottom sheet. ONE tap target and ONE sheet for both actions: opening a
 * claim for the tapped attendee is the first row, above the claimant list. The
 * epic doc never said how a claim opens; this is the locked answer, and a second
 * gesture must not be invented alongside it.
 */
function renderSheet() {
  const id = _sheetFor;
  const name = nameFor(id);
  const rows = claims()
    .map(c => String(c.character_id).toLowerCase())
    .map(cid => `<button type="button" class="sheet-row" data-praxis-action="assign" data-claimant-id="${esc(cid)}">
        <span class="n">${esc(nameFor(cid))}</span><span class="t">${esc(tallyFor(cid))} status</span>
      </button>`)
    .join('');

  return `<div class="sheet-overlay open" data-praxis-action="sheet-backdrop">
      <div class="sheet">
        <div class="sheet-handle"></div>
        <div class="sheet-title">Assign support &middot; ${esc(TALLY_LABEL)}</div>
        <div class="sheet-sub">${esc(name)}</div>
        <button type="button" class="sheet-action" data-praxis-action="open-claim" data-char-id="${esc(id)}">Open a ${esc(TALLY_LABEL)} claim for ${esc(name)} instead</button>
        <div class="sheet-section-lbl">Support a claimant</div>
        <div class="sheet-list">${rows || '<p class="sheet-empty">No claims are open yet.</p>'}</div>
        <button type="button" class="sheet-close" data-praxis-action="close-sheet">Cancel</button>
      </div>
    </div>`;
}

// ── Event wiring ─────────────────────────────────────────────────────────────

/**
 * One delegated listener on the domain container, attached once. Every render
 * rebuilds the container's innerHTML from scratch, so per-element listeners
 * would have to be re-bound on each pass; delegation survives the rebuild and
 * keeps the markup free of inline `onclick` handlers.
 */
function _wire() {
  if (_wired || !_rootEl) return;
  _wired = true;
  _rootEl.addEventListener('click', (e) => {
    const el = e.target.closest('[data-praxis-action]');
    if (!el || !_rootEl.contains(el)) return;
    const action = el.dataset.praxisAction;

    // Only a click on the scrim itself dismisses the sheet, never a click that
    // bubbled up from a control inside it.
    if (action === 'sheet-backdrop') {
      if (e.target !== el) return;
      _sheetFor = null;
      render();
      return;
    }
    if (action === 'close-sheet') { _sheetFor = null; render(); return; }
    if (action === 'open-board') { openBoard(); return; }
    if (action === 'pool-chip') { _sheetFor = el.dataset.charId; render(); return; }
    if (action === 'open-claim') { openClaim(el.dataset.charId); return; }
    if (action === 'assign') {
      const supporterId = _sheetFor;
      if (supporterId) assignSupport(supporterId, el.dataset.claimantId);
      return;
    }
    if (action === 'unassign') { unassignSupport(el.dataset.charId); return; }
    if (action === 'withdraw') { withdrawClaim(el.dataset.claimantId); return; }
  });
}
