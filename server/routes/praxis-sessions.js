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
 * Opening and withdrawing claims, and assigning and unassigning supporters.
 * Nothing renders (prax.2/prax.3 build the boards), and nothing resolves
 * (prax.4a/prax.4b own that). `resolved.praxis` and `resolved.harpy` are minted
 * as null by POST / and are never written again by any handler below.
 */

import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getCollection } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { broadcastPraxisUpdate } from '../ws.js';
// The 24-hex id shape, reused rather than re-declared. Exactly the precedent
// office-seats.js's own `parseHolderId` set when it needed to validate a
// CHARACTER id: that module's stated reason for existing is that the pattern
// must live in one place, because a second, drifting copy is how one route
// starts accepting an id shape another rejects. Only the pattern is imported;
// `resolveOfficeSeat` itself has nothing to do with this collection.
import { SEAT_ID_PATTERN } from '../lib/office-seat-resolve.js';

const router = Router();
const col = () => getCollection('praxis_sessions');

/** The two tallies. A literal whitelist, checked before any value reaches a
 *  computed Mongo field path below. */
const TALLIES = ['praxis', 'harpy'];

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
 */
function parseClaimantId(body) {
  if (!body || typeof body !== 'object' || !('claimant_character_id' in body))
    throw new RouteResponse(400, {
      error: 'VALIDATION_ERROR',
      message: 'claimant_character_id is required (a 24-character hexadecimal character id, or null to return the supporter to the unassigned pool)',
    });
  if (body.claimant_character_id === null) return null;
  return normaliseId(body.claimant_character_id, 'claimant_character_id');
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

export default router;
