import { Router }   from 'express';
import { ObjectId } from 'mongodb';
import { getCollection } from '../db.js';
import { requireRole }   from '../middleware/auth.js';
import { validate }      from '../middleware/validate.js';
import { devlogEntrySchema } from '../schemas/devlog_entry.schema.js';

const router = Router();
const col    = () => getCollection('devlog_entries');

router.get('/', async (req, res) => {
  const entries = await col().find({}).sort({ created_at: -1 }).toArray();
  res.json(entries);
});

router.post('/', requireRole('st'), validate(devlogEntrySchema), async (req, res) => {
  const now    = new Date().toISOString();
  const doc    = { ...req.body, created_at: now, updated_at: now };
  const result = await col().insertOne(doc);
  res.status(201).json({ ...doc, _id: result.insertedId });
});

router.patch('/:id', requireRole('st'), async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'BAD_ID' });
  const update = { ...req.body, updated_at: new Date().toISOString() };
  delete update._id;
  const result = await col().findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: update },
    { returnDocument: 'after' }
  );
  if (!result) return res.status(404).json({ error: 'NOT_FOUND' });
  res.json(result);
});

router.delete('/:id', requireRole('st'), async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'BAD_ID' });
  const result = await col().deleteOne({ _id: new ObjectId(id) });
  if (result.deletedCount === 0) return res.status(404).json({ error: 'NOT_FOUND' });
  res.json({ ok: true });
});

export default router;
