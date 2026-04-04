import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getCollection } from '../db.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();
const col = () => getCollection('downtime_investigations');

function parseId(id) {
  try { return new ObjectId(id); } catch { return null; }
}

// All investigation routes are ST-only
router.use(requireRole('st'));

// GET /api/downtime_investigations — list, optionally filtered by cycle_id
router.get('/', async (req, res) => {
  const filter = {};
  if (req.query.cycle_id) {
    const oid = parseId(req.query.cycle_id);
    filter.$or = oid
      ? [{ cycle_id: oid }, { cycle_id: req.query.cycle_id }]
      : [{ cycle_id: req.query.cycle_id }];
  }
  if (req.query.status) filter.status = req.query.status;
  const docs = await col().find(filter).sort({ created_at: -1 }).toArray();
  res.json(docs);
});

// POST /api/downtime_investigations
router.post('/', async (req, res) => {
  const { target_description, threshold_type, custom_threshold, investigating_character_id, cycle_id, notes } = req.body;
  if (!target_description) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'target_description required' });

  const THRESHOLD_DEFAULTS = {
    public_identity: 5,
    hidden_identity: 10,
    private_activity: 10,
    haven: 10,
    touchstone: 15,
    bloodline: 15,
  };
  const threshold = custom_threshold ?? THRESHOLD_DEFAULTS[threshold_type] ?? 10;

  const doc = {
    target_description,
    threshold_type: threshold_type || 'private_activity',
    threshold,
    investigating_character_id: investigating_character_id || null,
    cycle_id: cycle_id ? (parseId(String(cycle_id)) || cycle_id) : null,
    successes_accumulated: 0,
    status: 'active',
    notes: notes ? [{ text: notes, added_at: new Date().toISOString() }] : [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const result = await col().insertOne(doc);
  const created = await col().findOne({ _id: result.insertedId });
  res.status(201).json(created);
});

// PUT /api/downtime_investigations/:id — add successes, add note, update status
router.put('/:id', async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid ID' });

  const existing = await col().findOne({ _id: oid });
  if (!existing) return res.status(404).json({ error: 'NOT_FOUND', message: 'Investigation not found' });

  const { add_successes, note_text, status, custom_threshold,
          target_description, threshold_type, investigating_character_id,
          cycle_id, successes_accumulated } = req.body;
  const updates = { updated_at: new Date().toISOString() };

  // Operational fields (incremental progress tracking)
  if (add_successes != null) {
    updates.successes_accumulated = (existing.successes_accumulated || 0) + (+add_successes || 0);
    if (updates.successes_accumulated >= existing.threshold && existing.status === 'active') {
      updates.status = 'resolved';
    }
  }
  if (note_text) {
    updates.$push = { notes: { text: note_text, added_at: new Date().toISOString(), successes_added: +add_successes || 0 } };
  }
  if (status) updates.status = status;
  if (custom_threshold != null) updates.threshold = +custom_threshold;

  // Direct field updates (used by data-portability import)
  if (target_description !== undefined) updates.target_description = target_description;
  if (threshold_type !== undefined) updates.threshold_type = threshold_type;
  if (investigating_character_id !== undefined) updates.investigating_character_id = investigating_character_id;
  if (cycle_id !== undefined) updates.cycle_id = cycle_id ? (parseId(String(cycle_id)) || cycle_id) : null;
  if (successes_accumulated != null && add_successes == null) updates.successes_accumulated = +successes_accumulated;

  const { $push, ...setFields } = updates;
  const op = { $set: setFields };
  if ($push) op.$push = $push;

  const result = await col().findOneAndUpdate({ _id: oid }, op, { returnDocument: 'after' });
  res.json(result);
});

export default router;
