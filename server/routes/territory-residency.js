import { Router } from 'express';
import { getCollection } from '../db.js';
import { validate } from '../middleware/validate.js';
import { territoryResidencySchema } from '../schemas/territory.schema.js';

const router = Router();
const col = () => getCollection('territory_residency');

// GET /api/territory-residency?territory_id=<oid>  — single territory
// GET /api/territory-residency                     — all territories
//
// ADR-002 Q5 user decision: collection is migrated, not dropped. Field rename
// territory → territory_id (ObjectId-string) lands here; the dead client block
// at public/js/tabs/downtime-form.js:73,1311-1317 is out of scope and must be
// addressed by a separate cleanup story.
router.get('/', async (req, res) => {
  const territory_id = req.query.territory_id;
  if (territory_id) {
    const doc = await col().findOne({ territory_id });
    return res.json(doc || { territory_id, residents: [] });
  }
  const docs = await col().find().toArray();
  res.json(docs);
});

// PUT /api/territory-residency
// Upsert the residency list for a territory. Body: { territory_id, residents: [charId, ...] }
// Only the regent of the territory may update.
router.put('/', validate(territoryResidencySchema), async (req, res) => {
  const { territory_id, residents } = req.body;
  if (!territory_id || !Array.isArray(residents)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'territory_id and residents[] required' });
  }

  const result = await col().findOneAndUpdate(
    { territory_id },
    { $set: { territory_id, residents, updated_at: new Date().toISOString() } },
    { upsert: true, returnDocument: 'after' }
  );
  res.json(result);
});

export default router;
