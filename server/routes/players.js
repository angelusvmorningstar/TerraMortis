import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getCollection } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { playerSchema } from '../schemas/player.schema.js';

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
// discord_id is optional — a record can be pre-created with just a username;
// the numeric ID will be auto-filled when the player first logs in via OAuth.
router.post('/', requireRole('st'), validate(playerSchema), async (req, res) => {
  const doc = req.body;
  if (!doc || !doc.display_name) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: "Field 'display_name' is required" });
  }

  // Prevent duplicate discord_id (if provided)
  if (doc.discord_id) {
    const existing = await col().findOne({ discord_id: doc.discord_id });
    if (existing) {
      return res.status(409).json({ error: 'CONFLICT', message: 'A player with this Discord ID already exists' });
    }
  }

  // Prevent duplicate discord_username (if provided)
  if (doc.discord_username) {
    const existing = await col().findOne({ discord_username: doc.discord_username });
    if (existing) {
      return res.status(409).json({ error: 'CONFLICT', message: 'A player with this Discord username already exists' });
    }
  }

  const now = new Date().toISOString();
  const player = {
    discord_id:       doc.discord_id || null,
    discord_username: doc.discord_username || null,
    display_name:     doc.display_name,
    role:             doc.role || 'player',
    character_ids:    (doc.character_ids || []).map(id => new ObjectId(id)),
    ordeals:          doc.ordeals || {},
    created_at:       now,
    last_login:       null,
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
