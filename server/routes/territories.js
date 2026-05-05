import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getCollection } from '../db.js';
import { validate } from '../middleware/validate.js';
import { territorySchema } from '../schemas/territory.schema.js';
import { isStRole, isRegentOfTerritory } from '../middleware/auth.js';
import { normaliseTerritorySlug } from '../utils/territory-slugs.js';

function requireST(req, res, next) {
  if (!isStRole(req.user)) return res.status(403).json({ error: 'FORBIDDEN', message: 'Insufficient role' });
  next();
}

const router = Router();
const col = () => getCollection('territories');

function parseId(id) {
  try {
    return new ObjectId(id);
  } catch {
    return null;
  }
}

// GET /api/territories — list all
router.get('/', async (req, res) => {
  const docs = await col().find().toArray();
  res.json(docs);
});

// POST /api/territories — create new (no _id) or update existing (with _id), ST only.
// Strict cutover per ADR-002 Q2: no upsert by slug; _id is the only update key.
router.post('/', requireST, validate(territorySchema), async (req, res) => {
  const { _id, ...fields } = req.body;
  if (_id) {
    const oid = parseId(_id);
    if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid _id format' });
    const result = await col().findOneAndUpdate(
      { _id: oid },
      { $set: { ...fields, updated_at: new Date().toISOString() } },
      { returnDocument: 'after' }
    );
    if (!result) return res.status(404).json({ error: 'NOT_FOUND', message: 'Territory not found' });
    return res.json(result);
  }
  // No _id → insert new
  const insert = await col().insertOne({ ...fields, updated_at: new Date().toISOString() });
  const doc = await col().findOne({ _id: insert.insertedId });
  res.status(201).json(doc);
});

// PUT /api/territories/:id — update one by _id (ST only)
router.put('/:id', requireST, async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid territory ID format' });

  const { _id, ...updates } = req.body;
  const result = await col().findOneAndUpdate(
    { _id: oid },
    { $set: updates },
    { returnDocument: 'after' }
  );

  if (!result) return res.status(404).json({ error: 'NOT_FOUND', message: 'Territory not found' });
  res.json(result);
});

// PATCH /api/territories/:id/feeding-rights — regent's player (or ST) may write
// feeding_rights for their own territory. Body: { feeding_rights: string[] }
// Lock rule: a character who has submitted a DT marked 'resident' on this
// territory in the active cycle cannot be removed from feeding_rights by the
// regent. ST override bypasses the lock.
//
// Strict cutover per ADR-002 Q2: :id MUST be an ObjectId. Slug-fallback removed.
router.patch('/:id/feeding-rights', async (req, res) => {
  const { id } = req.params;
  const { feeding_rights } = req.body;

  if (!Array.isArray(feeding_rights)) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'feeding_rights must be an array of character IDs',
    });
  }

  const oid = parseId(id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid territory ID format' });

  const territory = await col().findOne({ _id: oid });
  if (!territory) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Territory not found' });
  }

  // Permission: ST or this territory's regent
  if (!isRegentOfTerritory(req.user, territory)) {
    return res.status(403).json({
      error: 'FORBIDDEN',
      message: 'You are not the Regent of this territory',
    });
  }

  // Lock check — only applies to non-ST callers.
  // Note: feeding_territories keys in submissions remain slug-variant strings
  // (per ADR-002 Q4); the legacy reader resolves them against the territory's
  // `slug` field.
  if (!isStRole(req.user)) {
    const activeCycle = await getCollection('downtime_cycles').findOne({ status: 'active' });

    if (activeCycle) {
      const current = Array.isArray(territory.feeding_rights) ? territory.feeding_rights : [];
      const removed = current.filter(cid => !feeding_rights.includes(cid));

      if (removed.length > 0) {
        const subs = await getCollection('downtime_submissions').find({
          cycle_id: activeCycle._id,
          status: 'submitted',
        }).toArray();

        const fedCharIds = new Set();
        const terrSlug = territory.slug;
        for (const sub of subs) {
          const raw = sub?.responses?.feeding_territories;
          if (!raw) continue;
          let grid;
          try { grid = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { continue; }
          if (!grid || typeof grid !== 'object') continue;
          for (const [slug, state] of Object.entries(grid)) {
            if (state !== 'resident') continue;
            if (normaliseTerritorySlug(slug) === terrSlug) {
              fedCharIds.add(String(sub.character_id));
            }
          }
        }

        const locked = removed.filter(cid => fedCharIds.has(String(cid)));
        if (locked.length > 0) {
          return res.status(409).json({
            error: 'CONFLICT',
            message: 'Cannot remove characters who have already fed this cycle',
            locked,
          });
        }
      }
    }
  }

  const result = await col().findOneAndUpdate(
    { _id: territory._id },
    { $set: { feeding_rights, updated_at: new Date().toISOString() } },
    { returnDocument: 'after' }
  );

  res.json(result);
});

export default router;
