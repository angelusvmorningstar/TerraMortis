import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getCollection } from '../db.js';
import { requireRole, isStRole } from '../middleware/auth.js';
import { validateCharacter, validateCharacterPartial } from '../middleware/validateCharacter.js';
import { normalizeMeritsMiddleware, normalizeCharacterMerits } from '../lib/normalize-character.js';
// N-1 (ADR-005 Rev 2): map-fallback shape for per-slug reads. Used in the
// partner-dots enrichment below so the server's hardcoded subset survives
// the N-2 backfill from `m.free_<slug>` to `m.free_grants.<slug>`. The
// SUBSET ITSELF (mci + bloodline + retainer) is preserved verbatim per
// Concern #1 Rev 2 — divergence with the client's mci-only subset stays.
import { freeOf, resolveSharingScope } from '../../public/js/data/rules-helpers.js';

const router = Router();
const col = () => getCollection('characters');

// #510: canonical influence spheres (mirrors public/js/data/constants.js:123).
// Carthian Pull allocations to Allies/Contacts must pick from this fixed set so
// downstream systems recognise the qualifier.
const INFLUENCE_SPHERES = ['Bureaucracy', 'Church', 'Finance', 'Health', 'High Society', 'Industry', 'Legal', 'Media', 'Military', 'Occult', 'Police', 'Politics', 'Street', 'Transportation', 'University', 'Underworld'];

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

// N-1 (ADR-005 Rev 2 §D3): Collective Compound synthesis on the server side.
// Mirrors the client-side pass in `mci.js#applyDerivedMerits` so the player
// portal sees synthesised `_collective_shared_with` without needing to run
// the full editor rule-engine in the browser. ST path uses its full `chars`
// array as the search context (no extra fetch); player path augments its own
// chars with any collective members it doesn't otherwise have access to (one
// scoped fetch by source-merit name; reuses the existing partner projection
// shape — `{ name: 1, merits: 1 }`). Never persists `_collective_shared_with`
// — it lives only on the response, stripped by `buildSaveBody` on the save
// path (per Concern #3).
async function _enrichCollectiveSharing(chars) {
  const grantsCol = getCollection('rule_grant');
  const collectiveRules = await grantsCol
    .find({ 'sharing_scope.type': 'collective_owners_of_merit' })
    .toArray();
  if (!collectiveRules.length) return;

  // Build the search context: union of `chars` plus any collective-owner chars
  // not already in the set. Player path needs the augmentation; ST path's
  // `chars` already contains everyone (the union is a no-op there).
  const sourceMerits = [...new Set(collectiveRules.map(r => r?.sharing_scope?.merit).filter(Boolean))];
  let searchContext = chars;
  if (sourceMerits.length) {
    const haveIds = new Set(chars.map(c => String(c._id)).filter(Boolean));
    const extras = await col()
      .find(
        { 'merits.name': { $in: sourceMerits } },
        { projection: { name: 1, merits: 1 } }
      )
      .toArray();
    const missing = extras.filter(e => e && e._id && !haveIds.has(String(e._id)));
    if (missing.length) searchContext = chars.concat(missing);
  }

  for (const c of chars) {
    for (const rule of collectiveRules) {
      const synthesised = resolveSharingScope(rule.sharing_scope, c, searchContext, rule);
      if (synthesised == null) continue;
      const targets = Array.isArray(rule.pool_targets) ? rule.pool_targets : [];
      if (!targets.length) continue;
      for (const m of (c.merits || [])) {
        if (targets.includes(m.name)) m._collective_shared_with = synthesised;
      }
    }
  }
}

// GET /api/characters — ST gets all, player gets only their characters
// ?mine=1 forces the player-only path for any role (used by player portal)
router.get('/', async (req, res) => {
  if (isStRole(req.user) && !req.query.mine) {
    const chars = await col().find().toArray();
    await _enrichCollectiveSharing(chars);
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
        // N-1 (Concern #1 Rev 2 VERBATIM): subset preserved verbatim — DO NOT
        // narrow to match the client's mci-only subset. Per-slug reads via
        // `freeOf` for N-2-backfill safety; behaviour identical pre-N-1.
        meritDots[m.name] = (m.cp || 0) + freeOf(m, 'mci') + freeOf(m, 'bloodline')
                          + freeOf(m, 'retainer') + (m.xp || 0);
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

  await _enrichCollectiveSharing(chars);
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

// PATCH /api/characters/:id/st_mods_suppressed — ST only.
// Epic STM (issue #378): per-character override of the overlay kill-switch.
// Truthy → suppress; false → clear ($unset to keep characters that have
// never been touched by STM clean of a transient false flag).
router.patch('/:id/st_mods_suppressed', requireRole('st'), async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid character ID format' });

  const { st_mods_suppressed } = req.body || {};
  if (typeof st_mods_suppressed !== 'boolean') {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'st_mods_suppressed must be boolean' });
  }

  const update = st_mods_suppressed
    ? { $set: { st_mods_suppressed: true } }
    : { $unset: { st_mods_suppressed: '' } };

  const result = await col().findOneAndUpdate(
    { _id: oid },
    update,
    { returnDocument: 'after' },
  );
  if (!result) return res.status(404).json({ error: 'NOT_FOUND', message: 'Character not found' });
  res.json(result);
});

