/**
 * oxp.9 — office XP spend, routed through Epic OAQ's ST Approval Queue.
 *
 * The holder of a Court Position seat requests ONE purchase from their
 * office's own XP pool (one merit dot, or the next manoeuvre rank). The
 * request lands in `contested_roll_requests` as a fourth discriminated shape,
 * `request_type: 'office_purchase'`, alongside `contested_roll` (crd.1),
 * `status_action` (oaq.2) and `humanity_check` (gdx.12). gdx.12 is the
 * precedent this file follows line for line: its own schema, its own route
 * file, its own accept/decline, and ONE widened `$in` in office-actions.js's
 * shared `GET /pending` rather than a second GET endpoint.
 *
 * TWO THINGS THIS FILE IS THE ONLY PLACE FOR, AND ONE IT IS NOT:
 *
 *   - The purchase WRITE happens only on ST accept. Nothing is written to
 *     `office_merit_dots` / `office_manoeuvre_ranks` at submission time, and a
 *     decline writes nothing at all — the same "budget spends on approval,
 *     never on submission" decision oaq.2 recorded for Status Actions.
 *   - The BUDGET CHECK (`officeSeatXp().left >= 1`) is authoritative only in
 *     the accept route, against documents re-read inside the same transaction.
 *     POST carries a courtesy copy of the same rule so an obviously
 *     unaffordable request never reaches the ST's queue, exactly as
 *     office-actions.js re-checks `computeNewStatus` at both ends.
 *   - It is NOT a gate on the existing ST-only PUT routes
 *     (`office-merit-dots.js`, `office-manoeuvre-rank.js`). Those stay direct
 *     ST-set state with no budget check, and `officeSeatXp().left` is still
 *     allowed to go negative, BY DESIGN: the down-steppers are a correction
 *     path with no approval to give, STs still need to seed historical
 *     purchase state that predates this economy, and office-tab.js's
 *     "N over budget" line only works because a negative `left` is
 *     representable. An ST setting state directly IS an ST-approved action.
 */

import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getCollection, getClient } from '../db.js';
import { validate } from '../middleware/validate.js';
import { isStRole, requireRole } from '../middleware/auth.js';
import { officePurchaseRequestSchema } from '../schemas/office_purchase_request.schema.js';
import { resolveOfficeSeat } from '../lib/office-seat-resolve.js';
import { OFFICE_DATA, MERIT_DOT_CAPS } from '../../public/js/tabs/office-data.js';
import { officeSeatXp } from '../../public/js/data/office-xp.js';

const router = Router();
const pendingCol   = () => getCollection('contested_roll_requests');
const seatsCol     = () => getCollection('office_seats');
const meritDotsCol = () => getCollection('office_merit_dots');
const manoeuvreCol = () => getCollection('office_manoeuvre_ranks');

const REQUEST_TYPE = 'office_purchase';

/**
 * A deliberate business rejection thrown from inside a withTransaction()
 * callback. Same class, same reasoning, as office-actions.js's own:
 * withTransaction only retries errors MongoDB itself labels transient, so a
 * plain thrown Error aborts the transaction and propagates straight out with
 * no spurious retry.
 */
class RouteResponse extends Error {
  constructor(statusCode, body) { super(body.message); this.statusCode = statusCode; this.body = body; }
}

/**
 * This route family's own lookup + pending guard, literal to
 * `request_type: 'office_purchase'`.
 *
 * Deliberately NOT office-actions.js's `_findPending`: that one hardcodes
 * `request_type: 'status_action'`, and gdx.12's own Dev Notes already ruled
 * out generalising it — every discriminator in this shared collection owns its
 * own copy, the same way contested-rolls.js's `_findChallenge` does.
 */
async function _findPendingPurchase(req, res) {
  let oid;
  try { oid = new ObjectId(req.params.id); } catch {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid ID format' });
    return null;
  }
  const doc = await pendingCol().findOne({ _id: oid, request_type: REQUEST_TYPE });
  if (!doc) { res.status(404).json({ error: 'NOT_FOUND' }); return null; }
  if (doc.status !== 'pending') {
    res.status(409).json(_conflictBody(doc));
    return null;
  }
  return doc;
}

/** This route family's own enriched 409 body, mirroring office-actions.js's
 *  `_conflictBody` in shape without importing it (same reasoning as
 *  `_findPendingPurchase` above). */
