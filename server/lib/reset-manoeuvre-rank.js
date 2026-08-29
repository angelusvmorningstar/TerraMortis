/**
 * The office-manoeuvre reset, shared by every route that hands a seat over.
 *
 * ═══ WHY THIS MODULE EXISTS (prax.4a AC1) ═══
 *
 * Extracted VERBATIM out of server/routes/office-seats.js, where it lived as a
 * file-local function from oxp.5 until prax.4a needed a second caller. Nothing
 * about the function changed in the move: same signature, same body, same doc
 * comment. `office-seats.js` now imports it and keeps no copy.
 *
 * The extraction happened here rather than being deferred (the epic doc
 * originally anticipated prax.4b as "the third caller") because this is real,
 * previously-buggy arithmetic whose stage order is load-bearing - see the
 * comment inside the pipeline below. A temporary duplicate would have been a
 * second place for that inversion to be reintroduced silently, which is exactly
 * the class of bug the counter was written to prevent. Contrast `RouteResponse`,
 * a six-line class with no logic in it, which BOTH routes still keep their own
 * local copy of on the same reasoning read the other way round.
 *
 * The second caller is `POST /api/praxis_sessions/:id/resolve-harpy`
 * (server/routes/praxis-sessions.js), which cannot call the existing
 * `PUT /api/office_seats/:seatId/holder` over HTTP: it needs the seat handover
 * and the `praxis_sessions.harpy.resolved` snapshot in ONE transaction, and this
 * codebase's convention is that cross-collection atomicity is achieved by
 * writing inside one transaction, never by one route invoking another.
 */

import { getCollection } from '../db.js';

/**
 * oxp.5 AC5 + AC6: zero this seat's manoeuvre rank and RECORD the XP that zeroing
 * destroys. Called on every real handover, replacement and vacate alike.
 *
 * Vacating IS a handover. The ruling's wording is "on handover" / "when the
 * office changes hands", and a departing holder's investment dies with their
 * tenure whether or not a successor is named — the office-powers ruling's own
 * consequence 2 ("a holder near the end of their tenure has no reason to buy
 * manoeuvres") depends on this being true. Vacate is not reset-exempt.
 *
 * ═══ WHY THE DESTROYED-XP COUNTER EXISTS (oxp.5 Finding 1 — read this before
 * changing anything here) ═══
 *
 * Office spend is DERIVED, never stored. `officeXpSpentForCategory` in
 * public/js/data/office-xp.js (oxp.2) computes it as the sum of the seat's
 * current merit dots plus its current manoeuvre `rank`. So the instant this
 * function sets `rank` to 0, the derived spend DROPS by the old rank and the
 * office's balance RISES by exactly the amount office-powers.md says must be
 * destroyed. The obvious implementation delivers the precise OPPOSITE of the
 * rule: a refund.
 *
 * The ruling anticipated it: "The running balance is total accrued since
 * creation, minus everything ever spent, INCLUDING THE SPEND THAT HAS SINCE
 * BEEN LOST." Lost spend cannot be recovered from current state after the fact
 * — it is destroyed by definition, and nothing else in the system records the
 * rank a seat used to have. This function is the only place the information
 * exists, so it is captured HERE or it is gone forever.
 *
 * ═══ HANDED FORWARD, DELIBERATELY (oxp.6 / oxp.7) ═══
 *
 * oxp.5 STORES this counter and does not consume it. `officeXpSpentForCategory`
 * MUST eventually add `manoeuvre_xp_destroyed` to its total, or every balance
 * it renders over-reports by the destroyed amount — which IS the refund the
 * ruling forbids. Nothing renders that number today (office-xp.js has no
 * consumer yet), so nothing is wrong on screen, and wiring it here would
 * rewrite oxp.2's AC8 from inside this story. Whoever builds the first real
 * consumer owns that arithmetic. Recorded here, in oxp.5's Dev Notes and in
 * oxp.6's sprint-status entry, the same way oxp.11 recorded `holder_id` into
 * oxp.5 rather than leaving it to be rediscovered.
 *
 * @returns {Promise<{seat_id:string, rank_before:number, xp_destroyed:number,
 *   manoeuvre_xp_destroyed_total:number}|null>} null when the seat has no rank
 *   document at all (nothing was purchased, so nothing was destroyed).
 */
export async function resetManoeuvreRank(seatId, category, timestamp, dbSession) {
  const ranks = getCollection('office_manoeuvre_ranks');
  // `findOneAndUpdate` rather than `updateOne`: it is the SAME single atomic
  // aggregation-pipeline update (the same idiom office-manoeuvre-rank.js's step
  // route uses), and it additionally hands back the pre-image, which is the only
  // way to report the rank that was actually destroyed without adding a second
  // read. A plain updateOne would leave the caller with `matchedCount` and no
  // way to tell an ST what the operation cost them.
  const result = await ranks.findOneAndUpdate(
    { _id: seatId },
    [
      // STAGE ORDER IS LOAD-BEARING. Aggregation-pipeline stages run in
      // sequence, so THIS stage reads the ORIGINAL `$rank` — before stage 2
      // below zeroes it. Swap these two and the counter silently records 0
      // destroyed on every handover, forever, with no error and no visible
      // symptom until a balance is finally rendered. A test pins that exact
      // inversion.
      //
      // The rate is 1 XP per rank (office-powers.md's flat "standard merit
      // rate"), so the increment is exactly the pre-reset rank. The counter is
      // CUMULATIVE across every handover this seat ever sees.
      { $set: { manoeuvre_xp_destroyed: { $add: [{ $ifNull: ['$manoeuvre_xp_destroyed', 0] }, { $ifNull: ['$rank', 0] }] } } },
      // `$set rank: 0`, NOT delete-the-document. Both read identically to
      // clients (GET / does `out[doc._id] = doc.rank || 0`, and the client
      // treats a missing key as 0), so the choice is purely about what evidence
      // survives. Zeroing keeps `updated_at` and the destroyed counter as a
      // legible record that a reset happened; deleting throws away the only
      // trace, the counter included.
      //
      // `office_category` rides along as a $literal, keeping oxp.11's
      // denormalised copy self-healing. Never a bare string: in an
      // aggregation-pipeline update a string beginning with '$' would be read
      // as a field path. Same idiom as office-manoeuvre-rank.js's step route.
      { $set: { rank: 0, office_category: { $literal: category }, updated_at: timestamp } },
    ],
    {
      session: dbSession,
      // upsert: false, DELIBERATELY. A seat that never purchased a rank has no
      // document, nothing to destroy, and needs no document minted saying so.
      // No match is a correct, silent success. It also keeps the collection's
      // "no document = 0" convention intact instead of filling it with
      // meaningless rank-0 rows.
      upsert: false,
      // 'before' so the caller can report the rank that was actually
      // destroyed; the post-image is fully determined (rank 0) anyway.
      returnDocument: 'before',
    },
  );
  if (!result) return null;
  const rankBefore = result.rank || 0;
  return {
    seat_id: seatId,
    rank_before: rankBefore,
    xp_destroyed: rankBefore,
    manoeuvre_xp_destroyed_total: (result.manoeuvre_xp_destroyed || 0) + rankBefore,
  };
}
