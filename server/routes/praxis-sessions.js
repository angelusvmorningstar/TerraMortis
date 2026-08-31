/**
 * Routes for the Praxis night board (Epic PRAX, story prax.1).
 * Collection: praxis_sessions - exactly ONE document per Chapter.
 *
 * Document shape and the reasoning behind it: server/schemas/praxis_session.schema.js.
 *
 * ═══ EVERY ROUTE IN THIS FILE IS ST-ONLY. THAT IS PERMANENT. ═══
 *
 * `requireRole('st')` (which also admits `dev`, the privacy-redacted ST login -
 * see middleware/auth.js) sits on all five handlers, and there is deliberately
 * no player-reachable path anywhere in this file. Praxis results must never be
 * player-visible, ever: Angelus's locked ruling for the whole epic, not a
 * placeholder posture to be relaxed later for a player-facing screen. Territory
 * Bids' own fuzzed `peekInfo()` player view is NOT ported here and must not be.
 *
 * The same constraint applies at the transport layer, which is why the WS
 * broadcaster this file calls is `broadcastPraxisUpdate` (ST/dev fan-out) and
 * not one of the open ones. A live claim/support frame reaching a player socket
 * would bypass this role gate entirely.
 *
 * ═══ WHAT IS AND IS NOT HERE ═══
 *
 * Opening and withdrawing claims, and assigning and unassigning supporters,
 * plus (prax.4a) resolving the People's Harpy tally and (prax.4b) resolving the
 * Praxis claim itself.
 *
 * Nothing renders (prax.2/prax.3 build the boards). Each `resolved.<tally>`
 * field has exactly ONE writer, and both live at the bottom of this file:
 * `resolved.harpy` is written by the sixth route (`POST /:id/resolve-harpy`,
 * prax.4a, a single-seat handover) and `resolved.praxis` by the seventh
 * (`POST /:id/resolve-praxis`, prax.4b, the Head of State mass-clear). The two
 * are structurally similar and deliberately independent: neither reads or
 * writes the other's half of the document, so resolving one tally leaves the
 * other fully live.
 */

import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getCollection, getClient } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { broadcastPraxisUpdate, broadcastPraxisResolved } from '../ws.js';
// prax.4a: the office-manoeuvre reset, extracted verbatim out of
// office-seats.js when this route became its second caller (AC1). This route
// cannot call `PUT /api/office_seats/:seatId/holder` over HTTP - it needs the
// seat handover AND the `resolved.harpy` snapshot in one transaction, and this
// codebase achieves cross-collection atomicity by writing inside a single
// transaction, never by one route invoking another. So the handover steps are
// reimplemented inline below; this one piece of arithmetic is shared rather
// than copied, because its stage order is load-bearing and a silent inversion
// has no visible symptom. See the module's own header.
import { resetManoeuvreRank } from '../lib/reset-manoeuvre-rank.js';
// The 24-hex id shape, reused rather than re-declared. Exactly the precedent
// office-seats.js's own `parseHolderId` set when it needed to validate a
// CHARACTER id: that module's stated reason for existing is that the pattern
// must live in one place, because a second, drifting copy is how one route
// starts accepting an id shape another rejects. Only the pattern is imported;
// `resolveOfficeSeat` itself has nothing to do with this collection.
import { SEAT_ID_PATTERN } from '../lib/office-seat-resolve.js';
// prax.4b: prax.0's headline derivation, reused rather than reimplemented. This
// route is the first real caller outside office-seats.js's own handover route.
// The PURE half is what is used below, not the querying half - see the note at
// the headline write for why this route has to supply a seat the winner does
// not hold a document for.
import { deriveCourtCategory } from '../lib/court-category.js';
// prax.4b: the Praxis tally is a City Status SUM, not a headcount, so freezing
// it needs the same arithmetic the board renders with. `city-status-calc.js`
// exists precisely to be importable from both sides (see its own header, and
// office-actions.js's authoritative budget check, the other server caller);
// `accessors.js` itself is NOT server-safe. `findRegentTerritory` is the same
// pure helper accessors.js resolves the regent-ambience component through.
import { calcEffectiveCityStatus } from '../../public/js/data/city-status-calc.js';
import { findRegentTerritory } from '../../public/js/data/helpers.js';

const router = Router();
const col = () => getCollection('praxis_sessions');

/** The two tallies. A literal whitelist, checked before any value reaches a
 *  computed Mongo field path below. */
const TALLIES = ['praxis', 'harpy'];

/**
 * prax.4a: the seat the Harpy tally hands over.
 *
 * `office_seats.seat_label`, NOT `court_category`: Socialite has TWO live seats
 * ('Harpy', appointed, and "People's Harpy", popular) whose holders' character
 * documents are indistinguishable from each other, which is the whole reason
 * the office_seats collection exists (see server/schemas/office_seat.schema.js).
 * Resolving on the category alone would hand over whichever of the two Mongo
 * returned first.
 *
 * A SECOND copy of the same literal, deliberately. public/js/admin/praxis-tab.js
 * carries its own `PEOPLES_HARPY_SEAT_LABEL` for the claim-card badge, and
 * nothing currently exports a constant across the client/server boundary in this
 * codebase; inventing a shared-constants module for one string is not warranted.
 * The straight apostrophe matches the real seeded data
 * (server/scripts/seed-office-seats.mjs) and must not be prettified into a
 * typographic one - the lookup below is an exact match.
 */
const PEOPLES_HARPY_SEAT_LABEL = "People's Harpy";

/** The office category both Socialite seats sit under. */
const SOCIALITE_CATEGORY = 'Socialite';

/**
 * prax.4b: the office a Praxis win confers.
 *
 * Written to `characters.court_category` / `court_title` only. This route does
 * NOT hand over a Head of State SEAT, and that is the epic's own ruled scope,
 * not an omission: the winner's HEADLINE flips to Head of State while
 * `office_seats` records only the seats they really sit in. See the headline
 * write below, and prax.0's own `server/lib/court-category.js`, which documents
 * that a dual-seat holder's headline and their held seats legitimately and
 * permanently disagree.
 */
const HEAD_OF_STATE_CATEGORY = 'Head of State';

/**
 * prax.4b: the APPOINTED Socialite seat, one of the three offices a Praxis win
 * mass-clears.
 *
 * `'City Harpy'`, NOT plain `'Harpy'`. The rename is this story's own
 * precondition (`server/scripts/rename-city-harpy-seat.mjs` for the live
 * document, `server/scripts/seed-office-seats.mjs`'s literal for a fresh seed)
 * and it exists for exactly one reason: the mass-clear query below has to tell
 * Socialite's two seats apart by `seat_label` alone, and a label that is a
 * PREFIX of the other one is not a safe thing to match on when the two must
 * never be confused. The popular seat, `PEOPLES_HARPY_SEAT_LABEL` above, is
 * never a member of the mass-clear set - it gets its own explicit branch.
 */
const CITY_HARPY_SEAT_LABEL = 'City Harpy';

/**
 * prax.4b: the two office categories a Praxis win clears wholesale, whoever
 * holds them.
 *
 * Primogen and Head of State are deliberately absent. The epic's locked game
 * rule: Primogen seats (and Territory Regent, which is not an office_seats
 * category at all) are not created by the Head of State and survive a Praxis
 * change untouched.
 */
const MASS_CLEAR_CATEGORIES = ['Enforcer', 'Administrator'];

