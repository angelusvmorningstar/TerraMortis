import { Router } from 'express';
import { getCollection } from '../db.js';
import { ObjectId } from 'mongodb';
import { validate } from '../middleware/validate.js';
import { officeActionSchema } from '../schemas/office_action.schema.js';

const TITLE_STATUS_BONUS = {
  'Head of State': 3, 'Primogen': 2, 'Socialite': 1, 'Enforcer': 1, 'Administrator': 1,
};
const PAID_TYPES = new Set(['raise', 'lower']);

const router = Router();
const col    = () => getCollection('office_actions');

// GET /api/office_actions/latest_session
// Returns the most recent game session (session_date <= today) so the client
// can scope budget checks and the public log to the active game.
router.get('/latest_session', async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const session = await getCollection('game_sessions').findOne(
    { session_date: { $lte: today } },
    { sort: { session_date: -1 }, projection: { _id: 1, title: 1, session_date: 1, game_number: 1 } },
  );
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
  const { game_session_id, actor_id, target_id, action_type } = req.body;

  if (actor_id === target_id)
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Cannot target yourself' });

  // Load actor — must hold a court office
  let actor;
  try { actor = await getCollection('characters').findOne({ _id: new ObjectId(actor_id) }); }
  catch { return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid actor_id' }); }
  if (!actor)
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Actor not found' });
  if (!actor.court_category)
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Actor holds no court office' });

  // Budget + uniqueness checks for paid actions
  if (PAID_TYPES.has(action_type)) {
    const budget = (actor.status?.city || 0) + (TITLE_STATUS_BONUS[actor.court_category] || 0);
    const used = await col().countDocuments({
      game_session_id, actor_id, action_type: { $in: ['raise', 'lower'] },
    });
    if (used >= budget)
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Budget exhausted for this session' });
    const dup = await col().findOne({
      game_session_id, actor_id, target_id, action_type: { $in: ['raise', 'lower'] },
    });
    if (dup)
      return res.status(409).json({ error: 'CONFLICT', message: 'Target already acted on this session' });
  }

  // Load target
  let target;
  try { target = await getCollection('characters').findOne({ _id: new ObjectId(target_id) }); }
  catch { return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid target_id' }); }
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

  const inserted = await col().insertOne(doc);
  await getCollection('characters').updateOne(
    { _id: new ObjectId(target_id) },
    { $set: { 'status.city': new_status, updated_at: timestamp } },
  );

  res.status(201).json({ action: { ...doc, _id: inserted.insertedId }, new_status });
});

export default router;
