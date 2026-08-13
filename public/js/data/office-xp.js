/**
 * Derived office XP (Epic OXP, story oxp.2).
 *
 * Pure functions only. Everything here takes already-fetched data as an
 * argument and derives a number from it — no fetch, no cache, no DOM, no
 * clock read. That is deliberately the same shape as `public/js/editor/xp.js`
 * (`xpEarned`/`xpSpent`/`xpLeft` take the character object and derive), rather
 * than `public/js/data/game-xp.js`'s shape (which is the fetch-and-cache half
 * of the same pattern). The fetch-and-cache half for offices is not written
 * yet on purpose: nothing consumes these numbers until oxp.6 (purchase
 * markers) or oxp.7 (sheet section), and each will shape its own read pattern
 * from its own real requirements.
 *
 * THE RULING THIS IMPLEMENTS (do not re-derive it here — it is settled):
 * `content/rules/office-powers.md` §"Office XP", Angelus 2026-08-11.
 *
 *   - An office accrues 1 XP per month from creation, whether or not anyone
 *     holds it. A vacant seat still earns. The pool belongs to the OFFICE,
 *     never to the holder, and never mixes with personal XP in either
 *     direction.
 *   - Spend is 1 XP per dot, at "the standard merit rate", for the fixed merit
 *     suite (`office_merit_dots`) and for the graduated manoeuvre ladder
 *     (`office_manoeuvre_ranks`) alike.
 *   - The balance is total accrued since creation minus everything ever spent,
 *     including manoeuvre spend that a handover has since destroyed. This
 *     module reads whatever is stored today; it does not implement the
 *     handover reset (that is oxp.5).
 *
 * Nothing here is ever stored. Office XP is a derived value like health, vitae
 * and character XP, computed at render time from `created_at` plus the two
 * purchase collections, per this project's standing "derived stats are never
 * stored" rule.
 */

/**
 * The flat accrual rate from the ruling: one point per calendar month.
 * Named rather than inlined so a future rate change is one edit, and so a
 * reader can see the multiplication is a rate and not a coincidence.
 */
export const OFFICE_XP_PER_MONTH = 1;

/**
 * Pull the calendar year and month out of a value that is either an ISO date
 * string ('2026-02-21' or '2026-02-21T09:30:00.000Z') or a Date object.
 *
 * A Date is read with LOCAL getters, because a Date used as "now" means the
 * reader's wall clock. A string is read by its own characters and never goes
 * through Date parsing at all, so no timezone can shift '2026-02-01' back into
 * January on a machine west of UTC.
 *
 * Throws on anything unparseable. That is deliberate: the ISO pattern on
 * `created_at` in `server/schemas/office_seat.schema.js` exists precisely
 * because a malformed date reaching this arithmetic would otherwise produce a
 * wrong-but-plausible number rather than a visible failure.
 *
 * @param {string|Date} value
 * @param {string} label - which argument this is, for the error message
 * @returns {{ year: number, month: number }} month is 1-12
 */
function yearMonthOf(value, label) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error(`office-xp: ${label} is an Invalid Date`);
    }
    return { year: value.getFullYear(), month: value.getMonth() + 1 };
  }

  if (typeof value === 'string') {
    // Anchored at both ends and day-bounded, matching office_seat.schema.js's
    // own `isoDate` pattern exactly (Codex review, oxp.2: the previous
    // start-anchored-only pattern accepted a valid-looking prefix and ignored
    // any garbage after it, e.g. '2026-02-99' or '2026-02-21junk', silently
    // deriving a plausible month figure from a value that should have thrown).
    const m = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])([T ][0-9:.+-Z]+)?$/.exec(value);
    if (m) return { year: Number(value.slice(0, 4)), month: Number(m[1]) };
  }

  throw new Error(
    `office-xp: ${label} '${value}' is not an ISO date (YYYY-MM-DD) or a Date. ` +
    'Refusing to derive a months-since-creation figure from it.'
  );
}