function _conflictBody(doc) {
  const by = doc?.status === 'resolved' ? doc.resolved_by : doc?.status === 'declined' ? doc.declined_by : null;
  const message = by ? `Request is no longer pending, already ${doc.status} by ${by}` : 'Request is no longer pending';
  return { error: 'CONFLICT', message, resolved_by: doc?.resolved_by, declined_by: doc?.declined_by };
}

/**
 * Shared purchase-validity check, run at BOTH submission (a courtesy
 * rejection) and accept (the real one, against freshly-read documents). The
 * same submit-then-recheck shape office-actions.js uses for `computeNewStatus`
 * — the ST's own steppers can move either value in between, so what was valid
 * at submission is not necessarily valid at approval.
 *
 * Returns `{ from, to, cap }` on success. Throws RouteResponse(status, body)
 * otherwise; the caller decides which status a stale-state rejection deserves
 * (400 at submission, 409 at accept).
 *
 * @param {number} conflictStatus 400 at submission, 409 at accept
 */
function checkPurchaseValidity(officeEntry, purchase_kind, merit, meritDotsDoc, manoeuvreRankDoc, conflictStatus) {
  if (purchase_kind === 'merit') {
    if (!Array.isArray(officeEntry.merits) || !officeEntry.merits.includes(merit))
      throw new RouteResponse(400, { error: 'VALIDATION_ERROR', message: 'That merit does not belong to this office' });

    const cap = MERIT_DOT_CAPS[merit] || 5;
    const from = (meritDotsDoc && meritDotsDoc.dots && meritDotsDoc.dots[merit]) || 0;
    if (from >= cap)
      throw new RouteResponse(conflictStatus, {
        error: conflictStatus === 409 ? 'CONFLICT' : 'VALIDATION_ERROR',
        message: `${merit} is already at its cap of ${cap} dots`,
      });
    return { from, to: from + 1, cap };
  }

  if (!Array.isArray(officeEntry.manoeuvres) || officeEntry.manoeuvres.length === 0)
    throw new RouteResponse(400, { error: 'VALIDATION_ERROR', message: 'This seat\'s office has no manoeuvres' });

  const max = officeEntry.manoeuvres.length;
  // A STORED rank that is not a whole non-negative number is refused outright
  // rather than coerced. Codex review, 2026-08-27 pass 1: `rank: -5` made the
  // recorded outcome (`to: -4`) disagree with what the clamped pipeline
  // actually stores (`0`), and `rank: 'bad'` built `to: 'bad1'` and then blew
  // up inside MongoDB's `$add`, aborting the transaction with an uncaught 500
  // and stranding the request as pending. Both reproduced here before this
  // guard was written.
  //
  // The non-finite convention is office-xp.js's own (`officeXpSpentForCategory`
  // skips a value unless `typeof value === 'number' && Number.isFinite(value)`,
  // on the stated reasoning that `Number(null)` is a lie and `Number('three')`
  // poisons the total). This goes one step further and REJECTS rather than
  // skipping, because unlike a derived balance an accept has to write a number
  // back: silently reading a corrupted rank as 0 would apply a purchase and
  // record an audit outcome that neither matches the corrupted state nor
  // names it. This is pre-existing data corruption, not user input, so a
  // clear refusal naming the field is the honest answer and costs four lines.
  const rawRank = manoeuvreRankDoc == null ? null : manoeuvreRankDoc.rank;
  if (rawRank != null && (typeof rawRank !== 'number' || !Number.isFinite(rawRank) || rawRank < 0))
    throw new RouteResponse(conflictStatus, {
      error: conflictStatus === 409 ? 'CONFLICT' : 'VALIDATION_ERROR',
      message: 'This seat\'s stored manoeuvre rank is not a valid rank; an ST must correct it before a purchase can be applied',
    });

  const from = Number.isFinite(rawRank) ? rawRank : 0;
  if (from >= max)
    throw new RouteResponse(conflictStatus, {
      error: conflictStatus === 409 ? 'CONFLICT' : 'VALIDATION_ERROR',
      message: `All ${max} manoeuvres are already purchased for this seat`,
    });
  return { from, to: from + 1, cap: max };
}

