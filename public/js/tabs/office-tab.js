import { OFFICE_DATA, MERIT_DOT_CAPS } from './office-data.js';
import { esc, displayName, shDotsWithBonus } from '../data/helpers.js';
import { apiGet, apiPost, apiPut } from '../data/api.js';
import { calcCityStatus } from '../data/accessors.js';
import { charPicker, setCharPickerSources } from '../components/character-picker.js';
import { getCycles } from '../downtime/db.js';
import { currentCycleInGamePhase } from '../downtime/cycle-phase.js';
import { getRole } from '../auth/discord.js';
import { officeSeatXp } from '../data/office-xp.js';
import { resolveHeldSeat } from '../data/office-seat-resolve.js';
import { toast } from '../suite/toast.js';

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
 * oxp.6: hollow dots with a per-dot `title` reason (why not bought yet).
 *
 * Deliberately NOT built via `shDotsWithBonus`'s `opts.hollowMod`: that
 * mechanism is the ST-mod-overlay's own convention (`stm-modded-dot` class,
 * gold-tinted styling in `components.css`), and reusing it here would visually
 * present an unaffordable dot as an ST override, which it is not — a real
 * correction against this story's own original plan to reuse it. Same
 * `.pointed`/`.pointed.hollow` markup `shDots`/`shDotsWithBonus` emit, just
 * with a bare `title` attribute instead of that unrelated class.
 */
function _dotsWithReasons(n, count, reasons) {
  let out = '';
  for (let i = 0; i < count; i++) {
    if (i < n) { out += '<span class="pointed"></span>'; continue; }
    const reason = reasons ? reasons[i] : null;
    out += reason
      ? `<span class="pointed hollow" title="${esc(reason)}"></span>`
      : '<span class="pointed hollow"></span>';
  }
  return out;
}

/**
 * oxp.6 AC6: per-manoeuvre-dot reason an unpurchased dot isn't bought yet.
 * Pure, DOM-free, exported for direct testing — mirrors `city-views.js`'s
 * `computeCourtChanges` in being a plain data decision kept out of the
 * DOM-writing function that consumes it.
 *
 * Rank order is checked FIRST: a manoeuvre beyond the next purchasable one
 * cannot be bought regardless of balance, so only the SINGLE next dot (index
 * === the office's current rank) can ever carry an affordability reason —
 * every dot beyond it is order-blocked no matter how much is left.
 *
 * @param {number} rank - the office's current purchased rank
 * @param {number} count - total manoeuvres in the ladder
 * @param {number} left - the seat's remaining office XP (`officeSeatXp().left`)
 * @returns {Array<string|null>} one entry per manoeuvre index (0-based)
 */
export function manoeuvreDotReasons(rank, count, left) {
  const r = Math.max(0, Math.min(count, Math.trunc(rank) || 0));
  const known = Number.isFinite(left);
  const reasons = [];
  for (let i = 0; i < count; i++) {
    if (i < r) { reasons.push(null); continue; }
    if (i === r) {
      reasons.push(known && left < 1 ? `Not enough office XP (${1 - left} short)` : null);
      continue;
    }
    reasons.push(`Reach rank ${i} first`);
  }
  return reasons;
}

/**
 * oxp.6 AC6: per-merit-dot reason an unpurchased dot isn't bought yet. No
 * rank-order gate exists for merit dots (independently settable, unlike the
 * manoeuvre ladder), so every unpurchased dot beyond `left` gets a reason; one
 * within reach gets none — a plain hollow dot the ST could buy right now.
 *
 * @param {number} current - dots already bought on this merit
 * @param {number} cap - this merit's dot cap (`MERIT_DOT_CAPS[merit]`)
 * @param {number} left - the seat's remaining office XP
 * @returns {Array<string|null>} one entry per dot index (0-based), length `cap`
 */
export function meritDotReasons(current, cap, left) {
  const n = Math.max(0, Math.min(cap, Math.trunc(current) || 0));
  const known = Number.isFinite(left);
  const reasons = [];
  for (let i = 0; i < cap; i++) {
    if (i < n) { reasons.push(null); continue; }
    const cost = (i - n) + 1; // XP needed to reach THIS dot from the current count
    reasons.push(known && cost > left ? `Not enough office XP (${cost - left} short)` : null);
  }
  return reasons;
}