// PATCH /api/characters/:id/safe_place_locations — player (own char) or ST.
// #506: persist per-Safe-Place street+suburb on the character so locations carry
// across downtime cycles. Narrowly scoped: only the `location` field on `Safe
// Place` domain merits is touched; every other merit and field is left exactly
// as-is. The player-facing downtime form cannot use PUT /:id (ST-only), so this
// is the sole player write path. Ownership mirrors GET /:id (:331-333).
router.patch('/:id/safe_place_locations', async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid character ID format' });

  // Ownership: players may only write their own character; ST may write any.
  if (!isStRole(req.user)) {
    const owns = (req.user.character_ids || []).some(id => id.toString() === oid.toString());
    if (!owns) return res.status(403).json({ error: 'FORBIDDEN', message: 'Not your character' });
  }

  const { locations } = req.body || {};
  if (!Array.isArray(locations)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'locations must be an array' });
  }
  const MAX_LEN = 200;
  const clean = locations.map(v => {
    if (v == null) return '';
    if (typeof v !== 'string') return null; // sentinel: invalid entry
    return v.slice(0, MAX_LEN);
  });
  if (clean.some(v => v === null)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'each location must be a string' });
  }

  const char = await col().findOne({ _id: oid });
  if (!char) return res.status(404).json({ error: 'NOT_FOUND', message: 'Character not found' });

  // Apply positionally to Safe Place domain merits in document order — the same
  // filter the downtime form renders/collects by, so index i aligns within a
  // single load->submit. A shorter array leaves trailing safe places untouched.
  let spIndex = 0;
  const merits = (char.merits || []).map(m => {
    if (m.category === 'domain' && m.name === 'Safe Place') {
      const loc = clean[spIndex];
      spIndex += 1;
      if (loc !== undefined) return { ...m, location: loc };
    }
    return m;
  });

  const result = await col().findOneAndUpdate(
    { _id: oid },
    { $set: { merits } },
    { returnDocument: 'after' },
  );
  if (!result) return res.status(404).json({ error: 'NOT_FOUND', message: 'Character not found' });
  res.json(result);
});