/**
 * Every seat a Praxis resolution vacates: both mass-clear categories, plus the
 * ONE Socialite seat that is the City Harpy, filtered to seats somebody
 * actually holds.
 *
 * `holder_id: { $ne: null }` excludes an absent field as well as an explicit
 * null, which is what makes "occupied" mean occupied even on a document written
 * before the field was required.
 *
 * Built as a function rather than a frozen literal so no caller can mutate the
 * shared object it is about to hand to Mongo.
 */
function massClearFilter() {
  return {
    holder_id: { $ne: null },
    $or: [
      { office_category: { $in: MASS_CLEAR_CATEGORIES } },
      { office_category: SOCIALITE_CATEGORY, seat_label: CITY_HARPY_SEAT_LABEL },
    ],
  };
}

/**
 * A deliberate business rejection, thrown from a helper and caught by the
 * handler that called it. Same six-line local class office-seats.js defines for
 * its own file, and local for the same reason it gives: lifting it to a shared
 * module would touch an unrelated route for no behavioural gain, and two copies
 * used only by their own files cannot drift in any way a test would miss.
 */
class RouteResponse extends Error {
  constructor(statusCode, body) { super(body.message); this.statusCode = statusCode; this.body = body; }
}

/** Run a handler body, turning any thrown RouteResponse into its response. */
function handle(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof RouteResponse) return res.status(err.statusCode).json(err.body);
      throw err;
    }
  };
}

/**
 * Normalise a 24-hex id to lower case, or throw a 400 naming the field.
 *
 * Lower-casing is not cosmetic. Character ids are the KEYS of the support map
 * (see the schema's own note on why they must be strings), so an upper-case
 * request that was written through verbatim would mint a second key for a
 * supporter who already has one, and the "at most one assignment per tally"
 * guarantee would quietly stop being true.
 */
function normaliseId(raw, field) {
  if (typeof raw !== 'string' || !SEAT_ID_PATTERN.test(raw))
    throw new RouteResponse(400, {
      error: 'VALIDATION_ERROR',
      message: `${field} must be a 24-character hexadecimal id`,
    });
  return raw.toLowerCase();
}

/** Validate a `tally` value against the two literals. */
function parseTally(raw) {
  if (typeof raw !== 'string' || !TALLIES.includes(raw))
    throw new RouteResponse(400, {
      error: 'VALIDATION_ERROR',
      message: "tally must be either 'praxis' or 'harpy'",
    });
  return raw;
}

/**
 * `claimant_character_id`, normalised. Returns a 24-hex lower-case string, or
 * null to unassign.
 *
 * An ABSENT key is a 400, NOT a silent unassign. This is the same "absent key
 * and explicit null are different requests" discipline office-seats.js's
 * `parseHolderId` established in this codebase, and it matters more here than
 * it looks: a client bug that dropped the field from the body would otherwise
 * read as a deliberate "return this supporter to the pool", silently undoing an
 * assignment the ST had just made, with a cheerful 200.
 *
 * prax.4a reuses this function for `POST /:id/resolve-harpy`, where the same
 * field carries the same shape and the same absent-vs-null discipline but a
 * different MEANING for null ("dismiss the vote, no winner" rather than
 * "unassign"). Only that trailing clause is parameterised - the validation
 * itself stays a single implementation, so the two routes cannot drift into
 * accepting different id shapes or disagreeing about what an absent key means.
 */
const NULL_MEANS_UNASSIGN = 'null to return the supporter to the unassigned pool';

function parseClaimantId(body, nullMeaning = NULL_MEANS_UNASSIGN) {
  if (!body || typeof body !== 'object' || !('claimant_character_id' in body))
    throw new RouteResponse(400, {
      error: 'VALIDATION_ERROR',
      message: `claimant_character_id is required (a 24-character hexadecimal character id, or ${nullMeaning})`,
    });
  if (body.claimant_character_id === null) return null;
  return normaliseId(body.claimant_character_id, 'claimant_character_id');
}

/**
 * prax.4b: `confirmed_vacate_seat_ids`, normalised to a sorted, de-duplicated
 * array of lower-case 24-hex strings.
 *
 * REQUIRED on the resolve path, and required as an ARRAY even when it is empty.
 * An absent key is a 400 rather than an implicit "nothing to vacate", the same
 * absent-vs-explicit discipline `parseClaimantId` above enforces and for a
 * sharper version of the same reason: a client bug that dropped the field would
 * otherwise sail through the execute-time re-verification whenever the live set
 * happened to be empty, and silently fail whenever it was not. "The ST confirmed
 * that nobody is vacated" and "the client forgot to tell us" must not be the
 * same request.
 *
 * Sorted and de-duplicated here, once, so the comparison below is a plain
 * element-wise equality rather than set logic scattered across two call sites,
 * and so the array frozen into the historical record has a stable order.
 */
function parseConfirmedVacateSeatIds(body) {
  if (!body || typeof body !== 'object' || !('confirmed_vacate_seat_ids' in body))
    throw new RouteResponse(400, {
      error: 'VALIDATION_ERROR',
      message: 'confirmed_vacate_seat_ids is required when declaring a winner (an array of 24-character hexadecimal seat ids, empty if no office is currently held)',
    });
  const raw = body.confirmed_vacate_seat_ids;
  if (!Array.isArray(raw))
    throw new RouteResponse(400, {
      error: 'VALIDATION_ERROR',
      message: 'confirmed_vacate_seat_ids must be an array of 24-character hexadecimal seat ids',
    });
  const ids = raw.map(id => normaliseId(id, 'confirmed_vacate_seat_ids[]'));
  return [...new Set(ids)].sort();
}

/** Serialise one stored board for the JSON boundary: both id fields become
 *  strings, matching the shape praxis_session.schema.js validates. */
function serialiseBoard(doc) {
  if (!doc) return null;
  return { ...doc, _id: String(doc._id), chapter_id: String(doc.chapter_id) };
}

/** Load a board by its own `_id`, or throw a 404. */
async function loadBoard(rawId) {
  const id = normaliseId(rawId, 'praxis session id');
  const doc = await col().findOne({ _id: new ObjectId(id) });
  if (!doc) throw new RouteResponse(404, { error: 'NOT_FOUND', message: 'No praxis session with that id' });
  return doc;
}

/**
 * The live attendee pool for a board's Chapter.
 *
 * Sourced from `game_sessions.attendance[]`, filtered to `attended === true`,
 * for the session linked to this board's `chapter_id` (CM-6's 1:1 Chapter link,
 * enforced by that collection's own partial unique index). Angelus's ruling: no
 * separate Praxis roster exists or should exist, because Check-In already keeps
 * this list live-current and a second copy would be wrong within minutes.
 *
 * The `$in` on both id forms is not defensiveness for its own sake. Issue #497's
 * mixed ObjectId/string foreign key is still live in this database - it is the
 * exact reason `game_sessions.chapter_id_unique_notnull` lists BOTH BSON types
 * in its partial filter - so a lookup that queried only the ObjectId form would
 * silently find nothing for any session whose link predates `coerceChapterId`.
 *
 * @returns {Promise<Set<string>|null>} lower-cased attendee ids, or null when no
 *   session is linked to the Chapter at all. The two are genuinely different
 *   situations and the callers report them differently: an empty pool means
 *   nobody has been checked in yet, a null one means the ST has not paired a
 *   session with this Chapter.
 */
async function attendeePool(chapterId) {
  const oid = chapterId instanceof ObjectId ? chapterId : new ObjectId(String(chapterId));
  const session = await getCollection('game_sessions').findOne({
    chapter_id: { $in: [oid, String(oid)] },
  });
  if (!session) return null;
  const ids = (session.attendance || [])
    .filter(a => a && a.attended === true)
    .map(a => String(a?.character_id || '').toLowerCase())
    .filter(id => SEAT_ID_PATTERN.test(id));
  return new Set(ids);
}

