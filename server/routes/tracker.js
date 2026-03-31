import { Router } from 'express';
import { getCollection } from '../db.js';

const router = Router();
const col = () => getCollection('tracker_state');

// GET /api/tracker_state/:character_id — get tracker for character
router.get('/:character_id', async (req, res) => {
  const doc = await col().findOne({ character_id: req.params.character_id });
  if (!doc) return res.status(404).json({ error: 'NOT_FOUND', message: 'Tracker state not found for this character' });
  res.json(doc);
});

// PUT /api/tracker_state/:character_id — upsert tracker for character
router.put('/:character_id', async (req, res) => {
  const { _id, ...updates } = req.body;
  const result = await col().findOneAndUpdate(
    { character_id: req.params.character_id },
    { $set: { ...updates, character_id: req.params.character_id } },
    { returnDocument: 'after', upsert: true }
  );

  res.json(result);
});

export default router;
