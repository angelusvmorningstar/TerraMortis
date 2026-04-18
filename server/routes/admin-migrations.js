import express from 'express';
import { getDb } from '../db.js';

const router = express.Router();

const COV_SHORT = {
  'Carthian Movement':   'Carthian',
  'Circle of the Crone': 'Crone',
  'Invictus':            'Invictus',
  'Lancea et Sanctum':   'Lance',
  'Ordo Dracul':         'Ordo',
};

// POST /api/admin/fix-covenant-standings
// One-shot: removes own-covenant key from covenant_standings on all affected characters.
router.post('/fix-covenant-standings', async (req, res) => {
  try {
    const db = getDb();
    const chars = db.collection('characters');
    const all = await chars.find({}).toArray();
    const results = [];
    let fixed = 0;

    for (const c of all) {
      const ownLabel = COV_SHORT[c.covenant];
      if (!ownLabel) continue;
      if (c.covenant_standings && ownLabel in c.covenant_standings) {
        await chars.updateOne(
          { _id: c._id },
          { $unset: { [`covenant_standings.${ownLabel}`]: '' } }
        );
        results.push(`Fixed: ${c.name} — removed covenant_standings.${ownLabel}`);
        fixed++;
      }
    }

    res.json({ fixed, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
