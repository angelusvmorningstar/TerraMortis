/**
 * Equipment routes (EQ-1, issue #654).
 *
 * Epic ECM (issue #868) made this endpoint a thin alias of the new
 * GET /api/equipment_catalogue for one release cycle — the DT form and
 * player app still call /api/equipment/catalogue today; ECM-4 / ECM-5
 * switch them to the new endpoint, then ECM-7 removes the alias.
 *
 * Both endpoints intentionally serve the same shape (array of catalogue
 * docs from the equipment_catalogue collection); during the transition
 * window before ECM-2 seeds, the collection is empty and this endpoint
 * returns []. That matches what the new endpoint returns; clients still
 * reading from this alias see the same view of the data they would after
 * ECM-7's swap.
 */

import { Router } from 'express';
import { getCollection } from '../db.js';

const router = Router();

router.get('/catalogue', async (req, res) => {
  const docs = await getCollection('equipment_catalogue')
    .find({}).sort({ bucket: 1, name: 1 }).toArray();
  res.json(docs);
});

export default router;