// PATCH /api/characters/:id/carthian_pull — player (own char) or ST.
// #508: allocate the single Carthian Pull dot to Allies/Contacts/Haven/Herd as a
// live bonus dot (the `free_carthian` channel) on the character, so it shows on
// the sheet via the existing bonus-dot model. At most one Carthian-Pull bonus
// exists at a time, so every write is strip-then-apply: bonus-only instances we
// created (tagged `granted_by:'Carthian Pull'`) are deleted, an augmented
// existing Herd/Haven has its `free_carthian` cleared, then the new allocation
// is applied. Player-scoped (the ST-only PUT cannot be used by players);
// ownership mirrors GET /:id (:331-333). `target:''` clears the allocation.
router.patch('/:id/carthian_pull', async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid character ID format' });

  if (!isStRole(req.user)) {
    const owns = (req.user.character_ids || []).some(id => id.toString() === oid.toString());
    if (!owns) return res.status(403).json({ error: 'FORBIDDEN', message: 'Not your character' });
  }

  // #522: accept a SET of allocations { allocations: [{ target, sphere }, ...] }.
  // The legacy single { target, sphere } is normalised to a one-element set
  // (and target:'' to an empty set = cleared) for back-compat. The pool size is
  // the character's Carthian (Covenant) Status, read from the doc — never
  // trusted from the client.
  const body = req.body || {};
  let rawAllocations;
  if (Array.isArray(body.allocations)) {
    rawAllocations = body.allocations;
  } else if (typeof body.target === 'string') {
    rawAllocations = body.target ? [{ target: body.target, sphere: body.sphere }] : [];
  } else {
    rawAllocations = [];
  }

  const VALID_TARGETS = ['allies', 'contacts', 'haven', 'herd'];
  const allocations = [];
  for (const a of rawAllocations) {
    const target = a && typeof a.target === 'string' ? a.target : '';
    if (target === '') continue; // empty rows are no-ops
    if (!VALID_TARGETS.includes(target)) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'invalid target' });
    }
    let sphereStr = '';
    if (target === 'allies' || target === 'contacts') {
      sphereStr = typeof a.sphere === 'string' ? a.sphere.trim().slice(0, 120) : '';
      if (!sphereStr) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'sphere required for allies/contacts' });
      // #510: sphere must be a recognised influence sphere, not free text.
      if (!INFLUENCE_SPHERES.includes(sphereStr)) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'sphere must be a valid influence sphere' });
      }
    }
    allocations.push({ target, sphere: sphereStr });
  }

  const char = await col().findOne({ _id: oid });
  if (!char) return res.status(404).json({ error: 'NOT_FOUND', message: 'Character not found' });

  // Pool = Carthian Movement covenant Status (0–5). #522.
  const pool = Number(char.status?.covenant?.['Carthian Movement']) || 0;
  if (allocations.length > pool) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: `Carthian Pull allows ${pool} dot(s) (your Carthian Status); ${allocations.length} requested` });
  }

  // 1) Strip ALL prior Carthian-Pull residue, leaving zero trace:
  //    - delete bonus-only instances we created (granted_by:'Carthian Pull');
  //    - clear free_carthian from any merit we augmented in place;
  //    - pop every Contacts sphere a Carthian dot pushed (carthian_spheres[]
  //      plural #522, or the legacy single carthian_sphere #510) so rating
  //      stays equal to spheres.length.
  let merits = (char.merits || [])
    .filter(m => m.granted_by !== 'Carthian Pull')
    .map(m => {
      const hasPushed = (Array.isArray(m.carthian_spheres) && m.carthian_spheres.length) || m.carthian_sphere;
      if (!m.free_carthian && !hasPushed) return m;
      const rest = { ...m };
      delete rest.free_carthian;
      const popped = [];
      if (Array.isArray(rest.carthian_spheres)) { popped.push(...rest.carthian_spheres); delete rest.carthian_spheres; }
      if (rest.carthian_sphere) { popped.push(rest.carthian_sphere); delete rest.carthian_sphere; }
      if (popped.length && Array.isArray(rest.spheres)) rest.spheres = rest.spheres.filter(s => !popped.includes(s));
      return rest;
    });

  // Normalize once so ratings reflect the stripped base (rating = sum of
  // channels) before we cap-check against the base.
  const baseDoc = { merits };
  normalizeCharacterMerits(baseDoc);
  merits = baseDoc.merits;

  // 2) Tally the requested dots per target (stacking allowed — PO 2026-06-01).
  const alliesAdds = new Map();   // area -> dot count
  const contactsAdds = [];        // ordered, distinct spheres to push
  let havenAdds = 0, herdAdds = 0;
  for (const { target, sphere } of allocations) {
    if (target === 'allies') alliesAdds.set(sphere, (alliesAdds.get(sphere) || 0) + 1);
    else if (target === 'contacts') contactsAdds.push(sphere);
    else if (target === 'haven') havenAdds++;
    else herdAdds++;
  }

  // 3) Validate caps against the stripped base (reject over-cap — PO 2026-06-01).
  //    Allies: base(area) + added <= 5 per sphere. Herd/Haven uncapped here.
  for (const [area, cnt] of alliesAdds) {
    const ex = merits.find(m => m.category === 'influence' && m.name === 'Allies' && (m.area || '') === area);
    const base = ex ? (ex.rating || 0) : 0;
    if (base + cnt > 5) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: `Allies (${area}) would exceed 5 dots` });
    }
  }
  //    Contacts: each pushed sphere distinct + not already held; total <= 5.
  const contactsEx = merits.find(m => m.category === 'influence' && m.name === 'Contacts');
  const existingContactSpheres = contactsEx && Array.isArray(contactsEx.spheres) ? contactsEx.spheres : [];
  const seenContact = new Set();
  for (const sp of contactsAdds) {
    if (existingContactSpheres.includes(sp)) return res.status(400).json({ error: 'VALIDATION_ERROR', message: `Contacts sphere already held: ${sp}` });
    if (seenContact.has(sp)) return res.status(400).json({ error: 'VALIDATION_ERROR', message: `a Contacts sphere can only be held once: ${sp}` });
    seenContact.add(sp);
  }
  if (existingContactSpheres.length + contactsAdds.length > 5) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Contacts would exceed 5 spheres' });
  }

  // 4) Apply. Match the existing merit by qualifier (Allies → area, Contacts →
  //    spheres[]); augment it, or create a bonus-only instance if absent.
  for (const [area, cnt] of alliesAdds) {
    const ex = merits.find(m => m.category === 'influence' && m.name === 'Allies' && (m.area || '') === area);
    if (ex) ex.free_carthian = (ex.free_carthian || 0) + cnt;
    else merits.push({ category: 'influence', name: 'Allies', area, granted_by: 'Carthian Pull', free_carthian: cnt, rating: cnt });
  }
  if (contactsAdds.length) {
    if (contactsEx) {
      contactsEx.spheres = [...existingContactSpheres, ...contactsAdds];
      contactsEx.free_carthian = (contactsEx.free_carthian || 0) + contactsAdds.length;
      contactsEx.carthian_spheres = [...(Array.isArray(contactsEx.carthian_spheres) ? contactsEx.carthian_spheres : []), ...contactsAdds];
    } else {
      merits.push({ category: 'influence', name: 'Contacts', spheres: [...contactsAdds], carthian_spheres: [...contactsAdds], granted_by: 'Carthian Pull', free_carthian: contactsAdds.length, rating: contactsAdds.length });
    }
  }
  for (const [name, cnt] of [['Haven', havenAdds], ['Herd', herdAdds]]) {
    if (!cnt) continue;
    const ex = merits.find(m => m.category === 'domain' && m.name === name);
    if (ex) ex.free_carthian = (ex.free_carthian || 0) + cnt;
    else merits.push({ category: 'domain', name, granted_by: 'Carthian Pull', free_carthian: cnt, rating: cnt });
  }

  // 5) Re-sync ratings (rating = sum of channels) so the doc stays consistent.
  const docForNorm = { merits };
  normalizeCharacterMerits(docForNorm);
  merits = docForNorm.merits;

  const result = await col().findOneAndUpdate(
    { _id: oid },
    { $set: { merits } },
    { returnDocument: 'after' },
  );
  if (!result) return res.status(404).json({ error: 'NOT_FOUND', message: 'Character not found' });
  res.json(result);
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

