import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getCollection, getClient } from '../db.js';
import { isStRole, requireRole } from '../middleware/auth.js';
// oxp.5: ONLY the id pattern is reused from the shared resolver — see the long
// comment on PUT /:seatId/holder below for the two independent reasons
// `resolveOfficeSeat()` itself is not, and must not become, this route's seat
// lookup.
import { SEAT_ID_PATTERN } from '../lib/office-seat-resolve.js';

const router = Router();
const col = () => getCollection('office_seats');

// oxp.5: a deliberate business rejection thrown from inside a
// withTransaction() callback. Copied from office-actions.js's identical class
// (its own comment states the reason): `session.withTransaction` retries only
// errors MongoDB itself labels transient, so a plain thrown Error — this one
// included — aborts the transaction and propagates straight out with no
// spurious retry.
//
// Defined LOCALLY rather than lifted to a shared module, deliberately. Lifting
// it would touch office-actions.js, a 414-line transactional route this story
// otherwise leaves entirely alone, for no behavioural gain: the class is six
// lines with no logic in it, and the two copies cannot drift in any way a test
// would fail to notice, because each is used only by its own file. A shared
// module is the right call the first time a THIRD route needs it.
class RouteResponse extends Error {
  constructor(statusCode, body) { super(body.message); this.statusCode = statusCode; this.body = body; }
}

// Serialise one stored seat for the JSON boundary. `_id` and `holder_id` are
// real BSON ObjectIds in storage and become strings here, matching
// office_seat.schema.js's own documented convention (the schema validates the
// JSON-serialised form). A VACANT seat's `holder_id` is null and must stay
// null — the string 'null' would pass a truthiness check and silently point
// nowhere.
//
// `notes` is redacted to null for a non-ST caller (Codex review, oxp.2:
// office_seat.schema.js documents this field explicitly as "Provenance
// notes, ST caveats" — unlike its two sibling routes, which only ever expose
// numeric dot/rank data, this collection has a free-text field an ST might
// write something player-sensitive into). Angelus's ruling: keep the route
// open for every other field (needed by a future player-facing UI — that's
// still oxp.6/oxp.7's job), strip only `notes` rather than gating the whole
// route ST-only. `isStRole` also admits `dev` (the privacy-redacted ST
// login), matching every other ST-vs-everyone-else check in this codebase.
//
// oxp.5 extracted this from GET /'s inline map so the handover route below
// returns the SAME shape. The client caches the seat array and swaps the
// returned seat straight into it; two divergent serialisations would put a
// subtly different object into that cache.
function serialiseSeat(d, isSt) {
  return {
    ...d,
    _id: String(d._id),
    holder_id: d.holder_id == null ? null : String(d.holder_id),
    notes: isSt ? (d.notes ?? null) : null,
  };
}

// GET /api/office_seats
// Reference info, open to any authenticated user — the same posture as
// office-merit-dots.js and office-manoeuvre-rank.js, whose own GET / handlers
// are open reads with ST-gated writes. This router follows the same split: the
// read is open, and oxp.5's handover write below carries requireRole('st').
//
// Returns the full array of seat documents exactly as stored — no aggregation,
// no derived field. The XP arithmetic happens CLIENT-side in
// public/js/data/office-xp.js, from this array plus the two existing purchase
// routes, mirroring how office-tab.js already fetches office_merit_dots and
// office_manoeuvre_rank and computes from them. Derived values are never
// stored and, here, not even computed server-side, so there is exactly one
// implementation of the accrual rule and one place to test it.
//
// Seat CREATION and DELETION are still not exposed anywhere: `office_seats`
// documents are minted only by oxp.1's manual seed script
// (server/scripts/seed-office-seats.mjs). oxp.5 changes who HOLDS a seat,
// never which seats exist. In-app seat CRUD has no story home yet and is a
// known, recorded gap — see oxp.5's story file, "What this story is NOT".
router.get('/', async (req, res) => {
  const docs = await col().find({}).toArray();
  const st = isStRole(req.user);
  res.json(docs.map(d => serialiseSeat(d, st)));
});

/**
 * oxp.5: normalise and validate the request body's `holder_id`.
 * Returns a 24-hex lower-case string, or null for a vacate. Throws
 * RouteResponse(400) on anything else — including an ABSENT key, which is a
 * different request from an explicit `null` and must not be read as one.
 */
