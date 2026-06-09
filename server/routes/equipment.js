/**
 * Equipment routes (EQ-1, issue #654).
 *
 * GET /api/equipment/catalogue — returns the full EQUIPMENT_CATALOGUE.
 * No auth required: the DT form and player app both need access without a token.
 */

import { Router } from 'express';
import { EQUIPMENT_CATALOGUE } from '../data/equipment-catalogue.js';

const router = Router();

// GET /api/equipment/catalogue — full static catalogue, no auth.
router.get('/catalogue', (req, res) => {
  res.json(EQUIPMENT_CATALOGUE);
});

export default router;