// PATCH /api/characters/:id/player_prefs — player (own char) or ST.
// #542: persist player preference ratings. Narrowly scoped: only the
// `player_prefs` subdocument is touched. Ownership mirrors GET /:id.
router.patch('/:id/player_prefs', async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid character ID format' });

  if (!isStRole(req.user)) {
    const owns = (req.user.character_ids || []).some(id => id.toString() === oid.toString());
    if (!owns) return res.status(403).json({ error: 'FORBIDDEN', message: 'Not your character' });
  }

  const { player_prefs } = req.body || {};
  if (!player_prefs || typeof player_prefs !== 'object') {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'player_prefs must be an object' });
  }

  const VALID_KEYS = [
    'combat_action', 'horror_dread', 'institutional_corruption',
    'mysticism_mystery', 'personal_story', 'political_intrigue',
  ];
  const prefs = {};
  for (const key of VALID_KEYS) {
    const v = player_prefs[key];
    if (v === undefined) continue;
    const rating = (v && typeof v === 'object') ? v.rating : v;
    if (rating !== null && rating !== undefined &&
        (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5)) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: `${key}.rating must be 1–5 integer or null` });
    }
    prefs[key] = { rating: rating ?? null };
  }
  prefs.updated_at = new Date().toISOString();

  const result = await col().findOneAndUpdate(
    { _id: oid },
    { $set: { player_prefs: prefs } },
    { returnDocument: 'after' },
  );
  if (!result) return res.status(404).json({ error: 'NOT_FOUND', message: 'Character not found' });
  res.json(result);
});

// ── Equipment routes (EQ-1, issue #654) ─────────────────────────────────────
//
// All five routes require ST auth.
// DELETE routes: client must refresh after delete to avoid stale indices.

// GET /api/characters/:id/equipment — returns { equipment, assets } for the character.
router.get('/:id/equipment', requireRole('st'), async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid character ID' });
  const char = await col().findOne({ _id: oid }, { projection: { equipment: 1, assets: 1 } });
  if (!char) return res.status(404).json({ error: 'NOT_FOUND', message: 'Character not found' });
  res.json({ equipment: char.equipment || [], assets: char.assets || [] });
});

