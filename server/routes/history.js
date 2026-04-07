import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getCollection } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { historyResponseSchema } from '../schemas/questionnaire.schema.js';

const router = Router();
const col = () => getCollection('history_responses');

function parseId(id) {
  try {
    return new ObjectId(id);
  } catch {
    return null;
  }
}

async function cascadeOrdealXp(charId, ordealName) {
  const chars = getCollection('characters');
  const now = new Date().toISOString();
  const upd = await chars.updateOne(
    { _id: charId, 'ordeals.name': ordealName },
    { $set: { 'ordeals.$.complete': true, 'ordeals.$.approved_at': now } }
  );
  if (upd.matchedCount === 0) {
    await chars.updateOne(
      { _id: charId },
      { $push: { ordeals: { name: ordealName, complete: true, approved_at: now } } }
    );
  }
}

// GET /api/history?character_id=...
router.get('/', async (req, res) => {
  const charId = req.query.character_id;
  if (!charId) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'character_id required' });

  const oid = parseId(charId);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid character_id format' });

  if (req.user.role === 'player') {
    const owns = (req.user.character_ids || []).some(id => id.toString() === oid.toString());
    if (!owns) return res.status(403).json({ error: 'FORBIDDEN', message: 'Not your character' });
  }

  const doc = await col().findOne({ character_id: oid });
  if (doc) return res.json(doc);

  // Fallback: historical import in ordeal_submissions
  const ordealSub = await getCollection('ordeal_submissions').findOne({
    character_id: oid,
    ordeal_type: 'character_history',
  });
  if (!ordealSub) return res.json(null);

  res.json({
    _id:           ordealSub._id,
    _source:       'ordeal_submission',
    character_id:  ordealSub.character_id,
    history_text:  ordealSub.responses?.[0]?.answer || '',
    source:        ordealSub.source,
    submitted_at:  ordealSub.submitted_at,
    status:        ordealSub.marking?.status === 'complete' ? 'approved' : 'submitted',
  });
});

// POST /api/history — create
router.post('/', validate(historyResponseSchema), async (req, res) => {
  const { character_id, responses } = req.body;
  if (!character_id) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'character_id required' });

  const charOid = parseId(character_id);
  if (!charOid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid character_id' });

  if (req.user.role === 'player') {
    const owns = (req.user.character_ids || []).some(id => id.toString() === charOid.toString());
    if (!owns) return res.status(403).json({ error: 'FORBIDDEN', message: 'Not your character' });
  }

  const existing = await col().findOne({ character_id: charOid });
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

// PUT /api/history/:id — update
router.put('/:id', async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid ID format' });

  const existing = await col().findOne({ _id: oid });
  if (!existing) return res.status(404).json({ error: 'NOT_FOUND', message: 'Response not found' });

  if (req.user.role === 'player') {
    const owns = (req.user.character_ids || []).some(id => id.toString() === existing.character_id.toString());
    if (!owns) return res.status(403).json({ error: 'FORBIDDEN', message: 'Not your character' });
    if (existing.status === 'approved') {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Approved history is locked' });
    }
  }

  const updates = { updated_at: new Date().toISOString() };
  if (req.body.responses !== undefined) updates.responses = req.body.responses;

  if (req.body.status === 'submitted') {
    updates.status = 'submitted';
    updates.submitted_at = updates.updated_at;
  } else if (req.body.status === 'approved' && req.user.role === 'st') {
    updates.status = 'approved';
    updates.approved_at = updates.updated_at;
  } else if (req.body.status === 'draft') {
    if (existing.status !== 'approved' || req.user.role === 'st') {
      updates.status = 'draft';
    }
  }

  const result = await col().findOneAndUpdate(
    { _id: oid },
    { $set: updates },
    { returnDocument: 'after' }
  );

  if (updates.status === 'approved' && existing.status !== 'approved') {
    await cascadeOrdealXp(existing.character_id, 'history');
  }

  res.json(result);
});

// GET /api/history/all — ST only
router.get('/all', requireRole('st'), async (req, res) => {
  const docs = await col().find().toArray();
  res.json(docs);
});

export default router;
