import { Router } from 'express';
import { getCollection } from '../db.js';

const router = Router();
const col = () => getCollection('session_logs');

// GET /api/session_logs — list all, optionally filter by session_date
router.get('/', async (req, res) => {
  const filter = {};
  if (req.query.session_date) {
    filter.session_date = req.query.session_date;
  }
  const docs = await col().find(filter).toArray();
  res.json(docs);
});

// POST /api/session_logs — create log entry
router.post('/', async (req, res) => {
  const doc = req.body;
  if (!doc || !doc.session_date) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: "Field 'session_date' is required" });
  }

  const result = await col().insertOne(doc);
  const created = await col().findOne({ _id: result.insertedId });
  res.status(201).json(created);
});

export default router;
