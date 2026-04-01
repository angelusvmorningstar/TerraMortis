import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getCollection } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { stripStReview } from '../helpers/strip-st-review.js';

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

// GET /api/downtime_cycles — list all (both roles can see cycles)
cyclesRouter.get('/', async (req, res) => {
  const docs = await cycles().find().toArray();
  res.json(docs);
});

// POST /api/downtime_cycles — ST only
cyclesRouter.post('/', requireRole('st'), async (req, res) => {
  const doc = req.body;
  const result = await cycles().insertOne(doc);
  const created = await cycles().findOne({ _id: result.insertedId });
  res.status(201).json(created);
});

// --- Submissions: /api/downtime_submissions ---

export const submissionsRouter = Router();
const submissions = () => getCollection('downtime_submissions');

// POST /api/downtime_submissions — both roles can create
submissionsRouter.post('/', async (req, res) => {
  const doc = req.body;
  const result = await submissions().insertOne(doc);
  const created = await submissions().findOne({ _id: result.insertedId });
  res.status(201).json(created);
});

// GET /api/downtime_submissions — ST gets all, player gets only their own (st_review stripped)
submissionsRouter.get('/', async (req, res) => {
  const filter = {};
  if (req.query.cycle_id) {
    const oid = parseId(req.query.cycle_id);
    if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid cycle_id format' });
    filter.cycle_id = oid;
  }

  // Player: restrict to their characters
  if (req.user.role === 'player') {
    const charIds = (req.user.character_ids || []).map(id =>
      id instanceof ObjectId ? id : new ObjectId(id)
    );
    filter.character_id = { $in: charIds };
  }

  const docs = await submissions().find(filter).toArray();

  // Strip st_review for player responses
  if (req.user.role === 'player') {
    docs.forEach(doc => stripStReview(doc));
  }

  res.json(docs);
});

// PUT /api/downtime_submissions/:id — ST can update any, player can update own (before deadline)
submissionsRouter.put('/:id', async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid submission ID format' });

  // Player: verify ownership
  if (req.user.role === 'player') {
    const existing = await submissions().findOne({ _id: oid });
    if (!existing) return res.status(404).json({ error: 'NOT_FOUND', message: 'Submission not found' });

    const charIds = (req.user.character_ids || []).map(id => id.toString());
    if (!charIds.includes(existing.character_id?.toString())) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Not your submission' });
    }

    // Players cannot modify st_review fields
    delete req.body.st_review;
  }

  const { _id, ...updates } = req.body;
  const result = await submissions().findOneAndUpdate(
    { _id: oid },
    { $set: updates },
    { returnDocument: 'after' }
  );

  if (!result) return res.status(404).json({ error: 'NOT_FOUND', message: 'Submission not found' });

  // Strip st_review from player responses
  if (req.user.role === 'player') {
    stripStReview(result);
  }

  res.json(result);
});