/** ST, or a character the caller owns who currently holds this seat. A vacant
 *  seat (`holder_id: null`) therefore has no holder who can submit, so it is
 *  ST-only by construction — no special case needed.
 *
 *  `office_seats.holder_id` is the identity field here, NOT
 *  `characters.court_category`: it is per-SEAT (two Primogen seats are
 *  distinguishable, two court_category values are not) and it is what oxp.5's
 *  handover route keeps current. */
function holderCharacterId(seat, user) {
  const holderId = seat.holder_id == null ? null : String(seat.holder_id);
  if (!holderId) return null;
  // Array.isArray, not `|| []`: a persisted `character_ids` that is present but
  // not an array (a bare string, an object) made `.map` throw, so the route
  // failed closed by CRASHING — an uncaught rejection and a 500 rather than a
  // controlled 403 (Codex review, 2026-08-27 pass 1). Access was never granted
  // either way; this makes the denial clean.
  const callerCharIds = Array.isArray(user?.character_ids) ? user.character_ids.map(String) : [];
  return callerCharIds.includes(holderId) ? holderId : null;
}

// ─────────────────────────────────────────────────────────────────────────────

// POST /api/office_purchase_requests
// The holder (or an ST on their behalf) submits ONE purchase for ST review.
// Nothing is spent and nothing is written to either purchase collection here.
router.post('/', validate(officePurchaseRequestSchema), async (req, res) => {
  const { seat_id, purchase_kind } = req.body;
  const merit = req.body.merit;

  // Resolved first, so its existing 400/404/400 bodies pass straight through —
  // which is what preserves the Administrator refusal (no OFFICE_DATA entry
  // until oxp.8) with the message that route family already returns.
  const resolved = await resolveOfficeSeat(seat_id);
  if (resolved.error) return res.status(resolved.error.status).json(resolved.error.body);
  const { seatId, seat, category, officeEntry } = resolved;

  const requesterId = holderCharacterId(seat, req.user);
  if (!isStRole(req.user) && !requesterId)
    return res.status(403).json({ error: 'FORBIDDEN', message: 'You do not hold this office seat' });

  // A merit name is required for a merit purchase and refused for a manoeuvre
  // one. `null` counts as absent (the schema allows it) so a client that
  // always sends the key is not punished for it.
  if (purchase_kind === 'merit') {
    if (typeof merit !== 'string' || merit.trim() === '')
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'A merit name is required for a merit purchase' });
  } else if (merit != null) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'A merit must not be supplied for a manoeuvre purchase' });
  }

  const meritDotsDoc     = await meritDotsCol().findOne({ _id: seatId });
  const manoeuvreRankDoc = await manoeuvreCol().findOne({ _id: seatId });

  let submittedFrom;
  try {
    ({ from: submittedFrom } = checkPurchaseValidity(officeEntry, purchase_kind, merit, meritDotsDoc, manoeuvreRankDoc, 400));
  } catch (err) {
    if (err instanceof RouteResponse) return res.status(err.statusCode).json(err.body);
    throw err;
  }

  // Courtesy affordability pre-check. NOT the authoritative one (that is the
  // accept route's, against documents re-read inside its transaction) — this
  // only keeps an obviously unaffordable request out of the ST's queue.
  const allSeats = await seatsCol().find({}).toArray();
  const balance = officeSeatXp(seat, allSeats, meritDotsDoc, manoeuvreRankDoc, new Date());
  if (balance.left < 1)
    return res.status(403).json({
      error: 'FORBIDDEN',
      message: `Not enough office XP (${1 - balance.left} short)`,
    });

  // One in-flight request per SEAT, regardless of kind or merit. That is what
  // keeps the accept-time budget check from being defeated by queueing five
  // requests against one point of XP.
  //
  // This findOne is a FAST PATH ONLY — it spares the common case a wasted
  // validity/affordability computation and returns the friendlier body. The
  // AUTHORITATIVE guard is the partial unique index on
  // `{ seat_id }` filtered to `request_type: 'office_purchase', status:
  // 'pending'`, declared in server/index.js beside oaq.2's own. The story's
  // original reasoning ("one holder tapping their own button, not a
  // multi-actor budget race") was wrong and an external Codex review round
  // (2026-08-27, passes 1 and 2) reproduced why: the button is not disabled
  // until a later refresh, a 12-request burst got ten pending rows past this
  // check, and two of them were then accepted onto the same merit. Same
  // finding, same fix, as issue #1143's on office_actions.
  const existing = await pendingCol().findOne({ request_type: REQUEST_TYPE, seat_id: seatId, status: 'pending' });
  if (existing)
    return res.status(409).json({ error: 'CONFLICT', message: 'A purchase request is already pending for this seat' });

  let requesterName = null;
  if (requesterId) {
    let requesterOid = null;
    try { requesterOid = new ObjectId(requesterId); } catch { requesterOid = null; }
    const character = requesterOid ? await getCollection('characters').findOne({ _id: requesterOid }) : null;
    requesterName = character ? (character.moniker || character.name || requesterId) : requesterId;
  }

  const timestamp = new Date().toISOString();
  const doc = {
    request_type: REQUEST_TYPE,
    status:       'pending',
    outcome:      null,
    // The NORMALISED (lower-case) seat id resolveOfficeSeat returned. That is
    // the document key on both purchase collections; storing the raw request
    // form instead would let a later accept mint a second purchase document
    // for the same seat.
    seat_id:    seatId,
    // Denormalised for display only, never authoritative — the same posture
    // `office_category` already has on both purchase collections.
    office_category: category,
    seat_label: seat.seat_label ?? null,
    purchase_kind,
    merit: purchase_kind === 'merit' ? merit : null,
    // The value observed AT SUBMISSION, before this request's own effect: the
    // merit's dot count, or the manoeuvre rank. The accept route compares its
    // own freshly-read reading against this and refuses on ANY difference, not
    // just one that crosses a cap. Angelus's ruling, 2026-08-27, after Codex
    // pass 3 reproduced a below-cap stepper move being silently applied on top
    // of: an ST approves a SPECIFIC request, so the effect that lands must be
    // the effect that was queued.
    submitted_from: submittedFrom,
    // Null when an ST submits on a seat none of their own characters hold.
    // The accept route's requester-still-holds-seat re-check is skipped in
    // that case, deliberately: there is no requester to have lost the seat.
    requested_by_character_id:   requesterId,
    requested_by_character_name: requesterName,
    created_at: timestamp,
    updated_at: timestamp,
  };

  let result;
  try {
    result = await pendingCol().insertOne(doc);
  } catch (err) {
    // The partial unique index rejecting a concurrent duplicate. Translated to
    // the SAME 409 the fast-path pre-check above returns, so a caller cannot
    // tell which of the two arbitrated — only that one request per seat is in
    // flight. Any other write error is a real fault and propagates.
    if (err && err.code === 11000)
      return res.status(409).json({ error: 'CONFLICT', message: 'A purchase request is already pending for this seat' });
    throw err;
  }
  const created = await pendingCol().findOne({ _id: result.insertedId });
  res.status(201).json(created);
});

