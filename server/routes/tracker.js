import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getCollection } from '../db.js';
import { broadcastTrackerUpdate } from '../ws.js';

const router = Router();
const col = () => getCollection('tracker_state');

// Ownership check: players can only access their own characters
function canAccess(req, charId) {
  const role = req.user?.role;
  if (role === 'st' || role === 'dev') return true;
  const ids = (req.user?.character_ids || []).map(String);
  return ids.includes(charId);
}

// GET /api/tracker_state/:character_id — get tracker for character
router.get('/:character_id', async (req, res) => {
  const raw = req.params.character_id;
  if (!canAccess(req, raw)) return res.status(403).json({ error: 'FORBIDDEN' });
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
  if (!canAccess(req, raw)) return res.status(403).json({ error: 'FORBIDDEN' });
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
