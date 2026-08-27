import { Router } from 'express';
import { getCollection } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { resolveOfficeSeat } from '../lib/office-seat-resolve.js';

const router = Router();
const col = () => getCollection('office_manoeuvre_ranks');

// GET /api/office_manoeuvre_rank
// Reference info, open to any authenticated user — the same posture as
// office-merit-dots.js's own GET / (open read, ST-gated write). Returns
// { [seatId]: { rank, manoeuvre_xp_destroyed } } for every office SEAT that
// has a document; a seat nobody has purchased into yet simply has no key
// here, and the client treats a missing entry as rank 0 (nothing purchased).
//
// oxp.6: the value used to be a bare integer (just `rank`). This is the ONLY
// route `manoeuvre_xp_destroyed` (written by oxp.5's handover reset, on this
// same document) can reach the client through, so office-xp.js's
// officeXpSpentForCategory can fold it into spend before any balance is
// rendered — without it, a handover's destroyed XP silently reappears as a
// refund the moment anything shows a balance (see office-xp.js's own header
// comment). Changing the value's shape is a breaking change for this route's
// one consumer, office-tab.js's _wireManoeuvreRank, updated in the same story.
router.get('/', async (req, res) => {
  const docs = await col().find({}).toArray();
  const out = {};
  // oxp.11: `doc._id` is the seat id, not the office category.
  for (const doc of docs) {
    out[doc._id] = { rank: doc.rank || 0, manoeuvre_xp_destroyed: doc.manoeuvre_xp_destroyed || 0 };
  }
  res.json(out);
});

// PUT /api/office_manoeuvre_rank/:seatId
// ST-only. Body: { rank }. Sets how many of this SEAT's office's ranked
// manoeuvres are currently purchased, as one graduated integer: 0 means none,
// and the office's own manoeuvre count means all of them. Rank order IS the
// order of that office's `office_content` document's `manoeuvres` array
// (oxp.10), which already matches the resolved rank table in
// content/rules/office-powers.md.
//
// The upper bound is read from the resolved seat's own office's manoeuvres
// array rather than hardcoded, so an office authored later with a different
// number of manoeuvres (Administrator, oxp.8) validates correctly without a
// code change here.
//
// oxp.11 re-keyed this from office category to seat. Two offices carry more
// than one concurrent seat (Primogen, Socialite), and under category-keying
// their single shared document could not record that one seat had climbed the
// ladder and the other had not. That mattered most for oxp.5, which must reset
// ONE seat's rank on a handover without destroying the other's.
//
// Minimal-scope note (oxp.3, 2026-08-13): this mirrors the office-merit-dots
// stopgap exactly — direct ST-set purchase state, not Epic OXP's full
// accrual/spend economy. No XP bookkeeping, no approval-queue routing (oxp.9 —
// there is no spend event here to approve), and no handover reset (oxp.5).
router.put('/:seatId', requireRole('st'), async (req, res) => {
  const resolved = await resolveOfficeSeat(req.params.seatId);
  if (resolved.error) return res.status(resolved.error.status).json(resolved.error.body);
  const { seatId, category, officeEntry } = resolved;

  if (!Array.isArray(officeEntry.manoeuvres))
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'This seat\'s office has no manoeuvres' });

  const { rank } = req.body;
  const max = officeEntry.manoeuvres.length;
  // Accept a numeric string (office-merit-dots accepts one too) but never
  // coerce null/undefined/''/[]/booleans, all of which Number() would happily
  // turn into a valid-looking 0.
  const n = typeof rank === 'string' && rank.trim() !== '' ? Number(rank) : rank;
  if (!Number.isInteger(n) || n < 0 || n > max)
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: `Rank must be an integer between 0 and ${max}` });

  const result = await col().findOneAndUpdate(
    { _id: seatId },
    { $set: { rank: n, office_category: category, updated_at: new Date().toISOString() } },
    { upsert: true, returnDocument: 'after' },
  );
  res.json(result);
});

// PUT /api/office_manoeuvre_rank/:seatId/step
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
// oxp.11: the seat lookup that resolves `:seatId` happens BEFORE the update and
// is a separate read, but it reads `office_seats`, not this collection, so the
// atomicity above is untouched. Nothing about the rank is read before it is
// written.
//
// The absolute-set PUT /:seatId above is deliberately kept: it is the route
// for setting a known rank directly, and its own semantics are correct (last
// writer wins is what "set it to exactly this" means). Only the stepper needed
// the relative form.
router.put('/:seatId/step', requireRole('st'), async (req, res) => {
  const resolved = await resolveOfficeSeat(req.params.seatId);
  if (resolved.error) return res.status(resolved.error.status).json(resolved.error.body);
  const { seatId, category, officeEntry } = resolved;

  if (!Array.isArray(officeEntry.manoeuvres))
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'This seat\'s office has no manoeuvres' });

  const { delta } = req.body;
  const d = typeof delta === 'string' && delta.trim() !== '' ? Number(delta) : delta;
  if (!Number.isInteger(d) || d === 0)
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Delta must be a non-zero integer' });

  const max = officeEntry.manoeuvres.length;
  const result = await col().findOneAndUpdate(
    { _id: seatId },
    [
      { $set: { rank: { $min: [max, { $max: [0, { $add: [{ $ifNull: ['$rank', 0] }, d] }] }] } } },
      // oxp.11's denormalised category rides in the existing second stage. In
      // an aggregation-pipeline update a bare string would be read as a field
      // path if it began with '$', so `$literal` states plainly that this is a
      // value and not a reference, whatever a future office is named.
      { $set: { office_category: { $literal: category }, updated_at: new Date().toISOString() } },
    ],
    { upsert: true, returnDocument: 'after' },
  );
  res.json(result);
});

export default router;
