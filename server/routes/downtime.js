import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getCollection } from '../db.js';

function parseId(id) {
  try {
    return new ObjectId(id);
  } catch {
    return null;
  }
}

// --- Cycles: /api/downtime_cycles ---

export const cyclesRouter = Router();
const cycles = () => getCollection('downtime_cycles');

// GET /api/downtime_cycles — list all
cyclesRouter.get('/', async (req, res) => {
  const docs = await cycles().find().toArray();
  res.json(docs);
});

// POST /api/downtime_cycles — create cycle
cyclesRouter.post('/', async (req, res) => {
  const doc = req.body;
  const result = await cycles().insertOne(doc);
  const created = await cycles().findOne({ _id: result.insertedId });
  res.status(201).json(created);
});

// --- Submissions: /api/downtime_submissions ---

export const submissionsRouter = Router();
const submissions = () => getCollection('downtime_submissions');

// GET /api/downtime_submissions — list all, optionally filter by cycle_id
submissionsRouter.get('/', async (req, res) => {
  const filter = {};
  if (req.query.cycle_id) {
    const oid = parseId(req.query.cycle_id);
    if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid cycle_id format' });
    filter.cycle_id = oid;
  }
  const docs = await submissions().find(filter).toArray();
  res.json(docs);
});

// PUT /api/downtime_submissions/:id — update submission
submissionsRouter.put('/:id', async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid submission ID format' });

  const { _id, ...updates } = req.body;
  const result = await submissions().findOneAndUpdate(
    { _id: oid },
    { $set: updates },
    { returnDocument: 'after' }
  );

  if (!result) return res.status(404).json({ error: 'NOT_FOUND', message: 'Submission not found' });
  res.json(result);
});
