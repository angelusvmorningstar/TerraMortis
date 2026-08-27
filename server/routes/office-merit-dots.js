import { Router } from 'express';
import { getCollection } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { resolveOfficeSeat } from '../lib/office-seat-resolve.js';
import { getMeritCaps } from '../lib/office-content-read.js';

const router = Router();
const col = () => getCollection('office_merit_dots');

// GET /api/office_merit_dots
// Reference info, open to any authenticated user — mirrors office-actions.js's
// own GET / (applied log is public read, ST-gated write). Returns
// { [seatId]: { [meritName]: dots } } for every office SEAT that has a
// document; a seat never purchased into yet simply has no key here — the
// client treats a missing entry as 0 dots for every merit.
router.get('/', async (req, res) => {
  const docs = await col().find({}).toArray();
  const out = {};
  // oxp.11: `doc._id` IS the seat id (its `office_seats._id` as a 24-hex
  // string). This handler is unchanged from the category-keyed era apart from
  // what `_id` now means; the value shape is identical.
  //
  // oxp.4's guarantee survives the re-keying, for a slightly different reason
  // than before. It used to rest on "the key is a category, so no character
  // can reach it". It now rests on "the key is a SEAT, whose `_id` is minted
  // once and never changes". A handover moves `office_seats.holder_id`, which
  // is never copied into this collection, so the same seat resolves to the
  // same document before and after. No character or holder reference exists
  // anywhere in this file, in either era. Proven end to end by
  // server/tests/oxp-4-merit-persistence-handover.test.js.
  for (const doc of docs) out[doc._id] = doc.dots || {};
  res.json(out);
});

// PUT /api/office_merit_dots/:seatId
// ST-only. Body: { merit, dots }. Sets one merit's dot rating for one office
// SEAT. The seat is resolved first (oxp.11), which is what yields the office
// category; the merit name and the value are then validated against that
// category exactly as before, using the same `office_content` the client
// renders from and the same per-merit caps (Trained Observer/Cacophony Savvy
// cap at 3, everything else at 5 — see office_content's `kind: 'merit_caps'`
// document, oxp.10).
//
// Minimal-scope note (2026-08-12, ahead of Saturday's game): this is
// direct ST-set purchase state, not Epic OXP's full accrual/spend economy
// (still backlog — see office-powers.md and the reference_office_powers_xp_economy
// memory). No XP bookkeeping, no approval-queue routing, no handover
// reset-on-manoeuvres logic — just "what dots does this office's merit
// suite currently show", settable directly by an ST.
router.put('/:seatId', requireRole('st'), async (req, res) => {
  // Resolve before validating anything else, so a caller with both a bad seat
  // id and a bad body learns which one the server could not even look up.
  const resolved = await resolveOfficeSeat(req.params.seatId);
  if (resolved.error) return res.status(resolved.error.status).json(resolved.error.body);
  const { seatId, category, officeEntry } = resolved;

  const { merit, dots } = req.body;

  if (typeof merit !== 'string' || !Array.isArray(officeEntry.merits) || !officeEntry.merits.includes(merit))
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'That merit does not belong to this office' });

  const meritCaps = await getMeritCaps();
  const cap = meritCaps[merit] || 5;
  // Codex review, DBO-4 (2026-08-14): accept a numeric string, but never
  // coerce null/undefined/''/[]/booleans - all of which bare Number() turns
  // into a valid-looking 0, silently accepting malformed input as "clear this
  // merit's dots to zero" instead of rejecting it. Same guard as
  // office-manoeuvre-rank.js's PUT routes.
  const n = typeof dots === 'string' && dots.trim() !== '' ? Number(dots) : dots;
  if (!Number.isInteger(n) || n < 0 || n > cap)
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: `Dots must be an integer between 0 and ${cap}` });

  // oxp.11: seat-keyed, deliberately. No character id is ever stored against a
  // seat's merit dots, so a change of officeholder cannot reach them — the
  // seat outlives its holder and keeps its own `_id` through a handover.
  // Re-keying this collection by character (or back to category) would look
  // like a reasonable refactor in isolation and would break either oxp.4's
  // handover guarantee or oxp.11's per-seat independence.
  //
  // `office_category` is written on every write as a DENORMALISED copy: it
  // makes a bare seat id legible to a human reading the collection and keeps
  // an orphaned document readable. It is never the key and never authoritative
  // — the seat wins if the two ever disagree — and rewriting it here is what
  // makes it self-healing.
  const result = await col().findOneAndUpdate(
    { _id: seatId },
    { $set: { [`dots.${merit}`]: n, office_category: category, updated_at: new Date().toISOString() } },
    { upsert: true, returnDocument: 'after' },
  );
  res.json(result);
});

export default router;