// POST /api/characters/:id/equipment — append a single equipment item.
router.post('/:id/equipment', requireRole('st'), async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid character ID' });

  const item = req.body;
  const VALID_STATES = ['carried', 'worn', 'stashed', 'lost', 'active'];
  if (!item || typeof item !== 'object') {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Request body must be an equipment item object' });
  }
  if (!item.catalogue_id || typeof item.catalogue_id !== 'string') {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'catalogue_id is required' });
  }
  if (!VALID_STATES.includes(item.state)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: `state must be one of: ${VALID_STATES.join(', ')}` });
  }
  if (!Number.isInteger(item.acquired_cycle) || item.acquired_cycle < 0) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'acquired_cycle must be a non-negative integer' });
  }

  const char = await col().findOne({ _id: oid }, { projection: { _id: 1 } });
  if (!char) return res.status(404).json({ error: 'NOT_FOUND', message: 'Character not found' });

  const cleanItem = {
    catalogue_id:   item.catalogue_id,
    state:          item.state,
    acquired_cycle: item.acquired_cycle,
    notes:          item.notes ?? null,
  };
  const result = await col().findOneAndUpdate(
    { _id: oid },
    { $push: { equipment: cleanItem } },
    { returnDocument: 'after', projection: { equipment: 1, assets: 1 } },
  );
  res.json({ equipment: result.equipment || [], assets: result.assets || [] });
});

// DELETE /api/characters/:id/equipment/:itemIndex — remove by zero-based index.
// Client must refresh after delete to avoid stale indices.
router.delete('/:id/equipment/:itemIndex', requireRole('st'), async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid character ID' });

  const char = await col().findOne({ _id: oid }, { projection: { equipment: 1, assets: 1 } });
  if (!char) return res.status(404).json({ error: 'NOT_FOUND', message: 'Character not found' });

  const idx = parseInt(req.params.itemIndex, 10);
  const arr = char.equipment || [];
  if (!Number.isInteger(idx) || idx < 0 || idx >= arr.length) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Equipment index out of range' });
  }

  arr.splice(idx, 1);
  const result = await col().findOneAndUpdate(
    { _id: oid },
    { $set: { equipment: arr } },
    { returnDocument: 'after', projection: { equipment: 1, assets: 1 } },
  );
  res.json({ equipment: result.equipment || [], assets: result.assets || [] });
});

// POST /api/characters/:id/assets — append a single asset.
router.post('/:id/assets', requireRole('st'), async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid character ID' });

  const item = req.body;
  if (!item || typeof item !== 'object') {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Request body must be an asset object' });
  }
  if (!item.name || typeof item.name !== 'string') {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'name is required' });
  }
  if (!item.description || typeof item.description !== 'string') {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'description is required' });
  }
  if (!Number.isInteger(item.acquired_cycle) || item.acquired_cycle < 0) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'acquired_cycle must be a non-negative integer' });
  }

  const char = await col().findOne({ _id: oid }, { projection: { _id: 1 } });
  if (!char) return res.status(404).json({ error: 'NOT_FOUND', message: 'Character not found' });

  const cleanItem = {
    name:              item.name,
    description:       item.description,
    location:          item.location ?? null,
    mechanical_effect: item.mechanical_effect ?? null,
    acquired_cycle:    item.acquired_cycle,
    notes:             item.notes ?? null,
  };
  const result = await col().findOneAndUpdate(
    { _id: oid },
    { $push: { assets: cleanItem } },
    { returnDocument: 'after', projection: { equipment: 1, assets: 1 } },
  );
  res.json({ equipment: result.equipment || [], assets: result.assets || [] });
});

// DELETE /api/characters/:id/assets/:itemIndex — remove by zero-based index.
// Client must refresh after delete to avoid stale indices.
router.delete('/:id/assets/:itemIndex', requireRole('st'), async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid character ID' });

  const char = await col().findOne({ _id: oid }, { projection: { equipment: 1, assets: 1 } });
  if (!char) return res.status(404).json({ error: 'NOT_FOUND', message: 'Character not found' });

  const idx = parseInt(req.params.itemIndex, 10);
  const arr = char.assets || [];
  if (!Number.isInteger(idx) || idx < 0 || idx >= arr.length) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Asset index out of range' });
  }

  arr.splice(idx, 1);
  const result = await col().findOneAndUpdate(
    { _id: oid },
    { $set: { assets: arr } },
    { returnDocument: 'after', projection: { equipment: 1, assets: 1 } },
  );
  res.json({ equipment: result.equipment || [], assets: result.assets || [] });
});

export default router;
