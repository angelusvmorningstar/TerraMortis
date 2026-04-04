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

  const attendees = attendance
    .filter(a => a.attended && !matchesChar(a))
    .map(a => ({ id: String(a.character_id), name: a.display_name || a.character_display || a.name || a.character_name || '' }))
    .sort((a, b) => a.name.localeCompare(b.name));

  res.json({ attended, attendees });
});

export default router;
