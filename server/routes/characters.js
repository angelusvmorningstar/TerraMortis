import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getCollection } from '../db.js';
import { requireRole, isStRole } from '../middleware/auth.js';
import { validateCharacter, validateCharacterPartial } from '../middleware/validateCharacter.js';
import { normalizeMeritsMiddleware } from '../lib/normalize-character.js';

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

/**
 * NPCR.4: validate that every id in touchstone_edge_ids[] points to an
 * active relationship edge with kind='touchstone' and the character on
 * one endpoint. Returns null on success, or an error message string.
 */
/**
 * NPCR.4 helpers — touchstones live on character.touchstones[], capped at 6.
 * Slot rating descends from the clan anchor (Ventrue=7, else=6).
 * Each entry may carry an optional edge_id linking to a relationships doc
 * (kind='touchstone') when the touchstone is a character; omitted for objects.
 */

function anchorFor(character) {
  return character?.clan === 'Ventrue' ? 7 : 6;
}

/**
 * Validate a touchstones[] array on a save body: cap, humanity-in-anchor-range,
 * and each edge_id (when present) points to an active relationships edge of
 * kind='touchstone' with this character on one endpoint.
 * Returns null on success or an error message string.
 */
async function validateTouchstones(touchstones, characterId, currentCharDoc) {
  if (!Array.isArray(touchstones)) return null;
  if (touchstones.length > 6) {
    return `touchstones cap is 6 (received ${touchstones.length})`;
  }

  const anchor = anchorFor(currentCharDoc);
  const minRating = Math.max(1, anchor - 5);
  for (const t of touchstones) {
    if (!Number.isInteger(t?.humanity) || t.humanity < minRating || t.humanity > anchor) {
      return `touchstone humanity ${t?.humanity} out of range (anchor=${anchor}, min=${minRating})`;
    }
  }

  const edgeIds = touchstones
    .map(t => t?.edge_id)
    .filter(id => typeof id === 'string' && id.length > 0);
  if (edgeIds.length === 0) return null;

  const oids = [];
  for (const id of edgeIds) {
    try { oids.push(new ObjectId(id)); }
    catch { return `touchstone edge_id '${id}' is not a valid id`; }
  }
  const rels = getCollection('relationships');
  const edges = await rels.find({ _id: { $in: oids } }).toArray();
  const foundById = new Map(edges.map(e => [String(e._id), e]));
  const charIdStr = String(characterId);
  for (const id of edgeIds) {
    const edge = foundById.get(String(id));
    if (!edge) return `touchstone edge '${id}' not found`;
    if (edge.kind !== 'touchstone') return `edge '${id}' is kind='${edge.kind}', expected 'touchstone'`;
    if (edge.status === 'retired') return `edge '${id}' is retired`;
    const onEdge =
      (edge.a?.type === 'pc' && String(edge.a.id) === charIdStr) ||
      (edge.b?.type === 'pc' && String(edge.b.id) === charIdStr);
    if (!onEdge) return `edge '${id}' does not have this character as an endpoint`;
  }
  return null;
}

/**
 * Attach _npc_name on each touchstones[] entry that carries an edge_id,
 * so the client can render the linked NPC's name without a separate fetch.
 * Edges that are retired or (for player callers) st_hidden are treated as
 * missing — no name attached; the client still renders the entry via its
 * inline name field.
 */
async function enrichTouchstoneNpcNames(chars, { forPlayer } = {}) {
  const allEdgeOids = [];
  for (const c of chars) {
    for (const t of (c.touchstones || [])) {
      if (typeof t?.edge_id === 'string' && t.edge_id.length > 0) {
        try { allEdgeOids.push(new ObjectId(t.edge_id)); } catch { /* skip */ }
      }
    }
  }
  if (allEdgeOids.length === 0) return;

  const rels = getCollection('relationships');
  const edgeFilter = {
    _id: { $in: allEdgeOids },
    kind: 'touchstone',
    status: { $ne: 'retired' },
  };
  if (forPlayer) edgeFilter.st_hidden = { $ne: true };
  const edges = await rels.find(edgeFilter).toArray();
  const edgeById = new Map(edges.map(e => [String(e._id), e]));

  const npcOids = [];
  for (const e of edges) {
    const npcEp = e.a?.type === 'npc' ? e.a : (e.b?.type === 'npc' ? e.b : null);
    if (npcEp?.id) {
      try { npcOids.push(new ObjectId(String(npcEp.id))); } catch { /* skip */ }
    }
  }
  const npcs = npcOids.length > 0
    ? await getCollection('npcs').find({ _id: { $in: npcOids } }, { projection: { name: 1 } }).toArray()
    : [];
  const npcById = new Map(npcs.map(n => [String(n._id), n]));

  for (const c of chars) {
    for (const t of (c.touchstones || [])) {
      if (typeof t?.edge_id !== 'string' || !t.edge_id) continue;
      const edge = edgeById.get(String(t.edge_id));
      if (!edge) continue;
      const npcEp = edge.a?.type === 'npc' ? edge.a : edge.b;
      const npc = npcEp ? npcById.get(String(npcEp.id)) : null;
      if (npc?.name) t._npc_name = npc.name;
    }
  }
}

