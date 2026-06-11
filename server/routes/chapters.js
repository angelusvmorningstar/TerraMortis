import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getCollection } from '../db.js';
import { requireRole } from '../middleware/auth.js';

const col = () => getCollection('chapters');
const cycles = () => getCollection('downtime_cycles');

function parseId(id) {
  try { return new ObjectId(id); } catch { return null; }
}

export const chaptersRouter = Router();

// GET /api/chapters — list all chapters sorted by number asc (public read)
chaptersRouter.get('/', async (req, res) => {
  const docs = await col().find().sort({ number: 1 }).toArray();
  res.json(docs);
});

// GET /api/chapters/:id — single chapter (public read)
chaptersRouter.get('/:id', async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid chapter ID format' });
  const doc = await col().findOne({ _id: oid });
  if (!doc) return res.status(404).json({ error: 'NOT_FOUND', message: 'Chapter not found' });
  res.json(doc);
});

// POST /api/chapters — create chapter (ST only)
chaptersRouter.post('/', requireRole('st'), async (req, res) => {
  const { number, label } = req.body;
  if (typeof number !== 'number' || !Number.isInteger(number) || number < 1) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'number must be a positive integer' });
  }
  if (typeof label !== 'string' || !label.trim()) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'label must be a non-empty string' });
  }
  const doc = { number, label: label.trim(), created_at: new Date().toISOString() };
  const result = await col().insertOne(doc);
  const created = await col().findOne({ _id: result.insertedId });
  res.status(201).json(created);
});

// PATCH /api/chapters/:id — update number and/or label (ST only)
chaptersRouter.patch('/:id', requireRole('st'), async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid chapter ID format' });

  const updates = {};
  if (req.body.number !== undefined) {
    const n = req.body.number;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'number must be a positive integer' });
    }
    updates.number = n;
  }
  if (req.body.label !== undefined) {
    if (typeof req.body.label !== 'string' || !req.body.label.trim()) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'label must be a non-empty string' });
    }
    updates.label = req.body.label.trim();
  }
  if (!Object.keys(updates).length) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'At least one of number or label is required' });
  }

  const result = await col().findOneAndUpdate(
    { _id: oid },
    { $set: updates },
    { returnDocument: 'after' },
  );
  if (!result) return res.status(404).json({ error: 'NOT_FOUND', message: 'Chapter not found' });
  res.json(result);
});

// DELETE /api/chapters/:id — delete chapter (ST only); 409 if any cycles reference it
chaptersRouter.delete('/:id', requireRole('st'), async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid chapter ID format' });

  const idStr = req.params.id;
  const linkedCount = await cycles().countDocuments({ chapter_id: idStr });
  if (linkedCount > 0) {
    return res.status(409).json({
      error: 'CHAPTER_IN_USE',
      message: `Chapter is linked to ${linkedCount} downtime cycle(s) and cannot be deleted`,
      linked_cycles: linkedCount,
    });
  }

  const result = await col().findOneAndDelete({ _id: oid });
  if (!result) return res.status(404).json({ error: 'NOT_FOUND', message: 'Chapter not found' });
  res.json({ deleted: true, _id: req.params.id });
});

export default chaptersRouter;