function parseHolderId(body) {
  if (!body || typeof body !== 'object' || !('holder_id' in body))
    throw new RouteResponse(400, { error: 'VALIDATION_ERROR', message: 'holder_id is required (a 24-character hexadecimal character id, or null to vacate)' });
  const raw = body.holder_id;
  if (raw === null) return null;
  // SEAT_ID_PATTERN is a bare 24-hex ObjectId-string shape, so it is the right
  // check for a CHARACTER id too. Reused rather than copied for the reason
  // office-seat-resolve.js's own header gives: a second, drifting copy of the
  // pattern is how one route starts accepting an id shape another rejects.
  if (typeof raw !== 'string' || !SEAT_ID_PATTERN.test(raw))
    throw new RouteResponse(400, { error: 'VALIDATION_ERROR', message: 'holder_id must be a 24-character hexadecimal character id, or null to vacate' });
  return raw.toLowerCase();
}

/**
 * oxp.5: normalise the optional `court_title`. Three distinct inputs, three
 * distinct meanings — the middle one is easy to collapse into the others by
 * accident, and doing so is what Codex review finding 5 caught:
 *
 *   - key ABSENT, or `null`  -> NOT SUPPLIED. Returns `null`. A handover
 *     defaults to the seat's office category; a same-holder request leaves the
 *     sitting holder's existing title alone rather than clobbering it.
 *   - `''` or whitespace     -> RESET TO DEFAULT. Returns `''`, which every
 *     branch resolves to the office category. This is what an ST clearing the
 *     title box means, and it must mean the same thing whether or not the
 *     holder happens to be changing in the same request.
 *   - any other string       -> that string, trimmed.
 *
 * Anything that is not a string, null or absent is a 400.
 */
function parseCourtTitle(body) {
  if (!body || !('court_title' in body) || body.court_title == null) return null;
  if (typeof body.court_title !== 'string')
    throw new RouteResponse(400, { error: 'VALIDATION_ERROR', message: 'court_title must be a string or null' });
  return body.court_title.trim();
}

/**
 * oxp.5: resolve a parsed `court_title` against the seat's office category.
 *
 * Defined once and used by BOTH the same-holder branch and the handover branch,
 * deliberately. Codex review finding 5: these two branches previously resolved
 * a blank title differently — the handover path did `requestedTitle || category`
 * (blank becomes the category) while the same-holder path wrote the empty
 * string through verbatim. The same logical input must not mean two things
 * depending on whether the holder changed.
 *
 * Returns `null` for "not supplied"; the caller decides what that means in its
 * own branch.
 */
function resolveCourtTitle(requestedTitle, category) {
  if (requestedTitle === null) return null;
  return requestedTitle || category;
}

