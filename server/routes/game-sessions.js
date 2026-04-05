import { Router } from 'express';
import { getCollection } from '../db.js';
import { ObjectId } from 'mongodb';

function formatDeadline(isoStr) {
  const d = new Date(isoStr);
  return d.toLocaleString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
    timeZone: 'Australia/Sydney',
  });
}

const router = Router();
const col = () => getCollection('game_sessions');

// GET /api/game_sessions — list all sessions (sorted newest first)
router.get('/', async (req, res) => {
  const docs = await col().find({}).sort({ session_date: -1 }).toArray();
  res.json(docs);
});

// GET /api/game_sessions/next — nearest upcoming session (used by public website banner)
// Also exported as a standalone handler so index.js can mount it without auth.
export async function getNextSession(req, res) {
  const today = new Date().toISOString().slice(0, 10);
  const session = await col().findOne(
    { session_date: { $gte: today } },
    { sort: { session_date: 1 } }
  );
  if (!session) return res.json(null);

  // Merge active downtime cycle deadline if session has none
  if (!session.downtime_deadline) {
    const cycle = await getCollection('downtime_cycles').findOne({ status: 'active' });
    if (cycle?.deadline_at) {
      session.downtime_deadline = formatDeadline(cycle.deadline_at);
    }
  }

  res.json(session);
}
router.get('/next', getNextSession);

// GET /api/game_sessions/:id — single session
router.get('/:id', async (req, res) => {
  const doc = await col().findOne({ _id: new ObjectId(req.params.id) });
  if (!doc) return res.status(404).json({ error: 'NOT_FOUND' });
  res.json(doc);
});

// POST /api/game_sessions — create new session
router.post('/', async (req, res) => {
  const doc = req.body;
  if (!doc || !doc.session_date) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: "Field 'session_date' is required" });
  }
  // Default structure
  doc.attendance = doc.attendance || [];
  doc.created_at = new Date().toISOString();

  const result = await col().insertOne(doc);
  const created = await col().findOne({ _id: result.insertedId });
  res.status(201).json(created);
});

// PUT /api/game_sessions/:id — update session (attendance changes, etc.)
router.put('/:id', async (req, res) => {
  const { _id, ...body } = req.body;
  body.updated_at = new Date().toISOString();
  const result = await col().findOneAndUpdate(
    { _id: new ObjectId(req.params.id) },
    { $set: body },
    { returnDocument: 'after' }
  );
  if (!result) return res.status(404).json({ error: 'NOT_FOUND' });
  res.json(result);
});

// DELETE /api/game_sessions/:id — remove a session (ST only)
router.delete('/:id', async (req, res) => {
  const result = await col().deleteOne({ _id: new ObjectId(req.params.id) });
  if (result.deletedCount === 0) return res.status(404).json({ error: 'NOT_FOUND' });
  res.json({ ok: true });
});

export default router;
