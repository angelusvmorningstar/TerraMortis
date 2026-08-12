import { Router } from 'express';
import { getCollection, getClient } from '../db.js';
import { ObjectId } from 'mongodb';
import { validate } from '../middleware/validate.js';
import { officeActionSchema } from '../schemas/office_action.schema.js';
import { calcEffectiveCityStatus } from '../../public/js/data/city-status-calc.js';
import { findRegentTerritory } from '../../public/js/data/helpers.js';
import { currentCycleInGamePhase } from '../../public/js/downtime/cycle-phase.js';
import { isStRole } from '../middleware/auth.js';

const PAID_TYPES = new Set(['raise', 'lower']);
const GATED_TYPES = new Set(['raise', 'lower', 'grant_first', 'strip_last']);

const router = Router();
const col    = () => getCollection('office_actions');

// A deliberate business rejection thrown from inside a withTransaction()
// callback. session.withTransaction only retries errors MongoDB itself
// labels transient — a plain thrown Error (this one included) aborts the
// transaction and propagates straight out, no spurious retry.
class RouteResponse extends Error {
  constructor(statusCode, body) { super(body.message); this.statusCode = statusCode; this.body = body; }
}

// issue-1143: the single source of truth for "what is the current game
// session" — used by GET /latest_session for display AND by POST / to
// derive the authoritative game_session_id server-side. A client-supplied
// game_session_id must never be trusted for budget/dedupe scoping (finding
// #2 — it was previously the spoofable key resetting both checks).
async function findLatestSession() {
  const today = new Date().toISOString().slice(0, 10);
  return getCollection('game_sessions').findOne(
    { session_date: { $lte: today } },
    { sort: { session_date: -1 }, projection: { _id: 1, title: 1, session_date: 1, game_number: 1 } },
  );
}

// GET /api/office_actions/latest_session
// Returns the most recent game session (session_date <= today) so the client
// can scope budget checks and the public log to the active game.
router.get('/latest_session', async (req, res) => {
  const session = await findLatestSession();
  res.json(session || null);
});

// GET /api/office_actions?game_session_id=X[&actor_id=Y]
router.get('/', async (req, res) => {
  const { game_session_id, actor_id } = req.query;
  if (!game_session_id)
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'game_session_id required' });
  const filter = { game_session_id };
  if (actor_id) filter.actor_id = actor_id;
  const docs = await col().find(filter).sort({ timestamp: 1 }).toArray();
  res.json(docs);
});

