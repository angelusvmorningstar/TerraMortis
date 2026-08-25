import { Router } from 'express';
import { getCollection, getClient } from '../db.js';
import { ObjectId } from 'mongodb';
import { validate } from '../middleware/validate.js';
import { officeActionSchema } from '../schemas/office_action.schema.js';
import { calcEffectiveCityStatus } from '../../public/js/data/city-status-calc.js';
import { findRegentTerritory } from '../../public/js/data/helpers.js';
import { currentCycleInGamePhase } from '../../public/js/downtime/cycle-phase.js';
import { isStRole, requireRole } from '../middleware/auth.js';

const PAID_TYPES = new Set(['raise', 'lower']);
const GATED_TYPES = new Set(['raise', 'lower', 'grant_first', 'strip_last']);

const router = Router();
const actionsCol  = () => getCollection('office_actions');
const pendingCol   = () => getCollection('contested_roll_requests');

// A deliberate business rejection thrown from inside a withTransaction()
// callback, or returned directly from a plain route handler. session.
// withTransaction only retries errors MongoDB itself labels transient — a
// plain thrown Error (this one included) aborts the transaction and
// propagates straight out, no spurious retry.
class RouteResponse extends Error {
  constructor(statusCode, body) { super(body.message); this.statusCode = statusCode; this.body = body; }
}

// issue-1143: the single source of truth for "what is the current game
// session" — used by GET /latest_session for display AND by POST / to
// derive the authoritative game_session_id server-side. A client-supplied
// game_session_id must never be trusted for budget/dedupe scoping.
async function findLatestSession() {
  const today = new Date().toISOString().slice(0, 10);
  return getCollection('game_sessions').findOne(
    { session_date: { $lte: today } },
    // oaq.2 review finding: a secondary sort on _id (insertion order) makes
    // ties on session_date deterministic — two game_sessions docs sharing a
    // date previously resolved to whichever the query happened to return
    // first (implementation-defined, not guaranteed stable), which surfaced
    // as genuine cross-file test flakiness once multiple test files started
    // seeding same-date sessions in the same shared tm_suite_test run.
    { sort: { session_date: -1, _id: -1 }, projection: { _id: 1, title: 1, session_date: 1, game_number: 1 } },
  );
}

// oaq.2: shared action-type precondition check, used at BOTH submission
// time (a courtesy rejection of an obviously-invalid request) and accept
// time (the real, authoritative check — against whatever status.city is
// AT APPROVAL, not whatever it was when the request was submitted; the
// target can legitimately change in between via another accepted action).
// Throws RouteResponse(400, ...) on an invalid transition; otherwise
// returns the new_status value.
function computeNewStatus(action_type, old_status) {
  if (action_type === 'grant_first') {
    if (old_status !== 0)
      throw new RouteResponse(400, { error: 'VALIDATION_ERROR', message: 'Target already has City Status' });
    return 1;
  }
  if (action_type === 'raise') {
    if (old_status >= 10)
      throw new RouteResponse(400, { error: 'VALIDATION_ERROR', message: 'Target is at max City Status' });
    return old_status + 1;
  }
  if (action_type === 'lower') {
    if (old_status <= 1)
      throw new RouteResponse(400, { error: 'VALIDATION_ERROR', message: 'Use strip_last to remove the final dot' });
    return old_status - 1;
  }
  if (action_type === 'strip_last') {
    if (old_status !== 1)
      throw new RouteResponse(400, { error: 'VALIDATION_ERROR', message: 'Target must be at exactly 1 City Status' });
    return 0;
  }
  throw new RouteResponse(400, { error: 'VALIDATION_ERROR', message: 'Unknown action_type' });
}

// oaq.3: builds the enriched 409 body (names who already resolved/declined a
// no-longer-pending record) from a freshly-read document. Shared by
// _findPending's own check AND by the inner concurrent-race branches inside
// accept/decline's transactions — a true simultaneous accept-vs-accept (or
// accept-vs-decline) race passes _findPending's initial read before either
// side has committed, so that check alone doesn't cover it; the loser's own
// matchedCount===0 branch re-reads the document to enrich its 409 the same
// way, closing the gap for the actual concurrent case (review finding).
function _conflictBody(doc) {
  const by = doc?.status === 'resolved' ? doc.resolved_by : doc?.status === 'declined' ? doc.declined_by : null;
  const message = by ? `Request is no longer pending — already ${doc.status} by ${by}` : 'Request is no longer pending';
  return { error: 'CONFLICT', message, resolved_by: doc?.resolved_by, declined_by: doc?.declined_by };
}