/** oxp.6 AC7: the shared seat balance line, holder-or-ST-only by construction
 *  — every call site of this function already sits behind that gate (see
 *  _wireManoeuvreRank's early return and _wireMeritDots's showReasons check),
 *  so this function itself does not re-check who is viewing. `left` is
 *  allowed to go negative (office-xp.js's own documented behaviour) and still
 *  is after oxp.9: that story's budget check lives on the APPROVAL path only
 *  (office-purchase.js's ST-accept route), while the ST's own direct-set
 *  stepper routes deliberately stay unchecked, so a seat can legitimately be
 *  over budget. Rendered as "over budget" rather than a confusing negative
 *  number. */
function _balanceLineHtml(balance) {
  if (!balance) return '';
  const { earned, spent, left } = balance;
  const tail = left < 0 ? `${-left} over budget` : `${left} remaining`;
  return `<p class="derived-note">${esc(String(spent))} of ${esc(String(earned))} office XP spent, ${esc(tail)}.</p>`;
}

/**
 * oxp.3: builds the graduated rank readout, plus the ST/dev-only +/- stepper.
 *
 * One control set per office, not per manoeuvre — this is a single graduated
 * value, not five independent purchases. Mirrors the Merit Suite's own dot
 * display and reuses its stepper classes verbatim.
 *
 * The rank is clamped here as well as at the only current call site. This is an
 * exported function, and `shDotsWithBonus` throws a RangeError on a negative
 * count (the same underlying `'●'.repeat(n)` guard this comment originally
 * described), so the safety cannot rest on every future caller remembering to
 * clamp first (Codex review, 2026-08-13).
 *
 * oxp.6: `reasons` is optional (from `manoeuvreDotReasons`) — when supplied,
 * unpurchased dots carry a per-dot `title`; when omitted (the synchronous
 * optimistic first render, before any balance is known), dots render via
 * `shDotsWithBonus` exactly as the rest of the app's dot displays do.
 */
