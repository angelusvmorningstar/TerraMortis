import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getCollection } from '../db.js';
import { requireRole, isStRole } from '../middleware/auth.js';
import { STATUS_ENUM } from '../schemas/npc_flag.schema.js';

const router = Router();
const col = () => getCollection('npc_flags');
const relCol = () => getCollection('relationships');

function parseId(id) {
  try { return new ObjectId(id); } catch { return null; }
}

function nowIso() { return new Date().toISOString(); }

// GET / — ST only. ?status=<open|resolved> optional filter.
router.get('/', requireRole('st'), async (req, res) => {
  const { status, npc_id } = req.query;
  if (status !== undefined && !STATUS_ENUM.includes(String(status))) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: `Unknown status '${status}'`,
    });
  }
  if (npc_id !== undefined && !ObjectId.isValid(String(npc_id))) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: `Invalid ObjectId in query param 'npc_id'`,
    });
  }
  const filter = {};
  if (status) filter.status = String(status);
  if (npc_id) filter.npc_id = String(npc_id);
  const docs = await col().find(filter).sort({ created_at: -1 }).toArray();
  res.json(docs);
});

// POST / — player-only. Accepts { npc_id, character_id, reason }.
// Server constructs flagged_by from req.user + character_id, verifies
// ownership and relationship-edge, enforces uniqueness.
router.post('/', async (req, res) => {
  // Per product decision: ST never POSTs flags (they only resolve).
  if (isStRole(req.user)) {
    return res.status(403).json({
      error: 'FORBIDDEN',
      message: 'STs cannot flag NPCs — flags are a player-to-ST signal.',
    });
  }
  if (req.user?.role !== 'player') {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Player role required' });
  }

  const { npc_id, character_id, reason } = req.body || {};

  if (!npc_id || typeof npc_id !== 'string') {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'npc_id is required' });
  }
  if (!character_id || typeof character_id !== 'string') {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'character_id is required' });
  }
  const trimmedReason = typeof reason === 'string' ? reason.trim() : '';
  if (!trimmedReason) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'reason is required' });
  }

  // Caller must own the character
  const ownedIds = (req.user.character_ids || []).map(id => String(id));
  if (!ownedIds.includes(String(character_id))) {
    return res.status(403).json({
      error: 'FORBIDDEN',
      message: 'You do not own the specified character',
    });
  }

  // Relationship-gate: an active edge must exist between this PC and this NPC
  const edge = await relCol().findOne({
    status: 'active',
    $or: [
      { 'a.type': 'pc', 'a.id': String(character_id), 'b.type': 'npc', 'b.id': String(npc_id) },
      { 'b.type': 'pc', 'b.id': String(character_id), 'a.type': 'npc', 'a.id': String(npc_id) },
    ],
  });
  if (!edge) {
    return res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Your character has no active relationship with this NPC',
    });
  }

  // Uniqueness: one open flag per (character, npc)
  const existing = await col().findOne({
    npc_id: String(npc_id),
    'flagged_by.character_id': String(character_id),
    status: 'open',
  });
  if (existing) {
    return res.status(409).json({
      error: 'CONFLICT',
      message: 'You have already flagged this NPC — resolve the existing flag first',
    });
  }

  const playerIdent = String(req.user.id || req.user.player_id || '');
  if (playerIdent.length === 0) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Missing player identity' });
  }

  const doc = {
    npc_id: String(npc_id),
    flagged_by: {
      player_id: playerIdent,
      character_id: String(character_id),
    },
    reason: trimmedReason,
    status: 'open',
    created_at: nowIso(),
  };

  const result = await col().insertOne(doc);
  const created = await col().findOne({ _id: result.insertedId });
  res.status(201).json(created);
});

// PUT /:id/resolve — ST only. Accepts { resolution_note } (optional).
router.put('/:id/resolve', requireRole('st'), async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid ID' });

  const existing = await col().findOne({ _id: oid });
  if (!existing) return res.status(404).json({ error: 'NOT_FOUND', message: 'Flag not found' });

  if (existing.status === 'resolved') {
    return res.status(409).json({
      error: 'CONFLICT',
      message: 'Flag already resolved',
    });
  }

  const note = typeof req.body?.resolution_note === 'string'
    ? req.body.resolution_note.trim()
    : '';

  const updates = {
    status: 'resolved',
    resolved_by: { type: 'st', id: String(req.user?.id || '') },
    resolved_at: nowIso(),
  };
  if (note) updates.resolution_note = note;

  const result = await col().findOneAndUpdate(
    { _id: oid, status: 'open' },
    { $set: updates },
    { returnDocument: 'after' }
  );
  if (!result) {
    return res.status(409).json({
      error: 'CONFLICT',
      message: 'Flag was modified by another request',
    });
  }
  res.json(result);
});

export default router;