/**
 * How many calendar months a seat has been accruing for, INCLUSIVE of the
 * month it was created in (AC1).
 *
 * This is a named-month count, not a day difference and not a 30-day bucket.
 * Day-of-month never enters it. The ruling's own worked example is the pin:
 * a seat created February 2026, read in August 2026, has accrued 7 — which is
 * what `(nowYear*12 + nowMonth) - (createdYear*12 + createdMonth) + 1` gives,
 * on any day of August. A day-based implementation would give 5 or 6 for most
 * of that month and is the easy wrong answer here.
 *
 * `now` is a REQUIRED parameter and the clock is never read inside this
 * module, so every result is deterministic and testable. That matches the
 * convention `server/scripts/seed-office-seats.mjs` already set for this
 * epic's calendar arithmetic.
 *
 * @param {string|Date} createdAt - the seat's own `created_at`
 * @param {string|Date} now - caller-supplied evaluation date
 * @returns {number} months accrued, never negative
 */
export function officeMonthsAccrued(createdAt, now) {
  const from = yearMonthOf(createdAt, 'created_at');
  const to = yearMonthOf(now, 'now');

  const months = (to.year * 12 + to.month) - (from.year * 12 + from.month) + 1;
  // A "now" earlier than the creation month means the office does not exist
  // yet, which is zero accrual — never a negative balance.
  return Math.max(0, months);
}

/**
 * Total XP a seat has EARNED since it was created (AC2).
 *
 * Reads `created_at` and nothing else. It deliberately does not look at
 * `holder_id`: a vacant seat accrues exactly as a filled one does, because the
 * pool belongs to the office. "A long-dormant office is a prize" in the
 * ruling's own words — whoever is appointed to it inherits every point banked
 * since creation.
 *
 * @param {{ created_at: string }} seat - one `office_seats` document
 * @param {string|Date} now - caller-supplied evaluation date
 * @returns {number}
 */
export function officeXpEarned(seat, now) {
  return officeMonthsAccrued(seat.created_at, now) * OFFICE_XP_PER_MONTH;
}

/**
 * Total XP SPENT against one office category (AC3).
 *
 * Both purchase collections are counted at the flat 1 XP per dot the ruling
 * sets: every merit dot in `office_merit_dots`, plus the graduated manoeuvre
 * ladder's current rank in `office_manoeuvre_ranks` (rank 3 means ranks 1, 2
 * and 3 are bought, so the rank IS the dot count).
 *
 * A missing document counts as 0, never as an error. That is not defensive
 * padding: it is the sibling routes' own established convention. `GET
 * /api/office_merit_dots` and `GET /api/office_manoeuvre_rank` both omit a
 * never-purchased category from the response entirely, and as of 2026-08-13
 * that is MOST offices — office_merit_dots holds two documents and
 * office_manoeuvre_ranks holds none at all.
 *
 * Two input shapes are accepted for each argument, so no caller has to reshape
 * first: the API response shape (`{ [meritName]: dots }` and a bare rank
 * number) and the raw MongoDB document shape (`{ dots: {...} }` and
 * `{ rank: n }`). They are unambiguous — a raw document's `dots` is an object,
 * where an API-shaped map's values are all numbers.
 *
 * NOTE ON SCOPE: this is a CATEGORY total, not a seat total, because both
 * collections are keyed by `office_category` alone with no seat or holder
 * reference. For an office with more than one seat that total cannot be split
 * between them — see `officeSpendKnownByCategory`.
 *
 * @param {object|undefined|null} meritDotsDoc
 * @param {number|object|undefined|null} manoeuvreRankDoc
 * @returns {number}
 */
export function officeXpSpentForCategory(meritDotsDoc, manoeuvreRankDoc) {
  const dots = (meritDotsDoc && typeof meritDotsDoc.dots === 'object' && meritDotsDoc.dots !== null)
    ? meritDotsDoc.dots
    : meritDotsDoc;

  let meritXp = 0;
  if (dots && typeof dots === 'object') {
    for (const value of Object.values(dots)) {
      // A non-numeric value is skipped rather than coerced. `Number(null)` is
      // 0 and `Number('three')` is NaN; the first is a lie and the second
      // poisons the whole total.
      if (typeof value === 'number' && Number.isFinite(value)) meritXp += value;
    }
  }

  let rankXp = 0;
  if (typeof manoeuvreRankDoc === 'number' && Number.isFinite(manoeuvreRankDoc)) {
    rankXp = manoeuvreRankDoc;
  } else if (manoeuvreRankDoc && typeof manoeuvreRankDoc.rank === 'number' && Number.isFinite(manoeuvreRankDoc.rank)) {
    rankXp = manoeuvreRankDoc.rank;
  }

  return meritXp + rankXp;
}