// GET /api/office_purchase_requests?seat_id=<24-hex>
// The pending request(s) for ONE seat, so the Office tab can show "awaiting ST
// approval" after a reload instead of offering a button that would 409.
router.get('/', async (req, res) => {
  const seat_id = req.query.seat_id;
  // `typeof === 'string'` is the guard that matters, not truthiness: a
  // repeated query key (?seat_id=a&seat_id=b) arrives as an ARRAY under
  // Express 5's default 'simple' query parser, and that is the genuinely
  // reachable non-string vector here. Bracket-notation injection is not — see
  // the project-express5-query-parser memory and gdx.12's own review finding,
  // which named the wrong vector before it was checked empirically.
  if (typeof seat_id !== 'string')
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'seat_id is required' });

  const resolved = await resolveOfficeSeat(seat_id);
  if (resolved.error) return res.status(resolved.error.status).json(resolved.error.body);
  const { seatId, seat } = resolved;

  if (!isStRole(req.user) && !holderCharacterId(seat, req.user))
    return res.status(403).json({ error: 'FORBIDDEN', message: 'You do not hold this office seat' });

  const docs = await pendingCol()
    .find({ request_type: REQUEST_TYPE, seat_id: seatId, status: 'pending' })
    .sort({ created_at: 1 })
    .toArray();
  res.json(docs);
});