export function manoeuvreRankHtml(rank, count, isST, reasons) {
  const n = Math.max(0, Math.min(count, Math.trunc(rank) || 0));
  const display = reasons ? _dotsWithReasons(n, count, reasons) : shDotsWithBonus(n, Math.max(0, count - n));
  let html = `<span class="office-manoeuvre-rank-label">Purchased</span>`;
  html += `<span class="office-manoeuvre-rank-dots">${display}</span>`;
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
  _wirePurchaseState(el, char, category, data, isOwnOffice);

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

// oxp.11: what an office's purchase state is keyed by, and the three states the
// tab can end up in when it tries to work that out.
//
// Both purchase collections are keyed by SEAT now, not by office category, so
// the tab has to resolve WHICH seat it is showing before it can read or write
// anything. `office_seats.holder_id` is the only signal available for that, and
// nothing in this codebase maintains it yet (oxp.1's one-off seed script is its
// only writer; oxp.5, which would update it on a handover, is unbuilt). So the
// holder match can go stale, and a deterministic fallback plus an honest
// on-screen label is what makes that survivable rather than dangerous.
const SEATLESS_MSG    = 'This office has no seat on record, so there is no purchase state to show.';
const SEATS_FAILED_MSG = 'Could not load office seats.';

/**
 * The single async entry point for an office's purchase state.
 *
 * `GET /api/office_seats` is fetched ONCE here, per render pass, and the seat
 * it resolves is handed to both wiring functions. Neither of them fetches seats
 * for itself: two independent fetches could resolve two different seats for the
 * same view if a write landed between them.
 *
 * The render-generation counter is captured here, before this function's first
 * await, and passed down. That is deliberate: the seat fetch is now the first
 * await in the whole chain, so the guard has to start here or a late seat fetch
 * could paint the previous category's state into the one now on screen.
 */
async function _wirePurchaseState(el, char, category, data, isOwnOffice) {
  if (typeof el.querySelector !== 'function') return; // plain-object test mocks have no real DOM

  const gen = el._officeManoeuvreGen;

  let seats = null;
  try { seats = await apiGet('/api/office_seats'); } catch { seats = null; }
  if (gen !== el._officeManoeuvreGen) return;

  let outcome;
  if (!Array.isArray(seats)) {
    outcome = { status: 'unavailable', seatId: null, seat: null, allSeats: [], note: null };
  } else {
    const forCategory = seats.filter(s => s && s.office_category === category);
    if (forCategory.length === 0) {
      outcome = { status: 'no-seat', seatId: null, seat: null, allSeats: seats, note: null };
    } else {
      // AC5: the viewer's OWN office resolves by holder. A seat's holder_id and
      // a character's _id are both stringified at the JSON boundary, so this is
      // a plain string comparison.
      //
      // oxp.7: this is now the SAME shared `resolveHeldSeat` the new sheet
      // section calls, not a second copy. Passed the FULL `seats` array (not
      // `forCategory`) — `resolveHeldSeat` does its own category filtering by
      // `char.court_category`, which equals `category` exactly when
      // `isOwnOffice` is true, so this is equivalent to the previous inline
      // filter, not a behaviour change. Still gated on `isOwnOffice`: a
      // reference viewer (browsing an office that is not their own) must never
      // resolve to THEIR OWN seat just because `resolveHeldSeat` found one.
      const held = isOwnOffice ? resolveHeldSeat(char, seats) : null;
      const seat = held || _fallbackSeat(forCategory);
      // Codex review, oxp.11: a single-seat category has exactly one candidate,
      // so the fallback is provably that seat regardless of whether holder_id
      // matched — nothing was ever ambiguous there. A multi-seat category with
      // no holder match is genuinely uncertain: office_seats.holder_id is not
      // kept current by anything yet (oxp.5's job), so an own-office view can
      // silently fall back to a DIFFERENT holder's seat. `confirmed` is what
      // tells the manoeuvre list whether it is safe to present as the viewer's
      // own progress — see _wireManoeuvreRank.
      const confirmed = held != null || forCategory.length === 1;
      outcome = {
        status: 'ok',
        seatId: String(seat._id),
        seat,          // oxp.6: officeSeatXp needs the whole document (created_at, office_category)
        allSeats: seats, // oxp.6: officeSeatXp needs every seat to establish spendKnown per category
        confirmed,
        // AC6: only disclose when there is genuinely something to disclose. For
        // a single-seat office the fallback cannot be wrong, so a label would
        // be noise; for a multi-seat one it is the difference between an ST
        // knowing which Primogen they are editing and not.
        note: forCategory.length > 1 ? _seatNote(seat, isOwnOffice && !confirmed) : null,
      };
    }
  }

  await _refreshPurchaseState(el, outcome, data, isOwnOffice, gen);
}

/**
 * oxp.6: fetches `office_merit_dots` and `office_manoeuvre_rank` TOGETHER for
 * the resolved seat, derives the seat's balance via `officeSeatXp`, and
 * renders both purchase sections from that one fetch.
 *
 * Also the re-render target after a stepper click succeeds (`_adjustMeritDots`
 * / `_adjustManoeuvreRank`), not just each function's own section — a merit
 * purchase changes the SAME balance the manoeuvre section's affordability
 * markers read, and vice versa (AC7: the holder decides the split, there is
 * no separate per-section budget), so both must refresh together or one
 * section's affordability markers go stale the moment the other is spent
 * from.
 */
async function _refreshPurchaseState(el, outcome, data, isOwnOffice, gen) {
  let dotsBySeat = null, ranksBySeat = null, meritFailed = false, rankFailed = false;
  // oxp.9: is this viewer entitled to the holder's REQUEST affordance at all?
  // Exactly the gate `showReasons`/`showBalance` already use for a holder —
  // an unconfirmed multi-seat fallback view must never offer a button that
  // would act on someone else's seat. Also what keeps a reference viewer's
  // DOM (and network traffic) carrying no purchase state at all: the pending-
  // request fetch below is not even attempted for them.
  const canRequest = isOwnOffice && outcome.confirmed === true;
  let pendingRequests = [], pendingFailed = false;
  if (outcome.status === 'ok') {
    // Codex review: a plain Promise.all coupled the two sections' failure
    // states through one shared flag — a transient failure on EITHER endpoint
    // blanked BOTH sections, where before this story they fetched and failed
    // independently. allSettled restores that independence: each collection's
    // own success/failure feeds only its own renderer below. oxp.9 joins as a
    // third entry with its own independent flag, for the same reason: a failed
    // pending-request read must degrade the REQUEST BUTTON to disabled-with-
    // unknown, never blank the merit or manoeuvre sections.
    const [dotsResult, ranksResult, pendingResult] = await Promise.allSettled([
      apiGet('/api/office_merit_dots'),
      apiGet('/api/office_manoeuvre_rank'),
      canRequest
        ? apiGet(`/api/office_purchase_requests?seat_id=${encodeURIComponent(outcome.seatId)}`)
        : Promise.resolve([]),
    ]);
    if (dotsResult.status === 'fulfilled') dotsBySeat = dotsResult.value; else meritFailed = true;
    if (ranksResult.status === 'fulfilled') ranksBySeat = ranksResult.value; else rankFailed = true;
    if (pendingResult.status === 'fulfilled') {
      pendingRequests = Array.isArray(pendingResult.value) ? pendingResult.value : [];
    } else {
      pendingFailed = true;
    }
  }
  if (gen !== el._officeManoeuvreGen) return;

  // Computed whenever the seat resolved, regardless of viewer — officeSeatXp
  // is a pure computation, not a fetch, so there is no cost to deriving it
  // here. AC7's owner-or-ST-only gate is enforced where it is RENDERED:
  // `_wireManoeuvreRank`'s own existing early return for a non-owner non-ST
  // viewer, and `_wireMeritDots`'s own `showReasons` check — both of which
  // already call `_isST()` themselves, so it is deliberately NOT called again
  // here as well. The balance itself still needs BOTH collections — a merit-
  // dots failure with a successful rank fetch leaves the manoeuvre readout
  // showing real purchase state but no balance line, rather than fabricating
  // a partial number.
  let balance = null;
  if (outcome.status === 'ok' && !meritFailed && !rankFailed) {
    const meritDotsDoc = dotsBySeat[outcome.seatId];
    const rankDoc = ranksBySeat[outcome.seatId];
    balance = officeSeatXp(outcome.seat, outcome.allSeats, meritDotsDoc, rankDoc, new Date());
  }

  // oxp.9: one in-flight request per SEAT (the server's own dedupe rule), so
  // a single boolean is the whole of the pending state both sections need.
  const requestState = {
    canRequest,
    hasPending: pendingRequests.length > 0,
    unknown: pendingFailed,
  };

  _wireMeritDots(el, outcome, data, dotsBySeat, meritFailed, balance, isOwnOffice, gen, requestState);
  _wireManoeuvreRank(el, outcome, data, ranksBySeat, rankFailed, balance, isOwnOffice, gen, requestState);
}

/** AC6: the deterministic fallback when no seat matches by holder — a
 *  reference view, or a stale holder_id after an untracked handover. Ascending
 *  created_at, then ascending _id as the tie-break, so the same viewer always
 *  lands on the same seat and two viewers agree. */
function _fallbackSeat(seats) {
  return [...seats].sort((a, b) => {
    const ca = String(a.created_at ?? '');
    const cb = String(b.created_at ?? '');
    if (ca !== cb) return ca < cb ? -1 : 1;
    const ia = String(a._id ?? '');
    const ib = String(b._id ?? '');
    return ia < ib ? -1 : ia > ib ? 1 : 0;
  })[0];
}

/** AC6: names the seat whose purchase state is on screen. A label if the seat
 *  has one (Socialite's two do: 'Harpy' and "People's Harpy"), otherwise a
 *  short form of its id, because Primogen's two seats have neither a label nor
 *  any other distinguishing field.
 *
 *  Codex review, oxp.11: `unconfirmedOwn` is true only for an own-office view
 *  that could not match the viewer's own character by holder_id, in a
 *  multi-seat category — the case where the resolved seat may genuinely NOT be
 *  the viewer's. The wording says so plainly, because the manoeuvre list is no
 *  longer muted as "yours" in that case (see _wireManoeuvreRank) but the merit
 *  suite and any edit control still act on the seat named here, own or not. */
function _seatNote(seat, unconfirmedOwn) {
  const label = seat.seat_label ? String(seat.seat_label) : `seat ${String(seat._id).slice(-6)}`;
  if (unconfirmedOwn) {
    return `Could not confirm which of this office's seats is yours. Showing: ${label}. `
      + 'Any edit here affects that seat, which may not be your own.';
  }
  return `This office has more than one seat. Showing: ${label}.`;
}

/** AC6: a short, non-interactive line. Choosing a different seat is oxp.6's
 *  job; this only says which one you are looking at. Reuses the tab's existing
 *  informational-line class rather than inventing styling. */
function _seatNoteHtml(note) {
  return note ? `<div class="office-reference-banner">${esc(note)}</div>` : '';
}

/** Renders this seat's merit suite from data already fetched by
 *  `_refreshPurchaseState`. The merit NAMES are reference info (which merits
 *  this office grants) and render for every viewer, own office or not — same
 *  posture as the Manoeuvres list's effect text. The actual DOT RATINGS are
 *  holder-or-ST-only (`showDots`), matching `_wireManoeuvreRank`'s own
 *  `isOwnOffice || isST` gate: a reference viewer learns what an office CAN
 *  hold, never what a specific seat's holder has actually purchased. Fixed
 *  2026-08-15 (Angelus, live pre-game check) — the previous version showed
 *  real dot values to any reference viewer; Brandy (Socialite) browsing
 *  Eve's Head of State office as reference could see her Merit Suite ratings.
 *  STs (and dev, treated as ST everywhere per this codebase's own
 *  equivalence) additionally get +/- stepper controls.
 *
 *  oxp.11: takes the resolved seat OUTCOME rather than an office category.
 *  The seat-disclosure note is gated with the dots now too — it only exists
 *  to say WHICH seat's rating a viewer is looking at, so it has nothing to
 *  disclose once the rating itself is hidden.
 *
 *  oxp.6: `dotsBySeat`/`fetchFailed`/`balance` come from `_refreshPurchaseState`
 *  rather than this function fetching its own — merit and manoeuvre purchases
 *  share one balance, so one shared fetch feeds both render calls. Per-dot
 *  affordability REASONS (the `title` attribute) stay holder-or-ST-only
 *  (`showReasons`), same as before — moot for anyone who can't see the dots
 *  at all now, but still needed to keep an ST's own reasons scoped to a
 *  confirmed own-office view. */
function _wireMeritDots(el, outcome, data, dotsBySeat, fetchFailed, balance, isOwnOffice, gen, requestState) {
  if (typeof el.querySelector !== 'function') return; // plain-object test mocks have no real DOM
  const mount = el.querySelector('[data-office-merit-mount]');
  if (!mount) return;
  if (gen !== el._officeManoeuvreGen) return;

  const meritNames = data.merits;

  // No seat means no purchase state can be read or written. Saying so is more
  // honest than rendering a plausible row of zeros, which an ST would then be
  // able to step into a document keyed by nothing.
  if (outcome.status !== 'ok') {
    const msg = outcome.status === 'no-seat' ? SEATLESS_MSG : SEATS_FAILED_MSG;
    mount.innerHTML = `<p class="dtl-empty">${esc(msg)}</p>`;
    return;
  }
  if (fetchFailed || !dotsBySeat) {
    mount.innerHTML = '<p class="dtl-empty">Could not load merit dots.</p>';
    return;
  }

  const dots = dotsBySeat[outcome.seatId] || {};
  const isST = _isST();
  // Fixed 2026-08-15: dot RATINGS are owner-or-ST-only, same gate
  // `_wireManoeuvreRank` uses at its own top-level early return. A reference
  // viewer (not this office's own occupant, not an ST) sees the merit names
  // below but never this.
  const showDots = isOwnOffice || isST;
  // Codex review, oxp.6: requires outcome.confirmed, mirroring the pre-existing
  // manoeuvre-LIST muting guard a few functions over (_wireManoeuvreRank's own
  // `isOwnOffice && outcome.confirmed`). Without it, a player whose own-office
  // view fell back to a DIFFERENT seat (a multi-seat category with no confirmed
  // match — see oxp.11) saw that OTHER seat's real balance and affordability
  // reasons presented as their own. An ST still sees reasons regardless of
  // confirmation, same as every other purchase-state control in this file.
  const showReasons = (isOwnOffice && outcome.confirmed) || isST;

  const rowsHtml = meritNames.map((merit) => {
    const n = dots[merit] || 0;
    const cap = MERIT_DOT_CAPS[merit] || 5;
    let row = `<div class="office-merit-row">`;
    row += `<span class="office-merit-chip">${esc(merit)}</span>`;
    const reasons = showReasons && balance ? meritDotReasons(n, cap, balance.left) : null;
    if (showDots) {
      row += `<span class="office-merit-dots">${_dotsWithReasons(n, cap, reasons)}</span>`;
    }
    // oxp.9: the request control for a confirmed own-office view, hidden once
    // the merit is at its cap (there is nothing left to buy). `reasons[n]` is
    // the reason for the NEXT dot, which is precisely the one being requested.
    if (n < cap) {
      row += _requestControlHtml(
        'Request dot',
        `data-office-request-merit="${esc(merit)}"`,
        requestState,
        balance ? balance.left : null,
        reasons ? reasons[n] : null,
      );
    }
    if (isST) {
      row += `<div class="cs-edit-stepper office-merit-stepper">`;
      row += `<button class="cs-step-btn" data-merit-up="${esc(merit)}"${n >= cap ? ' disabled' : ''}>▲</button>`;
      row += `<button class="cs-step-btn" data-merit-down="${esc(merit)}"${n <= 0 ? ' disabled' : ''}>▼</button>`;
      row += `</div>`;
    }
    row += `</div>`;
    return row;
  }).join('');

  mount.innerHTML = (showDots ? _seatNoteHtml(outcome.note) : '') + rowsHtml;

  if (isST) {
    mount.querySelectorAll('[data-merit-up]').forEach((btn) => {
      btn.addEventListener('click', () => _adjustMeritDots(el, outcome, data, isOwnOffice, btn.dataset.meritUp, 1));
    });
    mount.querySelectorAll('[data-merit-down]').forEach((btn) => {
      btn.addEventListener('click', () => _adjustMeritDots(el, outcome, data, isOwnOffice, btn.dataset.meritDown, -1));
    });
  }

  // oxp.9: wired the same per-render way the steppers above already are (this
  // module has no delegated router; a new one would be a bigger change than
  // the story asks for). Disabled controls never fire, so the pending/
  // unaffordable states need no second guard here.
  mount.querySelectorAll('[data-office-request-merit]').forEach((btn) => {
    btn.addEventListener('click', () => _submitPurchaseRequest(el, outcome, data, isOwnOffice, {
      purchase_kind: 'merit',
      merit: btn.dataset.officeRequestMerit,
    }));
  });
}

async function _adjustMeritDots(el, outcome, data, isOwnOffice, merit, delta) {
  const gen = el._officeManoeuvreGen;
  // Re-fetch fresh rather than trusting DOM state — another ST could have
  // changed this since the row was last rendered.
  let dotsBySeat;
  try { dotsBySeat = await apiGet('/api/office_merit_dots'); } catch { return; }
  const current = (dotsBySeat[outcome.seatId] || {})[merit] || 0;
  const cap = MERIT_DOT_CAPS[merit] || 5;
  const next = Math.max(0, Math.min(cap, current + delta));
  if (next === current) return;

  try {
    await apiPut(`/api/office_merit_dots/${encodeURIComponent(outcome.seatId)}`, { merit, dots: next });
  } catch {
    return; // silent no-op on failure — the displayed value simply stays put
  }
  // The viewer may have switched category while the write was in flight;
  // re-rendering now would paint this seat's dots into another office's markup.
  if (gen !== el._officeManoeuvreGen) return;
  // oxp.6: refreshes BOTH sections, not just this one — a merit purchase
  // changes the shared balance the manoeuvre section's affordability markers
  // read too.
  await _refreshPurchaseState(el, outcome, data, isOwnOffice, gen);
}

/** oxp.3: renders this seat's manoeuvre rank readout, mutes the manoeuvres
 *  above it (own-office view only), and the ST/dev-only stepper — from data
 *  already fetched by `_refreshPurchaseState`, like `_wireMeritDots`. Like it,
 *  deliberately NOT gated on isOwnOffice for the ST — an ST needs to set an
 *  office's purchase state while browsing it as reference, before anyone even
 *  holds it.
 *
 *  oxp.11: takes the resolved seat OUTCOME rather than an office category, and
 *  the render generation captured by _wirePurchaseState before ITS first await
 *  rather than capturing its own (the seat fetch now precedes this one).
 *
 *  oxp.6: `ranksBySeat`/`fetchFailed`/`balance` come from `_refreshPurchaseState`
 *  (see `_wireMeritDots`'s own note — one shared fetch feeds both). The AC7
 *  balance line renders here, near the Manoeuvres section header, because this
 *  function's early return below (line "if (!isOwnOffice && !isST) return")
 *  already IS the owner-or-ST-only gate the balance line needs — no second
 *  gate is introduced. */
function _wireManoeuvreRank(el, outcome, data, ranksBySeat, fetchFailed, balance, isOwnOffice, gen, requestState) {
  if (typeof el.querySelector !== 'function') return; // plain-object test mocks have no real DOM
  if (gen !== el._officeManoeuvreGen) return;

  const manoeuvres = data.manoeuvres;
  const mount  = el.querySelector('[data-office-manoeuvre-rank-mount]');
  const listEl = el.querySelector('.office-manoeuvre-list');
  if (!mount && !listEl) return;

  const isST = _isST();
  // A non-ST browsing someone else's office is entitled to nothing but the
  // plain summary (oxp.3 AC2), so there is no reason to show purchase state at
  // all. This early return sits above EVERY write below, including oxp.11's
  // seat messages and disclosure note and oxp.6's balance line, so that
  // boundary survives unchanged: a reference viewer's DOM still carries no
  // purchase state of any kind.
  if (!isOwnOffice && !isST) return;

  // oxp.11: no seat, or seats unavailable. Same shape as the rank-fetch
  // failure below — do not leave the optimistic first render up, and attempt
  // no write.
  if (outcome.status !== 'ok') {
    const msg = outcome.status === 'no-seat' ? SEATLESS_MSG : SEATS_FAILED_MSG;
    if (isOwnOffice && listEl) listEl.innerHTML = `<p class="dtl-empty">${esc(msg)}</p>`;
    if (mount) mount.innerHTML = `<span class="dtl-empty">${esc(msg)}</span>`;
    return;
  }
  if (fetchFailed || !ranksBySeat) {
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

  const count = manoeuvres.length;
  const rankDoc = ranksBySeat[outcome.seatId];
  const rank = Math.max(0, Math.min(count, (rankDoc && rankDoc.rank) || 0));

  // Muting is own-office only — the reference view's markup never gains the
  // class, whatever the stored rank.
  //
  // Codex review, oxp.11: also requires outcome.confirmed. Muting presents the
  // list as the viewer's OWN purchased progress. When the own-office holder
  // match failed and the resolved seat is only a deterministic fallback (a
  // multi-seat category with no confirmed holder), that presentation would be
  // a real lie, not just an unhelpful one — it could be a different holder's
  // seat entirely. Leaving the list at its unmuted first-render markup (see
  // renderOfficeTab, which passes a null rank there) is the same safe state a
  // reference viewer already sees, and _seatNote's unconfirmedOwn wording
  // (rendered into the mount below regardless) is what discloses the gap.
  if (isOwnOffice && outcome.confirmed && listEl) {
    listEl.innerHTML = manoeuvreListHtml(manoeuvres, rank, true);
  }

  if (!mount) return;
  // Codex review, oxp.6: the balance line and per-dot reasons are a NEW
  // disclosure this story adds (the dots-only readout above already showed
  // an unconfirmed rank pre-story, unaffected here), so they get the SAME
  // outcome.confirmed gate the pre-existing list-muting guard above already
  // uses — not just isOwnOffice. Without it, an unconfirmed own-office view
  // (a multi-seat category with no holder match) showed the FALLBACK seat's
  // real balance and affordability reasons as if they were the viewer's own.
  const showBalance = (isOwnOffice && outcome.confirmed) || isST;
  const reasons = showBalance && balance ? manoeuvreDotReasons(rank, count, balance.left) : null;
  // oxp.9: ONE request control for the whole ladder, not one per manoeuvre —
  // manoeuvres are bought one dot at a time in fixed rank order, so the only
  // purchasable one is ever the next. Hidden at full rank.
  const requestHtml = rank < count
    ? _requestControlHtml(
      `Request rank ${rank + 1}`,
      'data-office-request-manoeuvre',
      requestState,
      balance ? balance.left : null,
      reasons ? reasons[rank] : null,
    )
    : '';
  mount.innerHTML = _seatNoteHtml(outcome.note) + (showBalance ? _balanceLineHtml(balance) : '') + manoeuvreRankHtml(rank, count, isST, reasons) + requestHtml;

  if (isST) {
    mount.querySelectorAll('[data-manoeuvre-rank-up]').forEach((btn) => {
      btn.addEventListener('click', () => _adjustManoeuvreRank(el, outcome, data, isOwnOffice, 1));
    });
    mount.querySelectorAll('[data-manoeuvre-rank-down]').forEach((btn) => {
      btn.addEventListener('click', () => _adjustManoeuvreRank(el, outcome, data, isOwnOffice, -1));
    });
  }

  mount.querySelectorAll('[data-office-request-manoeuvre]').forEach((btn) => {
    btn.addEventListener('click', () => _submitPurchaseRequest(el, outcome, data, isOwnOffice, {
      purchase_kind: 'manoeuvre',
    }));
  });
}

async function _adjustManoeuvreRank(el, outcome, data, isOwnOffice, delta) {
  // Send the STEP, never a computed absolute value. Reading the rank here and
  // PUTting `current + delta` looks safe but is a read-then-write race: two
  // overlapping adjustments both read the same starting rank and both write the
  // same next one, losing a step (Codex review, 2026-08-13). The server applies
  // the delta and the clamp atomically instead, so overlapping steps converge.
  const gen = el._officeManoeuvreGen;

  try {
    await apiPut(`/api/office_manoeuvre_rank/${encodeURIComponent(outcome.seatId)}/step`, { delta });
  } catch {
    return; // silent no-op on failure — the displayed value simply stays put
  }
  // The viewer may have switched category while the write was in flight;
  // re-rendering now would paint this seat's rank into another office's markup.
  if (gen !== el._officeManoeuvreGen) return;
  // oxp.6: refreshes BOTH sections, not just this one — a manoeuvre step
  // changes the shared balance the merit section's affordability markers read
  // too.
  await _refreshPurchaseState(el, outcome, data, isOwnOffice, gen);
}

/**
 * oxp.9: the seat occupant's own "request this purchase" control.
 *
 * Deliberately a SEPARATE control from the ST's `+`/`-` steppers, not a
 * replacement for them — an ST setting purchase state directly is still an
 * unqueued, ST-approved action, and this story does not gate it (see
 * server/routes/office-purchase.js's own header for the three reasons).
 *
 * `reason` is oxp.6's already-computed shortfall string
 * (`meritDotReasons`/`manoeuvreDotReasons` for the NEXT dot), reused as the
 * disabled control's `title` rather than recomputed here — a second copy of
 * that arithmetic is exactly how the button and the dot beside it would come
 * to disagree.
 *
 * Deliberately placed BELOW `_wireManoeuvreRank` rather than beside
 * `_refreshPurchaseState`: oxp.4's structural guards read the source span
 * between `_wirePurchaseState` and `_wireMeritDots` and prove no write API is
 * reachable from it, and the source span of `_wireMeritDots` itself and prove
 * it carries no occupant reference. Both guarantees are still true and worth
 * keeping literally true, so this story's new code lives outside both spans.
 *
 * @param {string} label      what the button says when it is actionable
 * @param {string} attr       the data-attribute the click wiring reads
 * @param {object} requestState { canRequest, hasPending, unknown }
 * @param {number|null} left  the seat's remaining office XP, or null if unknown
 * @param {string|null} reason oxp.6's shortfall reason for the next dot
 */
function _requestControlHtml(label, attr, requestState, left, reason) {
  if (!requestState || !requestState.canRequest) return '';

  let text = label;
  let title = '';
  let disabled = false;

  if (requestState.unknown) {
    // A failed pending-request read is "we cannot tell", never a silent
    // all-clear — offering the button anyway would produce a 409 the viewer
    // could not have predicted.
    text = 'Request unavailable';
    title = 'Could not check whether a request is already awaiting approval.';
    disabled = true;
  } else if (requestState.hasPending) {
    text = 'Awaiting ST approval';
    title = 'This seat already has a purchase request awaiting ST approval.';
    disabled = true;
  } else if (!Number.isFinite(left)) {
    text = 'Request unavailable';
    title = 'Could not read this seat\'s office XP balance.';
    disabled = true;
  } else if (left < 1) {
    title = reason || 'Not enough office XP.';
    disabled = true;
  }

  return `<button class="office-request-btn" ${attr}`
    + (title ? ` title="${esc(title)}"` : '')
    + `${disabled ? ' disabled' : ''}>${esc(text)}</button>`;
}

/**
 * oxp.9: POSTs one purchase request and refreshes both purchase sections.
 *
 * Reports through the canonical `toast()` (the same one app.js and this
 * game-tab area already use), never through `.office-action-msg` — that
 * element belongs to the Head-of-State Status Action block and is not
 * rendered in the purchase sections at all.
 *
 * The render-generation guard is captured BEFORE the await and re-checked
 * after, exactly as `_adjustMeritDots`/`_adjustManoeuvreRank` already do: a
 * late response must never paint one office's state into another's markup.
 *
 * Only the seat id and the purchase itself are ever sent. The server decides
 * who may act on that seat, from `office_seats.holder_id` — which is stricter
 * than anything this client could assert, and is the authoritative check.
 */
async function _submitPurchaseRequest(el, outcome, data, isOwnOffice, payload) {
  const gen = el._officeManoeuvreGen;

  try {
    await apiPost('/api/office_purchase_requests', { seat_id: outcome.seatId, ...payload });
  } catch (err) {
    toast(err.message || 'Could not submit the request.');
    return;
  }
  toast('Request submitted. Awaiting ST approval.');

  if (gen !== el._officeManoeuvreGen) return;
  await _refreshPurchaseState(el, outcome, data, isOwnOffice, gen);
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
