import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getCollection } from '../db.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();
const mods = () => getCollection('st_mods');
const audit = () => getCollection('st_mod_audit');

// Canonical attribute/skill lists — mirror public/js/data/constants.js
// (Capitalised — that's how they're keyed on the character document; the
// lowercase examples in ADR-004 §D3 were illustrative, not normative.)
const ATTRS = [
  'Intelligence', 'Wits', 'Resolve',
  'Strength', 'Dexterity', 'Stamina',
  'Presence', 'Manipulation', 'Composure',
];
const SKILLS = [
  'Academics', 'Computer', 'Crafts', 'Investigation', 'Medicine', 'Occult', 'Politics', 'Science',
  'Athletics', 'Brawl', 'Drive', 'Firearms', 'Larceny', 'Stealth', 'Survival', 'Weaponry',
  'Animal Ken', 'Empathy', 'Expression', 'Intimidation', 'Persuasion', 'Socialise', 'Streetwise', 'Subterfuge',
];

// Static stat_path whitelist. Sourced from ADR-004 §D3, with field-name
// corrections per the §Concerns Item 4 hand-off:
//   - PRD example `current.damage / current.willpower / current.vitae` does NOT
//     resolve on the character document — those values live in the separate
//     `tracker_state` collection, not on the character. The overlay is a
//     character-render feature (ADR-004 §D1), so the whitelist surfaces only
//     character-document fields. Current state slots that exist on the char doc:
//     `blood_potency` and `humanity` (both top-level).
//   - Damage/wp-current/vitae-current can be re-added later if a future story
//     extends the overlay into the tracker render path.
const STATIC_WHITELIST = new Set([
  ...ATTRS.flatMap(a => [`attributes.${a}.dots`, `attributes.${a}.bonus`]),
  ...SKILLS.flatMap(s => [`skills.${s}.dots`, `skills.${s}.bonus`]),
  'blood_potency',
  'humanity',
  'derived.defence',
  'derived.health_max',
  'derived.willpower_max',
  'derived.size',
  'derived.speed',
  'derived.initiative',
]);

const DYNAMIC_PATH_RE = /^(merits|disciplines)\.[0-9]+\.dots$/;

function isValidStatPath(p) {
  return typeof p === 'string' && (STATIC_WHITELIST.has(p) || DYNAMIC_PATH_RE.test(p));
}

function parseId(id) {
  try { return new ObjectId(id); } catch { return null; }
}

function nowIso() { return new Date().toISOString(); }

function creatorFromUser(user) {
  return {
    discord_id: String(user?.id || ''),
    discord_name: user?.global_name || user?.username || '',
  };
}

// ─── POST /api/st_mods ───────────────────────────────────────────────
// Creates an st_mod and a paired st_mod_audit row in the same handler.
// Sequential write with best-effort rollback on audit failure (no Mongo
// transaction — v1 acceptable per story §Tasks Task 3).
router.post('/', requireRole('st'), async (req, res) => {
  const { character_id, stat_path, delta, reason, show_reason_to_player } = req.body || {};

  if (!character_id || typeof character_id !== 'string') {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'character_id is required' });
  }
  if (!Number.isInteger(delta)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'delta must be integer' });
  }
  const trimmedReason = typeof reason === 'string' ? reason.trim() : '';
  if (!trimmedReason) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'reason is required' });
  }
  if (!isValidStatPath(stat_path)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'invalid stat_path', stat_path });
  }

  const createdBy = creatorFromUser(req.user);
  const createdAt = nowIso();

  const modDoc = {
    character_id: String(character_id),
    stat_path,
    delta,
    reason: trimmedReason,
    show_reason_to_player: !!show_reason_to_player,
    created_by: createdBy,
    created_at: createdAt,
  };

  const modResult = await mods().insertOne(modDoc);
  const modId = modResult.insertedId;

  // Audit row mirrors the mod (minus show_reason_to_player, per AC#2) and
  // references the mod by st_mod_id so revoke-time matching is trivial.
  const auditDoc = {
    st_mod_id: modId,
    character_id: String(character_id),
    stat_path,
    delta,
    reason: trimmedReason,
    created_by: createdBy,
    created_at: createdAt,
  };

  try {
    await audit().insertOne(auditDoc);
  } catch (err) {
    // Best-effort rollback: drop the mod so we don't leave an unrecoverable
    // mod with no audit trail. Audit-survives-revoke is the load-bearing
    // contract; audit-survives-failed-insert isn't.
    try { await mods().deleteOne({ _id: modId }); } catch { /* best-effort */ }
    console.error('[st_mods] audit insert failed, rolled back mod:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to write audit row' });
  }

  const created = await mods().findOne({ _id: modId });
  res.status(201).json(created);
});

// ─── GET /api/st_mods?character_id=:id ───────────────────────────────
// Active mods for a character, oldest first (creation order — multi-mod
// stack downstream renders top-to-bottom in this order).
router.get('/', requireRole('st'), async (req, res) => {
  const { character_id } = req.query;
  if (!character_id || typeof character_id !== 'string') {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'character_id is required' });
  }
  const docs = await mods()
    .find({ character_id: String(character_id) })
    .sort({ created_at: 1 })
    .toArray();
  res.json(docs);
});

// ─── DELETE /api/st_mods/:id ─────────────────────────────────────────
// Hard-delete the mod. Audit row is intentionally LEFT IN PLACE.
router.delete('/:id', requireRole('st'), async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid ID' });
  const result = await mods().deleteOne({ _id: oid });
  if (!result.deletedCount) return res.status(404).json({ error: 'NOT_FOUND' });
  res.json({ deleted: true });
});

export default router;

// ─── GET /api/st_mod_audit?character_id=:id ──────────────────────────
// Mounted as its own router by server/index.js so the path namespace
// stays clean (POST/GET/DELETE /api/st_mods + GET /api/st_mod_audit).
export const auditRouter = Router();

auditRouter.get('/', requireRole('st'), async (req, res) => {
  const { character_id } = req.query;
  if (!character_id || typeof character_id !== 'string') {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'character_id is required' });
  }
  const docs = await audit()
    .find({ character_id: String(character_id) })
    .sort({ created_at: 1 })
    .toArray();
  res.json(docs);
});
