import { Router } from 'express';
import { getCollection } from '../db.js';
import { validate } from '../middleware/validate.js';
import { territoryResidencySchema } from '../schemas/territory.schema.js';

const router = Router();
const col = () => getCollection('territory_residency');

// GET /api/territory-residency?territory=The+North+Shore  — single territory
// GET /api/territory-residency                            — all territories
router.get('/', async (req, res) => {
  const territory = req.query.territory;
  if (territory) {
    const doc = await col().findOne({ territory });
    return res.json(doc || { territory, residents: [] });
  }
  const docs = await col().find().toArray();
  res.json(docs);
});

// PUT /api/territory-residency
// Upsert the residency list for a territory. Body: { territory, residents: [charId, ...] }
// Only the regent of the territory may update.
router.put('/', validate(territoryResidencySchema), async (req, res) => {
  const { territory, residents } = req.body;
  if (!territory || !Array.isArray(residents)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'territory and residents[] required' });
  }

  const result = await col().findOneAndUpdate(
    { territory },
    { $set: { territory, residents, updated_at: new Date().toISOString() } },
    { upsert: true, returnDocument: 'after' }
  );
  res.json(result);
});

export default router;
