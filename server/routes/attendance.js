import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getCollection } from '../db.js';

const router = Router();
const col = () => getCollection('game_sessions');

// GET /api/attendance?character_id=X[&game_number=N]
// Player-accessible: returns attendance status and attendee list.
// If game_number provided, looks up the Nth game session (sorted by date); otherwise uses the most recent.
router.get('/', async (req, res) => {
  const charId = req.query.character_id ? String(req.query.character_id) : null;
  const gameNumber = req.query.game_number ? parseInt(req.query.game_number, 10) : null;

  let latest;
  if (gameNumber && Number.isInteger(gameNumber) && gameNumber > 0) {
    const all = await col().find({}).sort({ session_date: 1 }).toArray();
    latest = all[gameNumber - 1] || null;
  } else {
    const sessions = await col().find({}).sort({ session_date: -1 }).limit(1).toArray();
    latest = sessions[0] || null;
  }

  if (!latest) return res.json({ attended: false, attendees: [] });
  const attendance = latest.attendance || [];

  // Resolve character name for fallback matching — attendance may store old character IDs
  // from before a migration, but character_name is stable.
  let charName = null;
  if (charId) {
    try {
      const oid = new ObjectId(charId);
      const char = await getCollection('characters').findOne({ _id: oid }, { projection: { name: 1 } });
      charName = char?.name || null;
    } catch { /* invalid id format — skip name lookup */ }
  }

  function matchesChar(a) {
    return String(a.character_id) === charId
      || (charName && (a.character_name === charName || a.name === charName));
  }

  let attended = false;
  if (charId) {
    const entry = attendance.find(matchesChar);
    attended = entry?.attended === true;
  }

  // Resolve current character records from attendance entries.
  // Attendance entries may store stale names/IDs from prior imports — look up
  // current characters by both character_id and character_name for robustness.
  const attendedEntries = attendance.filter(a => a.attended && !matchesChar(a));

  // Gather all character_ids and names from attendance for a single bulk lookup
  const lookupIds = [];
  const lookupNames = [];
  for (const a of attendedEntries) {
    if (a.character_id) {
      try { lookupIds.push(new ObjectId(a.character_id)); } catch { /* invalid id */ }
    }
    const n = a.character_name || a.name || '';
    if (n) lookupNames.push(n);
  }

  const currentChars = (lookupIds.length || lookupNames.length)
    ? await getCollection('characters').find(
        { $or: [
          ...(lookupIds.length ? [{ _id: { $in: lookupIds } }] : []),
          ...(lookupNames.length ? [{ name: { $in: lookupNames } }] : []),
        ] },
        { projection: { _id: 1, name: 1, moniker: 1, honorific: 1 } }
      ).toArray()
    : [];

  const charById = new Map(currentChars.map(c => [String(c._id), c]));
  const charByName = new Map(currentChars.map(c => [c.name, c]));

  const attendees = attendedEntries
    .map(a => {
      const aName = a.character_name || a.name || '';
      const char = charById.get(String(a.character_id)) || charByName.get(aName);
      if (!char) return { id: String(a.character_id || ''), name: aName };
      const display = char.honorific
        ? char.honorific + ' ' + (char.moniker || char.name)
        : (char.moniker || char.name);
      return { id: String(char._id), name: display };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // dt-form.17: surface session_id so the player client can address the
  // soft-submit lifecycle PATCH at /api/attendance/:session_id/:character_id.
  res.json({ attended, attendees, session_id: latest?._id ? String(latest._id) : null });
});

// dt-form.17 (ADR-003 §Q3): PATCH attendance.downtime for a single character
// on a single game session. Mirrors the player's submission `_has_minimum`
// derived bool both ways. Idempotent: writing the same value is a no-op
// success. Players may flip their own character; ST may flip any.
//
// Mounted under /api/attendance (player-accessible) rather than
// /api/game_sessions (ST/coordinator-only) so players can run their own
// soft-submit lifecycle. ST attendance edits still go through the existing
// PUT /api/game_sessions/:id (whole-document overwrite) for compat.
//
// Path: PATCH /api/attendance/:session_id/:character_id
// Body: { downtime: true | false }
// Returns: 200 + the updated attendance entry, or 404 if no match.
router.patch('/:session_id/:character_id', async (req, res) => {
  const sessionId = req.params.session_id;
  const charId = String(req.params.character_id || '');
  const downtime = req.body?.downtime;
  if (typeof downtime !== 'boolean') {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Body field `downtime` must be boolean',
    });
  }

  let sessOid;
  try { sessOid = new ObjectId(sessionId); }
  catch { return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid session ID format' }); }

  // Player auth: only flip their own character.
  if (req.user.role === 'player') {
    const owned = (req.user.character_ids || []).map(id => String(id));
    if (!owned.includes(charId)) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Not your character' });
    }
  }

  const result = await col().findOneAndUpdate(
    { _id: sessOid, 'attendance.character_id': charId },
    {
      $set: {
        'attendance.$.downtime': downtime,
        updated_at: new Date().toISOString(),
      },
    },
    { returnDocument: 'after', projection: { attendance: 1 } }
  );
  if (!result) {
    return res.status(404).json({
      error: 'NOT_FOUND',
      message: 'No attendance entry for that character on that session',
    });
  }
  const entry = (result.attendance || []).find(a => String(a.character_id) === charId);
  res.json({ ok: true, entry });
});

export default router;