// PUT /api/office_purchase_requests/:id/accept
// ST-only, and the ONLY place in oxp.9 where a purchase is written.
//
// Runs inside a single MongoDB transaction because this route makes TWO writes
// (claim the pending record, apply the purchase) and a failure between them
// would otherwise leave an approved-but-unapplied purchase with no way to
// detect it. Reads come first (they are not writes, and office-actions.js's
// own accept reads actor/target before claiming); the CLAIM is still the first
// write, which is the ordering office-actions.js adopted after a real
// concurrent-accept race reached its later writes on both sides. The loser
// must never reach the purchase write.
router.put('/:id/accept', requireRole('st'), async (req, res) => {
  const pending = await _findPendingPurchase(req, res);
  if (!pending) return;

  const client = getClient();
  const dbSession = client.startSession();
  let statusCode, body;
  try {
    await dbSession.withTransaction(async () => {
      const seatId = pending.seat_id;
      let seatOid;
      try { seatOid = new ObjectId(seatId); }
      catch { throw new RouteResponse(400, { error: 'VALIDATION_ERROR', message: 'Invalid seat_id on request' }); }

      // Re-read LIVE, inside the transaction. Everything below is judged
      // against current state, never against whatever was true at submission.
      const seat = await seatsCol().findOne({ _id: seatOid }, { session: dbSession });
      if (!seat) throw new RouteResponse(404, { error: 'NOT_FOUND', message: 'Office seat no longer exists' });

      // The seat's OFFICE itself can be re-assigned between submission and
      // approval, and `office_category` is denormalised onto the pending
      // record for display. Codex review, 2026-08-27 pass 2, reproduced the
      // consequence: a `Resources` request queued under Head of State was
      // approved after the seat became Primogen, and the purchase landed under
      // PRIMOGEN's rules with Primogen's denormalised category. The ST is
      // shown one office in the queue and signs off on another. A manoeuvre
      // request is worse still — it advances a completely different named
      // ladder. Refuse rather than retarget.
      if (seat.office_category !== pending.office_category)
        throw new RouteResponse(409, {
          error: 'CONFLICT',
          message: `This seat's office changed from ${pending.office_category} to ${seat.office_category} after the request was submitted; decline it and ask the holder to resubmit`,
        });

      const officeEntry = OFFICE_DATA[seat.office_category];
      if (!officeEntry)
        throw new RouteResponse(400, {
          error: 'VALIDATION_ERROR',
          message: `This seat's office ('${seat.office_category}') has no rules entry yet`,
        });

      // officeSeatXp needs EVERY seat to establish spendKnown for this seat's
      // category. This story never reads spendKnown, only earned/spent/left,
      // but the function still has to be called correctly.
      const allSeats         = await seatsCol().find({}, { session: dbSession }).toArray();
      const meritDotsDoc     = await meritDotsCol().findOne({ _id: seatId }, { session: dbSession });
      const manoeuvreRankDoc = await manoeuvreCol().findOne({ _id: seatId }, { session: dbSession });

      // A 409, not a 400: the ST's own stepper moving the same value since
      // submission is a conflict with current state, not a malformed request.
      const { from, to } = checkPurchaseValidity(
        officeEntry, pending.purchase_kind, pending.merit, meritDotsDoc, manoeuvreRankDoc, 409,
      );

      // STRICT re-validation: ANY intervening movement of the target value is
      // a 409, not just one that crosses a cap or the rank ceiling. The check
      // above only asks "is a purchase still legal?"; this asks "is it still
      // the SAME purchase?".
      //
      // Angelus's ruling, 2026-08-27, after Codex pass 3 reproduced the gap: a
      // request submitted at 0 dots, stepped by an ST to 1 (still below the
      // cap of 5) and then accepted, returned 200 and landed on 2. The story's
      // premise is that an ST approves a SPECIFIC request, so the effect that
      // lands must be the effect that was queued; a permissive "still legal,
      // apply it anyway" silently changes what was signed off. Failing closed
      // costs nothing real — the request stays pending and actionable, and the
      // holder resubmits against the value they can now see.
      if (from !== pending.submitted_from)
        throw new RouteResponse(409, {
          error: 'CONFLICT',
          message: pending.purchase_kind === 'merit'
            ? `${pending.merit} moved from ${pending.submitted_from} to ${from} dots after the request was submitted; decline it and ask the holder to resubmit`
            : `This seat's manoeuvre rank moved from ${pending.submitted_from} to ${from} after the request was submitted; decline it and ask the holder to resubmit`,
        });

      // Losing the seat between submission and approval is a real, narrow case
      // that must not silently apply — the same reasoning office-actions.js
      // re-checks the actor's own court_category at accept. Skipped when the
      // request was submitted by an ST (no requester to have lost anything).
      if (pending.requested_by_character_id) {
        const holderId = seat.holder_id == null ? null : String(seat.holder_id);
        if (holderId !== String(pending.requested_by_character_id))
          throw new RouteResponse(403, {
            error: 'FORBIDDEN',
            message: 'The requester no longer holds this seat',
          });
      }

      // THE authoritative budget check. The only enforcement point in oxp.9.
      const balance = officeSeatXp(seat, allSeats, meritDotsDoc, manoeuvreRankDoc, new Date());
      if (balance.left < 1)
        throw new RouteResponse(403, {
          error: 'FORBIDDEN',
          message: `Not enough office XP (${1 - balance.left} short)`,
        });

      const timestamp = new Date().toISOString();
      const resolved_by = req.user.username;
      const outcome = {
        purchase_kind: pending.purchase_kind,
        merit:         pending.merit ?? null,
        from,
        to,
        xp_cost:       1,
        earned:        balance.earned,
        spent_before:  balance.spent,
        left_after:    balance.left - 1,
      };

      // CLAIM FIRST — before the purchase write below. A true concurrent
      // accept race passes _findPendingPurchase's read on both sides; the
      // loser's own filtered update legitimately matches 0 documents once the
      // winner has committed, and is rejected here rather than applying a
      // second dot.
      const claim = await pendingCol().updateOne(
        { _id: pending._id, status: 'pending' },
        { $set: { status: 'resolved', outcome, resolved_by, updated_at: timestamp } },
        { session: dbSession },
      );
      if (claim.matchedCount === 0)
        throw new RouteResponse(409, { error: 'CONFLICT', message: 'Request is no longer pending', _needsEnrichment: true });

      if (pending.purchase_kind === 'merit') {
        // The same document shape, cap validation and self-healing
        // denormalised office_category write office-merit-dots.js already
        // performs on its own PUT.
        await meritDotsCol().updateOne(
          { _id: seatId },
          { $set: { [`dots.${pending.merit}`]: to, office_category: seat.office_category, updated_at: timestamp } },
          { session: dbSession, upsert: true },
        );
      } else {
        // The SAME clamped aggregation-pipeline update office-manoeuvre-rank
        // .js's /step route uses, not a read-then-write of `rank + 1`. The
        // pipeline form exists precisely because the read-then-write form
        // silently lost overlapping steps (Codex review, oxp.3). $ifNull makes
        // the upsert path behave identically to an existing document, and
        // $literal states that the category is a value, not a field path.
        const max = officeEntry.manoeuvres.length;
        await manoeuvreCol().updateOne(
          { _id: seatId },
          [
            { $set: { rank: { $min: [max, { $max: [0, { $add: [{ $ifNull: ['$rank', 0] }, 1] }] }] } } },
            { $set: { office_category: { $literal: seat.office_category }, updated_at: timestamp } },
          ],
          { session: dbSession, upsert: true },
        );
      }

      statusCode = 200;
      body = { ...pending, status: 'resolved', outcome, resolved_by, updated_at: timestamp };
    });
  } catch (err) {
    if (err instanceof RouteResponse) {
      statusCode = err.statusCode;
      body = err.body;
      if (body._needsEnrichment) {
        delete body._needsEnrichment;
        const fresh = await pendingCol().findOne({ _id: pending._id });
        Object.assign(body, _conflictBody(fresh));
      }
    } else throw err;
  } finally {
    await dbSession.endSession();
  }

  res.status(statusCode).json(body);
});

// PUT /api/office_purchase_requests/:id/decline
// ST-only. A pure state change: nothing was written to either purchase
// collection on submission, so there is nothing to unwind and no XP to refund.
router.put('/:id/decline', requireRole('st'), async (req, res) => {
  const pending = await _findPendingPurchase(req, res);
  if (!pending) return;

  const timestamp = new Date().toISOString();
  const declined_by = req.user.username;
  const result = await pendingCol().updateOne(
    { _id: pending._id, request_type: REQUEST_TYPE, status: 'pending' },
    { $set: { status: 'declined', declined_by, updated_at: timestamp } },
  );
  if (!result.matchedCount) {
    const fresh = await pendingCol().findOne({ _id: pending._id });
    return res.status(409).json(_conflictBody(fresh));
  }

  res.json({ declined: true, declined_by });
});

export default router;
