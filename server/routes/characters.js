import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getCollection } from '../db.js';
import { requireRole, isStRole } from '../middleware/auth.js';
import { validateCharacter, validateCharacterPartial } from '../middleware/validateCharacter.js';

const router = Router();
const col = () => getCollection('characters');

/** Strip ephemeral underscore-prefixed fields from req.body before validation. */
function stripEphemeral(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    for (const key of Object.keys(req.body)) {
      if (key.startsWith('_')) delete req.body[key];
    }
  }
  next();
}

function parseId(id) {
  try {
    return new ObjectId(id);
  } catch {
    return null;
  }
}

// GET /api/characters — ST gets all, player gets only their characters
// ?mine=1 forces the player-only path for any role (used by player portal)
router.get('/', async (req, res) => {
  if (isStRole(req.user) && !req.query.mine) {
    const chars = await col().find().toArray();
    return res.json(chars);
  }

  // Player (or ST with ?mine=1): return only their linked characters
  const ids = (req.user.character_ids || []).map(id =>
    id instanceof ObjectId ? id : new ObjectId(id)
  );
  const chars = await col().find({ _id: { $in: ids } }).toArray();

  // Enrich shared domain merits with partner contributions so the
  // player portal can render filled/hollow dots without needing the
  // full partner character objects (which it can't access).
  const partnerNames = new Set();
  for (const c of chars) {
    for (const m of (c.merits || [])) {
      if (m.category === 'domain' && m.shared_with) {
        for (const pn of m.shared_with) partnerNames.add(pn);
      }
    }
  }
  if (partnerNames.size > 0) {
    const partners = await col()
      .find(
        { name: { $in: [...partnerNames] } },
        { projection: { name: 1, merits: 1 } }
      )
      .toArray();
    // Build map: partner name → { meritName → shareable dots }
    const partnerMap = new Map();
    for (const p of partners) {
      const meritDots = {};
      for (const m of (p.merits || [])) {
        if (m.category !== 'domain') continue;
        meritDots[m.name] = (m.cp || 0) + (m.free_mci || 0) + (m.free_bloodline || 0)
                          + (m.free_retainer || 0) + (m.xp || 0);
      }
      partnerMap.set(p.name, meritDots);
    }
    // Attach _partner_dots on each shared domain merit
    for (const c of chars) {
      for (const m of (c.merits || [])) {
        if (m.category !== 'domain' || !m.shared_with || !m.shared_with.length) continue;
        let pd = 0;
        for (const pn of m.shared_with) {
          const pm = partnerMap.get(pn);
          if (pm && pm[m.name]) pd += pm[m.name];
        }
        if (pd > 0) m._partner_dots = pd;
      }
    }
  }

  res.json(chars);
});

// GET /api/characters/public — public who's who list (any authenticated user)
// Returns only display fields for active, non-retired characters.
router.get('/public', async (req, res) => {
  const chars = await col()
    .find(
      { retired: { $ne: true }, pending_approval: { $ne: true } },
      { projection: { name: 1, honorific: 1, moniker: 1, clan: 1, covenant: 1, court_title: 1, regent_territory: 1, player: 1 } }
    )
    .toArray();
  const sortKey = c => `${c.covenant || 'zzz'}|${(c.moniker || c.name || '').toLowerCase()}`;
  chars.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  res.json(chars);
});

// GET /api/characters/game-xp — attendance XP summary for all characters.
// Any authenticated user can access this (players need it for XP display).
// Returns per-session attendance data without sensitive ST notes.
router.get('/game-xp', async (req, res) => {
  const sessions = await getCollection('game_sessions')
    .find({}, { projection: { session_date: 1, title: 1, session_number: 1, attendance: 1 } })
    .sort({ session_date: -1 })
    .toArray();
  // Strip sensitive fields from attendance — only keep XP-relevant data
  for (const s of sessions) {
    s.attendance = (s.attendance || []).map(a => ({
      character_id: a.character_id,
      character_name: a.character_name,
      name: a.name,
      display_name: a.display_name,
      character_display: a.character_display,
      attended: !!a.attended,
      costuming: !!a.costuming,
      downtime: !!a.downtime,
      extra: a.extra || 0,
    }));
  }
  res.json(sessions);
});

// GET /api/characters/combat — lightweight resistance data for all active characters.
// Used by the game app dice roller to populate the opponent target dropdown
// when a player needs to select a resistance target. Returns only the fields
// needed for contested roll calculations — no merit data, no powers, no PII.
router.get('/combat', async (req, res) => {
  const chars = await col()
    .find(
      { retired: { $ne: true }, pending_approval: { $ne: true } },
      {
        projection: {
          name: 1, honorific: 1, moniker: 1, clan: 1, covenant: 1,
          blood_potency: 1,
          'attributes.Resolve': 1, 'attributes.Composure': 1,
          'attributes.Strength': 1, 'attributes.Dexterity': 1,
          'attributes.Stamina': 1, 'attributes.Wits': 1,
          'attributes.Presence': 1, 'attributes.Manipulation': 1,
          'attributes.Intelligence': 1,
          disciplines: 1,
        },
      }
    )
    .toArray();
  const sortKey = c => (c.moniker || c.name || '').toLowerCase();
  chars.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  res.json(chars);
});

