/**
 * oxp.11: resolve an office SEAT id to the seat document and the office
 * category that governs it.
 *
 * Both purchase collections (`office_merit_dots`, `office_manoeuvre_ranks`)
 * used to be keyed by office category, one document per office. They are now
 * keyed by the seat a purchase belongs to, so both route files have to turn a
 * `:seatId` URL parameter into a seat before they can validate anything else.
 * That is the whole of this module's job, and it lives here rather than being
 * copied into both routes for one specific reason: the 24-hex validation
 * pattern must exist exactly once. A second, drifting copy of it is how one
 * route would start accepting an id shape the other rejects.
 *
 * Why a seat id and not a category: a seat's `_id` is minted once by MongoDB
 * and never changes, while `holder_id` is only its current pointer at a
 * character. Keying purchases by seat therefore preserves oxp.4's
 * "merits survive a handover" guarantee exactly as category-keying did (no
 * character reference reaches the purchase document either way), while also
 * distinguishing Primogen's two concurrent seats from each other, which
 * category-keying could not express at all.
 */

import { ObjectId } from 'mongodb';
import { getCollection } from '../db.js';
import { OFFICE_DATA } from '../../public/js/tabs/office-data.js';

/**
 * The stored key shape. A seat id is its `office_seats._id` rendered as a
 * 24-character hexadecimal string, which is what `String(ObjectId)` produces.
 * Matched case-insensitively but always NORMALISED to lower case before it is
 * used as a document key, so an upper-case request cannot mint a second
 * purchase document for a seat that already has one.
 */
export const SEAT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

/**
 * Resolve `seatId` to its seat, office category and OFFICE_DATA entry.
 *
 * Returns either `{ seatId, seat, category, officeEntry }` on success, or
 * `{ error: { status, body } }` on any of the three failure modes, which the
 * caller passes straight to `res.status(...).json(...)`. Returning the failure
 * rather than writing the response keeps this usable from anywhere and keeps
 * the status codes defined in exactly one place:
 *
 *   - not a 24-hex string          -> 400 VALIDATION_ERROR
 *   - well formed, but no seat     -> 404 NOT_FOUND
 *   - seat's office has no rules   -> 400 VALIDATION_ERROR
 *
 * The last of those preserves the behaviour the category-keyed routes already
 * had: 'Administrator' has no `OFFICE_DATA` entry until oxp.8, so a purchase
 * against it cannot be validated and is refused rather than stored unchecked.
 *
 * @param {string} seatId
 * @returns {Promise<{seatId?:string, seat?:object, category?:string, officeEntry?:object, error?:{status:number, body:object}}>}
 */
export async function resolveOfficeSeat(seatId) {
  if (typeof seatId !== 'string' || !SEAT_ID_PATTERN.test(seatId)) {
    return {
      error: {
        status: 400,
        body: {
          error: 'VALIDATION_ERROR',
          message: 'Seat id must be a 24-character hexadecimal office_seats id',
        },
      },
    };
  }

  const normalised = seatId.toLowerCase();
  const seat = await getCollection('office_seats').findOne({ _id: new ObjectId(normalised) });
  if (!seat) {
    return {
      error: {
        status: 404,
        body: { error: 'NOT_FOUND', message: 'No office seat with that id' },
      },
    };
  }

  const category = seat.office_category;
  const officeEntry = OFFICE_DATA[category];
  if (!officeEntry) {
    return {
      error: {
        status: 400,
        body: {
          error: 'VALIDATION_ERROR',
          message: `This seat's office ('${category}') has no rules entry yet`,
        },
      },
    };
  }

  return { seatId: normalised, seat, category, officeEntry };
}
