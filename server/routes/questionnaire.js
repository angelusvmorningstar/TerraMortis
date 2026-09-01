import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getCollection } from '../db.js';
import { requireRole, isStRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { questionnaireResponseSchema } from '../schemas/questionnaire.schema.js';
import { upsertOrdeal } from '../lib/ordeal-cascade.js';
import { requireOrdealNotRetiredForPlayers } from '../middleware/ordeal-retirement.js';

const router = Router();
const col = () => getCollection('questionnaire_responses');

function parseId(id) {
  try {
    return new ObjectId(id);
  } catch {
    return null;
  }
}

/**
 * Upsert an ordeal entry on a character's ordeals array and mark it complete.
 * If the ordeal already exists it is updated in place; otherwise appended.
 */
async function cascadeOrdealXp(charId, ordealName) {
  await upsertOrdeal(getCollection('characters'), charId, ordealName, new Date().toISOString());
}

// GET /api/questionnaire?character_id=... — get response for a character
// Players can only fetch their own characters' responses
router.get('/', async (req, res) => {
  const charId = req.query.character_id;
  if (!charId) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'character_id required' });

  const oid = parseId(charId);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid character_id format' });

  // Player: verify they own this character
  // 2026-09-01 general audit fix (Medium severity): was role === 'player',
  // which let a coordinator-role account read/edit any character's
  // questionnaire responses with no ownership check.
  if (!isStRole(req.user)) {
    const owns = (req.user.character_ids || []).some(id => id.toString() === oid.toString());
    if (!owns) return res.status(403).json({ error: 'FORBIDDEN', message: 'Not your character' });
  }

  const doc = await col().findOne({ character_id: { $in: [oid, oid.toString()] } });
  if (!doc) return res.json(null);
  res.json(doc);
});

// POST /api/questionnaire — create a new response (draft)
router.post('/', requireOrdealNotRetiredForPlayers, validate(questionnaireResponseSchema), async (req, res) => {
  const { character_id, responses } = req.body;
  if (!character_id) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'character_id required' });

  const charOid = parseId(character_id);
  if (!charOid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid character_id' });

  // Player: verify ownership
  // 2026-09-01 general audit fix (Medium severity): was role === 'player',
  // which let a coordinator-role account read/edit any character's
  // questionnaire responses with no ownership check.
  if (!isStRole(req.user)) {
    const owns = (req.user.character_ids || []).some(id => id.toString() === charOid.toString());
    if (!owns) return res.status(403).json({ error: 'FORBIDDEN', message: 'Not your character' });
  }

  // Prevent duplicates
  const existing = await col().findOne({ character_id: { $in: [charOid, charOid.toString()] } });
  if (existing) return res.status(409).json({ error: 'CONFLICT', message: 'Response already exists — use PUT to update' });

  const now = new Date().toISOString();
  const doc = {
    character_id: charOid,
    player_id: req.user.player_id,
    status: 'draft',
    responses: responses || {},
    created_at: now,
    updated_at: now,
    submitted_at: null,
  };

  const result = await col().insertOne(doc);
  const created = await col().findOne({ _id: result.insertedId });
  res.status(201).json(created);
});

// PUT /api/questionnaire/:id — update responses (save draft or submit)
// 2026-08-29: requireOrdealNotRetiredForPlayers was wired onto POST only when the
// retirement flag shipped (2026-08-25) — an oversight. A player could still edit or
// submit an EXISTING draft (6 non-approved live today) via this route, unblocked.
router.put('/:id', requireOrdealNotRetiredForPlayers, async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid ID format' });

  const existing = await col().findOne({ _id: oid });
  if (!existing) return res.status(404).json({ error: 'NOT_FOUND', message: 'Response not found' });

  // Player: verify ownership
  // 2026-09-01 general audit fix (Medium severity): was role === 'player',
  // which let a coordinator-role account read/edit any character's
  // questionnaire responses with no ownership check.
  if (!isStRole(req.user)) {
    const owns = (req.user.character_ids || []).some(id => id.toString() === existing.character_id.toString());
    if (!owns) return res.status(403).json({ error: 'FORBIDDEN', message: 'Not your character' });
  }

  // 2026-09-01 general audit fix: was role === 'player' — an approved
  // questionnaire should stay locked for anyone who isn't ST, not just
  // players (a coordinator has no more business re-editing an approved
  // response than a player does).
  if (!isStRole(req.user) && existing.status === 'approved') {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Approved questionnaire is locked' });
  }

  const updates = { updated_at: new Date().toISOString() };
  if (req.body.responses !== undefined) updates.responses = req.body.responses;

  if (req.body.status === 'submitted') {
    updates.status = 'submitted';
    updates.submitted_at = updates.updated_at;
  } else if (req.body.status === 'approved' && isStRole(req.user)) {
    updates.status = 'approved';
    updates.approved_at = updates.updated_at;
  } else if (req.body.status === 'draft') {
    // Only allow reverting to draft if not approved (or if ST/dev)
    if (existing.status !== 'approved' || isStRole(req.user)) {
      updates.status = 'draft';
    }
  }

  const result = await col().findOneAndUpdate(
    { _id: oid },
    { $set: updates },
    { returnDocument: 'after' }
  );

  // Cascade XP to character when newly approved
  if (updates.status === 'approved' && existing.status !== 'approved') {
    await cascadeOrdealXp(existing.character_id, 'questionnaire');
  }

  res.json(result);
});

// GET /api/questionnaire/all — ST only: list all responses
router.get('/all', requireRole('st'), async (req, res) => {
  const docs = await col().find().toArray();
  res.json(docs);
});

export default router;
