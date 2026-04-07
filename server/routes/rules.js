import { Router } from 'express';
import { getCollection } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { purchasablePowerSchema } from '../schemas/purchasable_power.schema.js';

const router = Router();
const col = () => getCollection('purchasable_powers');

// GET /api/rules — browse rules with optional filtering, search, and pagination.
// Without ?page: returns flat array (backwards compatible for loadRulesFromApi).
// With ?page: returns { data, total, page, pages } envelope.
// Optional: ?category=merit, ?q=search_text, ?limit=50 (default 50, max 100).
router.get('/', async (req, res) => {
  const filter = {};
  if (req.query.category) filter.category = req.query.category;
  if (req.query.q) {
    const q = req.query.q;
    filter.$or = [
      { name: { $regex: q, $options: 'i' } },
      { description: { $regex: q, $options: 'i' } },
    ];
  }

  // Non-paginated path — backwards compatible flat array
  if (!req.query.page) {
    const docs = await col().find(filter).sort({ category: 1, name: 1 }).toArray();
    return res.json(docs);
  }

  // Paginated path
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const total = await col().countDocuments(filter);
  const pages = Math.ceil(total / limit) || 1;
  const data = await col().find(filter)
    .sort({ category: 1, name: 1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .toArray();
  res.json({ data, total, page, pages });
});

// GET /api/rules/:key — single power by slug key
router.get('/:key', async (req, res) => {
  const doc = await col().findOne({ key: req.params.key });
  if (!doc) return res.status(404).json({ error: 'NOT_FOUND', message: 'Power not found' });
  res.json(doc);
});

// POST /api/rules — ST only, create new power
router.post('/', requireRole('st'), validate(purchasablePowerSchema), async (req, res) => {
  const doc = req.body;
  // Check for duplicate key
  const existing = await col().findOne({ key: doc.key });
  if (existing) return res.status(409).json({ error: 'CONFLICT', message: `Key '${doc.key}' already exists` });
  const result = await col().insertOne(doc);
  const created = await col().findOne({ _id: result.insertedId });
  res.status(201).json(created);
});

// Allowlisted fields for PUT updates — defence-in-depth against injection
const UPDATABLE_FIELDS = new Set([
  'name', 'parent', 'rank', 'rating_range', 'description',
  'pool', 'resistance', 'cost', 'action', 'duration',
  'prereq', 'exclusive', 'sub_category', 'xp_fixed', 'special', 'bloodline',
]);

// PUT /api/rules/:key — ST only, update existing power
// Only allowlisted fields are accepted. Category and key are immutable.
router.put('/:key', requireRole('st'), async (req, res) => {
  const filtered = {};
  for (const [field, value] of Object.entries(req.body)) {
    if (UPDATABLE_FIELDS.has(field)) filtered[field] = value;
  }
  if (!Object.keys(filtered).length) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'No updatable fields provided' });
  }
  const result = await col().findOneAndUpdate(
    { key: req.params.key },
    { $set: filtered },
    { returnDocument: 'after' }
  );
  if (!result) return res.status(404).json({ error: 'NOT_FOUND', message: 'Power not found' });
  res.json(result);
});

export default router;
