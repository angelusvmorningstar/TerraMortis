// Generic ordeal responses API — handles Rules, Lore, and Covenant ordeals.
// These are player-level ordeals (stored per player, not per character).
// Collection: ordeal_responses, keyed by { player_id, ordeal_type }.

import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getCollection } from '../db.js';
import { requireRole, isStRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ordealResponseSchema } from '../schemas/ordeal.schema.js';
import { upsertOrdeal } from '../lib/ordeal-cascade.js';
import { requireOrdealNotRetiredForPlayers } from '../middleware/ordeal-retirement.js';

const router = Router();
const col = () => getCollection('ordeal_responses');

const VALID_TYPES = ['rules', 'lore', 'covenant'];

function parseId(id) {
  try {
    return new ObjectId(id);
  } catch {
    return null;
  }
}

/**
 * Cascade a player-level ordeal completion to all of that player's characters.
 * Upserts an entry in each character's ordeals array.
 */
async function cascadePlayerOrdealXp(playerId, ordealName) {
  const players = getCollection('players');
  const chars   = getCollection('characters');
  const player = await players.findOne({ _id: playerId });
  if (!player?.character_ids?.length) return;

  const now = new Date().toISOString();
  for (const charId of player.character_ids) {
    await upsertOrdeal(chars, charId, ordealName, now);
  }
}

// GET /api/ordeal-responses?type=rules — get current user's response for an ordeal type
router.get('/', async (req, res) => {
  const type = req.query.type;
  if (!type || !VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Valid type required: rules, lore, covenant' });
  }

  const playerId = req.user.player_id;

  // ST can optionally query another player's response
  const queryPlayerId = (isStRole(req.user) && req.query.player_id)
    ? parseId(req.query.player_id)
    : playerId;

  const doc = await col().findOne({ player_id: queryPlayerId, ordeal_type: type });
  if (!doc) return res.json(null);
  res.json(doc);
});

// POST /api/ordeal-responses — create a new response
router.post('/', requireOrdealNotRetiredForPlayers, validate(ordealResponseSchema), async (req, res) => {
  const { type, responses } = req.body;
  if (!type || !VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Valid type required' });
  }

  const playerId = req.user.player_id;

  const existing = await col().findOne({ player_id: playerId, ordeal_type: type });
  if (existing) return res.status(409).json({ error: 'CONFLICT', message: 'Response already exists — use PUT to update' });

  // Resolve character_id even when the session's character_ids is stale or empty.
  let characterId = req.user.character_ids?.[0] ?? null;
  if (!characterId) {
    const player = await getCollection('players').findOne(
      { _id: req.user.player_id },
      { projection: { character_ids: 1 } }
    );
    characterId = player?.character_ids?.[0] ?? null;
  }

  const now = new Date().toISOString();
  const doc = {
    player_id: playerId,
    character_id: characterId,
    ordeal_type: type,
    status: 'draft',
    responses: responses || {},
    created_at: now,
    updated_at: now,
    submitted_at: null,
  };

  const result = await col().insertOne(doc);
  const created = await col().findOne({ _id: result.insertedId });
  res.status(201).json(created);
});

// PUT /api/ordeal-responses/:id — update
// 2026-08-29: requireOrdealNotRetiredForPlayers was wired onto POST only when the
// retirement flag shipped (2026-08-25) — an oversight. A player could still edit or
// submit an EXISTING draft (11 non-approved live today) via this route, unblocked.
router.put('/:id', requireOrdealNotRetiredForPlayers, async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid ID format' });

  const existing = await col().findOne({ _id: oid });
  if (!existing) return res.status(404).json({ error: 'NOT_FOUND', message: 'Response not found' });

  // 2026-09-01 general audit fix (Medium severity): was role === 'player',
  // which let a coordinator-role account edit/submit any player's ordeal
  // response with no ownership or approved-lock check at all.
  if (!isStRole(req.user)) {
    if (existing.player_id.toString() !== req.user.player_id.toString()) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Not your response' });
    }
    if (existing.status === 'approved') {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Approved ordeal is locked' });
    }
  }

  const updates = { updated_at: new Date().toISOString() };
  if (req.body.responses !== undefined) updates.responses = req.body.responses;

  if (req.body.marking !== undefined && isStRole(req.user)) {
    updates.marking = req.body.marking;
    if (req.body.marking?.status === 'complete') {
      updates.marking.marked_at  = updates.updated_at;
      updates.marking.xp_awarded = 3;
    }
  }

  if (req.body.status === 'submitted') {
    updates.status = 'submitted';
    updates.submitted_at = updates.updated_at;
  } else if (req.body.status === 'approved' && isStRole(req.user)) {
    updates.status = 'approved';
    updates.approved_at = updates.updated_at;
  } else if (req.body.status === 'draft') {
    if (existing.status !== 'approved' || isStRole(req.user)) {
      updates.status = 'draft';
    }
  }

  const result = await col().findOneAndUpdate(
    { _id: oid },
    { $set: updates },
    { returnDocument: 'after' }
  );

  // Cascade XP to all player characters when a player-level ordeal is newly approved
  if (updates.status === 'approved' && existing.status !== 'approved') {
    await cascadePlayerOrdealXp(existing.player_id, existing.ordeal_type);
  }

  // Also cascade when ST marks complete via the admin marking panel
  if (updates.marking?.status === 'complete' && existing.marking?.status !== 'complete') {
    await cascadePlayerOrdealXp(existing.player_id, existing.ordeal_type);
  }

  res.json(result);
});

// GET /api/ordeal-responses/all — ST only
router.get('/all', requireRole('st'), async (req, res) => {
  const filter = {};
  if (req.query.type) filter.ordeal_type = req.query.type;
  const docs = await col().find(filter).toArray();

  // Batch-enrich: for docs with null character_id, resolve via player lookup.
  // Mutates in-memory docs only — never writes back to MongoDB.
  const nullCharDocs = docs.filter(d => !d.character_id && d.player_id);
  if (nullCharDocs.length) {
    const playerIds = [...new Set(nullCharDocs.map(d => d.player_id))];
    const players = await getCollection('players').find(
      { _id: { $in: playerIds } },
      { projection: { _id: 1, character_ids: 1 } }
    ).toArray();
    const playerMap = new Map(players.map(p => [String(p._id), p.character_ids?.[0] ?? null]));
    docs.forEach(d => {
      if (!d.character_id && d.player_id) {
        d.character_id = playerMap.get(String(d.player_id)) ?? null;
      }
    });
  }

  // Snapshot character_name for all docs that have a character_id — includes
  // retired characters which may not appear in the admin's active chars[] array.
  const charIds = [...new Set(docs.filter(d => d.character_id).map(d => d.character_id))];
  if (charIds.length) {
    const charDocs = await getCollection('characters').find(
      { _id: { $in: charIds } },
      { projection: { _id: 1, name: 1, moniker: 1, honorific: 1 } }
    ).toArray();
    const charMap = new Map(charDocs.map(c => [String(c._id), c]));
    docs.forEach(d => {
      if (d.character_id && !d.character_name) {
        const c = charMap.get(String(d.character_id));
        if (c) d.character_name = [c.honorific, c.moniker || c.name].filter(Boolean).join(' ');
      }
    });
  }

  res.json(docs);
});

export default router;
