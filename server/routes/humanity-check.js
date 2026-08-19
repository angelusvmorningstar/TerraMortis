import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getCollection } from '../db.js';
import { validate } from '../middleware/validate.js';
import { isStRole, requireRole } from '../middleware/auth.js';
import { humanityCheckRequestSchema } from '../schemas/humanity_check_request.schema.js';
import { attachedTouchstoneCount } from '../../public/js/data/accessors.js';

const router = Router();
const col = () => getCollection('contested_roll_requests');

// gdx.12 (Breaking Points / Detachment, rulebook p.107-108) — dice-per-level
// table. Not a formula: floor/ceil on level/2 both disagree with level 1's
// literal "Zero Dice" entry, so this is an explicit lookup, not derived.
export const BASE_DICE_BY_LEVEL = {
  10: 5, 9: 5, 8: 4, 7: 4, 6: 3, 5: 3, 4: 2, 3: 2, 2: 1, 1: 0,
};

// p.108, "Suggested Modifiers for Detachment Rolls": attached Touchstone +2,
// multiple attached Touchstones +3, no [attached] Touchstones -2.
export function touchstoneModifier(attachedCount) {
  if (attachedCount >= 2) return 3;
  if (attachedCount === 1) return 2;
  return -2;
}

export function computeHumanityCheckPool(breakingPointLevel, touchstoneCount) {
  const base_dice = BASE_DICE_BY_LEVEL[breakingPointLevel];
  if (base_dice === undefined) {
    throw new Error('breaking_point_level must be an integer 1-10');
  }
  const touchstone_mod = touchstoneModifier(touchstoneCount);
  const pool = Math.max(0, base_dice + touchstone_mod);
  return { base_dice, touchstone_count: touchstoneCount, touchstone_mod, pool };
}

// POST /api/humanity_check_requests — player (or ST, on a character's
// behalf) submits a pending Humanity Check for ST review. No roll happens
// here; see PUT /:id/accept.
router.post('/', validate(humanityCheckRequestSchema), async (req, res) => {
  const { character_id } = req.body;

  const callerCharIds = (req.user?.character_ids || []).map(String);
  if (!isStRole(req.user) && !callerCharIds.includes(String(character_id)))
    return res.status(403).json({ error: 'FORBIDDEN', message: 'You may not act as this character' });

  let characterObjectId;
  try { characterObjectId = new ObjectId(character_id); }
  catch { return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid character_id' }); }

  const character = await getCollection('characters').findOne({ _id: characterObjectId });
  if (!character)
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Character not found' });

  const existing = await col().findOne({
    request_type: 'humanity_check', character_id, status: 'pending',
  });
  if (existing)
    return res.status(409).json({ error: 'CONFLICT', message: 'A Humanity Check is already pending for this character' });

  const timestamp = new Date().toISOString();
  const doc = {
    request_type: 'humanity_check',
    status:       'pending',
    outcome:      null,
    character_id,
    character_name: character.moniker || character.name || character_id,
    created_at: timestamp,
    updated_at: timestamp,
  };

  const result  = await col().insertOne(doc);
  const created = await col().findOne({ _id: result.insertedId });
  res.status(201).json(created);
});

// GET /api/humanity_check_requests/mine?character_id=X — resolved-but-not-
// yet-loaded Humanity Checks for one character. Scoped to a single character
// (not every resolved request in the collection) — used by the Roll tab's
// own "Load Humanity Check" affordance (AC7), which only ever cares about
// the currently-loaded roll character.
router.get('/mine', async (req, res) => {
  const { character_id } = req.query;
  if (!character_id || typeof character_id !== 'string')
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'character_id is required' });

  const callerCharIds = (req.user?.character_ids || []).map(String);
  if (!isStRole(req.user) && !callerCharIds.includes(String(character_id)))
    return res.status(403).json({ error: 'FORBIDDEN', message: 'You may not view this character\'s requests' });

  const docs = await col()
    .find({ request_type: 'humanity_check', character_id, status: 'resolved' })
    .sort({ updated_at: -1 })
    .toArray();
  res.json(docs);
});

// PUT /api/humanity_check_requests/:id/accept — ST-only. Computes and
// stores the pool; does not roll, does not touch the character document.
router.put('/:id/accept', requireRole('st'), async (req, res) => {
  const pending = await _findPending(req, res);
  if (!pending) return;

  const level = req.body?.breaking_point_level;
  if (!Number.isInteger(level) || level < 1 || level > 10)
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'breaking_point_level must be an integer 1-10' });

  let characterObjectId;
  try { characterObjectId = new ObjectId(pending.character_id); }
  catch { return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid character_id on request' }); }

  const character = await getCollection('characters').findOne({ _id: characterObjectId });
  if (!character)
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Character not found' });

  const touchstoneCount = attachedTouchstoneCount(character);
  const outcome = computeHumanityCheckPool(level, touchstoneCount);
  outcome.breaking_point_level = level;

  const timestamp = new Date().toISOString();
  const resolved_by = req.user.username;
  const result = await col().updateOne(
    { _id: pending._id, request_type: 'humanity_check', status: 'pending' },
    { $set: { status: 'resolved', outcome, resolved_by, updated_at: timestamp } },
  );
  if (!result.matchedCount)
    return res.status(409).json({ error: 'CONFLICT', message: 'Request is no longer pending' });

  res.json(await col().findOne({ _id: pending._id }));
});

// PUT /api/humanity_check_requests/:id/decline — ST-only.
router.put('/:id/decline', requireRole('st'), async (req, res) => {
  const pending = await _findPending(req, res);
  if (!pending) return;

  const timestamp = new Date().toISOString();
  const declined_by = req.user.username;
  const result = await col().updateOne(
    { _id: pending._id, request_type: 'humanity_check', status: 'pending' },
    { $set: { status: 'declined', declined_by, updated_at: timestamp } },
  );
  if (!result.matchedCount)
    return res.status(409).json({ error: 'CONFLICT', message: 'Request is no longer pending' });

  res.json({ declined: true, declined_by });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function _findPending(req, res) {
  let oid;
  try { oid = new ObjectId(req.params.id); } catch {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid ID format' });
    return null;
  }
  const doc = await col().findOne({ _id: oid, request_type: 'humanity_check' });
  if (!doc) { res.status(404).json({ error: 'NOT_FOUND' }); return null; }
  if (doc.status !== 'pending') {
    res.status(409).json({ error: 'CONFLICT', message: 'Request is no longer pending' });
    return null;
  }
  return doc;
}

export default router;
