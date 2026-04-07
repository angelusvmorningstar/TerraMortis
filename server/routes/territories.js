import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getCollection } from '../db.js';
import { validate } from '../middleware/validate.js';
import { territorySchema } from '../schemas/territory.schema.js';

const router = Router();
const col = () => getCollection('territories');

function parseId(id) {
  try {
    return new ObjectId(id);
  } catch {
    return null;
  }
}

// GET /api/territories — list all
router.get('/', async (req, res) => {
  const docs = await col().find().toArray();
  res.json(docs);
});

// POST /api/territories — create or upsert by territory id field
router.post('/', validate(territorySchema), async (req, res) => {
  const { id, ...fields } = req.body;
  if (!id) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'id required' });

  const result = await col().findOneAndUpdate(
    { id },
    { $set: { id, ...fields, updated_at: new Date().toISOString() } },
    { upsert: true, returnDocument: 'after' }
  );
  res.status(201).json(result);
});

// PUT /api/territories/:id — update one
router.put('/:id', async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid territory ID format' });

  const { _id, ...updates } = req.body;
  const result = await col().findOneAndUpdate(
    { _id: oid },
    { $set: updates },
    { returnDocument: 'after' }
  );

  if (!result) return res.status(404).json({ error: 'NOT_FOUND', message: 'Territory not found' });
  res.json(result);
});

export default router;