// GET /api/characters — ST gets all, player gets only their characters
// ?mine=1 forces the player-only path for any role (used by player portal)
router.get('/', async (req, res) => {
  if (isStRole(req.user) && !req.query.mine) {
    const chars = await col().find().toArray();
    await enrichTouchstoneNpcNames(chars, { forPlayer: false });
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

  await enrichTouchstoneNpcNames(chars, { forPlayer: true });
  res.json(chars);
});

// GET /api/characters/public — public who's who list (any authenticated user)
// Returns only display fields for active, non-retired characters.
router.get('/public', async (req, res) => {
  const chars = await col()
    .find(
      { retired: { $ne: true }, pending_approval: { $ne: true } },
      { projection: { name: 1, honorific: 1, moniker: 1, clan: 1, covenant: 1, court_title: 1, court_category: 1, regent_territory: 1, player: 1, blood_potency: 1, humanity: 1 } }
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
          court_title: 1, court_category: 1,
          player: 1, powers: 1,
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
    const otsOath = (c.powers || []).find(p => p.category === 'pact' && (p.name || '').toLowerCase() === 'oath of the scapegoat');
    c._ots_covenant_bonus = otsOath ? ((otsOath.cp || 0) + (otsOath.xp || 0)) : 0;
    delete c.powers;
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

  const forPlayer = req.user.role === 'player';
  await enrichTouchstoneNpcNames([char], { forPlayer });
  res.json(char);
});

// POST /api/characters/wizard — player creates their own character
router.post('/wizard', requireRole('player'), stripEphemeral, validateCharacter, normalizeMeritsMiddleware, async (req, res) => {
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
router.post('/', requireRole('st'), stripEphemeral, validateCharacter, normalizeMeritsMiddleware, async (req, res) => {
  const doc = req.body;
  if (!doc || !doc.name) return res.status(400).json({ error: 'VALIDATION_ERROR', message: "Field 'name' is required" });

  const result = await col().insertOne(doc);
  const created = await col().findOne({ _id: result.insertedId });
  res.status(201).json(created);
});

// PUT /api/characters/:id — ST only
// Uses partial schema validation: types/shapes checked but no field is required,
// so both full document saves and partial updates (e.g. regent assignment) are valid.
router.put('/:id', requireRole('st'), stripEphemeral, validateCharacterPartial, normalizeMeritsMiddleware, async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid character ID format' });

  const { _id, willpower, ...updates } = req.body;

  // NPCR.4: if the save includes touchstones[], validate cap, humanity-in-range,
  // and each embedded edge_id points to a valid touchstone relationship for this char.
  if (Object.prototype.hasOwnProperty.call(updates, 'touchstones')) {
    const existingChar = await col().findOne({ _id: oid }, { projection: { clan: 1 } });
    const effectiveChar = { ...existingChar, ...updates }; // updates may also change clan
    const err = await validateTouchstones(updates.touchstones, oid, effectiveChar);
    if (err) return res.status(400).json({ error: 'VALIDATION_ERROR', message: err });
  }

  const result = await col().findOneAndUpdate(
    { _id: oid },
    { $set: updates },
    { returnDocument: 'after' }
  );

  if (!result) return res.status(404).json({ error: 'NOT_FOUND', message: 'Character not found' });
  res.json(result);
});

// GET /api/characters/:id/cascade-preview — ST only
router.get('/:id/cascade-preview', requireRole('st'), async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid character ID format' });
  try {
    const [submissions, sessionsAffected, players] = await Promise.all([
      getCollection('downtime_submissions').countDocuments({ character_id: oid }),
      getCollection('game_sessions').countDocuments({ 'attendance.character_id': oid }),
      getCollection('players').countDocuments({ character_ids: oid }),
    ]);
    res.json({ submissions, sessionsAffected, players });
  } catch (err) {
    res.status(500).json({ error: 'PREVIEW_FAILED', message: err.message });
  }
});

// DELETE /api/characters/:id — ST only (hard-delete with cascade)
router.delete('/:id', requireRole('st'), async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid character ID format' });
  try {
    // Cascade deletes first; character delete is last as the completion marker
    await getCollection('downtime_submissions').deleteMany({ character_id: oid });
    await getCollection('ordeal_submissions').deleteMany({ character_id: oid }).catch(() => {});
    await getCollection('histories').deleteMany({ character_id: oid }).catch(() => {});
    await getCollection('questionnaire_responses').deleteMany({ character_id: oid }).catch(() => {});
    await getCollection('tracker_state').deleteMany({ character_id: oid }).catch(() => {});
    await getCollection('game_sessions').updateMany({}, { $pull: { attendance: { character_id: oid } } });
    await getCollection('players').updateMany({}, { $pull: { character_ids: oid } });
    await getCollection('npcs').updateMany({}, { $pull: { linked_character_ids: oid } }).catch(() => {});

    const result = await col().deleteOne({ _id: oid });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'NOT_FOUND', message: 'Character not found' });
    res.status(204).end();
  } catch (err) {
    console.error('Hard-delete cascade failed:', err);
    res.status(500).json({ error: 'CASCADE_FAILED', message: err.message });
  }
});

export default router;