// oaq.2: shared lookup + pending-guard for the accept/decline routes,
// mirroring contested-rolls.js's own _findChallenge shape (AC8's race
// guard: reject 409 if the record is no longer pending by the time a
// mutating route reaches it).
async function _findPending(req, res) {
  let oid;
  try { oid = new ObjectId(req.params.id); }
  catch { res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid ID format' }); return null; }
  const doc = await pendingCol().findOne({ _id: oid, request_type: 'status_action' });
  if (!doc) { res.status(404).json({ error: 'NOT_FOUND' }); return null; }
  if (doc.status !== 'pending') {
    res.status(409).json(_conflictBody(doc));
    return null;
  }
  return doc;
}

// GET /api/office_actions/latest_session
// Returns the most recent game session (session_date <= today) so the client
// can scope budget checks and the public log to the active game.
router.get('/latest_session', async (req, res) => {
  const session = await findLatestSession();
  res.json(session || null);
});

// GET /api/office_actions/pending
// oaq.3: ST-only. Lists every pending Status Action for the approval-queue
// tab, oldest-first so nothing gets buried once a second pending-item type
// starts sharing this same collection. gdx.12: widened to also surface
// pending Humanity Checks (request_type: 'humanity_check') in the same
// queue, per office-approvals.js's own extension-point design — no second
// GET route, the client only ever calls this one.
router.get('/pending', requireRole('st'), async (req, res) => {
  const docs = await pendingCol()
    .find({ request_type: { $in: ['status_action', 'humanity_check'] }, status: 'pending' })
    .sort({ created_at: 1 })
    .toArray();
  res.json(docs);
});

// GET /api/office_actions?game_session_id=X[&actor_id=Y]
// Reads the APPLIED action log (office_actions) — pending/declined requests
// live in contested_roll_requests and are not surfaced here.
router.get('/', async (req, res) => {
  const { game_session_id, actor_id } = req.query;
  if (!game_session_id)
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'game_session_id required' });
  const filter = { game_session_id };
  if (actor_id) filter.actor_id = actor_id;
  const docs = await actionsCol().find(filter).sort({ timestamp: 1 }).toArray();
  res.json(docs);
});

