import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getCollection } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { npcSchema } from '../schemas/investigation.schema.js';

const router = Router();
const col = () => getCollection('npcs');

function parseId(id) {
  try { return new ObjectId(id); } catch { return null; }
}

// NPCR.8: in-memory rate-limit state for player quick-add. Keyed by
// player_id. Resets on process restart — acceptable for a single-node
// deployment per the story spec. If we ever scale out, promote to a
// persistent store.
const _quickAddLastAt = new Map();
const QUICKADD_RATE_LIMIT_MS = 30 * 1000;
const QUICKADD_PENDING_CAP = 20;

// NPCR.8: player creates a pending NPC inline (from the Relationships tab
// quick-add picker). Owner check + per-player 30s rate limit + per-player
// 20-cap on concurrent pending NPCs. The caller then POSTs a relationship
// edge separately via /api/relationships using the returned _id.
router.post('/quick-add', async (req, res) => {
  const { name, relationship_note, general_note, character_id } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'name is required' });
  }
  if (!character_id || typeof character_id !== 'string') {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'character_id is required' });
  }

  const isSt = req.user?.role === 'st' || req.user?.role === 'dev';
  const userCharIds = (req.user?.character_ids || []).map(String);
  if (!isSt && !userCharIds.includes(String(character_id))) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'character_id is not yours' });
  }

  const playerId = String(req.user?.player_id || req.user?.id || '');
  const now = Date.now();
  const lastAt = _quickAddLastAt.get(playerId) || 0;
  if (now - lastAt < QUICKADD_RATE_LIMIT_MS) {
    const waitSec = Math.ceil((QUICKADD_RATE_LIMIT_MS - (now - lastAt)) / 1000);
    return res.status(429).json({
      error: 'RATE_LIMIT',
      message: `Please wait ${waitSec}s before creating another NPC.`,
      retry_after_ms: QUICKADD_RATE_LIMIT_MS - (now - lastAt),
    });
  }

  const openPending = await col().countDocuments({
    status: 'pending',
    'created_by.player_id': playerId,
  });
  if (openPending >= QUICKADD_PENDING_CAP) {
    return res.status(429).json({
      error: 'RATE_LIMIT',
      message: `You have ${openPending} pending NPCs awaiting ST review. Wait for the ST to resolve some before creating more.`,
      cap: QUICKADD_PENDING_CAP,
    });
  }

  const nowIso = new Date().toISOString();
  const doc = {
    name: String(name).trim(),
    description: String(general_note || '').trim(),
    notes: String(relationship_note || '').trim(),
    status: 'pending',
    linked_character_ids: [String(character_id)],
    linked_cycle_id: null,
    created_by: {
      type: 'player',
      player_id: playerId,
      character_id: String(character_id),
    },
    created_at: nowIso,
    updated_at: nowIso,
  };

  const result = await col().insertOne(doc);
  _quickAddLastAt.set(playerId, now);
  const created = await col().findOne({ _id: result.insertedId });
  res.status(201).json(created);
});

// Test-only reset hook. Exported so integration tests can clear rate-limit
// state between tests without process restart. Never called in production.
export function _resetQuickAddRateLimit() {
  _quickAddLastAt.clear();
}

// NPCR.7: player-readable NPC directory. Returns minimal fields for all
// active / pending NPCs so a player can pick one when creating a new edge
// from the Relationships tab. Must register BEFORE the ST-only router.use.
router.get('/directory', async (req, res) => {
  const docs = await col()
    .find(
      { status: { $in: ['active', 'pending'] } },
      { projection: { name: 1, description: 1, status: 1, is_correspondent: 1 } }
    )
    .sort({ name: 1 })
    .toArray();
  res.json(docs);
});

// DTOSL.2: player-readable endpoint (must register BEFORE the ST-only
// router.use below). Returns NPCs linked to the given character. The
// caller must own the character (character_ids contains the id). ST
// bypasses the ownership check.
router.get('/for-character/:characterId', async (req, res) => {
  const { characterId } = req.params;
  const userCharIds = (req.user?.character_ids || []).map(String);
  const isSt = req.user?.role === 'st' || req.user?.role === 'dev';
  if (!isSt && !userCharIds.includes(String(characterId))) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Not your character' });
  }
  const filter = {
    linked_character_ids: String(characterId),
    status: { $in: ['active', 'pending'] },
  };
  if (req.query.is_correspondent === 'true') {
    filter.is_correspondent = true;
  }
  const docs = await col().find(filter).sort({ name: 1 }).toArray();
  res.json(docs);
});

// All other NPC routes are ST-only
router.use(requireRole('st'));

// GET /api/npcs — list all, optionally filtered by cycle_id
router.get('/', async (req, res) => {
  const filter = {};
  if (req.query.cycle_id) {
    const oid = parseId(req.query.cycle_id);
    filter.$or = oid
      ? [{ linked_cycle_id: oid }, { linked_cycle_id: req.query.cycle_id }]
      : [{ linked_cycle_id: req.query.cycle_id }];
  }
  if (req.query.status) filter.status = req.query.status;
  const docs = await col().find(filter).sort({ name: 1 }).toArray();
  res.json(docs);
});

// POST /api/npcs
router.post('/', validate(npcSchema), async (req, res) => {
  const { name, description, status, linked_character_ids, linked_cycle_id, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'name required' });

  const doc = {
    name,
    description: description || '',
    status: status || 'active',
    linked_character_ids: linked_character_ids || [],
    linked_cycle_id: linked_cycle_id ? (parseId(String(linked_cycle_id)) || linked_cycle_id) : null,
    notes: notes || '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const result = await col().insertOne(doc);
  const created = await col().findOne({ _id: result.insertedId });
  res.status(201).json(created);
});

// PUT /api/npcs/:id
router.put('/:id', async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid ID' });

  const { _id, ...updates } = req.body;
  updates.updated_at = new Date().toISOString();

  const result = await col().findOneAndUpdate({ _id: oid }, { $set: updates }, { returnDocument: 'after' });
  if (!result) return res.status(404).json({ error: 'NOT_FOUND', message: 'NPC not found' });
  res.json(result);
});

// DELETE /api/npcs/:id (archive = set status to 'archived')
router.delete('/:id', async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid ID' });
  const result = await col().findOneAndUpdate(
    { _id: oid },
    { $set: { status: 'archived', updated_at: new Date().toISOString() } },
    { returnDocument: 'after' }
  );
  if (!result) return res.status(404).json({ error: 'NOT_FOUND', message: 'NPC not found' });
  res.json(result);
});

export default router;
