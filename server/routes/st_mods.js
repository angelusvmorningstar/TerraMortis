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

// Static stat_path whitelist. Sourced from ADR-004 §D3 + Rev 2 §D5.
//
// `current.*` paths (damage_bashing / damage_lethal / damage_aggravated /
// willpower / vitae) resolve against a synthetic `c.current` namespace
// that STM-2's pre-overlay splice materialises onto the in-memory
// character from the `tracker_state` collection. The character document
// itself does NOT carry these fields — the overlay is a render-time
// composition, not a storage shape. Per ADR-004 §D6 the overlay is
// strictly read-direction and never writes back to tracker_state.
//
// `blood_potency` and `humanity` live at the character-document root.
// `derived.*` are render-time computed; STM-2's overlay sets them on
// the in-memory character before renderSheet reads them.
const STATIC_WHITELIST = new Set([
  ...ATTRS.flatMap(a => [`attributes.${a}.dots`, `attributes.${a}.bonus`]),
  ...SKILLS.flatMap(s => [`skills.${s}.dots`, `skills.${s}.bonus`]),
  // Current state — tracker_state-resident, spliced pre-overlay (ADR-004 §D5)
  'current.damage_bashing',
  'current.damage_lethal',
  'current.damage_aggravated',
  'current.willpower',
  'current.vitae',
  // Character-doc root
  'blood_potency',
  'humanity',
  // Derived
  'derived.defence',
  'derived.health_max',
  'derived.willpower_max',
  'derived.size',
  'derived.speed',
  'derived.initiative',
]);

// STM-5 (issue #386): the original STM-1 regex accepted numeric indices
// only, which works for `c.merits[]` (an array) but NOT for `c.disciplines`
// — that's an object keyed by discipline NAME on the v2 schema (see
// `public/js/data/accessors.js#discDots` which reads `c.disciplines[name].dots`).
// Splitting the regex per kind: merits stay numeric (array path); disciplines
// accept an ASCII-letter name key to match the actual document shape.
const DYNAMIC_PATH_RE = /^(merits\.[0-9]+|disciplines\.[A-Za-z][A-Za-z0-9]*)\.dots$/;

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

// ─── GET /api/st_mod_audit ───────────────────────────────────────────
// Mounted as its own router by server/index.js so the path namespace
// stays clean (POST/GET/DELETE /api/st_mods + GET /api/st_mod_audit).
//
// STM-6 (issue #379): extended with optional filters + pagination.
// Backwards-compatible breaking change in response shape: returns
// { rows, total, page, page_size } wrapper instead of a bare array.
// STM-2 had no consumer; the STM-6 admin page is the first consumer.
//
// Query params (all optional):
//   character_id — exact match
//   st           — match against created_by.discord_name
//   from / to    — ISO date range, inclusive, applied to created_at
//   page         — 1-indexed (default 1)
//   page_size    — default 50, clamped to [1, 100]
//
// Each returned row is decorated with { ...auditRow, active: <bool> }
// where active === (st_mods document with _id === auditRow.st_mod_id exists).
// The active lookup is batched into a single $in query — explicitly NOT
// N+1 — per ADR §"Concerns" Item 2 sibling concern about query shape.
export const auditRouter = Router();

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

auditRouter.get('/', requireRole('st'), async (req, res) => {
  const { character_id, st, from, to } = req.query;

  // Parse pagination — clamp to safe bounds. Bad input falls back to defaults
  // rather than 400, matching the "filters are optional" spirit.
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(req.query.page_size, 10) || DEFAULT_PAGE_SIZE),
  );

  // Build the Mongo filter from non-empty params
  const filter = {};
  if (character_id) filter.character_id = String(character_id);
  if (st) filter['created_by.discord_name'] = String(st);
  if (from || to) {
    filter.created_at = {};
    if (from) filter.created_at.$gte = String(from);
    if (to) filter.created_at.$lte = String(to);
  }

  const total = await audit().countDocuments(filter);
  const rows = await audit()
    .find(filter)
    .sort({ created_at: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .toArray();

  // Batched active-check: one $in query against st_mods regardless of
  // page size. Collect st_mod_ids from this page, find which still exist,
  // map back to a boolean per row. Audit rows from a future writer that
  // didn't populate st_mod_id (none today) safely default to inactive.
  const stModIds = rows.map(r => r.st_mod_id).filter(id => id != null);
  let aliveSet = new Set();
  if (stModIds.length) {
    const alive = await mods()
      .find({ _id: { $in: stModIds } }, { projection: { _id: 1 } })
      .toArray();
    aliveSet = new Set(alive.map(d => String(d._id)));
  }

  const decorated = rows.map(r => ({
    ...r,
    active: r.st_mod_id != null && aliveSet.has(String(r.st_mod_id)),
  }));

  res.json({ rows: decorated, total, page, page_size: pageSize });
});