// GET /api/characters/status — status ranking data (any authenticated user)
// Returns active characters with clan/covenant status, joined with their
// linked player's Discord avatar so the player portal Status tab can
// render ranked lists with profile pics. Must be declared before /:id.
router.get('/status', async (req, res) => {
  const chars = await col()
    .find(
      { retired: { $ne: true }, pending_approval: { $ne: true } },
      {
        projection: {
          name: 1, honorific: 1, moniker: 1,
          clan: 1, covenant: 1,
          'status.clan': 1, 'status.covenant': 1, 'status.city': 1,
          court_title: 1,
          player: 1,
        },
      }
    )
    .toArray();

  // Join linked player Discord info for avatars
  const players = await getCollection('players')
    .find({}, { projection: { _id: 1, character_ids: 1, discord_id: 1, discord_avatar: 1 } })
    .toArray();
  const charToPlayer = new Map();
  for (const p of players) {
    for (const cid of (p.character_ids || [])) {
      charToPlayer.set(String(cid), {
        discord_id: p.discord_id || null,
        discord_avatar: p.discord_avatar || null,
      });
    }
  }
  for (const c of chars) {
    c._player_info = charToPlayer.get(String(c._id)) || null;
  }

  res.json(chars);
});

// GET /api/characters/names — lightweight list of all active character names (any authenticated user)
router.get('/names', async (req, res) => {
  const chars = await col()
    .find({ retired: { $ne: true } }, { projection: { name: 1, moniker: 1, honorific: 1, player: 1 } })
    .toArray();
  const sortName = c => (c.moniker || c.name).toLowerCase();
  chars.sort((a, b) => sortName(a).localeCompare(sortName(b)));
  res.json(chars);
});

// GET /api/characters/:id — ST gets any, player gets only their own
router.get('/:id', async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid character ID format' });

  // Player: check they own this character
  if (req.user.role === 'player') {
    const owns = (req.user.character_ids || []).some(id => id.toString() === oid.toString());
    if (!owns) return res.status(403).json({ error: 'FORBIDDEN', message: 'Not your character' });
  }

  const char = await col().findOne({ _id: oid });
  if (!char) return res.status(404).json({ error: 'NOT_FOUND', message: 'Character not found' });

  res.json(char);
});

// POST /api/characters/wizard — player creates their own character
router.post('/wizard', requireRole('player'), stripEphemeral, validateCharacter, async (req, res) => {
  const players = getCollection('players');
  const player = await players.findOne({ _id: req.user.player_id });
  const existingIds = player?.character_ids || [];

  // First character is auto-approved; subsequent characters await ST sign-off
  const isFirst = existingIds.length === 0;

  const doc = { ...req.body };
  delete doc._id;
  doc.pending_approval = !isFirst;
  doc.retired = false;
  doc.created_at = new Date().toISOString();

  const result = await col().insertOne(doc);
  const created = await col().findOne({ _id: result.insertedId });

  // Link to player record
  await players.updateOne(
    { _id: req.user.player_id },
    { $push: { character_ids: result.insertedId } }
  );

  res.status(201).json(created);
});

// POST /api/characters — ST only
router.post('/', requireRole('st'), stripEphemeral, validateCharacter, async (req, res) => {
  const doc = req.body;
  if (!doc || !doc.name) return res.status(400).json({ error: 'VALIDATION_ERROR', message: "Field 'name' is required" });

  const result = await col().insertOne(doc);
  const created = await col().findOne({ _id: result.insertedId });
  res.status(201).json(created);
});

// PUT /api/characters/:id — ST only
// Uses partial schema validation: types/shapes checked but no field is required,
// so both full document saves and partial updates (e.g. regent assignment) are valid.
router.put('/:id', requireRole('st'), stripEphemeral, validateCharacterPartial, async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid character ID format' });

  const { _id, willpower, ...updates } = req.body;

  const result = await col().findOneAndUpdate(
    { _id: oid },
    { $set: updates },
    { returnDocument: 'after' }
  );

  if (!result) return res.status(404).json({ error: 'NOT_FOUND', message: 'Character not found' });
  res.json(result);
});

// DELETE /api/characters/:id — ST only
router.delete('/:id', requireRole('st'), async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid character ID format' });

  const result = await col().deleteOne({ _id: oid });
  if (result.deletedCount === 0) return res.status(404).json({ error: 'NOT_FOUND', message: 'Character not found' });

  res.status(204).end();
});

export default router;
