// Generic ordeal responses API — handles Rules, Lore, and Covenant ordeals.
// These are player-level ordeals (stored per player, not per character).
// Collection: ordeal_responses, keyed by { player_id, ordeal_type }.

import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getCollection } from '../db.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();
const col = () => getCollection('ordeal_responses');

const VALID_TYPES = ['rules', 'lore', 'covenant'];

function parseId(id) {
  try {
    return new ObjectId(id);
  } catch {
    return null;
  }
}

// GET /api/ordeal-responses?type=rules — get current user's response for an ordeal type
router.get('/', async (req, res) => {
  const type = req.query.type;
  if (!type || !VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Valid type required: rules, lore, covenant' });
  }

  const playerId = req.user.player_id;

  // ST can optionally query another player's response
  const queryPlayerId = (req.user.role === 'st' && req.query.player_id)
    ? parseId(req.query.player_id)
    : playerId;

  const doc = await col().findOne({ player_id: queryPlayerId, ordeal_type: type });
  if (!doc) return res.json(null);
  res.json(doc);
});

// POST /api/ordeal-responses — create a new response
router.post('/', async (req, res) => {
  const { type, responses } = req.body;
  if (!type || !VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Valid type required' });
  }

  const playerId = req.user.player_id;

  const existing = await col().findOne({ player_id: playerId, ordeal_type: type });
  if (existing) return res.status(409).json({ error: 'CONFLICT', message: 'Response already exists — use PUT to update' });

  const now = new Date().toISOString();
  const doc = {
    player_id: playerId,
    ordeal_type: type,
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

// PUT /api/ordeal-responses/:id — update
router.put('/:id', async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid ID format' });

  const existing = await col().findOne({ _id: oid });
  if (!existing) return res.status(404).json({ error: 'NOT_FOUND', message: 'Response not found' });

  // Players can only edit their own, and not if approved
  if (req.user.role === 'player') {
    if (existing.player_id.toString() !== req.user.player_id.toString()) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Not your response' });
    }
    if (existing.status === 'approved') {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Approved ordeal is locked' });
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

  res.json(result);
});

// GET /api/ordeal-responses/all — ST only
router.get('/all', requireRole('st'), async (req, res) => {
  const filter = {};
  if (req.query.type) filter.ordeal_type = req.query.type;
  const docs = await col().find(filter).toArray();
  res.json(docs);
});

export default router;
