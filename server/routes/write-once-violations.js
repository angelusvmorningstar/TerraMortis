/**
 * GET /api/write_once_violations — issue #1132.
 *
 * The review surface for refused write-once transitions on `characters.clan`
 * and `characters.bloodline`. Written from `routes/characters.js`'s PUT /:id
 * at both of its existing 409 sites (see `lib/write-once-violation-log.js`);
 * this router only reads.
 *
 * Deliberately NOT shaped like `st_mods.js`'s `auditRouter`, which pages and
 * facets through an aggregation pipeline. This is a rare-event log — an ST
 * mistakenly retrying a change the rules make permanent — not a stream. The
 * shape that fits is the one `GET /api/characters/:id/xp_ledger` already uses:
 * find, sort, hand it back. A bounded limit is the only concession, so a
 * pathological collection can never return unboundedly.
 *
 * ST only. `requireRole('st')` already admits `dev` (see middleware/auth.js) —
 * do not add it explicitly.
 */

import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getCollection } from '../db.js';
import { requireRole } from '../middleware/auth.js';

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

const router = Router();

router.get('/', requireRole('st'), async (req, res) => {
  const filter = {};

  if (req.query.character_id !== undefined) {
    const raw = String(req.query.character_id);
    // Round-trip equality as well as isValid: `ObjectId.isValid` also accepts
    // any 12-character string and an uppercase-hex spelling that would then
    // never match the stored lowercase id. Same defensive shape characters.js
    // uses for equipment[].catalogue_id.
    if (!ObjectId.isValid(raw) || String(new ObjectId(raw)) !== raw) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid character ID format' });
    }
    filter.character_id = new ObjectId(raw);
  }

  let limit = DEFAULT_LIMIT;
  if (req.query.limit !== undefined) {
    const n = Number(req.query.limit);
    // A non-numeric or non-positive limit falls back to the default rather
    // than 400ing: this is a read-only review surface, and a broken query
    // string should not stop an ST seeing the log.
    if (Number.isInteger(n) && n > 0) limit = Math.min(n, MAX_LIMIT);
  }

  // `_id` tiebreak: the rows of one refusal share an identical `at` (see
  // buildViolationDocs), so `at` alone leaves same-event ordering unspecified.
  const rows = await getCollection('write_once_violations')
    .find(filter)
    .sort({ at: -1, _id: -1 })
    .limit(limit)
    .toArray();

  res.json(rows);
});

export default router;