/**
 * Throw the right 400 unless `characterId` is a current attendee.
 * Shared by the claim route and the support route so the two cannot drift into
 * enforcing subtly different versions of the same rule.
 */
async function requireAttendee(board, characterId, field) {
  const pool = await attendeePool(board.chapter_id);
  if (pool === null)
    throw new RouteResponse(400, {
      error: 'VALIDATION_ERROR',
      message: 'No game session is linked to this chapter, so there is no attendee list to check against',
    });
  if (!pool.has(characterId))
    throw new RouteResponse(400, {
      error: 'VALIDATION_ERROR',
      message: `${field} is not a current attendee of this chapter's session`,
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// AC3. GET /api/praxis_sessions?chapter_id=<id>
// ─────────────────────────────────────────────────────────────────────────────
// Returns the board for that Chapter, or `null` if none has been opened yet.
//
// NULL, NOT 404, deliberately - the same convention ranking_ballots.js's own
// `GET /mine` uses. "No board opened yet" is a normal, expected state on every
// Chapter until the ST opens one, so a 404 would make the client's ordinary
// first read look like an error and invite it to treat a genuine missing-route
// 404 as the same thing.
router.get('/', requireRole('st'), handle(async (req, res) => {
  const chapterId = normaliseId(String(req.query.chapter_id || ''), 'chapter_id');
  const doc = await col().findOne({ chapter_id: new ObjectId(chapterId) });
  res.json(serialiseBoard(doc));
}));

// ─────────────────────────────────────────────────────────────────────────────
// AC4. POST /api/praxis_sessions - body { chapter_id }
// ─────────────────────────────────────────────────────────────────────────────
// Opens a fresh board. Both tallies start empty and both `resolved` slots start
// null.
//
// No WS broadcast fires here, unlike the three write routes below, and that is
// a decision rather than an omission: nothing can be watching a board that did
// not exist a moment ago, so a frame would have no recipient with anything to
// refetch.
router.post('/', requireRole('st'), handle(async (req, res) => {
  const chapterId = normaliseId(req.body?.chapter_id, 'chapter_id');
  const chapterOid = new ObjectId(chapterId);

  const chapter = await getCollection('chapters').findOne({ _id: chapterOid });
  if (!chapter) throw new RouteResponse(404, { error: 'NOT_FOUND', message: 'No chapter with that id' });

  // The route-level half of the 1:1 invariant. The boot-time partial unique
  // index is the other half, and the catch below is where the two meet: a
  // second board created between this read and the insert loses on the index
  // instead of slipping through the gap.
  const existing = await col().findOne({ chapter_id: chapterOid });
  if (existing)
    throw new RouteResponse(409, {
      error: 'CONFLICT',
      message: 'A praxis session already exists for that chapter',
      // Named so the caller can fall straight through to a GET rather than
      // treating this as a hard failure - two STs opening the board at the same
      // moment is an ordinary Praxis-night race, not a bug either of them made.
      existing_id: String(existing._id),
    });

  const now = new Date().toISOString();
  const doc = {
    chapter_id: chapterOid,
    praxis: { claims: [], support: {} },
    harpy: { claims: [], support: {} },
    resolved: { praxis: null, harpy: null },
    created_at: now,
    updated_at: now,
  };

  try {
    const result = await col().insertOne(doc);
    res.status(201).json(serialiseBoard({ ...doc, _id: result.insertedId }));
  } catch (err) {
    // E11000 from the partial unique index: the read above lost a race. Same
    // duplicate-key-to-409 translation game-sessions.js's own
    // `isDuplicateChapterId` does, so the loser gets the same actionable answer
    // as if it had simply read second.
    if (err?.code === 11000) {
      const winner = await col().findOne({ chapter_id: chapterOid });
      throw new RouteResponse(409, {
        error: 'CONFLICT',
        message: 'A praxis session already exists for that chapter',
        existing_id: winner ? String(winner._id) : null,
      });
    }
    throw err;
  }
}));

// ─────────────────────────────────────────────────────────────────────────────
// AC5. POST /api/praxis_sessions/:id/claims - body { tally, character_id }
// ─────────────────────────────────────────────────────────────────────────────
// Opens a claim in one tally.
//
// A character MAY hold an open claim in BOTH tallies at once. There is no
// cross-tally exclusivity check here and there should not be one: standing for
// Head of State and standing for People's Harpy are independent decisions on the
// night, per the epic's ruled model. The 409 below is scoped to the SAME tally
// only.
router.post('/:id/claims', requireRole('st'), handle(async (req, res) => {
  const board = await loadBoard(req.params.id);
  const tally = parseTally(req.body?.tally);
  const characterId = normaliseId(req.body?.character_id, 'character_id');

  await requireAttendee(board, characterId, 'character_id');

  // Refused, not silently accepted twice. A duplicate is overwhelmingly likely
  // to be a double-tap on a touchscreen mid-session, and accepting it would put
  // two claim entries on one character that every downstream tally would then
  // have to de-duplicate.
  const claims = board[tally]?.claims || [];
  if (claims.some(c => c && c.character_id === characterId))
    throw new RouteResponse(409, {
      error: 'CONFLICT',
      message: `That character already has an open ${tally} claim on this board`,
    });

  const now = new Date().toISOString();
  const claim = { character_id: characterId, opened_at: now };
  // Filtered on the claim's ABSENCE as well as the board id, so a genuine
  // concurrent double-tap fails the filter rather than appending a second entry
  // the read above could not have seen.
  const result = await col().updateOne(
    { _id: board._id, [`${tally}.claims.character_id`]: { $ne: characterId } },
    { $push: { [`${tally}.claims`]: claim }, $set: { updated_at: now } },
  );
  if (result.matchedCount === 0)
    throw new RouteResponse(409, {
      error: 'CONFLICT',
      message: `That character already has an open ${tally} claim on this board`,
    });

  broadcastPraxisUpdate(board._id);
  res.status(201).json({ ok: true, tally, claim });
}));

// ─────────────────────────────────────────────────────────────────────────────
// AC6. DELETE /api/praxis_sessions/:id/claims/:characterId?tally=praxis|harpy
// ─────────────────────────────────────────────────────────────────────────────
// Withdraws a claim AND releases every supporter assigned to it, in ONE write.
//
// ═══ READ THIS BEFORE CHANGING THE UPDATE BELOW ═══
//
// The cascade is the single genuinely tricky invariant in this story. Angelus's
// ruling: a withdrawn claimant's supporters return to the UNASSIGNED pool, and
// are never auto-reassigned to anybody else - reassigning is an ST call, made
// explicitly through a fresh PUT /support.
//
// It is one aggregation-pipeline update, not a delete followed by a tidy-up,
// and that is load-bearing. Split across two writes, any failure between them
// leaves support entries pointing at a claimant who no longer has a claim: the
// board would still render those chips as supporting a claimant the tally can
// no longer see, and no read path would ever notice. A pipeline update rewrites
// both fields inside a single atomic document write, so the two facts cannot be
// observed out of step.
//
// The pre-image (`returnDocument: 'before'`) is how the response reports how
// many supporters were released. Nothing else records it: after the write, the
// entries are simply gone, and no later read could reconstruct the count.
router.delete('/:id/claims/:characterId', requireRole('st'), handle(async (req, res) => {
  const board = await loadBoard(req.params.id);
  const tally = parseTally(req.query.tally);
  const characterId = normaliseId(req.params.characterId, 'characterId');

  const result = await col().findOneAndUpdate(
    // The claim's PRESENCE is part of the filter, so withdrawing a claim that
    // is not open matches nothing and 404s below, rather than reporting a
    // cheerful success for a write that changed nothing.
    { _id: board._id, [`${tally}.claims.character_id`]: characterId },
    [
      {
        $set: {
          [`${tally}.claims`]: {
            $filter: {
              input: { $ifNull: [`$${tally}.claims`, []] },
              cond: { $ne: ['$$this.character_id', characterId] },
            },
          },
          // The cascade. `$objectToArray` -> filter out every pair whose VALUE
          // is the withdrawn claimant -> `$arrayToObject`. Filtering on `$$this.v`
          // (the claimant) and NOT `$$this.k` (the supporter) is the whole point:
          // the withdrawing character is a CLAIMANT here, and filtering on the
          // key would instead delete their own outgoing support for somebody
          // else while leaving all of their supporters stranded. A test pins that
          // exact inversion.
          //
          // The `$ifNull` guard matters because `$objectToArray` of a missing
          // field yields null, and the whole expression would then write `null`
          // over the support map rather than an empty object.
          [`${tally}.support`]: {
            $arrayToObject: {
              $filter: {
                input: { $objectToArray: { $ifNull: [`$${tally}.support`, {}] } },
                cond: { $ne: ['$$this.v', characterId] },
              },
            },
          },
          updated_at: { $literal: new Date().toISOString() },
        },
      },
    ],
    { returnDocument: 'before' },
  );

  if (!result)
    throw new RouteResponse(404, {
      error: 'NOT_FOUND',
      message: `That character has no open ${tally} claim on this board`,
    });

  const before = result[tally]?.support || {};
  const supporters_released = Object.values(before).filter(v => v === characterId).length;

  broadcastPraxisUpdate(board._id);
  res.json({ ok: true, tally, character_id: characterId, supporters_released });
}));

// ─────────────────────────────────────────────────────────────────────────────
// AC7. PUT /api/praxis_sessions/:id/support
// body { tally, supporter_character_id, claimant_character_id }
// ─────────────────────────────────────────────────────────────────────────────
// Assigns a supporter to a claimant, or (with an explicit null claimant) returns
// them to the unassigned pool.
//
// There is no separate "withdraw support" verb, and none is needed: a supporter
// has at most one assignment per tally, so reassigning simply overwrites the one
// key and `claimant_character_id: null` deletes it. One route, one key, one
// invariant - rather than two verbs that could each leave the map in a state the
// other did not expect.
router.put('/:id/support', requireRole('st'), handle(async (req, res) => {
  const board = await loadBoard(req.params.id);
  const tally = parseTally(req.body?.tally);
  const supporterId = normaliseId(req.body?.supporter_character_id, 'supporter_character_id');
  const claimantId = parseClaimantId(req.body);

  await requireAttendee(board, supporterId, 'supporter_character_id');

  // You cannot support somebody who is not standing. Checked against the OPEN
  // claims in this tally only - a claimant in the other tally is irrelevant here,
  // because the two tallies are never coupled.
  if (claimantId !== null) {
    const claims = board[tally]?.claims || [];
    if (!claims.some(c => c && c.character_id === claimantId))
      throw new RouteResponse(400, {
        error: 'VALIDATION_ERROR',
        message: `claimant_character_id has no open ${tally} claim on this board`,
      });
  }

  const now = new Date().toISOString();
  // The key is a validated 24-hex string, so this computed path carries nothing
  // a caller chose the shape of - no dot, no leading `$`, nothing that could
  // reach into a neighbouring field.
  const key = `${tally}.support.${supporterId}`;
  const update = claimantId === null
    ? { $unset: { [key]: '' }, $set: { updated_at: now } }
    : { $set: { [key]: claimantId, updated_at: now } };
  await col().updateOne({ _id: board._id }, update);

  broadcastPraxisUpdate(board._id);
  res.json({
    ok: true,
    tally,
    supporter_character_id: supporterId,
    claimant_character_id: claimantId,
  });
}));

// ─────────────────────────────────────────────────────────────────────────────
// prax.4a. POST /api/praxis_sessions/:id/resolve-harpy
// body { claimant_character_id: <24-hex string> | null }
// ─────────────────────────────────────────────────────────────────────────────
// Declares a winner of the People's Harpy vote, or dismisses the vote with no
// winner. ST-only, like every other route in this file.
//
// ═══ RUNS EXACTLY ONCE PER BOARD ═══
//
// `resolved.harpy` is a frozen historical record, not a mutable field. A second
// call is a 409 whichever branch it takes, compare-and-swap enforced: the
// existing value is read as a baseline OUTSIDE the transaction and the write
// inside it is filtered on that baseline still holding. Reading the baseline out
// here is load-bearing rather than stylistic, for exactly the reason
// office-seats.js's own handover route documents at length: `withTransaction`
// RE-RUNS its callback on any error MongoDB labels transient, so a filter built
// from an in-callback read would see the winner's freshly committed value on the
// retry and succeed, and two simultaneous resolves would both report 200.
//
// There is deliberately NO reversal path. Angelus's locked ruling at design-lock:
// a mistaken resolve is corrected by hand through the existing Court panel
// (`PUT /api/office_seats/:seatId/holder`). A real undo would have to precisely
// reverse `resetManoeuvreRank`'s destroyed-XP counter, and a half-correct
// reversal is worse than none.
//
// ═══ WHAT THIS ROUTE DOES NOT TOUCH ═══
//
//   - `harpy.claims` / `harpy.support`. NOT cleared, NOT mutated. The board keeps
//     its full claim and support history forever, alongside the frozen snapshot;
//     prax.4a adds a read-only summary of that data, never a wipe.
//   - `resolved.praxis`, and every Praxis-side field. The Praxis tally stays
//     fully live after a Harpy resolve. prax.4b owns that half.
//   - The OTHER Socialite seat (plain 'Harpy', appointed). Only the seat labelled
//     "People's Harpy" changes hands here.
//   - `office_merit_dots`. Permanent merits survive a handover by construction -
//     a seat's `_id` never changes, so nothing has to be carried across.
router.post('/:id/resolve-harpy', requireRole('st'), handle(async (req, res) => {
  const board = await loadBoard(req.params.id);
  // Same absent-vs-explicit-null discipline as PUT /support: a client bug that
  // dropped the field would otherwise read as a deliberate dismissal, closing a
  // live vote with a cheerful 200 and no way back.
  const claimantId = parseClaimantId(req.body, 'null to dismiss the vote with no winner');

  // ── The CAS baseline, frozen before the transaction opens. ────────────────
  const baselineResolved = board.resolved?.harpy ?? null;
  if (baselineResolved !== null)
    throw new RouteResponse(409, {
      error: 'CONFLICT',
      message: "The People's Harpy vote on this board has already been resolved",
    });

  const dismissed = claimantId === null;
  const seats = getCollection('office_seats');
  const characters = getCollection('characters');

  let finalTally = 0;
  let seatOid = null;
  let baselineHolderId = null;

  if (!dismissed) {
    // You cannot declare a winner who was never standing. Checked against the
    // OPEN claims in the HARPY tally only; a Praxis claim is irrelevant here,
    // because the two tallies are never coupled.
    const openClaims = board.harpy?.claims || [];
    if (!openClaims.some(c => c && c.character_id === claimantId))
      throw new RouteResponse(400, {
        error: 'VALIDATION_ERROR',
        message: 'claimant_character_id has no open harpy claim on this board',
      });

    // The headcount, computed the same way praxis-tab.js's own `tallyFor` does
    // for this tally: one supporter, one vote, no City Status weighting and no
    // baseline vote for the claimant themselves. Taken from the board read
    // above, so the number frozen into the record is the one the ST was looking
    // at when they tapped.
    finalTally = Object.values(board.harpy?.support || {})
      .filter(assignedTo => String(assignedTo).toLowerCase() === claimantId)
      .length;

    // The seat, and its own CAS baseline, likewise read outside the
    // transaction. Resolved by `seat_label`, never by category alone.
    const baselineSeat = await seats.findOne({
      office_category: SOCIALITE_CATEGORY,
      seat_label: PEOPLES_HARPY_SEAT_LABEL,
    });
    // A seeding gap, not a normal runtime state: this seat is minted by
    // server/scripts/seed-office-seats.mjs and every office route already
    // assumes the seats it is asked to touch exist. Reported as a 500 with a
    // message that says where to look, rather than a 404 that would read to the
    // ST as "you asked for the wrong thing".
    if (!baselineSeat)
      throw new RouteResponse(500, {
        error: 'INTERNAL_ERROR',
        message: "No People's Harpy seat exists in office_seats, so the vote cannot be resolved. It is created by the office-seat seed script.",
      });
    seatOid = baselineSeat._id;
    baselineHolderId = baselineSeat.holder_id == null ? null : String(baselineSeat.holder_id);
  }

  const client = getClient();
  const dbSession = client.startSession();
  // Captured outside the callback and used only after the commit: responding
  // from inside would answer before the transaction had committed, and a retry
  // would then try to respond twice.
  let snapshot = null;
  try {
    await dbSession.withTransaction(async () => {
      const timestamp = new Date().toISOString();

      if (dismissed) {
        // No seat write, no character write, no manoeuvre reset. The vote is
        // formally closed so it does not sit "still open" forever, and nothing
        // else changes.
        snapshot = { dismissed: true, resolved_at: timestamp };
      } else {
        const winnerOid = new ObjectId(claimantId);

        // ── 1. Re-read the seat inside the session. ─────────────────────────
        // The outer read is not transactional: it cannot be trusted for the
        // current holder and cannot see a change that lands in between.
        const seat = await seats.findOne({ _id: seatOid }, { session: dbSession });
        if (!seat)
          throw new RouteResponse(500, {
            error: 'INTERNAL_ERROR',
            message: "No People's Harpy seat exists in office_seats, so the vote cannot be resolved. It is created by the office-seat seed script.",
          });
        const currentHolderId = seat.holder_id == null ? null : String(seat.holder_id);

        // ── 2. The winner's own character document must exist. ──────────────
        // Named as a CHARACTER 404, not a seat one: the seat was found, so a
        // message about the seat would send the ST looking in the wrong place.
        // Without this the seat would be handed to an id whose
        // `court_category` write silently matched nothing, leaving the two
        // facts this handover exists to keep in step contradicting each other.
        const winner = await characters.findOne({ _id: winnerOid }, { session: dbSession });
        if (!winner)
          throw new RouteResponse(404, { error: 'NOT_FOUND', message: 'No character with that id' });

        // ── 3. A winner who already holds a DIFFERENT seat is refused. ──────
        // Never cascaded, for the reason office-seats.js's own handover route
        // states: `court_category` is a single field, so silently assigning
        // somebody into a second seat would either overwrite their existing
        // office while leaving the FIRST seat's holder_id stale, or force this
        // route to modify a third document the caller never named. The ST
        // vacates the other seat first, through the Court panel.
        const conflicting = await seats.findOne(
          { holder_id: winnerOid, _id: { $ne: seatOid } },
          { session: dbSession },
        );
        if (conflicting) {
          const which = conflicting.seat_label
            ? `${conflicting.office_category} (${conflicting.seat_label})`
            : `${conflicting.office_category} (seat ${String(conflicting._id).slice(-6)})`;
          throw new RouteResponse(409, {
            error: 'CONFLICT',
            message: `That character already holds the ${which} seat. Vacate it first, then declare them here.`,
            conflicting_seat_id: String(conflicting._id),
            conflicting_office_category: conflicting.office_category,
            conflicting_seat_label: conflicting.seat_label ?? null,
          });
        }

        // ── 4. Claim the seat FIRST, before any other write. ────────────────
        // Compare-and-swap on the baseline holder captured outside the
        // transaction. Claiming the contested record first makes a race loser
        // fail cleanly, before it has touched anything else at all.
        //
        // `holder_id` is written as a real ObjectId, never a string: live
        // storage is BSON ObjectIds and a string would create the mixed
        // string/ObjectId foreign key office_seat.schema.js's 24-hex pattern
        // exists to prevent.
        const claimed = await seats.updateOne(
          { _id: seatOid, holder_id: baselineHolderId === null ? null : new ObjectId(baselineHolderId) },
          { $set: { holder_id: winnerOid } },
          { session: dbSession },
        );
        if (claimed.matchedCount === 0)
          throw new RouteResponse(409, {
            error: 'CONFLICT',
            message: 'This seat was changed by another handover - please retry',
          });

        // ── 5. Clear the departing holder, if there was one. ────────────────
        // CAS-filtered on THIS seat's category. A matchedCount of 0 is BENIGN,
        // not an error: it means their `court_category` had already moved
        // elsewhere by another route, and clearing it unconditionally would
        // wipe a legitimate newer assignment.
        //
        // Skipped when the departing holder IS the winner (an incumbent
        // re-elected). Clearing and then immediately re-setting the same
        // document would reach the same end state, but only because step 6
        // happens to run second; not writing it at all removes that ordering
        // dependency entirely.
        if (currentHolderId !== null && currentHolderId !== claimantId) {
          await characters.updateOne(
            { _id: new ObjectId(currentHolderId), court_category: SOCIALITE_CATEGORY },
            { $set: { court_category: null, court_title: null, updated_at: timestamp } },
            { session: dbSession },
          );
        }

        // ── 6. Set the incoming holder. ─────────────────────────────────────
        // The title is the SEAT LABEL, not the bare office category. The Court
        // panel's own PUT defaults an unsupplied title to the category because
        // an ST is standing there able to type a better one; this route never
        // collects a title at all, so it supplies the one that actually
        // describes what was just won rather than leaving the winner of the
        // People's Harpy vote titled merely "Socialite".
        //
        // `court_title` goes on the CHARACTER and only there. `seat_label` is
        // the SEAT's own permanent distinguisher and is never written here.
        await characters.updateOne(
          { _id: winnerOid },
          {
            $set: {
              court_category: SOCIALITE_CATEGORY,
              court_title: PEOPLES_HARPY_SEAT_LABEL,
              updated_at: timestamp,
            },
          },
          { session: dbSession },
        );

        // ── 7. The manoeuvre reset, last. ───────────────────────────────────
        // office-powers.md's ruling: manoeuvres reset to zero on every handover
        // and the XP spent on them is destroyed, not refunded. The shared module
        // is the only place that arithmetic exists.
        //
        // Skipped when the winner is the sitting holder being re-elected
        // (Angelus's ruling, 2026-09-01, deferred-work.md): a re-election is a
        // continuation of the same tenure, not a fresh one, mirroring step 5's
        // own same-holder skip above and office-seats.js's PUT /:seatId/holder
        // (AC4) treating a same-holder request as not a handover at all.
        if (currentHolderId !== claimantId) {
          await resetManoeuvreRank(String(seatOid), SOCIALITE_CATEGORY, timestamp, dbSession);
        }

        snapshot = {
          winner_character_id: claimantId,
          final_tally: finalTally,
          resolved_at: timestamp,
        };
      }

      // ── The snapshot, in the SAME transaction as everything above. ────────
      // Filtered on the frozen baseline, so a concurrent resolve loses here
      // rather than double-writing. `{ 'resolved.harpy': null }` matches a
      // missing field as well as an explicit null, so a board written before
      // the field existed is handled by the same filter.
      const written = await col().updateOne(
        { _id: board._id, 'resolved.harpy': null },
        { $set: { 'resolved.harpy': snapshot, updated_at: timestamp } },
        { session: dbSession },
      );
      if (written.matchedCount === 0)
        throw new RouteResponse(409, {
          error: 'CONFLICT',
          message: "The People's Harpy vote on this board has already been resolved",
        });
    });
  } finally {
    await dbSession.endSession();
  }

  broadcastPraxisUpdate(board._id);
  // No seat or character data in the response, deliberately: the client already
  // holds every character's current data and refetches the board through its
  // own established write-then-reread path, so resolving names here would be a
  // second implementation of what `nameFor()` already does client-side.
  res.json({ ok: true, dismissed, resolved: snapshot });
}));

// ─────────────────────────────────────────────────────────────────────────────
// prax.4b. POST /api/praxis_sessions/:id/resolve-praxis
// body { claimant_character_id: <24-hex string> | null,
//        confirmed_vacate_seat_ids: <array of 24-hex strings> }
// ─────────────────────────────────────────────────────────────────────────────
// Declares a winner of the Praxis claim - the new Head of State - or dismisses
// the vote with no winner. ST-only, like every other route in this file.
//
// Structurally this is `resolve-harpy` above with one difference that changes
// everything about it: the write set is a LIVE QUERY rather than one fixed seat.
// A Praxis win mass-clears every Enforcer, Administrator and City Harpy seat at
// once, so the route vacates an unknown number of offices belonging to people
// who are not in the room and are not watching the board.
//
// ═══ FULLY ATOMIC, DELIBERATELY - DO NOT "ALIGN" THIS WITH saveCourt ═══
//
// Every write below happens inside ONE transaction. The other multi-seat write
// path in this codebase, `public/js/admin/city-views.js`'s `saveCourt`, is
// deliberately NOT atomic: it loops independent `PUT /api/office_seats/:id/holder`
// calls and accepts partial completion, because an ST sitting at that panel can
// see what landed and simply finish the job. Nobody is sitting in front of THIS
// one in the same way - it fires from a single tap, clears offices belonging to
// several other players at once, and destroys each seat's manoeuvre XP as it
// goes. A half-applied mass-clear would leave some offices vacated, some not,
// and `resolved.praxis` still null, with no read path anywhere that would
// notice. The two shapes differ on purpose; converging them would be a
// regression in whichever direction it was done.
//
// ═══ RUNS EXACTLY ONCE PER BOARD ═══
//
// `resolved.praxis` is a frozen historical record, not a mutable field. A second
// call is a 409 whichever branch it takes, compare-and-swap enforced exactly as
// `resolve-harpy` documents at length: the baseline is read OUTSIDE the
// transaction and the write inside it is filtered on that baseline still
// holding, because `withTransaction` RE-RUNS its callback on any error MongoDB
// labels transient and a filter built from an in-callback read would see the
// winner's freshly committed value on the retry.
//
// ═══ THE CONFIRM LIST IS THE CAS BASELINE ═══
//
// The one genuine departure from `resolve-harpy`'s shape. The client shows the
// ST every office this resolution would vacate, and sends that exact list back
// on the request. The live query inside the transaction is the execute-time
// truth; the confirmed list is only ever the thing it is DIFFED AGAINST, never
// the write target. Any difference at all - a seat vacated by somebody else
// since the modal opened, or a seat newly filled - aborts with a 409 naming the
// CURRENT list, so the ST re-reads a fresh confirmation rather than either
// retrying blind or silently clearing offices they never saw.
//
// ═══ WHAT THIS ROUTE DOES NOT TOUCH ═══
//
//   - `praxis.claims` / `praxis.support`. NOT cleared, NOT mutated, the same
//     permanent-history posture prax.4a established for the Harpy side.
//   - `resolved.harpy`, and every Harpy-side field. The two tallies stay fully
//     independent; a Praxis resolve leaves a live Harpy vote live.
//   - PRIMOGEN seats, and Territory Regent. The epic's locked game rule: both
//     survive a Praxis change untouched. A winner who holds Primogen keeps the
//     seat and only their headline moves.
//   - `office_merit_dots`. Permanent merits survive a handover by construction -
//     a seat's `_id` never changes, so nothing has to be carried across.
//
// The Head of State SEAT (unlike the three lines above) IS touched - added
// during this story's own review (2026-08-30, confirmed with Angelus). The
// original spec said this route wrote only the winner's headline and left any
// Head of State seat document alone; that turned out to strand the new Head
// of State with no seat `resolveHeldSeat`/`resolveOfficeSeat` could ever
// match them to, since office purchases are seat-keyed (oxp.11) and Head of
// State has real purchasable content. See step 6b below.
router.post('/:id/resolve-praxis', requireRole('st'), handle(async (req, res) => {
  const board = await loadBoard(req.params.id);
  const claimantId = parseClaimantId(req.body, 'null to dismiss the vote with no winner');

  // ── The CAS baseline, frozen before the transaction opens. ────────────────
  const baselineResolved = board.resolved?.praxis ?? null;
  if (baselineResolved !== null)
    throw new RouteResponse(409, {
      error: 'CONFLICT',
      message: 'The Praxis claim on this board has already been resolved',
    });

  const dismissed = claimantId === null;
  const seats = getCollection('office_seats');
  const characters = getCollection('characters');

  let confirmedIds = [];

  if (!dismissed) {
    // You cannot declare a winner who was never standing. Checked against the
    // OPEN claims in the PRAXIS tally only; a Harpy claim is irrelevant here,
    // because the two tallies are never coupled.
    const openClaims = board.praxis?.claims || [];
    if (!openClaims.some(c => c && c.character_id === claimantId))
      throw new RouteResponse(400, {
        error: 'VALIDATION_ERROR',
        message: 'claimant_character_id has no open praxis claim on this board',
      });

    confirmedIds = parseConfirmedVacateSeatIds(req.body);
  }

  const client = getClient();
  const dbSession = client.startSession();
  // Captured outside the callback and used only after the commit: responding
  // from inside would answer before the transaction had committed, and a retry
  // would then try to respond twice. The two broadcast payloads are captured
  // the same way and for the same reason.
  let snapshot = null;
  let affectedSeatIds = [];
  let affectedCharacterIds = [];
  try {
    await dbSession.withTransaction(async () => {
      const timestamp = new Date().toISOString();
      // Re-initialised on every attempt: `withTransaction` re-runs its callback
      // on a transient error, and appending to arrays that survived the last
      // attempt would broadcast each affected id twice.
      affectedSeatIds = [];
      affectedCharacterIds = [];

      if (dismissed) {
        // No seat write, no character write, no manoeuvre reset, and the
        // mass-clear query is never run at all. The claim is formally closed so
        // it does not sit "still open" forever, and nothing else changes.
        snapshot = { dismissed: true, resolved_at: timestamp };
      } else {
        const winnerOid = new ObjectId(claimantId);

        // ── 1. The mass-clear set, queried LIVE inside the session. ─────────
        // This is the execute-time truth and the only thing the writes below
        // ever iterate. The request body's own list is never a write target.
        // Sorted by id so the 409 payload, the broadcast and the frozen record
        // all carry the same stable order.
        const liveSeats = (await seats.find(massClearFilter(), { session: dbSession }).toArray())
          .sort((a, b) => (String(a._id) < String(b._id) ? -1 : String(a._id) > String(b._id) ? 1 : 0));
        const liveIds = [...new Set(liveSeats.map(s => String(s._id).toLowerCase()))].sort();

        // ── 2. Diff it against what the ST actually confirmed. ──────────────
        // Any difference in either direction aborts. NO partial clear ever
        // happens on a mismatch: nothing has been written yet at this point,
        // which is why this check sits before every write rather than inside
        // the loop.
        const matches = liveIds.length === confirmedIds.length
          && liveIds.every((id, i) => id === confirmedIds[i]);
        if (!matches)
          throw new RouteResponse(409, {
            error: 'CONFLICT',
            message: 'The offices this resolution would vacate changed since the confirmation was opened. Review the updated list and confirm again.',
            // The CURRENT list, never the stale one the caller sent: the client
            // re-renders its confirmation from this and lets the ST retry
            // immediately, rather than closing back to the live board.
            current_vacate_seat_ids: liveIds,
            current_vacate: liveSeats.map(s => ({
              seat_id: String(s._id),
              office_category: s.office_category,
              seat_label: s.seat_label ?? null,
              holder_id: s.holder_id == null ? null : String(s.holder_id),
            })),
          });

        // ── 3. The winner's own character document must exist. ──────────────
        // Named as a CHARACTER 404, not a seat one, for the reason
        // resolve-harpy's own step 2 documents: a message about a seat would
        // send the ST looking in the wrong place. Read BEFORE any write, so
        // the tally below is computed against the pre-clear world.
        const winner = await characters.findOne({ _id: winnerOid }, { session: dbSession });
        if (!winner)
          throw new RouteResponse(404, { error: 'NOT_FOUND', message: 'No character with that id' });

        // ── 4. The frozen tally, computed BEFORE any write. ─────────────────
        // Order is load-bearing. The Praxis weighting is a City Status SUM, and
        // City Status includes a title bonus read off `court_category` - which
        // the mass-clear below is about to null on several of these very
        // characters. Computed after the clears, a supporter who happened to be
        // the sitting Enforcer would silently contribute less than the number
        // the ST was looking at when they tapped.
        //
        // The arithmetic is `praxis-tab.js`'s own `tallyFor` for this tally,
        // through the same shared `calcEffectiveCityStatus`: the claimant's own
        // City Status plus that of every character currently assigned to support
        // them. A claimant who is assigned to themselves is counted twice, once
        // as the claimant and once as their own supporter, exactly as the board
        // renders it - which is why `tallyIds` is deliberately NOT deduplicated.
        // An id with no character document contributes 0, matching `statusFor`.
        const supporterIds = Object.entries(board.praxis?.support || {})
          .filter(([, assignedTo]) => String(assignedTo).toLowerCase() === claimantId)
          .map(([supporterId]) => String(supporterId).toLowerCase())
          .filter(id => SEAT_ID_PATTERN.test(id));
        const tallyIds = [claimantId, ...supporterIds];
        const tallyChars = await characters
          .find({ _id: { $in: [...new Set(tallyIds)].map(id => new ObjectId(id)) } }, { session: dbSession })
          .toArray();
        const tallyCharById = new Map(tallyChars.map(c => [String(c._id).toLowerCase(), c]));
        const territories = await getCollection('territories').find({}, { session: dbSession }).toArray();
        const finalTally = tallyIds.reduce((sum, id) => {
          const c = tallyCharById.get(id);
          if (!c) return sum;
          return sum + (calcEffectiveCityStatus(c, findRegentTerritory(territories, c)?.ambience) || 0);
        }, 0);

        // ── 5. The mass-clear. ─────────────────────────────────────────────
        // Applies UNIFORMLY, whether the departing holder is a third party or
        // the winner themselves. The winner holding one of these three seats is
        // an ordinary case, not a special one - prax.0's exclusivity matrix says
        // Head of State cannot also hold Enforcer, Administrator or Socialite,
        // so their own seat has to go the same way as anybody else's. The only
        // place that case is treated differently at all is what the confirm
        // modal DISPLAYED beforehand.
        for (const seat of liveSeats) {
          const holderId = String(seat.holder_id).toLowerCase();

          // Compare-and-swap on the holder read a moment ago inside this same
          // session. A miss cannot happen under snapshot isolation, and is
          // treated as a hard 409 rather than skipped: a seat that moved is
          // exactly the situation the confirm-list diff above exists to refuse,
          // and quietly carrying on would produce the partial clear this route
          // must never leave behind.
          const cleared = await seats.updateOne(
            { _id: seat._id, holder_id: new ObjectId(holderId) },
            { $set: { holder_id: null } },
            { session: dbSession },
          );
          if (cleared.matchedCount === 0)
            throw new RouteResponse(409, {
              error: 'CONFLICT',
              message: 'A seat this resolution would vacate was changed by another handover - please retry',
              conflicting_seat_id: String(seat._id),
            });

          // Clear the departing holder's headline, CAS-filtered on THIS seat's
          // category. A matchedCount of 0 is BENIGN, not an error: it means
          // their `court_category` had already moved elsewhere by another route,
          // and clearing it unconditionally would wipe a legitimate newer
          // assignment. Same tolerance resolve-harpy's own step 5 documents.
          await characters.updateOne(
            { _id: new ObjectId(holderId), court_category: seat.office_category },
            { $set: { court_category: null, court_title: null, updated_at: timestamp } },
            { session: dbSession },
          );

          // office-powers.md's ruling: manoeuvres reset to zero on every
          // handover and the XP spent on them is destroyed, not refunded.
          // Vacating IS a handover - see the shared module's own header.
          await resetManoeuvreRank(String(seat._id), seat.office_category, timestamp, dbSession);

          affectedSeatIds.push(String(seat._id));
          affectedCharacterIds.push(holderId);
        }

        // ── 6. The winner's own People's Harpy seat, if they hold it. ───────
        // This seat is NEVER a member of the mass-clear query's match set (that
        // matches 'City Harpy', the appointed seat), so it needs its own
        // explicit branch rather than a query match.
        //
        // Gated on the SEAT's own `holder_id`, read inside the transaction, and
        // never on the confirm list. The story's own wording pairs that with
        // `winner.court_category === 'Socialite'`; the character-field CAS below
        // already carries that half of the test, and gating the SEAT write on a
        // headline that had drifted would strand a real seat under a new Head of
        // State - a combination prax.0's exclusivity matrix forbids outright.
        // The seat is the authoritative fact here, so the seat is what gates.
        const peoplesHarpy = await seats.findOne(
          { office_category: SOCIALITE_CATEGORY, seat_label: PEOPLES_HARPY_SEAT_LABEL },
          { session: dbSession },
        );
        // A missing seat is simply "the winner does not hold it" here, NOT the
        // 500 resolve-harpy raises. There the seat IS the thing being handed
        // over and its absence makes the whole request meaningless; here it is
        // one conditional extra step, and a Praxis resolve must not be blocked
        // by the state of a seat this contest is not about.
        if (peoplesHarpy && peoplesHarpy.holder_id != null
            && String(peoplesHarpy.holder_id).toLowerCase() === claimantId) {
          const vacated = await seats.updateOne(
            { _id: peoplesHarpy._id, holder_id: winnerOid },
            { $set: { holder_id: null } },
            { session: dbSession },
          );
          if (vacated.matchedCount === 0)
            throw new RouteResponse(409, {
              error: 'CONFLICT',
              message: "The winner's People's Harpy seat was changed by another handover - please retry",
              conflicting_seat_id: String(peoplesHarpy._id),
            });

          // Same benign-mismatch tolerance as the mass-clear's own character
          // write. The headline is overwritten with Head of State a few lines
          // below either way; this write exists so that a winner whose
          // `court_category` genuinely still reads Socialite does not carry a
          // stale People's Harpy title through the intervening moment.
          await characters.updateOne(
            { _id: winnerOid, court_category: SOCIALITE_CATEGORY },
            { $set: { court_category: null, court_title: null, updated_at: timestamp } },
            { session: dbSession },
          );

          await resetManoeuvreRank(String(peoplesHarpy._id), SOCIALITE_CATEGORY, timestamp, dbSession);
          affectedSeatIds.push(String(peoplesHarpy._id));
        }

        // ── 6b. The Head of State seat itself, handed over unconditionally. ─
        // FOUND DURING REVIEW (2026-08-30), confirmed with Angelus, not in the
        // original spec. Office purchases are SEAT-keyed (oxp.11), and Head of
        // State has real purchasable content (server/scripts/seed-office-content.js).
        // Writing only the winner's headline (step 7 below) and leaving this
        // seat's `holder_id` pointed at whoever held it before would strand the
        // new Head of State with no seat `resolveHeldSeat`/`resolveOfficeSeat`
        // can ever match them to - a genuine purchase-eligibility break, not a
        // cosmetic one. Winning Praxis makes the claimant the real, seat-holding
        // Head of State, the same way every other office in this file works.
        //
        // Unconditional, unlike the People's Harpy branch above: every Praxis
        // resolve wins this seat, where People's Harpy only transfers if the
        // winner happened to hold it already. A missing seat document (the
        // office was never seeded) is tolerated, not fatal - a Praxis resolve
        // must not be blocked by a seeding gap in an office this route does not
        // otherwise depend on.
        const headOfState = await seats.findOne(
          { office_category: HEAD_OF_STATE_CATEGORY },
          { session: dbSession },
        );
        if (headOfState) {
          const previousHolderId = headOfState.holder_id == null
            ? null
            : String(headOfState.holder_id).toLowerCase();
          // A no-op, not an error, when the winner already held it (re-declared
          // or somehow already seated) - clearing and re-setting the same
          // document would reach the same end state only because of ordering,
          // the same reasoning step 5's own skip-on-self-hold carries.
          if (previousHolderId !== claimantId) {
            const claimedHos = await seats.updateOne(
              { _id: headOfState._id, holder_id: headOfState.holder_id },
              { $set: { holder_id: winnerOid } },
              { session: dbSession },
            );
            if (claimedHos.matchedCount === 0)
              throw new RouteResponse(409, {
                error: 'CONFLICT',
                message: 'The Head of State seat was changed by another handover - please retry',
                conflicting_seat_id: String(headOfState._id),
              });

            if (previousHolderId !== null) {
              // Same benign-mismatch tolerance every other departing-holder
              // clear in this route uses: a matchedCount of 0 means their
              // headline had already moved elsewhere, not an error.
              await characters.updateOne(
                { _id: new ObjectId(previousHolderId), court_category: HEAD_OF_STATE_CATEGORY },
                { $set: { court_category: null, court_title: null, updated_at: timestamp } },
                { session: dbSession },
              );
              // Vacating IS a handover - office-powers.md's ruling applies to
              // the outgoing Head of State exactly as it does to everyone else
              // this route clears.
              await resetManoeuvreRank(String(headOfState._id), HEAD_OF_STATE_CATEGORY, timestamp, dbSession);
              affectedCharacterIds.push(previousHolderId);
            }
            affectedSeatIds.push(String(headOfState._id));
          }
        }

        // ── 7. The winner's headline. ──────────────────────────────────────
        // prax.0's derivation, reused rather than reimplemented - but through
        // its PURE half, `deriveCourtCategory`, rather than the querying
        // `deriveCourtHeadlineForHolder`. That is not a shortcut: this story
        // hands over no Head of State SEAT (the epic's own ruled scope), so a
        // derivation that read only the seats the winner really holds would
        // return Primogen, or null, and never the office they just won. The
        // held seats are read live inside the session - AFTER every clear above,
        // so a seat the winner just lost is genuinely gone from the list - and
        // the won office is supplied alongside them.
        //
        // Head of State is the TOP of `COURT_CATEGORY_PRECEDENCE`, so it always
        // wins the derivation, and `seatTitle` is therefore always the title
        // that lands. A winner who holds Primogen keeps that seat's `holder_id`
        // completely untouched and only their headline moves - the one dual-hold
        // `mayHoldBothOffices` permits, and the reason a dual holder's headline
        // and one of their seats permanently disagree by design.
        const heldAfterClears = await seats.find({ holder_id: winnerOid }, { session: dbSession }).toArray();
        const derived = deriveCourtCategory(
          [...heldAfterClears, { office_category: HEAD_OF_STATE_CATEGORY }],
          { seatCategory: HEAD_OF_STATE_CATEGORY, seatTitle: HEAD_OF_STATE_CATEGORY },
        );
        await characters.updateOne(
          { _id: winnerOid },
          {
            $set: {
              court_category: derived.court_category,
              court_title: derived.court_title,
              updated_at: timestamp,
            },
          },
          { session: dbSession },
        );
        affectedCharacterIds.push(claimantId);

        snapshot = {
          winner_character_id: claimantId,
          final_tally: finalTally,
          // The confirmed, re-verified array, frozen. Identical to `liveIds` by
          // the time this line runs - the diff above is what makes that true -
          // and stored so the historical record says which offices this
          // resolution actually emptied, which nothing else records.
          vacated_seat_ids: confirmedIds,
          resolved_at: timestamp,
        };
      }

      // ── The snapshot, in the SAME transaction as everything above. ────────
      // Filtered on the frozen baseline, so a concurrent resolve loses here
      // rather than double-writing. `{ 'resolved.praxis': null }` matches a
      // missing field as well as an explicit null, so a board written before the
      // field existed is handled by the same filter.
      const written = await col().updateOne(
        { _id: board._id, 'resolved.praxis': null },
        { $set: { 'resolved.praxis': snapshot, updated_at: timestamp } },
        { session: dbSession },
      );
      if (written.matchedCount === 0)
        throw new RouteResponse(409, {
          error: 'CONFLICT',
          message: 'The Praxis claim on this board has already been resolved',
        });
    });
  } finally {
    await dbSession.endSession();
  }

  // The plain "this board changed" signal the Praxis board itself refetches on,
  // fired on BOTH paths exactly as every other write route in this file does.
  broadcastPraxisUpdate(board._id);
  // The richer frame, on a successful RESOLVE only. Nothing outside the Praxis
  // board needs to know about a dismissal: no seat changed hands, no character
  // moved, so there is nothing for the Office or City surfaces to refetch.
  if (!dismissed) {
    broadcastPraxisResolved(board._id, {
      affected_seat_ids: [...new Set(affectedSeatIds)],
      affected_character_ids: [...new Set(affectedCharacterIds)],
      resolved_office: HEAD_OF_STATE_CATEGORY,
    });
  }
  // No seat or character data in the response, deliberately: the client already
  // holds every character's current data and refetches through its own
  // established write-then-reread path, so resolving names here would be a
  // second implementation of what `nameFor()` already does client-side.
  res.json({ ok: true, dismissed, resolved: snapshot });
}));

export default router;
