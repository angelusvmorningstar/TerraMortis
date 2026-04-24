import { Router } from 'express';
import { ObjectId } from 'mongodb';
import Ajv from 'ajv';
import { getCollection } from '../db.js';
import { requireRole, isStRole } from '../middleware/auth.js';
import { npcFlagSchema, STATUS_ENUM } from '../schemas/npc_flag.schema.js';

const router = Router();
const col = () => getCollection('npc_flags');
const relCol = () => getCollection('relationships');

const REASON_MAX_LENGTH = 2000;
const NOTE_MAX_LENGTH = 2000;

const ajv = new Ajv({ allErrors: true, coerceTypes: false });
const validateFlagDoc = ajv.compile(npcFlagSchema);

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
  if (trimmedReason.length > REASON_MAX_LENGTH) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: `reason exceeds maximum length of ${REASON_MAX_LENGTH} characters`,
    });
  }

  // Caller must own the character
  const ownedIds = (req.user.character_ids || []).map(id => String(id));
  if (!ownedIds.includes(String(character_id))) {
    return res.status(403).json({
      error: 'FORBIDDEN',
      message: 'You do not own the specified character',
    });
  }

  // Relationship-gate: an active, non-hidden edge must exist between this PC
  // and this NPC. st_hidden edges are excluded so they cannot be confirmed
  // via the flag-exists signal.
  const edge = await relCol().findOne({
    status: 'active',
    st_hidden: { $ne: true },
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

  // Fast-path uniqueness check — still racy, so the real guard is the
  // partial unique index on (npc_id, flagged_by.character_id, status:'open').
  // Catch duplicate-key on insert below to cover the race window.
  const existing = await col().findOne({
    npc_id: String(npc_id),
    'flagged_by.character_id': String(character_id),
    status: 'open',
  });
  if (existing) {
    return res.status(409).json({
      error: 'CONFLICT',
      message: 'You have already flagged this NPC — resolve the existing flag first',
      existing_flag_id: String(existing._id),
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

  // Defensive: the constructed doc must pass schema validation. Guards against
  // future field additions drifting from the declared shape.
  if (!validateFlagDoc(doc)) {
    console.error('[npc-flags] constructed doc failed schema validation:', validateFlagDoc.errors);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Flag construction failed validation' });
  }

  let insertedId;
  try {
    const result = await col().insertOne(doc);
    insertedId = result.insertedId;
  } catch (err) {
    // Partial unique index on status:'open' → duplicate open flag from race
    if (err && err.code === 11000) {
      return res.status(409).json({
        error: 'CONFLICT',
        message: 'You have already flagged this NPC — resolve the existing flag first',
      });
    }
    throw err;
  }

  const created = await col().findOne({ _id: insertedId });
  res.status(201).json(created);
});

// PUT /:id/resolve — ST only. Accepts { resolution_note } (optional).
router.put('/:id/resolve', requireRole('st'), async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid ID' });

  const note = typeof req.body?.resolution_note === 'string'
    ? req.body.resolution_note.trim()
    : '';
  if (note.length > NOTE_MAX_LENGTH) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: `resolution_note exceeds maximum length of ${NOTE_MAX_LENGTH} characters`,
    });
  }

  const existing = await col().findOne({ _id: oid });
  if (!existing) return res.status(404).json({ error: 'NOT_FOUND', message: 'Flag not found' });

  if (existing.status === 'resolved') {
    // Return the resolved doc so the client can surface who resolved it and
    // with what note, instead of a generic error message.
    return res.status(409).json({
      error: 'CONFLICT',
      message: 'Flag already resolved',
      flag: existing,
    });
  }

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
    // Another writer landed between our read and update. Re-fetch so the
    // client can surface the actual resolved state.
    const latest = await col().findOne({ _id: oid });
    return res.status(409).json({
      error: 'CONFLICT',
      message: 'Flag was modified by another request',
      flag: latest,
    });
  }
  res.json(result);
});

export default router;
