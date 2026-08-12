import { Router } from 'express';
import { getCollection } from '../db.js';
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

  // Load actor — must hold a court office
  const actor = await getCollection('characters').findOne({ _id: actorObjectId });
  if (!actor)
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Actor not found' });
  if (!actor.court_category)
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Actor holds no court office' });

  // Load target
  const target = await getCollection('characters').findOne({ _id: targetObjectId });
  if (!target)
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Target not found' });

  const old_status = target.status?.city || 0;
  let new_status;

  if (action_type === 'grant_first') {
    if (old_status !== 0)
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Target already has City Status' });
    new_status = 1;
  } else if (action_type === 'raise') {
    if (old_status >= 10)
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Target is at max City Status' });
    new_status = old_status + 1;
  } else if (action_type === 'lower') {
    if (old_status <= 1)
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Use strip_last to remove the final dot' });
    new_status = old_status - 1;
  } else if (action_type === 'strip_last') {
    if (old_status !== 1)
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Target must be at exactly 1 City Status' });
    new_status = 0;
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

  if (PAID_TYPES.has(action_type)) {
    // issue-1143 finding #3: budget + dedupe + write must be atomic enough
    // that a realistic concurrent-request race cannot exceed budget or
    // double-act on one target.
    //
    // This project's local dev/test MongoDB runs as a STANDALONE instance
    // (confirmed live via `hello`), not a replica set — multi-document
    // transactions are unavailable there even though Atlas (production)
    // supports them. Using session.withTransaction would make this route
    // untestable in this project's actual dev environment, so this uses an
    // insert-then-verify pattern instead, which works identically on both:
    //   1. A partial unique index on { game_session_id, actor_id, target_id }
    //      (scoped to action_type in [raise, lower] — see index creation in
    //      server/index.js) makes the per-target dedupe check ATOMIC: a
    //      second concurrent insert on the same target fails with E11000,
    //      not a racing findOne.
    //   2. Budget stays a derived count (the formula/model is unchanged —
    //      see story "What this story is NOT"). After a successful insert,
    //      this re-counts the actor's paid actions THIS session; if the
    //      insert pushed the count over budget, the insert is compensated
    //      (deleted) and the request rejected. Two concurrent inserts can
    //      both land, but each recount is a fresh, real read — at most
    //      `budget` of them keep their insert, the rest self-evict. This
    //      can occasionally over-reject right at the boundary (a legitimate
    //      request bounces and must be retried) but can never over-accept —
    //      the direction issue #1143 actually cares about.
    const territories = await getCollection('territories').find().toArray();
    const regentAmbience = findRegentTerritory(territories, actor)?.ambience;
    const budget = calcEffectiveCityStatus(actor, regentAmbience);

    let inserted;
    try {
      inserted = await col().insertOne(doc);
    } catch (err) {
      if (err?.code === 11000)
        return res.status(409).json({ error: 'CONFLICT', message: 'Target already acted on this session' });
      throw err;
    }

    const used = await col().countDocuments({
      game_session_id, actor_id, action_type: { $in: ['raise', 'lower'] },
    });
    if (used > budget) {
      await col().deleteOne({ _id: inserted.insertedId });
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Budget exhausted for this session' });
    }

    await getCollection('characters').updateOne(
      { _id: targetObjectId },
      { $set: { 'status.city': new_status, updated_at: timestamp } },
    );

    return res.status(201).json({ action: { ...doc, _id: inserted.insertedId }, new_status });
  }

  // grant_first / strip_last — no budget, and the old_status guard above
  // already makes a race harmless: both set a fixed target value (1 or 0),
  // not an increment, so a duplicate concurrent insert produces a redundant
  // log entry but never an inconsistent status.city.
  const inserted = await col().insertOne(doc);
  await getCollection('characters').updateOne(
    { _id: targetObjectId },
    { $set: { 'status.city': new_status, updated_at: timestamp } },
  );

  res.status(201).json({ action: { ...doc, _id: inserted.insertedId }, new_status });
});

export default router;
