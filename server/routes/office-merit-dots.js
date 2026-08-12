import { Router } from 'express';
import { getCollection } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { OFFICE_DATA, MERIT_DOT_CAPS } from '../../public/js/tabs/office-data.js';

const router = Router();
const col = () => getCollection('office_merit_dots');

// GET /api/office_merit_dots
// Reference info, open to any authenticated user — mirrors office-actions.js's
// own GET / (applied log is public read, ST-gated write). Returns
// { [category]: { [meritName]: dots } } for every office category that has
// a document; a category never purchased into yet simply has no key here —
// the client treats a missing entry as 0 dots for every merit.
router.get('/', async (req, res) => {
  const docs = await col().find({}).toArray();
  const out = {};
  for (const doc of docs) out[doc._id] = doc.dots || {};
  res.json(out);
});

// PUT /api/office_merit_dots/:category
// ST-only. Body: { merit, dots }. Sets one merit's dot rating for one
// office category. Validates the category and merit are real (against the
// same OFFICE_DATA the client renders from) and the value is an integer
// within that merit's cap (Trained Observer/Cacophony Savvy cap at 3,
// everything else at 5 — see MERIT_DOT_CAPS).
//
// Minimal-scope note (2026-08-12, ahead of Saturday's game): this is
// direct ST-set purchase state, not Epic OXP's full accrual/spend economy
// (still backlog — see office-powers.md and the reference_office_powers_xp_economy
// memory). No XP bookkeeping, no approval-queue routing, no handover
// reset-on-manoeuvres logic — just "what dots does this office's merit
// suite currently show", settable directly by an ST.
router.put('/:category', requireRole('st'), async (req, res) => {
  const { category } = req.params;
  const { merit, dots } = req.body;

  const officeEntry = OFFICE_DATA[category];
  if (!officeEntry)
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Unknown office category' });
  if (typeof merit !== 'string' || !officeEntry.merits.includes(merit))
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'That merit does not belong to this office' });

  const cap = MERIT_DOT_CAPS[merit] || 5;
  const n = Number(dots);
  if (!Number.isInteger(n) || n < 0 || n > cap)
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: `Dots must be an integer between 0 and ${cap}` });

  const result = await col().findOneAndUpdate(
    { _id: category },
    { $set: { [`dots.${merit}`]: n, updated_at: new Date().toISOString() } },
    { upsert: true, returnDocument: 'after' },
  );
  res.json(result);
});

export default router;
