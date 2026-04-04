import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getCollection } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { validateCharacter } from '../middleware/validateCharacter.js';

const router = Router();
const col = () => getCollection('characters');

function parseId(id) {
  try {
    return new ObjectId(id);
  } catch {
    return null;
  }
}

// GET /api/characters — ST gets all, player gets only their characters
router.get('/', async (req, res) => {
  if (req.user.role === 'st') {
    const chars = await col().find().toArray();
    return res.json(chars);
  }

  // Player: return only their linked characters
  const ids = (req.user.character_ids || []).map(id =>
    id instanceof ObjectId ? id : new ObjectId(id)
  );
  const chars = await col().find({ _id: { $in: ids } }).toArray();
  res.json(chars);
});

// GET /api/characters/names — lightweight list of all active character names (any authenticated user)
router.get('/names', async (req, res) => {
  const chars = await col()
    .find({ retired: { $ne: true } }, { projection: { name: 1, moniker: 1, honorific: 1, player: 1 } })
    .toArray();
  const sortName = c => (c.moniker || c.name).toLowerCase();
  chars.sort((a, b) => sortName(a).localeCompare(sortName(b)));
  res.json(chars);
});

// GET /api/characters/:id — ST gets any, player gets only their own
router.get('/:id', async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid character ID format' });

  // Player: check they own this character
  if (req.user.role === 'player') {
    const owns = (req.user.character_ids || []).some(id => id.toString() === oid.toString());
    if (!owns) return res.status(403).json({ error: 'FORBIDDEN', message: 'Not your character' });
  }

  const char = await col().findOne({ _id: oid });
  if (!char) return res.status(404).json({ error: 'NOT_FOUND', message: 'Character not found' });

  res.json(char);
});

// POST /api/characters/wizard — player creates their own character
router.post('/wizard', requireRole('player'), async (req, res) => {
  const players = getCollection('players');
  const player = await players.findOne({ _id: req.user.player_id });
  const existingIds = player?.character_ids || [];

  // First character is auto-approved; subsequent characters await ST sign-off
  const isFirst = existingIds.length === 0;

  const doc = { ...req.body };
  delete doc._id;
  doc.pending_approval = !isFirst;
  doc.retired = false;
  doc.created_at = new Date().toISOString();

  const result = await col().insertOne(doc);
  const created = await col().findOne({ _id: result.insertedId });

  // Link to player record
  await players.updateOne(
    { _id: req.user.player_id },
    { $push: { character_ids: result.insertedId } }
  );

  res.status(201).json(created);
});

// POST /api/characters — ST only
router.post('/', requireRole('st'), validateCharacter, async (req, res) => {
  const doc = req.body;
  if (!doc || !doc.name) return res.status(400).json({ error: 'VALIDATION_ERROR', message: "Field 'name' is required" });

  const result = await col().insertOne(doc);
  const created = await col().findOne({ _id: result.insertedId });
  res.status(201).json(created);
});

// PUT /api/characters/:id — ST only
router.put('/:id', requireRole('st'), validateCharacter, async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid character ID format' });

  const { _id, ...updates } = req.body;
  const result = await col().findOneAndUpdate(
    { _id: oid },
    { $set: updates },
    { returnDocument: 'after' }
  );

  if (!result) return res.status(404).json({ error: 'NOT_FOUND', message: 'Character not found' });
  res.json(result);
});

// DELETE /api/characters/:id — ST only
router.delete('/:id', requireRole('st'), async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid character ID format' });

  const result = await col().deleteOne({ _id: oid });
  if (result.deletedCount === 0) return res.status(404).json({ error: 'NOT_FOUND', message: 'Character not found' });

  res.status(204).end();
});

export default router;
