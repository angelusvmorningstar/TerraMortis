import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getCollection } from '../db.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();
const col = () => getCollection('players');

function parseId(id) {
  try {
    return new ObjectId(id);
  } catch {
    return null;
  }
}

// GET /api/players/me — current user's own player doc (any authenticated role)
router.get('/me', async (req, res) => {
  const player = await col().findOne({ _id: req.user.player_id });
  if (!player) return res.status(404).json({ error: 'NOT_FOUND', message: 'Player not found' });
  res.json(player);
});

// GET /api/players — list all players (ST only)
router.get('/', requireRole('st'), async (req, res) => {
  const players = await col().find().toArray();
  res.json(players);
});

// GET /api/players/:id — get one player (ST only)
router.get('/:id', requireRole('st'), async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid player ID format' });

  const player = await col().findOne({ _id: oid });
  if (!player) return res.status(404).json({ error: 'NOT_FOUND', message: 'Player not found' });

  res.json(player);
});

// POST /api/players — create a player (ST only)
router.post('/', requireRole('st'), async (req, res) => {
  const doc = req.body;
  if (!doc || !doc.discord_id) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: "Field 'discord_id' is required" });
  }

  // Prevent duplicate discord_id
  const existing = await col().findOne({ discord_id: doc.discord_id });
  if (existing) {
    return res.status(409).json({ error: 'CONFLICT', message: 'A player with this Discord ID already exists' });
  }

  const now = new Date().toISOString();
  const player = {
    discord_id: doc.discord_id,
    display_name: doc.display_name || '',
    role: doc.role || 'player',
    character_ids: (doc.character_ids || []).map(id => new ObjectId(id)),
    ordeals: doc.ordeals || {},
    created_at: now,
    last_login: now,
  };

  const result = await col().insertOne(player);
  const created = await col().findOne({ _id: result.insertedId });
  res.status(201).json(created);
});

// PUT /api/players/:id — update a player (ST only)
router.put('/:id', requireRole('st'), async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid player ID format' });

  const { _id, ...updates } = req.body;

  // Convert character_ids strings to ObjectIds if present
  if (updates.character_ids) {
    updates.character_ids = updates.character_ids.map(id => new ObjectId(id));
  }

  const result = await col().findOneAndUpdate(
    { _id: oid },
    { $set: updates },
    { returnDocument: 'after' }
  );

  if (!result) return res.status(404).json({ error: 'NOT_FOUND', message: 'Player not found' });
  res.json(result);
});

// DELETE /api/players/:id — delete a player (ST only)
router.delete('/:id', requireRole('st'), async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid player ID format' });

  const result = await col().deleteOne({ _id: oid });
  if (result.deletedCount === 0) return res.status(404).json({ error: 'NOT_FOUND', message: 'Player not found' });

  res.status(204).end();
});

export default router;
