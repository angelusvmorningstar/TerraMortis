/**
 * prax.0: derive a character's HEADLINE court office from every seat they
 * actually hold.
 *
 * `characters.court_category` and `characters.court_title` are single stored
 * fields; `office_seats.holder_id` is the real, per-seat fact. Angelus's ruling
 * of 2026-08-13 (quoted at length in `server/routes/office-seats.js`) stands
 * unchanged: do NOT derive `court_category` at read time across every consumer.
 * One transactional route owns writing it, and every existing read site is left
 * alone. This module is what that ONE route computes the value WITH, so the
 * value it stores is right even when the holder sits in two seats at once.
 *
 * Why two seats are now possible at all: Praxis (Epic PRAX). A Praxis winner
 * who already holds Primogen keeps the Primogen seat, mechanically, and only
 * their headline flips to Head of State. `office_seat.schema.js`'s
 * `mayHoldBothOffices` is the matrix that permits exactly that one pairing.
 *
 * A dual-seat holder's headline and one of their held seats therefore
 * legitimately and PERMANENTLY disagree. That is by design, not drift.
 */

import { ObjectId } from 'mongodb';
import { getCollection } from '../db.js';
import { OFFICE_CATEGORY_ENUM } from '../schemas/office_seat.schema.js';

/**
 * Seniority, most senior first: Head of State > Primogen > Administrator >
 * Socialite > Enforcer.
 *
 * This is `OFFICE_CATEGORY_ENUM`'s own order, reused rather than restated. A
 * second literal array here could silently drift from the enum, and the two
 * disagreeing would show up as a wrong headline rather than as an error.
 */
export const COURT_CATEGORY_PRECEDENCE = OFFICE_CATEGORY_ENUM;

/**
 * prax.0 AC3: the headline `{court_category, court_title}` for a character who
 * holds `seatsHeld`.
 *
 * Pure and DOM-free, so the precedence rule is unit-testable without a
 * database. The querying half is `deriveCourtHeadlineForHolder` below.
 *
 * `court_title` follows the precedence WINNER and only the winner, because the
 * two fields must describe the SAME seat. Without that rule, granting a JUNIOR
 * seat to someone who already holds a SENIOR one would silently overwrite their
 * senior title with the junior seat's: a sitting Head of State additionally
 * granted Primogen would keep the correct headline "Head of State" while their
 * `court_title` read "Primogen".
 *
 * Title resolution, in order:
 *   1. the title supplied for `seatCategory` (the seat this request is
 *      writing), but ONLY when that seat is the winner;
 *   2. the holder's existing title, but ONLY when their existing category is
 *      already the winner (so their headline has not actually moved);
 *   3. the winning category's own name, the same default the handover route has
 *      always used for a title-less assignment.
 *
 * @param {Array<{office_category: string}>|null|undefined} seatsHeld every seat
 *   this character holds RIGHT NOW, in any order. Pass the empty array (or
 *   nothing) for a character who holds none.
 * @param {object} [opts]
 * @param {string|null} [opts.seatCategory] the category of the seat this
 *   request is writing, if any.
 * @param {string|null} [opts.seatTitle] the title this request wants for that
 *   seat. Ignored unless that seat is the precedence winner.
 * @param {string|null} [opts.currentCategory] the holder's stored
 *   `court_category` before this write.
 * @param {string|null} [opts.currentTitle] the holder's stored `court_title`
 *   before this write.
 * @returns {{court_category: string|null, court_title: string|null}}
 */
export function deriveCourtCategory(seatsHeld, opts = {}) {
  const { seatCategory = null, seatTitle = null, currentCategory = null, currentTitle = null } = opts;

  const held = Array.isArray(seatsHeld) ? seatsHeld : [];
  const categories = new Set(held.map(s => s && s.office_category).filter(Boolean));

  // Holding zero seats is a real answer, not a missing one: the character holds
  // no office, so both fields are null.
  const winner = COURT_CATEGORY_PRECEDENCE.find(cat => categories.has(cat)) || null;
  if (winner === null) return { court_category: null, court_title: null };

  let title;
  if (seatCategory === winner && seatTitle != null) title = seatTitle;
  else if (currentCategory === winner && currentTitle) title = currentTitle;
  else title = winner;

  return { court_category: winner, court_title: title };
}

/**
 * prax.0 AC3: the same derivation, reading the holder's seats from
 * `office_seats` INSIDE the caller's transaction.
 *
 * The `session` is not optional-by-convenience, it is load-bearing. Every
 * caller in `office-seats.js` runs after that route's own seat claim has
 * already committed within the transaction, so a read outside the session would
 * see the PRE-claim world and derive the headline the holder had a moment ago.
 *
 * @param {import('mongodb').ObjectId|string} holderId
 * @param {import('mongodb').ClientSession} session
 * @param {object} [opts] passed straight through to `deriveCourtCategory`.
 * @returns {Promise<{court_category: string|null, court_title: string|null}>}
 */
export async function deriveCourtHeadlineForHolder(holderId, session, opts = {}) {
  const oid = holderId instanceof ObjectId ? holderId : new ObjectId(String(holderId));
  const seatsHeld = await getCollection('office_seats')
    .find({ holder_id: oid }, { session })
    .toArray();
  return deriveCourtCategory(seatsHeld, opts);
}
