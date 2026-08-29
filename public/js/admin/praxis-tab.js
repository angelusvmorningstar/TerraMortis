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
 * ═══ DUAL TALLY (prax.3) ═══
 *
 * prax.3 delivered the parameterisation this file's constant-at-the-top design
 * was built for: the tally literal became `_activeTally` module state, switched
 * by the segmented control in the header, and every accessor and write action
 * below reads it rather than a fixed string. There is deliberately no second
 * board module - one component serves both tallies.
 *
 * The two tallies are NEVER coupled. A character may hold an open claim, or a
 * support assignment, in both at once - that is a supported state, not an
 * oversight (see prax.1's own POST /claims comment). The only cross-tally read
 * anywhere is cosmetic: the summary row's two leaders and the pool chips' two
 * dots, both computed against `_board.praxis` AND `_board.harpy` on every
 * render regardless of which tally is active.
 *
 * The two weightings are genuinely different, not a shared formula with a
 * parameter. Praxis is a City Status sum (claimant's own, plus every
 * supporter's). Harpy is a plain unweighted headcount of supporters assigned to
 * the claimant, with NO baseline for the claimant themselves: the epic's locked
 * ruling is that nothing auto-adds a Harpy claimant as their own first vote.
 * They can still be assigned to themselves through the ordinary support flow,
 * which then counts as one vote like anyone else's.
 */

import { apiGet, apiPost, apiPut, apiDelete, apiRaw } from '../data/api.js';
import { esc, displayName } from '../data/helpers.js';
import { calcCityStatus, setStatusTerritories } from '../data/accessors.js';
import { resolveHeldSeat } from '../data/office-seat-resolve.js';

/** The two tallies this one board carries, in the order the switch renders them. */
const TALLIES = ['praxis', 'harpy'];

/** How each tally is named in UI copy (the switch, the sheet). */
const TALLY_LABELS = { praxis: 'Praxis', harpy: 'People’s Harpy' };

/**
 * The unit a tally is counted in, for the small suffix on a claim card's
 * number: "19 STATUS" for the weighted Praxis sum, "3 VOTES" for the
 * unweighted Harpy headcount.
 */
const TALLY_UNIT_LABELS = { praxis: 'status', harpy: 'votes' };

/** The board title for each tally, per the locked mockup. */
const TALLY_TITLES = { praxis: 'Praxis Claim', harpy: 'People’s Harpy Vote' };

/** The short label each tally carries in the summary row. */
const TALLY_SUMMARY_LABELS = { praxis: 'Praxis leader', harpy: 'Harpy leader' };

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
// Which tally the board is currently being worked against. Reset to 'praxis' on
// every initPraxisView call: the tab deliberately does NOT remember the
// last-viewed tally across a full domain re-entry.
let _activeTally = 'praxis';

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

/**
 * One tally's open claims. The tally argument defaults to the active one, so
 * every existing call site reads the tally on screen; the summary row and the
 * pool chips' dots are the only callers that pass the other one explicitly.
 */
function claims(tally = _activeTally) {
  return (_board?.[tally]?.claims || []).filter(Boolean);
}

/** One tally's support map, keyed supporter id -> claimant id. */
function support(tally = _activeTally) {
  return _board?.[tally]?.support || {};
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
 * A claimant's live tally in one tally, derived every render and never stored.
 *
 * The two weightings are deliberately NOT a shared formula:
 *
 * - Praxis: the claimant's own City Status plus that of every character
 *   currently assigned to support them.
 * - Harpy: a plain, unweighted headcount of the supporters assigned to them.
 *   No `calcCityStatus()` call anywhere on this path (the epic's locked ruling
 *   is "1 supporter = 1 vote"), and no baseline for the claimant themselves -
 *   nothing auto-adds a Harpy claimant as their own first vote. A claimant who
 *   IS assigned to themselves through the ordinary support flow is counted by
 *   the same loop as anybody else, which is why that case needs no special
 *   casing here.
 */
function tallyFor(claimantId, tally = _activeTally) {
  const key = String(claimantId).toLowerCase();

  if (tally === 'harpy') {
    return Object.values(support('harpy'))
      .filter(assignedTo => String(assignedTo).toLowerCase() === key)
      .length;
  }

  let total = statusFor(key);
  for (const [supporterId, assignedTo] of Object.entries(support(tally))) {
    if (String(assignedTo).toLowerCase() === key) total += statusFor(supporterId);
  }
  return total;
}

/** Everyone currently supporting this claimant, in a stable name order. */
function supportersOf(claimantId, tally = _activeTally) {
  const key = String(claimantId).toLowerCase();
  return Object.entries(support(tally))
    .filter(([, assignedTo]) => String(assignedTo).toLowerCase() === key)
    .map(([supporterId]) => String(supporterId).toLowerCase())
    .sort((a, b) => nameFor(a).localeCompare(nameFor(b)));
}

/**
 * The leading claimant in one tally, or null when that tally has no claims.
 *
 * Cosmetic only: this decides nothing. prax.4a/prax.4b's own resolve routes are
 * the only place a result becomes real, so the tie-break below is for DISPLAY
 * determinism and carries no implication about how a real tie would resolve -
 * highest tally wins, and an exact tie falls to the alphabetically first name.
 */
function leaderFor(tally) {
  let best = null;
  for (const claim of claims(tally)) {
    const id = String(claim.character_id || '').toLowerCase();
    if (!id) continue;
    const value = tallyFor(id, tally);
    const beatsOnTally = !best || value > best.value;
    const beatsOnName = best && value === best.value
      && nameFor(id).localeCompare(nameFor(best.id)) < 0;
    if (beatsOnTally || beatsOnName) best = { id, value };
  }
  return best;
}

/**
 * Does this attendee have ANY assignment in the given tally - standing as a
 * claimant, or assigned as somebody's supporter? Drives the pool chips' dual
 * dots, which are read across BOTH tallies whichever one is active.
 */
function hasAssignmentIn(tally, characterId) {
  const key = String(characterId || '').toLowerCase();
  if (claims(tally).some(c => String(c.character_id || '').toLowerCase() === key)) return true;
  return Object.keys(support(tally)).some(k => String(k).toLowerCase() === key);
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
  // A fresh domain entry always lands on Praxis, never on the tally that
  // happened to be open last time.
  _activeTally = 'praxis';
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
    { tally: _activeTally, character_id: characterId },
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
    { tally: _activeTally, supporter_character_id: supporterId, claimant_character_id: claimantId },
  ));
}

function unassignSupport(supporterId) {
  if (!_board) return;
  return write(async () => {
    await apiPut(
      `/api/praxis_sessions/${encodeURIComponent(String(_board._id))}/support`,
      { tally: _activeTally, supporter_character_id: supporterId, claimant_character_id: null },
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
      + `/claims/${encodeURIComponent(claimantId)}?tally=${encodeURIComponent(_activeTally)}`,
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

/**
 * The header. Once a board exists the segmented control takes the slot the
 * standalone "Live" pill used to hold; the live dot itself moves into the
 * active tally's own summary-row label, where it says which of the two
 * contests the board below is currently working. That is the locked mockup's
 * arrangement, and it keeps the header to one control rather than two.
 */
function renderHead() {
  const status = _status ? `<div class="pb-status">${esc(_status)}</div>` : '';
  return `<div class="pb-head">
      <div><span class="pb-title">${esc(TALLY_TITLES[_activeTally])}</span><span class="pb-chapter">${esc(chapterCaption())}</span></div>
      ${_board ? renderTallySwitch() : ''}
    </div>${status}`;
}

/**
 * The Praxis / People's Harpy segmented control. Rendered only once a board
 * exists: `praxis_sessions` is ONE document holding both tallies, so before it
 * is opened there is genuinely nothing to switch between.
 */
function renderTallySwitch() {
  const buttons = TALLIES.map((t) => {
    const active = t === _activeTally;
    return `<button type="button" class="tally-switch-btn${active ? ' active' : ''}"`
      + ` data-praxis-action="switch-tally" data-tally="${esc(t)}"`
      + ` aria-pressed="${active ? 'true' : 'false'}">${esc(TALLY_LABELS[t])}</button>`;
  }).join('');
  return `<div class="tally-switch" role="group" aria-label="Which tally to work">${buttons}</div>`;
}

/**
 * Both contests' current leaders, side by side, regardless of which tally is
 * active below. Each half is computed against its OWN tally's claim list, so
 * the two halves are genuinely independent readings rather than two views of
 * the claimant list on screen.
 */
function renderSummary() {
  return `<div class="tally-summary">${TALLIES.map(renderSummaryItem).join('')}</div>`;
}

function renderSummaryItem(tally) {
  const live = tally === _activeTally
    ? '<span class="pb-live"><span class="dot"></span></span> '
    : '';
  const leader = leaderFor(tally);
  const body = leader
    ? `<span class="tally-summary-leader">${esc(nameFor(leader.id))}<span class="n">${esc(leader.value)}</span></span>`
    : '<span class="tally-summary-empty">No claims yet</span>';
  return `<div class="tally-summary-item" data-tally="${esc(tally)}">
      <span class="tally-summary-label">${live}${esc(TALLY_SUMMARY_LABELS[tally])}</span>
      ${body}
    </div>`;
}

/**
 * The empty state. Its one action opens the whole board - both tallies at once,
 * since they share a single document - so the button is deliberately
 * tally-agnostic rather than naming Praxis (prax.3's own copy correction to the
 * "Open Praxis Claim" prax.2 shipped).
 */
function renderEmpty() {
  return `<div class="pb-empty">
      <p>No ${esc(TALLY_LABELS[_activeTally])} board is open for this chapter yet.</p>
      <button type="button" class="btn-open" data-praxis-action="open-board">Open Board</button>
    </div>`;
}

function renderPopulated() {
  const pool = unassignedPool(_attendees, support(), claims());
  const noSession = !_session
    ? '<p class="pb-note">No game session is linked to this chapter yet, so there is no attendee list to claim from.</p>'
    : '';

  return `${renderSummary()}${noSession}
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
  return `<button type="button" class="char-chip" data-praxis-action="pool-chip" data-char-id="${esc(id)}">${esc(nameFor(id))}${renderChipDots(id)}</button>`;
}

/**
 * The two dots on a pool chip: crimson when this attendee has an assignment in
 * Praxis, gold when they have one in Harpy, dim otherwise. Read across BOTH
 * tallies every render, whichever one is active - the pool strip itself stays
 * scoped to the active tally, so without these an ST working Harpy has no way
 * to see that a chip is already spoken for on the Praxis side.
 */
function renderChipDots(id) {
  const praxis = hasAssignmentIn('praxis', id) ? ' on-praxis' : '';
  const harpy = hasAssignmentIn('harpy', id) ? ' on-harpy' : '';
  return `<span class="chip-dots" aria-hidden="true"><span class="chip-dot${praxis}"></span><span class="chip-dot${harpy}"></span></span>`;
}

/**
 * The claimant's secondary badge, checked live against office data rather than
 * read off the board document. `resolveHeldSeat` is the shared, confirmed-only
 * holder resolution (oxp.7) - no second office lookup is hand-rolled here.
 *
 * PRAXIS ONLY, by its call site below. Both badges describe what happens if the
 * character wins PRAXIS: "keeps seat" and "vacates on win" are meaningless on
 * the Harpy tally, and showing them on a Harpy card would read as a claim about
 * that contest instead.
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
          ${_activeTally === 'praxis' ? renderBadge(id) : ''}
        </div>
        <div class="claim-tally">${esc(tallyFor(id))}<span class="lbl">${esc(TALLY_UNIT_LABELS[_activeTally])}</span></div>
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
        <span class="n">${esc(nameFor(cid))}</span><span class="t">${esc(tallyFor(cid))} ${esc(TALLY_UNIT_LABELS[_activeTally])}</span>
      </button>`)
    .join('');

  return `<div class="sheet-overlay open" data-praxis-action="sheet-backdrop">
      <div class="sheet">
        <div class="sheet-handle"></div>
        <div class="sheet-title">Assign support &middot; ${esc(TALLY_LABELS[_activeTally])}</div>
        <div class="sheet-sub">${esc(name)}</div>
        <button type="button" class="sheet-action" data-praxis-action="open-claim" data-char-id="${esc(id)}">Open a ${esc(TALLY_LABELS[_activeTally])} claim for ${esc(name)} instead</button>
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
    // Switching tally re-renders in place from the already-loaded document,
    // which carries BOTH tallies - there is nothing new to fetch. Tapping the
    // already-active segment is a no-op: unlike the Cycle tab's phase buttons
    // there is no "neutral" state to toggle back to.
    if (action === 'switch-tally') {
      const next = el.dataset.tally;
      if (!TALLIES.includes(next) || next === _activeTally) return;
      _activeTally = next;
      _sheetFor = null;
      _status = '';
      render();
      return;
    }
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
