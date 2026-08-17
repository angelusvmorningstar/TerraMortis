import { Router } from 'express';
import { getCollection } from '../db.js';
import { ObjectId } from 'mongodb';
import { validate } from '../middleware/validate.js';
import { gameSessionSchema } from '../schemas/game_session.schema.js';

function formatDeadline(isoStr) {
  const d = new Date(isoStr);
  return d.toLocaleString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
    timeZone: 'Australia/Sydney',
  });
}

const router = Router();
const col = () => getCollection('game_sessions');

/**
 * CM-6 (cm-4's review, 2026-08-17). Coerce `chapter_id` to ONE canonical stored type, on every
 * write path that can touch it.
 *
 * WHY THIS EXISTS, and why a schema `pattern` alone would not have been enough. The partial unique
 * index `chapter_id_unique_notnull` treats `ObjectId('69f2…')` and the string `'69f2…'` as two
 * DISTINCT keys, so a document holding one and a document holding the other both satisfy a unique
 * index that is supposed to enforce a 1:1 session/Chapter link. That is not hypothetical: `PUT
 * /api/game_sessions/:id` was a blind `$set: body`, and BOTH live writers of it —
 * `public/js/admin/attendance.js` and `public/js/game/signin-tab.js` — GET the whole session
 * document, change one unrelated field, and PUT the whole thing back. JSON has no ObjectId, so the
 * very first attendance edit or sign-in autosave after the migration silently rewrote `chapter_id`
 * as its 24-hex string form and defeated the constraint the migration exists to establish.
 *
 * So: a 24-hex string becomes an ObjectId, an ObjectId stays one, `null` stays null (the field is
 * nullable and null is outside the partial index by design), and anything else is a 400 rather
 * than a silently-stored junk value.
 *
 * @returns {{ ok: true, value?: ObjectId|null }|{ ok: false, message: string }}
 */
export function coerceChapterId(value) {
  if (value === null) return { ok: true, value: null };
  if (value instanceof ObjectId) return { ok: true, value };
  if (typeof value === 'string') {
    if (!/^[0-9a-fA-F]{24}$/.test(value)) {
      return { ok: false, message: `Field 'chapter_id' must be a 24-character hex ObjectId or null (got '${value}')` };
    }
    return { ok: true, value: new ObjectId(value) };
  }
  return { ok: false, message: "Field 'chapter_id' must be a 24-character hex ObjectId string or null" };
}

/** Applies `coerceChapterId` in place when the body actually carries the field. */
function normaliseChapterId(body) {
  if (!Object.prototype.hasOwnProperty.call(body, 'chapter_id')) return null;
  const out = coerceChapterId(body.chapter_id);
  if (!out.ok) return out.message;
  body.chapter_id = out.value;
  return null;
}

/**
 * The partial unique index rejects a duplicate `chapter_id` with E11000. Surfaced as a 409 with a
 * named reason rather than a bare 500, so an ST who has genuinely double-paired two sessions is
 * told which constraint they hit.
 */
function isDuplicateChapterId(err) {
  return err?.code === 11000 && /chapter_id/.test(err?.message || '');
}

// GET /api/game_sessions — list all sessions (sorted newest first)
router.get('/', async (req, res) => {
  const docs = await col().find({}).sort({ session_date: -1 }).toArray();
  res.json(docs);
});

// GET /api/game_sessions/next — nearest upcoming session (used by public website banner)
// Also exported as a standalone handler so index.js can mount it without auth.
export async function getNextSession(req, res) {
  const today = new Date().toISOString().slice(0, 10);
  const session = await col().findOne(
    { session_date: { $gte: today } },
    { sort: { session_date: 1 } }
  );
  if (!session) return res.json(null);

  // Merge live downtime cycle deadline if session has none.
  // Cycles legitimately coexist (e.g. last cycle in 'game' while next opens
  // in 'prep'), so sort by the soonest deadline ascending — that's the cycle
  // whose deadline is approaching first, which is what the banner should
  // surface. The deadline_at filter prevents picking a 'prep' cycle that
  // hasn't had a deadline set yet.
  if (!session.downtime_deadline) {
    const cycle = await getCollection('chapters').findOne(
      {
        status: { $in: ['prep', 'game', 'active', 'open'] },
        deadline_at: { $exists: true, $ne: null },
      },
      { sort: { deadline_at: 1 } },
    );
    if (cycle?.deadline_at) {
      session.downtime_deadline = formatDeadline(cycle.deadline_at);
    }
  }

  res.json(session);
}
router.get('/next', getNextSession);

// GET /api/game_sessions/:id — single session
router.get('/:id', async (req, res) => {
  const doc = await col().findOne({ _id: new ObjectId(req.params.id) });
  if (!doc) return res.status(404).json({ error: 'NOT_FOUND' });
  res.json(doc);
});

// POST /api/game_sessions — create new session
router.post('/', validate(gameSessionSchema), async (req, res) => {
  const doc = req.body;
  if (!doc || !doc.session_date) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: "Field 'session_date' is required" });
  }
  // Default structure
  doc.attendance = doc.attendance || [];
  doc.created_at = new Date().toISOString();

  const badChapterId = normaliseChapterId(doc);
  if (badChapterId) return res.status(400).json({ error: 'VALIDATION_ERROR', message: badChapterId });

  let result;
  try {
    result = await col().insertOne(doc);
  } catch (err) {
    if (isDuplicateChapterId(err)) {
      return res.status(409).json({
        error: 'CHAPTER_ALREADY_PAIRED',
        message: 'Another game_session is already paired with that chapter. The session/Chapter link is 1:1.',
      });
    }
    throw err;
  }
  const created = await col().findOne({ _id: result.insertedId });
  res.status(201).json(created);
});

// PUT /api/game_sessions/:id — update session (attendance changes, etc.)
router.put('/:id', async (req, res) => {
  const { _id, ...body } = req.body;
  body.updated_at = new Date().toISOString();
  // See `coerceChapterId`. Both live callers of this route round-trip the WHOLE document, so
  // without this an unrelated attendance edit rewrites chapter_id as a string and quietly defeats
  // the partial unique index.
  const badChapterId = normaliseChapterId(body);
  if (badChapterId) return res.status(400).json({ error: 'VALIDATION_ERROR', message: badChapterId });

  let result;
  try {
    result = await col().findOneAndUpdate(
      { _id: new ObjectId(req.params.id) },
      { $set: body },
      { returnDocument: 'after' }
    );
  } catch (err) {
    if (isDuplicateChapterId(err)) {
      return res.status(409).json({
        error: 'CHAPTER_ALREADY_PAIRED',
        message: 'Another game_session is already paired with that chapter. The session/Chapter link is 1:1.',
      });
    }
    throw err;
  }
  if (!result) return res.status(404).json({ error: 'NOT_FOUND' });
  res.json(result);
});

// DELETE /api/game_sessions/:id — remove a session (ST only)
router.delete('/:id', async (req, res) => {
  const result = await col().deleteOne({ _id: new ObjectId(req.params.id) });
  if (result.deletedCount === 0) return res.status(404).json({ error: 'NOT_FOUND' });
  res.json({ ok: true });
});

export default router;