/**
 * Per office category, can spend be attributed to an INDIVIDUAL seat? (AC4)
 *
 * True only when the category has exactly one seat document. Two or more and
 * the answer is false, because `office_merit_dots` / `office_manoeuvre_ranks`
 * are keyed by category alone: there is no field anywhere saying which of the
 * seats a purchase belongs to. Live today that means Primogen (2 seats) and
 * Socialite (2 seats) are unattributable, while Head of State, Enforcer and
 * Administrator are fine.
 *
 * Vacancy is irrelevant. Two seats create the same structural ambiguity
 * whether or not anyone is sitting in them, so this counts SEATS and never
 * looks at `holder_id`.
 *
 * This is deliberately a first-class value rather than something a caller
 * infers. "Spend is 0" and "we cannot tell whose spend this is" are different
 * facts that happen to look identical in a rendered number, and conflating
 * them is exactly the bug this story was scoped around. The proper fix is to
 * migrate both purchase collections to seat-keying; that is real, known work,
 * deferred deliberately (see oxp.1 and this story's "What this story is NOT").
 * Until then this flag is how a UI knows to render "N/A, pending seat-level
 * purchase tracking" instead of a number that looks real and is not.
 *
 * @param {Array<{ office_category: string }>} allSeats - the full seats array
 * @returns {{ [category: string]: boolean }}
 */
export function officeSpendKnownByCategory(allSeats) {
  const counts = new Map();
  for (const s of Array.isArray(allSeats) ? allSeats : []) {
    const cat = s && s.office_category;
    if (!cat) continue;
    counts.set(cat, (counts.get(cat) || 0) + 1);
  }

  const out = {};
  for (const [cat, n] of counts) out[cat] = n === 1;
  return out;
}

/**
 * The combined per-seat XP position (AC5).
 *
 * @param {object} seat - one `office_seats` document
 * @param {Array<object>} allSeats - every seat document, so the seat count for
 *   this seat's category can be established (see `officeSpendKnownByCategory`).
 *   `seat` should be one of `allSeats`; if it genuinely is not, `spendKnown`
 *   is forced `false` rather than trusting a possibly-incomplete count.
 * @param {object|undefined|null} meritDotsDoc - this CATEGORY's merit dots
 * @param {number|object|undefined|null} manoeuvreRankDoc - this CATEGORY's rank
 * @param {string|Date} now - caller-supplied evaluation date
 * @returns {{ earned: number, spent: number, left: number, spendKnown: boolean }}
 *
 * `earned` is always this seat's own, exact figure: it derives from this
 * seat's `created_at` and nothing else, so two seats in the same office
 * created in different months correctly differ.
 *
 * `spent` and `left` are always real numbers so no caller crashes on
 * undefined, BUT when `spendKnown` is false they are the CATEGORY's shared
 * total and are NOT attributable to this seat. A caller must check
 * `spendKnown` before treating either as this seat's own figure — the check
 * guards against believing a number, not against a missing one. Never
 * simplify this away by defaulting `spendKnown` to true.
 *
 * `left` is allowed to go negative. Both purchase collections are direct
 * ST-set state with no budget check (oxp.9 would add one), so an office can
 * genuinely show more purchased than earned; clamping to 0 would hide that.
 *
 * `spendKnown` is forced `false` — never inferred from `allSeats` alone — if
 * `seat` itself cannot be found in `allSeats` (Codex review, oxp.2: a caller
 * passing a stale or filtered `allSeats` that omits the very seat being
 * evaluated made a genuinely multi-seat category undercount to 1 and report
 * `spendKnown: true`, exactly the false-confidence outcome this flag exists
 * to prevent). The failure direction is deliberately one-sided: an
 * inconsistent call can only make this MORE cautious, never falsely
 * confident, so a well-formed call (`seat` really is one of `allSeats`) is
 * completely unaffected.
 */
export function officeSeatXp(seat, allSeats, meritDotsDoc, manoeuvreRankDoc, now) {
  const earned = officeXpEarned(seat, now);
  const spent = officeXpSpentForCategory(meritDotsDoc, manoeuvreRankDoc);
  const seatIsIncluded = Array.isArray(allSeats) && allSeats.some(s =>
    s === seat || (seat && s && seat._id != null && s._id != null && String(seat._id) === String(s._id))
  );
  const spendKnown = seatIsIncluded && officeSpendKnownByCategory(allSeats)[seat.office_category] === true;

  return { earned, spent, left: earned - spent, spendKnown };
}
