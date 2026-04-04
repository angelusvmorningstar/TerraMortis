import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getCollection } from '../db.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();
const col = () => getCollection('npcs');

function parseId(id) {
  try { return new ObjectId(id); } catch { return null; }
}

// All NPC routes are ST-only
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
router.post('/', async (req, res) => {
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
