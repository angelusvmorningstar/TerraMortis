import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getCollection } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { npcSchema } from '../schemas/investigation.schema.js';

const router = Router();
const col = () => getCollection('npcs');

function parseId(id) {
  try { return new ObjectId(id); } catch { return null; }
}

// NPCR.7: player-readable NPC directory. Returns minimal fields for all
// active / pending NPCs so a player can pick one when creating a new edge
// from the Relationships tab. Must register BEFORE the ST-only router.use.
router.get('/directory', async (req, res) => {
  const docs = await col()
    .find(
      { status: { $in: ['active', 'pending'] } },
      { projection: { name: 1, description: 1, status: 1, is_correspondent: 1 } }
    )
    .sort({ name: 1 })
    .toArray();
  res.json(docs);
});

// DTOSL.2: player-readable endpoint (must register BEFORE the ST-only
// router.use below). Returns NPCs linked to the given character. The
// caller must own the character (character_ids contains the id). ST
// bypasses the ownership check.
router.get('/for-character/:characterId', async (req, res) => {
  const { characterId } = req.params;
  const userCharIds = (req.user?.character_ids || []).map(String);
  const isSt = req.user?.role === 'st' || req.user?.role === 'dev';
  if (!isSt && !userCharIds.includes(String(characterId))) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Not your character' });
  }
  const filter = {
    linked_character_ids: String(characterId),
    status: { $in: ['active', 'pending'] },
  };
  if (req.query.is_correspondent === 'true') {
    filter.is_correspondent = true;
  }
  const docs = await col().find(filter).sort({ name: 1 }).toArray();
  res.json(docs);
});

// All other NPC routes are ST-only
router.use(requireRole('st'));

// GET /api/npcs — list all, optionally filtered by cycle_id
router.get('/', async (req, res) => {
  const filter = {};
  if (req.query.cycle_id) {
    const oid = parseId(req.query.cycle_id);
    filter.$or = oid
      ? [{ linked_cycle_id: oid }, { linked_cycle_id: req.query.cycle_id }]
      : [{ linked_cycle_id: req.query.cycle_id }];
  }
  if (req.query.status) filter.status = req.query.status;
  const docs = await col().find(filter).sort({ name: 1 }).toArray();
  res.json(docs);
});

// POST /api/npcs
router.post('/', validate(npcSchema), async (req, res) => {
  const { name, description, status, linked_character_ids, linked_cycle_id, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'name required' });

  const doc = {
    name,
    description: description || '',
    status: status || 'active',
    linked_character_ids: linked_character_ids || [],
    linked_cycle_id: linked_cycle_id ? (parseId(String(linked_cycle_id)) || linked_cycle_id) : null,
    notes: notes || '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const result = await col().insertOne(doc);
  const created = await col().findOne({ _id: result.insertedId });
  res.status(201).json(created);
});

// PUT /api/npcs/:id
router.put('/:id', async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid ID' });

  const { _id, ...updates } = req.body;
  updates.updated_at = new Date().toISOString();

  const result = await col().findOneAndUpdate({ _id: oid }, { $set: updates }, { returnDocument: 'after' });
  if (!result) return res.status(404).json({ error: 'NOT_FOUND', message: 'NPC not found' });
  res.json(result);
});

// DELETE /api/npcs/:id (archive = set status to 'archived')
router.delete('/:id', async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid ID' });
  const result = await col().findOneAndUpdate(
    { _id: oid },
    { $set: { status: 'archived', updated_at: new Date().toISOString() } },
    { returnDocument: 'after' }
  );
  if (!result) return res.status(404).json({ error: 'NOT_FOUND', message: 'NPC not found' });
  res.json(result);
});

export default router;
