/**
 * GDX-8 (#989): persisted roll history + live ST roll feed.
 *
 * POST /api/roll_log — player writes a roll for their OWN character only
 * (mirrors tracker.js's own canAccess() shape; ST/dev unconditional).
 * GET  /api/roll_log — ST/dev only, most recent entries for the admin
 * feed's initial paint (the WS 'roll_log' frame carries live updates
 * thereafter, see server/ws.js's broadcastRollLogged).
 */

import { Router } from 'express';
import { getCollection } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { rollLogSchema } from '../schemas/roll_log.schema.js';
import { broadcastRollLogged } from '../ws.js';

const router = Router();
const col = () => getCollection('roll_log');

// Ownership check: players can only log a roll for their own character.
// Mirrors tracker.js's canAccess() exactly.
function canAccess(req, charId) {
  const role = req.user?.role;
  if (role === 'st' || role === 'dev') return true;
  const ids = (req.user?.character_ids || []).map(String);
  return ids.includes(charId);
}

router.post('/', validate(rollLogSchema), async (req, res) => {
  const { character_id } = req.body;
  if (!canAccess(req, character_id)) return res.status(403).json({ error: 'FORBIDDEN' });

  // player_id is server-derived from req.user, never trusted from the
  // request body. Review fix (Codex, external): the story's own Dev Notes
  // cited downtime.js's `req.user._id || req.user.id` as precedent, but
  // that pattern is itself stale — requireAuth (middleware/auth.js) never
  // sets req.user._id, so it always fell through to req.user.id (the
  // Discord account ID), not the actual players-collection _id. The newer,
  // correct pattern (history.js, cyoa.js, ordeal-responses.js) reads
  // req.user.player_id directly, which requireAuth DOES set to player._id.
  const doc = {
    ...req.body,
    player_id: req.user.player_id,
    // A genuine BSON Date, not an ISO string — the TTL index on this
    // collection (server/index.js) depends on this being a real Date to
    // actually reap documents. See that index's own comment for the
    // contested_roll_requests precedent this deliberately does not repeat.
    rolled_at: new Date(),
  };

  const result = await col().insertOne(doc);
  const written = { ...doc, _id: result.insertedId };

  broadcastRollLogged(written);

  res.status(201).json(written);
});

router.get('/', requireRole('st'), async (req, res) => {
  // Review fix (Blind Hunter): `parseInt('-5', 10) || 50` stays -5 (only a
  // falsy parse, e.g. NaN or 0, triggers the `|| 50` fallback), and Mongo's
  // .limit() treats a negative number specially (closes the cursor after
  // one batch) rather than rejecting it. Clamp the floor explicitly.
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const entries = await col().find({}).sort({ rolled_at: -1 }).limit(limit).toArray();
  res.json(entries);
});

export default router;