// PUT /api/office_seats/:seatId/holder
// oxp.5. ST-only. Body: { holder_id: <24-hex string> | null, court_title?: <string|null> }.
//
// The ONE place a court office changes hands. It exists because who holds an
// office is currently TWO independent facts that agree only by luck:
//
//   - `characters.court_category`, the plain nullable enum that actually gates
//     behaviour today (office-actions.js's auth check, office-tab.js's
//     isOwnOffice, city-tab.js, admin/city-views.js's court list), and
//   - `office_seats.holder_id`, the seat-identity field oxp.1 introduced and
//     oxp.2's and oxp.11's client code depend on to work out WHICH seat's
//     purchase state to show.
//
// Angelus's ruling (2026-08-13, asked directly): do NOT derive `court_category`
// from the seat — that is a large refactor touching every read site. Build one
// transactional route that keeps the two in step atomically and leave every
// existing read site alone. This is that route. Every other reader of
// `court_category` is unchanged and stays correct.
//
// It also implements the handover half of content/rules/office-powers.md
// (umbrella root, Angelus's ruling 2026-08-11): "Permanent merits stay when the
// office changes hands... Manoeuvres reset to zero, and the XP spent on them is
// lost. Not refunded, not banked, gone." `office_merit_dots` is therefore
// touched NOWHERE in this file — merits persist by construction, because a
// seat's `_id` never changes (oxp.11's core guarantee) — while
// `office_manoeuvre_ranks` is reset below.
//
// WHY resolveOfficeSeat() IS NOT USED HERE, and must not be reintroduced by a
// later tidy-up (oxp.5 Finding 2):
//
//   It 400s any seat whose office has no `office_content` entry (oxp.10).
//   That is Administrator, until oxp.8 authors its content — and the
//   Administrator seat is real, filled (Ivana Horvat, since Game 5) and must
//   be handoverable. That refusal is CORRECT for a purchase route, which
//   cannot validate a merit or a rank without rules, and wrong for a
//   handover route, which needs no rules at all. A test pins that an
//   Administrator handover succeeds.
//
// Only its exported SEAT_ID_PATTERN is reused, so the 24-hex shape still lives
// in exactly one place — that module's own stated reason for existing. Do not
// relax `resolveOfficeSeat`'s office_content refusal to accommodate this
// route: two live callers depend on that refusal and oxp-3's and oxp-11's
// tests pin it. (oxp.10: `resolveOfficeSeat` gained an optional `{session}`
// parameter for callers inside a transaction — office-purchase.js uses it —
// but that is orthogonal to this file's own reason for not calling it at
// all; nothing about session support changes the Administrator refusal
// above.)
//
// WHY THE CHARACTER WRITES BYPASS PUT /api/characters/:id: that route's
// stripEphemeral -> validateCharacterPartial -> three normalise/validate
// middlewares chain is an Express middleware stack, and running one from
// inside a transaction callback is not something this codebase does anywhere.
// The only fields written here are `court_category` and `court_title`, two
// plain enum/string fields the partial schema already admits, and the values
// come from a seat document that AJV already validated on the way in — not
// from the request body. Atomicity across three collections is the point of
// the story and cannot be had through three separate HTTP-shaped writes.
router.put('/:seatId/holder', requireRole('st'), async (req, res) => {
  const rawSeatId = req.params.seatId;
  if (typeof rawSeatId !== 'string' || !SEAT_ID_PATTERN.test(rawSeatId))
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Seat id must be a 24-character hexadecimal office_seats id' });
  const seatOid = new ObjectId(rawSeatId.toLowerCase());

  let requestedHolderId, requestedTitle;
  try {
    requestedHolderId = parseHolderId(req.body);
    requestedTitle    = parseCourtTitle(req.body);
  } catch (err) {
    if (err instanceof RouteResponse) return res.status(err.statusCode).json(err.body);
    throw err;
  }

  // ── The CAS baseline, read BEFORE the transaction opens. ─────────────────
  // This mirrors office-actions.js's `_findPending`, which likewise reads its
  // record outside the transaction and then uses that outer-scope value in the
  // compare-and-swap inside it. Here the outer read is not merely convention,
  // it is load-bearing, and the reason is easy to miss:
  //
  //   `session.withTransaction` RE-RUNS its whole callback on any error
  //   MongoDB labels transient, and a genuine concurrent write to the same
  //   document is exactly such an error (WriteConflict). If the compare-and-swap
  //   below filtered on a holder read INSIDE the callback, the retry would
  //   re-read the seat, see the WINNER's freshly committed holder, filter on
  //   that instead, and succeed — so two simultaneous handovers would BOTH
  //   report 200 and the ladder would be reset twice. Capturing the baseline
  //   out here freezes it across retries, so the loser's filter still names the
  //   holder that was there before either request started, matches nothing, and
  //   fails cleanly as a 409.
  //
  // The seat is nonetheless re-read inside the transaction as well (step 1
  // below), because this outer read is not transactional: it cannot be trusted
  // for the category, and it cannot see a deletion that lands in between.
  const baselineSeat = await col().findOne({ _id: seatOid });
  if (!baselineSeat) return res.status(404).json({ error: 'NOT_FOUND', message: 'No office seat with that id' });
  const baselineHolderId = baselineSeat.holder_id == null ? null : String(baselineSeat.holder_id);

  const isSt = isStRole(req.user);
  const client = getClient();
  const dbSession = client.startSession();
  // Captured OUTSIDE the callback and sent after the commit, exactly as
  // office-actions.js's accept route does: responding from inside the callback
  // would answer before the transaction had actually committed, and a retry
  // would then try to respond twice.
  let statusCode, body;
  try {
    await dbSession.withTransaction(async () => {
      // ── 1. Read the seat, inside the session. ───────────────────────────
      const seat = await col().findOne({ _id: seatOid }, { session: dbSession });
      if (!seat) throw new RouteResponse(404, { error: 'NOT_FOUND', message: 'No office seat with that id' });

      const category = seat.office_category;
      const currentHolderId = seat.holder_id == null ? null : String(seat.holder_id);
      const timestamp = new Date().toISOString();

      const resolvedTitle = resolveCourtTitle(requestedTitle, category);

      // ── AC4. Same holder is not a handover. ────────────────────────────
      // Detected INSIDE the transaction, after the read above, so there is no
      // read-then-decide gap where another handover could land in between.
      //
      // This is a 200, not an error: the court panel re-sends any row an ST has
      // edited, and a title correction on a seat whose holder has not changed
      // arrives here. It must not be an error, and it must not be a handover.
      // Critically, no manoeuvre reset fires — re-saving the panel must never
      // be able to wipe a ladder.
      //
      // `null === null` (re-vacating an already-vacant seat) is the same
      // no-op, for the same reason.
      if (requestedHolderId === currentHolderId) {
        // Codex review finding 6: this branch used to do nothing at all unless a
        // title was supplied, so a seat whose holder_id was correct while the
        // character's own `court_category` had drifted stale would get a
        // cheerful 200 and stay contradictory — from the one route whose entire
        // purpose is keeping those two facts in step. It now always REPAIRS the
        // character to match the seat, and the seat is authoritative when they
        // disagree.
        //
        // Writes happen only where a field genuinely differs, so a repeated
        // save of an unchanged panel really is inert rather than merely
        // harmless: an unconditional $set would churn `updated_at` on every
        // save and make "nothing happened" indistinguishable from "something
        // did" for anyone reading the character document afterwards.
        let title_updated = false;
        let category_repaired = false;
        if (currentHolderId != null) {
          const holderOid = new ObjectId(currentHolderId);
          const holder = await getCollection('characters').findOne({ _id: holderOid }, { session: dbSession });
          if (holder) {
            // Not supplied leaves the sitting holder's own title alone, falling
            // back to the category only where they have none at all. A blank
            // title is a deliberate reset and resolves to the category, exactly
            // as it does on the handover path.
            const nextTitle = resolvedTitle !== null ? resolvedTitle : (holder.court_title || category);
            const set = {};
            if (holder.court_category !== category) { set.court_category = category; category_repaired = true; }
            if (holder.court_title !== nextTitle) { set.court_title = nextTitle; title_updated = true; }
            if (Object.keys(set).length) {
              await getCollection('characters').updateOne(
                { _id: holderOid },
                { $set: { ...set, updated_at: timestamp } },
                { session: dbSession },
              );
            }
          }
        }
        statusCode = 200;
        body = {
          seat: serialiseSeat(seat, isSt),
          handover: false,
          previous_holder_id: currentHolderId,
          manoeuvre_reset: null,
          departing_holder_cleared: false,
          title_updated,
          category_repaired,
        };
        return;
      }

      // ── 2. Read the incoming holder, inside the session. ───────────────
      let targetOid = null;
      if (requestedHolderId !== null) {
        targetOid = new ObjectId(requestedHolderId);
        const target = await getCollection('characters').findOne({ _id: targetOid }, { session: dbSession });
        // Names the CHARACTER, not the seat: the seat was found, so a 404 that
        // read "no office seat with that id" would send the ST looking in the
        // wrong place.
        if (!target) throw new RouteResponse(404, { error: 'NOT_FOUND', message: 'No character with that id' });

        // ── AC2. A target who already holds a DIFFERENT seat is refused. ──
        // Never cascaded, and this is the only correct option rather than mere
        // defensiveness. `court_category` is a single field, so a character can
        // only ever display one office. Silently assigning someone into a
        // second seat would either overwrite their existing `court_category`
        // while leaving the FIRST seat's `holder_id` stale — precisely the
        // class of staleness bug oxp.11 just fixed, relocated rather than
        // solved — or force this route to silently modify a THIRD document the
        // caller never named.
        //
        // Same refuse-rather-than-guess posture as oxp.1's seed script (which
        // refuses an unconfirmed date) and oxp.11's migration (which refuses
        // both the zero-seat and the ambiguous multi-seat case).
        //
        // NOT a conflict: a character whose `court_category` is set but who
        // holds no seat at all. The seat is authoritative and this route
        // overwrites that stale value. Stated as a decision, not an oversight.
        const conflicting = await col().findOne(
          { holder_id: targetOid, _id: { $ne: seatOid } },
          { session: dbSession },
        );
        if (conflicting) {
          const which = conflicting.seat_label
            ? `${conflicting.office_category} (${conflicting.seat_label})`
            : `${conflicting.office_category} (seat ${String(conflicting._id).slice(-6)})`;
          throw new RouteResponse(409, {
            error: 'CONFLICT',
            message: `That character already holds the ${which} seat. Vacate it first, then assign them here.`,
            conflicting_seat_id: String(conflicting._id),
            conflicting_office_category: conflicting.office_category,
            conflicting_seat_label: conflicting.seat_label ?? null,
          });
        }
      }

      // ── 4. Claim the seat FIRST, before any other write. ───────────────
      // Compare-and-swap on the seat's CURRENT holder. This ordering is the
      // specific lesson office-actions.js's accept route records in its own
      // comments: claiming the record late let a genuine concurrent race reach
      // a later write and crash, where claiming it first makes the loser fail
      // cleanly, before it has touched anything else at all.
      //
      // holder_id is written as a real ObjectId (or null), NEVER a string.
      // Live storage is BSON ObjectIds, and a string would silently create the
      // mixed string/ObjectId foreign key of data-map.md Known Drift Pattern
      // #2 — exactly what office_seat.schema.js's 24-hex pattern exists to
      // prevent.
      // The filter names `baselineHolderId`, captured before the transaction
      // opened — NOT `currentHolderId` from step 1's in-session read. See the
      // long comment on the baseline read above: filtering on the in-session
      // value would let a retried transaction re-read the winner's result and
      // succeed, so a genuine race would produce two 200s and two resets.
      const claim = await col().updateOne(
        { _id: seatOid, holder_id: baselineHolderId === null ? null : new ObjectId(baselineHolderId) },
        { $set: { holder_id: targetOid } },
        { session: dbSession },
      );
      if (claim.matchedCount === 0)
        throw new RouteResponse(409, { error: 'CONFLICT', message: 'This seat was changed by another handover — please retry' });

      // ── 5. Clear the departing holder, if there was one. ───────────────
      // CAS-filtered on THIS seat's category. A matchedCount of 0 here is
      // BENIGN, not an error: it means their `court_category` had already moved
      // elsewhere by another route, and clearing it unconditionally would wipe
      // a legitimate newer assignment. Reported in the response; never aborts.
      //
      // Skipped entirely when there was no departing holder. (The same-holder
      // case never reaches here — AC4 returned above.)
      let departingCleared = false;
      if (currentHolderId !== null) {
        const cleared = await getCollection('characters').updateOne(
          { _id: new ObjectId(currentHolderId), court_category: category },
          { $set: { court_category: null, court_title: null, updated_at: timestamp } },
          { session: dbSession },
        );
        departingCleared = cleared.matchedCount > 0;
      }

      // ── 6. Set the incoming holder. ────────────────────────────────────
      // An absent `court_title` on a real handover defaults to the seat's
      // office_category, matching what saveCourt() already does today
      // (`const title = titleInput?.value.trim() || cat`). The title is IGNORED
      // when the seat is being vacated — a vacant seat has nobody to title.
      //
      // `court_title` goes on the CHARACTER and only there. `seat_label` is the
      // SEAT's own permanent distinguisher ("Harpy" appointed vs "People's
      // Harpy" popular) and belongs to the seat, outliving every holder. They
      // look similar and are not equivalents: rewriting a seat's label during a
      // handover would destroy the one thing telling Socialite's two seats
      // apart. This route never writes seat_label. (oxp.5 Finding 3.)
      if (targetOid !== null) {
        await getCollection('characters').updateOne(
          { _id: targetOid },
          { $set: { court_category: category, court_title: resolvedTitle ?? category, updated_at: timestamp } },
          { session: dbSession },
        );
      }

      // ── 7. The manoeuvre reset, last. ──────────────────────────────────
      const manoeuvre_reset = await resetManoeuvreRank(rawSeatId.toLowerCase(), category, timestamp, dbSession);

      const updatedSeat = { ...seat, holder_id: targetOid };
      statusCode = 200;
      body = {
        seat: serialiseSeat(updatedSeat, isSt),
        handover: true,
        previous_holder_id: currentHolderId,
        manoeuvre_reset,
        departing_holder_cleared: departingCleared,
      };
    });
  } catch (err) {
    if (err instanceof RouteResponse) {
      statusCode = err.statusCode;
      body = err.body;
    } else throw err;
  } finally {
    await dbSession.endSession();
  }

  res.status(statusCode).json(body);
});

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
async function resetManoeuvreRank(seatId, category, timestamp, dbSession) {
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

export default router;
