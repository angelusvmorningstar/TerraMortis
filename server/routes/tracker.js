import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getCollection } from '../db.js';
import { broadcastTrackerUpdate } from '../ws.js';

const router = Router();
const col = () => getCollection('tracker_state');

// GET /api/tracker_state/:character_id — get tracker for character
router.get('/:character_id', async (req, res) => {
  const raw = req.params.character_id;
  let filter;
  try { filter = { character_id: { $in: [new ObjectId(raw), raw] } }; }
  catch { filter = { character_id: raw }; }
  const doc = await col().findOne(filter);
  if (!doc) return res.status(404).json({ error: 'NOT_FOUND', message: 'Tracker state not found for this character' });
  res.json(doc);
});

// PUT /api/tracker_state/:character_id — upsert tracker for character
router.put('/:character_id', async (req, res) => {
  const raw = req.params.character_id;
  const { _id, ...updates } = req.body;
  let filter;
  try { filter = { character_id: { $in: [new ObjectId(raw), raw] } }; }
  catch { filter = { character_id: raw }; }
  const result = await col().findOneAndUpdate(
    filter,
    { $set: { ...updates, character_id: raw } },
    { returnDocument: 'after', upsert: true }
  );

  // Broadcast to all connected WebSocket clients
  broadcastTrackerUpdate(raw, updates);

  res.json(result);
});

export default router;
