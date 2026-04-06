import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getCollection } from '../db.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();
const col = () => getCollection('ordeal_rubrics');

function parseId(id) {
  try { return new ObjectId(id); } catch { return null; }
}

// GET /api/ordeal_rubrics — ST only; optional ?type= and ?covenant= filters
router.get('/', requireRole('st'), async (req, res) => {
  const filter = {};
  if (req.query.type)     filter.ordeal_type = req.query.type;
  if (req.query.covenant) filter.covenant    = req.query.covenant;
  const docs = await col().find(filter).toArray();
  res.json(docs);
});

// PUT /api/ordeal_rubrics/:id — ST only; update expected answers and marking notes
router.put('/:id', requireRole('st'), async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid ID' });

  const { _id, ...updates } = req.body;
  const result = await col().findOneAndUpdate(
    { _id: oid },
    { $set: updates },
    { returnDocument: 'after' }
  );

  if (!result) return res.status(404).json({ error: 'NOT_FOUND', message: 'Rubric not found' });
  res.json(result);
});

export default router;
