import { Router } from 'express';
import { getCollection } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { OFFICE_DATA } from '../../public/js/tabs/office-data.js';

const router = Router();
const col = () => getCollection('office_manoeuvre_ranks');

// GET /api/office_manoeuvre_rank
// Reference info, open to any authenticated user — the same posture as
// office-merit-dots.js's own GET / (open read, ST-gated write). Returns
// { [category]: rank } for every office category that has a document; a
// category nobody has purchased into yet simply has no key here, and the
// client treats a missing entry as rank 0 (nothing purchased).
router.get('/', async (req, res) => {
  const docs = await col().find({}).toArray();
  const out = {};
  for (const doc of docs) out[doc._id] = doc.rank || 0;
  res.json(out);
});

// PUT /api/office_manoeuvre_rank/:category
// ST-only. Body: { rank }. Sets how many of this office's ranked manoeuvres
// are currently purchased, as one graduated integer: 0 means none, and the
// office's own manoeuvre count means all of them. Rank order IS the order of
// OFFICE_DATA[category].manoeuvres, which already matches the resolved rank
// table in content/rules/office-powers.md.
//
// The upper bound is read from the office's own manoeuvres array rather than
// hardcoded, so an office authored later with a different number of
// manoeuvres (Administrator, oxp.8) validates correctly without a code change
// here.
//
// Minimal-scope note (oxp.3, 2026-08-13): this mirrors the office-merit-dots
// stopgap exactly — direct ST-set purchase state, not Epic OXP's full
// accrual/spend economy (oxp.1/oxp.2 still backlog). No XP bookkeeping, no
// approval-queue routing (oxp.9 — there is no spend event here to approve),
// and no handover reset (oxp.5 — there is no spent XP to destroy yet).
router.put('/:category', requireRole('st'), async (req, res) => {
  const { category } = req.params;
  const { rank } = req.body;

  const officeEntry = OFFICE_DATA[category];
  if (!officeEntry || !Array.isArray(officeEntry.manoeuvres))
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Unknown office category' });

  const max = officeEntry.manoeuvres.length;
  // Accept a numeric string (office-merit-dots accepts one too) but never
  // coerce null/undefined/''/[]/booleans, all of which Number() would happily
  // turn into a valid-looking 0.
  const n = typeof rank === 'string' && rank.trim() !== '' ? Number(rank) : rank;
  if (!Number.isInteger(n) || n < 0 || n > max)
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: `Rank must be an integer between 0 and ${max}` });

  const result = await col().findOneAndUpdate(
    { _id: category },
    { $set: { rank: n, updated_at: new Date().toISOString() } },
    { upsert: true, returnDocument: 'after' },
  );
  res.json(result);
});

// PUT /api/office_manoeuvre_rank/:category/step
// ST-only. Body: { delta }. Moves the rank by a relative step and returns the
// resulting document.
//
// This exists instead of letting the stepper compute its own next value.
// Review finding (Codex, 2026-08-13): the client used to GET the current rank,
// compute `current + delta` locally, then PUT that absolute value. Two
// overlapping adjustments (two STs, or one impatient double-click) could both
// read the same starting rank and both write the same next value, so one of the
// two requested steps was silently lost. `findOneAndUpdate` is atomic per write,
// but that never helped: the values being written had already been computed
// from a stale read.
//
// The fix is to do the read-modify-write inside MongoDB itself, as a single
// operation, via an aggregation-pipeline update (driver v7, server 4.2+). The
// clamp to [0, manoeuvres.length] happens in the same pipeline, so a step can
// never push the rank outside the office's own bounds, and `$ifNull` makes the
// upsert path (no document yet, i.e. rank 0) behave the same as an existing one.
//
// The absolute-set PUT /:category above is deliberately kept: it is the route
// for setting a known rank directly, and its own semantics are correct (last
// writer wins is what "set it to exactly this" means). Only the stepper needed
// the relative form.
router.put('/:category/step', requireRole('st'), async (req, res) => {
  const { category } = req.params;
  const { delta } = req.body;

  const officeEntry = OFFICE_DATA[category];
  if (!officeEntry || !Array.isArray(officeEntry.manoeuvres))
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Unknown office category' });

  const d = typeof delta === 'string' && delta.trim() !== '' ? Number(delta) : delta;
  if (!Number.isInteger(d) || d === 0)
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Delta must be a non-zero integer' });

  const max = officeEntry.manoeuvres.length;
  const result = await col().findOneAndUpdate(
    { _id: category },
    [
      { $set: { rank: { $min: [max, { $max: [0, { $add: [{ $ifNull: ['$rank', 0] }, d] }] }] } } },
      { $set: { updated_at: new Date().toISOString() } },
    ],
    { upsert: true, returnDocument: 'after' },
  );
  res.json(result);
});

export default router;