// POST /api/office_actions
// Records a status power use and atomically updates target's status.city.
router.post('/', validate(officeActionSchema), async (req, res) => {
  const { actor_id, target_id, action_type } = req.body;

  // issue-1143 finding #1: actor_id must belong to the authenticated caller
  // (one of req.user.character_ids), or the caller must hold an ST role.
  // Checked first, before every other gate — "you may not act as this
  // character" is a more fundamental rejection than "no game is live" or
  // "that target is invalid." Reuses this project's existing ownership
  // pattern (isStRole + character_ids membership), the same shape as
  // isRegentOfTerritory and npcs.js's quick-add ownership check.
  const callerCharIds = (req.user?.character_ids || []).map(String);
  if (!isStRole(req.user) && !callerCharIds.includes(String(actor_id)))
    return res.status(403).json({ error: 'FORBIDDEN', message: 'You may not act as this character' });

  // issue-1143 finding #2: derive the authoritative game_session_id
  // server-side from the SAME query GET /latest_session already uses. The
  // client-supplied body field is never trusted for scoping — see
  // findLatestSession() above.
  const session = await findLatestSession();
  if (!session)
    return res.status(403).json({ error: 'FORBIDDEN', message: 'No active game session found' });
  const game_session_id = String(session._id);

  // otc.2 (2026-08-12): Status Actions must only fire while a game is live.
  // Mirrors the server-side convention already used elsewhere
  // (server/routes/downtime.js): cyclePhase called with no second argument
  // trusts the phase-aware lane only.
  if (GATED_TYPES.has(action_type)) {
    // otc.2 fix (2026-08-12, Codex review): identify the CURRENT cycle
    // (highest game_number) first, THEN test its phase. The original
    // filter-then-sort logic found the highest game_number AMONG
    // GAME-PHASE CYCLES ONLY, so a stale cycle left in game phase could
    // outrank a genuinely newer cycle that had moved on to prep/processing/
    // downtime — a live Supertest probe reproduced a real 201 that should
    // have been 403.
    const cycles = await getCollection('downtime_cycles').find().toArray();
    const liveCycle = currentCycleInGamePhase(cycles);
    if (!liveCycle)
      return res.status(403).json({ error: 'FORBIDDEN', message: 'No game session is currently in progress' });
  }

  // issue-1143 finding #4: resolve both ids to real ObjectIds BEFORE any
  // comparison — a hex-case-variant pair of the SAME id must not slip past
  // a raw string comparison. Both ids are parsed once here and reused below
  // instead of re-constructed per query.
  let actorObjectId, targetObjectId;
  try { actorObjectId = new ObjectId(actor_id); }
  catch { return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid actor_id' }); }
  try { targetObjectId = new ObjectId(target_id); }
  catch { return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid target_id' }); }
  if (actorObjectId.equals(targetObjectId))
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Cannot target yourself' });

  // issue-1143 finding #3 (and its own external/internal review follow-ups):
  // the whole read-modify-write sequence below — load actor/target, validate
  // the action, claim a budget slot, dedupe-insert the log entry, write the
  // target's new status.city — runs inside ONE MongoDB multi-document
  // transaction. This project's `MONGODB_URI` (root `.env`, read by
  // `server/config.js`) resolves to a genuine 3-node Atlas replica set, not
  // a standalone instance — confirmed live via `hello` against the EXACT
  // connection `npx vitest run` actually uses. (An earlier version of this
  // fix wrongly concluded transactions were unavailable, having tested a
  // hardcoded `127.0.0.1:27017` — a real but unrelated local mongod install
  // — instead of the project's actual configured connection; that
  // non-transactional insert-then-rank workaround had its own real gap,
  // caught by review: two requests racing for the last budget slot could
  // still both survive if one request's write became visible to the other's
  // recount later than expected, a genuine timing hazard on a WAN-connected
  // replica set. Transactions close this at the source instead of patching
  // around it.)
  //
  // Two things a transaction alone does NOT provide, both handled
  // explicitly:
  //   - Budget is a COUNT across many rows, and two transactions each
  //     reading a stale count and inserting distinct new documents don't
  //     conflict with each other by default (no shared document, so nothing
  //     to detect). Fixed by claiming a slot from a single per-(session,
  //     actor) counter document via an atomic conditional $inc — a genuine
  //     point of write contention, so two transactions racing for it force
  //     MongoDB to serialize them (one gets a transient conflict and
  //     `session.withTransaction()` retries it automatically, re-reading
  //     the now-current count).
  //   - The per-target dedupe for raise/lower is a SEQUENTIAL business rule
  //     ("already acted on this target this session"), not just a
  //     concurrency hazard — a second, later, non-overlapping request must
  //     also be rejected. The existing partial unique index on
  //     { game_session_id, actor_id, target_id } (raise/lower only —
  //     grant_first/strip_last never shared this dedupe, and folding them
  //     in would wrongly block a legitimate later raise after an earlier
  //     grant_first) still does this; a unique-index violation is a real
  //     constraint check, not a snapshot read, so it's reliable inside a
  //     transaction the same way it is outside one.
  //   - The target's status.city write is a compare-and-swap, not a blind
  //     $set — the update filter includes the exact `old_status` this
  //     request read. Belt-and-braces: a same-target race (two different
  //     actors, or two grant_first/strip_last attempts) was a real, live-
  //     reproduced bug in an EARLIER, non-transactional version of this
  //     fix (both requests could get 201, one silently overwriting the
  //     other). Once the whole read-modify-write sequence moved inside a
  //     transaction, repeated live testing (60+ iterations, both through
  //     the real HTTP route and via a raw driver-level probe with a forced
  //     read/write interleaving) could no longer reproduce a lost update
  //     even with a plain $set — MongoDB's own conflict-detection-and-retry
  //     already appears to cover it. The CAS filter is kept anyway: it
  //     turns the guarantee into something checkable by inspection (a write
  //     whose filter no longer matches gets an explicit 409) rather than
  //     resting on transaction retry semantics this session could not fully
  //     pin down with certainty, and it costs nothing extra to keep. With
  //     the CAS filter, a write whose target document no longer matches
  //     `old_status` matches zero documents — treated as a 409, telling the
  //     client the target moved under them and to retry, the same shape as
  //     the existing dedupe
  //     conflict response.
  const client = getClient();
  const dbSession = client.startSession();

  let statusCode, body;
  try {
    await dbSession.withTransaction(async () => {
      const actor = await getCollection('characters').findOne({ _id: actorObjectId }, { session: dbSession });
      if (!actor) throw new RouteResponse(404, { error: 'NOT_FOUND', message: 'Actor not found' });
      if (!actor.court_category) throw new RouteResponse(403, { error: 'FORBIDDEN', message: 'Actor holds no court office' });

      const target = await getCollection('characters').findOne({ _id: targetObjectId }, { session: dbSession });
      if (!target) throw new RouteResponse(404, { error: 'NOT_FOUND', message: 'Target not found' });

      const old_status = target.status?.city || 0;
      let new_status;

      if (action_type === 'grant_first') {
        if (old_status !== 0)
          throw new RouteResponse(400, { error: 'VALIDATION_ERROR', message: 'Target already has City Status' });
        new_status = 1;
      } else if (action_type === 'raise') {
        if (old_status >= 10)
          throw new RouteResponse(400, { error: 'VALIDATION_ERROR', message: 'Target is at max City Status' });
        new_status = old_status + 1;
      } else if (action_type === 'lower') {
        if (old_status <= 1)
          throw new RouteResponse(400, { error: 'VALIDATION_ERROR', message: 'Use strip_last to remove the final dot' });
        new_status = old_status - 1;
      } else if (action_type === 'strip_last') {
        if (old_status !== 1)
          throw new RouteResponse(400, { error: 'VALIDATION_ERROR', message: 'Target must be at exactly 1 City Status' });
        new_status = 0;
      }

      if (PAID_TYPES.has(action_type)) {
        const territories = await getCollection('territories').find({}, { session: dbSession }).toArray();
        const regentAmbience = findRegentTerritory(territories, actor)?.ambience;
        const budget = calcEffectiveCityStatus(actor, regentAmbience);

        const budgetKey = `${game_session_id}:${actor_id}`;
        const budgetCol = getCollection('office_action_budgets');
        await budgetCol.updateOne(
          { _id: budgetKey },
          { $setOnInsert: { used: 0 } },
          { session: dbSession, upsert: true },
        );
        const claim = await budgetCol.findOneAndUpdate(
          { _id: budgetKey, used: { $lt: budget } },
          { $inc: { used: 1 } },
          { session: dbSession, returnDocument: 'after' },
        );
        if (!claim)
          throw new RouteResponse(403, { error: 'FORBIDDEN', message: 'Budget exhausted for this session' });
      }

      const timestamp = new Date().toISOString();
      const doc = {
        game_session_id,
        actor_id,
        actor_name:  actor.moniker  || actor.name  || actor_id,
        target_id,
        target_name: target.moniker || target.name || target_id,
        action_type,
        old_status,
        new_status,
        timestamp,
      };

      // Compare-and-swap: the filter includes the exact old_status this
      // request read. If another action already changed the target since
      // then, this matches zero documents instead of silently overwriting
      // that other action's result — see the comment block above.
      // old_status was itself computed as `target.status?.city || 0`, so an
      // old_status of 0 can mean a genuinely-stored 0 OR a wholly-missing
      // `status`/`status.city` field — a dotted-path equality filter does
      // NOT match a missing field, so that case needs its own clause.
      const statusMatch = old_status === 0
        ? { $or: [{ 'status.city': { $exists: false } }, { 'status.city': 0 }] }
        : { 'status.city': old_status };
      const casResult = await getCollection('characters').updateOne(
        { _id: targetObjectId, ...statusMatch },
        { $set: { 'status.city': new_status, updated_at: timestamp } },
        { session: dbSession },
      );
      if (casResult.matchedCount === 0)
        throw new RouteResponse(409, { error: 'CONFLICT', message: 'Target was changed by another action — please retry' });

      let inserted;
      try {
        inserted = await col().insertOne(doc, { session: dbSession });
      } catch (err) {
        if (err?.code === 11000)
          throw new RouteResponse(409, { error: 'CONFLICT', message: 'Target already acted on this session' });
        throw err;
      }

      statusCode = 201;
      body = { action: { ...doc, _id: inserted.insertedId }, new_status };
    });
  } catch (err) {
    if (err instanceof RouteResponse) { statusCode = err.statusCode; body = err.body; }
    else throw err;
  } finally {
    await dbSession.endSession();
  }

  res.status(statusCode).json(body);
});

export default router;