// POST /api/office_actions
// oaq.2: submits a Status Action for ST review — no longer applies it.
// Validates everything that can be validated up front (auth, live session,
// game phase, actor/target existence and court office, and the action's
// precondition against the target's CURRENT status.city) so an obviously-
// invalid request is rejected immediately rather than silently queued to
// fail later — but the precondition is re-checked, authoritatively, again
// at accept time (see PUT /:id/accept), since the target can change between
// submission and approval.
router.post('/', validate(officeActionSchema), async (req, res) => {
  const { actor_id, target_id, action_type } = req.body;

  const callerCharIds = (req.user?.character_ids || []).map(String);
  if (!isStRole(req.user) && !callerCharIds.includes(String(actor_id)))
    return res.status(403).json({ error: 'FORBIDDEN', message: 'You may not act as this character' });

  const session = await findLatestSession();
  if (!session)
    return res.status(403).json({ error: 'FORBIDDEN', message: 'No active game session found' });
  const game_session_id = String(session._id);

  if (GATED_TYPES.has(action_type)) {
    const cycles = await getCollection('chapters').find().toArray();
    const liveCycle = currentCycleInGamePhase(cycles);
    if (!liveCycle)
      return res.status(403).json({ error: 'FORBIDDEN', message: 'No game session is currently in progress' });
  }

  let actorObjectId, targetObjectId;
  try { actorObjectId = new ObjectId(actor_id); }
  catch { return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid actor_id' }); }
  try { targetObjectId = new ObjectId(target_id); }
  catch { return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid target_id' }); }
  if (actorObjectId.equals(targetObjectId))
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Cannot target yourself' });

  const actor = await getCollection('characters').findOne({ _id: actorObjectId });
  if (!actor)
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Actor not found' });
  if (!actor.court_category)
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Actor holds no court office' });

  const target = await getCollection('characters').findOne({ _id: targetObjectId });
  if (!target)
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Target not found' });

  const old_status = target.status?.city || 0;
  try {
    computeNewStatus(action_type, old_status);
  } catch (err) {
    if (err instanceof RouteResponse) return res.status(err.statusCode).json(err.body);
    throw err;
  }

  // Product decision (2026-08-12): once a paid raise/lower on a
  // (actor, target) pair has been ACCEPTED this session, that same actor
  // cannot spend another budget slot on the same target again — a decline
  // is the only way to free up a retry, since a decline means nothing
  // actually happened. Checked here as a plain read: the pending-scoped
  // unique index below already makes the CONCURRENT-race case atomic (two
  // simultaneous submissions for the same actor+target can't both land as
  // pending), so by the time this check runs there is never a second
  // in-flight pending request to race against — only a real, already-
  // resolved history to consult. This also structurally closes an earlier
  // review finding: a second raise/lower could previously reach `accept`
  // and crash on a stale `office_actions` unique index built for the old
  // apply-immediately design; now it can never be submitted in the first
  // place.
  if (PAID_TYPES.has(action_type)) {
    const alreadyResolved = await pendingCol().findOne({
      request_type: 'status_action', game_session_id, actor_id, target_id,
      action_type: { $in: ['raise', 'lower'] }, status: 'resolved',
    });
    if (alreadyResolved)
      return res.status(409).json({ error: 'CONFLICT', message: 'You have already acted on this target this session' });
  }

  const timestamp = new Date().toISOString();
  const doc = {
    request_type: 'status_action',
    status:       'pending',
    outcome:      null,
    game_session_id,
    actor_id,
    actor_name:  actor.moniker  || actor.name  || actor_id,
    target_id,
    target_name: target.moniker || target.name || target_id,
    action_type,
    created_at: timestamp,
    updated_at: timestamp,
  };

  let inserted;
  try {
    inserted = await pendingCol().insertOne(doc);
  } catch (err) {
    if (err?.code === 11000)
      return res.status(409).json({ error: 'CONFLICT', message: 'A pending request already exists for this target' });
    throw err;
  }

  res.status(201).json({ request: { ...doc, _id: inserted.insertedId } });
});

// PUT /api/office_actions/:id/accept
// oaq.2: ST-only. Applies the effect for real — re-reads the target live,
// re-validates the action's precondition against its CURRENT status (not
// whatever it was at submission time), claims a budget slot (paid types
// only — budget spends on approval, never on submission, per this story's
// explicit decision), writes the target via the same compare-and-swap
// pattern issue-1143 established, logs the applied effect to
// office_actions (the same collection the client's per-session action log
// already reads via GET /), and marks the pending record resolved — all
// inside one MongoDB transaction so a failure at any step leaves nothing
// half-applied.
//
// Deliberately NOT re-checked here: the live game-phase gate. otc.2's rule
// governs SUBMISSION — an ST reviewing a queue is expected to work through
// it after the game session has ended, not necessarily while a game is
// still live. Re-requiring a live game at accept time would mean nothing
// could ever be approved once a session ends, defeating the point of a
// queue. Product decision, 2026-08-12, after internal review raised it as
// a question — confirmed no re-check wanted. By contrast, whether the
// actor still holds office at all IS re-checked (below): losing office
// entirely between submission and approval is a narrower, different case
// than "the game moved on".
router.put('/:id/accept', requireRole('st'), async (req, res) => {
  const pending = await _findPending(req, res);
  if (!pending) return;

  const client = getClient();
  const dbSession = client.startSession();
  let statusCode, body;
  try {
    await dbSession.withTransaction(async () => {
      const actorObjectId  = new ObjectId(pending.actor_id);
      const targetObjectId = new ObjectId(pending.target_id);

      const actor = await getCollection('characters').findOne({ _id: actorObjectId }, { session: dbSession });
      if (!actor) throw new RouteResponse(404, { error: 'NOT_FOUND', message: 'Actor not found' });
      // Internal review finding: the actor's authorization to hold office can
      // change between submission and approval (a handover, a removal) just
      // as legitimately as the target's status.city can — re-checked fresh
      // here for the same reason AC5 re-checks the target's precondition,
      // not trusted from whatever was true at submission time.
      if (!actor.court_category) throw new RouteResponse(403, { error: 'FORBIDDEN', message: 'Actor no longer holds a court office' });

      const target = await getCollection('characters').findOne({ _id: targetObjectId }, { session: dbSession });
      if (!target) throw new RouteResponse(404, { error: 'NOT_FOUND', message: 'Target not found' });

      const old_status = target.status?.city || 0;
      const new_status = computeNewStatus(pending.action_type, old_status);

      // review finding (external, verified live): a TRUE concurrent accept
      // race on the SAME pending record — both requests pass _findPending's
      // read before either commits — used to reach the office_actions
      // insertOne below on BOTH sides, and the second one crashed with an
      // uncaught E11000 on the old issue-1143 unique index (a raw
      // MongoServerError, not a RouteResponse, so it propagated as a bare
      // 500). Claiming the pending record HERE, before any other write,
      // means the losing side is rejected cleanly (its own updateOne
      // legitimately matches 0 documents once the winner has committed) and
      // never reaches the log insert or the budget/CAS writes at all.
      const timestamp = new Date().toISOString();
      const resolved_by = req.user.username;
      const resolveResult = await pendingCol().updateOne(
        { _id: pending._id, status: 'pending' },
        { $set: { status: 'resolved', outcome: { old_status, new_status }, resolved_by, updated_at: timestamp } },
        { session: dbSession },
      );
      if (resolveResult.matchedCount === 0)
        throw new RouteResponse(409, { error: 'CONFLICT', message: 'Request is no longer pending', _needsEnrichment: true });

      if (PAID_TYPES.has(pending.action_type)) {
        const territories = await getCollection('territories').find({}, { session: dbSession }).toArray();
        const regentAmbience = findRegentTerritory(territories, actor)?.ambience;
        const budget = calcEffectiveCityStatus(actor, regentAmbience);

        const budgetKey = `${pending.game_session_id}:${pending.actor_id}`;
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

      const logDoc = {
        game_session_id: pending.game_session_id,
        actor_id:    pending.actor_id,
        actor_name:  pending.actor_name,
        target_id:   pending.target_id,
        target_name: pending.target_name,
        action_type: pending.action_type,
        old_status,
        new_status,
        timestamp,
      };
      const insertedLog = await actionsCol().insertOne(logDoc, { session: dbSession });

      statusCode = 200;
      body = {
        request: { ...pending, status: 'resolved', outcome: { old_status, new_status }, resolved_by },
        action:  { ...logDoc, _id: insertedLog.insertedId },
        new_status,
      };
    });
  } catch (err) {
    if (err instanceof RouteResponse) {
      statusCode = err.statusCode;
      body = err.body;
      // review finding: this branch fires on a true concurrent-accept race
      // (both requests pass _findPending's read before either commits), so
      // _findPending's own enrichment never ran for the loser. The winner's
      // write is guaranteed committed by the time matchedCount is 0 (that's
      // the only way this filtered update can fail to match), so a plain
      // re-read here reliably sees it.
      if (body._needsEnrichment) {
        delete body._needsEnrichment;
        const fresh = await pendingCol().findOne({ _id: pending._id });
        Object.assign(body, _conflictBody(fresh));
      }
    }
    else throw err;
  } finally {
    await dbSession.endSession();
  }

  res.status(statusCode).json(body);
});

// PUT /api/office_actions/:id/decline
// oaq.2: ST-only. Marks the record declined. No character mutation, no
// budget claim (nothing was ever spent by a submission), no office_actions
// log entry (nothing happened).
router.put('/:id/decline', requireRole('st'), async (req, res) => {
  const pending = await _findPending(req, res);
  if (!pending) return;

  const timestamp = new Date().toISOString();
  const declined_by = req.user.username;
  const result = await pendingCol().updateOne(
    { _id: pending._id, status: 'pending' },
    { $set: { status: 'declined', declined_by, updated_at: timestamp } },
  );
  if (!result.matchedCount) {
    // review finding: true concurrent race with another accept/decline —
    // _findPending's own enrichment already ran before this update was
    // attempted, so re-read fresh to name whoever actually won.
    const fresh = await pendingCol().findOne({ _id: pending._id });
    return res.status(409).json(_conflictBody(fresh));
  }

  res.json({ declined: true, declined_by });
});

export default router;
