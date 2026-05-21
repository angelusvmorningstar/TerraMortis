import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getCollection } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { broadcastStModUpdate } from '../ws.js';

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

/** STM-10 (issue #434, ADR-004 Rev 4 §D17): build a lifecycle audit-event
 *  row. The audit collection is an immutable event stream:
 *  created / activated / deactivated / deleted.
 *
 *  STM-11 (issue #439): `by` (actor) + `at` (timestamp) are now the ONLY
 *  field names. The STM-10 dual-stamp aliases (`created_by`/`created_at`)
 *  are dropped — the audit GET reader migrated to by/at (with an $ifNull
 *  fallback to the legacy fields for pre-STM-11 rows already in the DB).
 *
 *  `mod` is the (possibly partial) mod doc: needs _id, character_id,
 *  stat_path, delta, reason. delta + reason are captured AT THE EVENT
 *  so a later edit/revoke can't rewrite history. */
function buildAuditEvent(mod, event, who, when) {
  return {
    st_mod_id: mod._id,
    character_id: String(mod.character_id),
    stat_path: mod.stat_path,
    delta: mod.delta,
    reason: mod.reason,
    event,
    by: who,
    at: when,
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
    // STM-10 (issue #434, ADR-004 Rev 4 §D15): lifecycle field. Mods are
    // now persistent + toggleable; `active` defaults true on create.
    active: true,
    created_by: createdBy,
    created_at: createdAt,
  };

  const modResult = await mods().insertOne(modDoc);
  const modId = modResult.insertedId;

  // STM-10 (§D17): the audit row is now a lifecycle EVENT (event: 'created')
  // rather than the implicit creation-only row from STM-1.
  const auditDoc = buildAuditEvent({ _id: modId, character_id, stat_path, delta, reason: trimmedReason }, 'created', createdBy, createdAt);

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

  // STM-9 (issue #416, ADR-004 Rev 3 §D11): broadcast the create event
  // AFTER both inserts succeed. STM-10 (§D18) widened the op set; 'create'
  // unchanged. Connected clients refetch + re-overlay for the affected
  // character; the originating client deduplicates via markLocalWrite.
  broadcastStModUpdate(String(character_id), 'create', String(modId));

  const created = await mods().findOne({ _id: modId });
  res.status(201).json(created);
});

// Own-character access check (mirrors server/routes/tracker.js#canAccess
// pattern). Players can read mods only for character_ids they own;
// ST / dev can read mods for any character. Issue #410 — pre-fix this
// route was requireRole('st'), which broke the player-side sheet
// (loadStMods got 401, applyStMods short-circuited, no overlay rendered).
function canAccessMods(req, characterId) {
  const role = req.user?.role;
  if (role === 'st' || role === 'dev') return true;
  const ids = (req.user?.character_ids || []).map(String);
  return ids.includes(String(characterId));
}

// STM-7 (issue #413): cap on the bulk character_ids CSV. Picked at 200
// against a current campaign size of ~31 — comfortable headroom plus the
// suite app's boot path includes retired chars, so realistic worst case
// is ~50. 200 leaves room without inviting pathological inputs. Reject
// 400 above; chars beyond the cap would defeat the boot-path single-RTT
// goal anyway.
const BULK_CHARACTER_IDS_CAP = 200;

// ─── GET /api/st_mods ────────────────────────────────────────────────
// Two shapes, dispatched on which query param is present:
//   1. ?character_id=:id  →  returns [...mods]  (STM-1 single-char shape)
//   2. ?character_ids=a,b,c → returns { [character_id]: [...mods] }
//      (STM-7 bulk shape — one DB round-trip for the boot-path overlay
//       per ADR-004 Rev 3 §D9).
// Both shapes sort each character's mods by created_at ascending.
//
// Auth: any authenticated user. Ownership enforced by canAccessMods
// inside the handler — applied per-id for the bulk shape. Any non-own
// id in the bulk CSV → 403 (atomic; we never return partial results to
// a player who included an off-character id).
router.get('/', async (req, res) => {
  const { character_id, character_ids } = req.query;

  // ── Bulk shape (STM-7) ─────────────────────────────────────────
  if (character_ids !== undefined) {
    if (typeof character_ids !== 'string' || character_ids.length === 0) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'character_ids must be a non-empty CSV string' });
    }
    const ids = character_ids.split(',').map(s => s.trim()).filter(Boolean);
    if (ids.length === 0) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'character_ids must contain at least one id' });
    }
    if (ids.length > BULK_CHARACTER_IDS_CAP) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: `character_ids exceeds cap of ${BULK_CHARACTER_IDS_CAP}`,
        received: ids.length,
        cap: BULK_CHARACTER_IDS_CAP,
      });
    }
    // Per-id ownership check. Atomic: a player asking for any non-own id
    // gets 403 with no rows returned. ST/dev pass through.
    for (const id of ids) {
      if (!canAccessMods(req, id)) {
        return res.status(403).json({ error: 'FORBIDDEN', message: 'Not your character', character_id: id });
      }
    }
    const docs = await mods()
      .find({ character_id: { $in: ids } })
      .sort({ created_at: 1 })
      .toArray();
    // Bucket by character_id; every requested id gets a key (empty array
    // when no mods exist) so the client doesn't need to defend against
    // missing keys.
    const byChar = Object.fromEntries(ids.map(id => [id, []]));
    for (const d of docs) {
      if (byChar[d.character_id]) byChar[d.character_id].push(d);
    }
    return res.json(byChar);
  }

  // ── Single-character shape (STM-1, unchanged) ──────────────────
  if (!character_id || typeof character_id !== 'string') {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'character_id is required' });
  }
  if (!canAccessMods(req, character_id)) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Not your character' });
  }
  const docs = await mods()
    .find({ character_id: String(character_id) })
    .sort({ created_at: 1 })
    .toArray();
  res.json(docs);
});

// ─── PATCH /api/st_mods/:id ──────────────────────────────────────────
// STM-10 (issue #434, ADR-004 Rev 4 §D16): toggle a mod's active state.
// Body { active: boolean }. Writes an `activated` / `deactivated` audit
// event and broadcasts the matching WS op. Reason is captured from the
// mod's current reason (optional override via body.reason); by + at are
// always server-stamped. Returns the updated mod doc.
router.patch('/:id', requireRole('st'), async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid ID' });

  const { active } = req.body || {};
  if (typeof active !== 'boolean') {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'active must be boolean' });
  }

  const existing = await mods().findOne({ _id: oid });
  if (!existing) return res.status(404).json({ error: 'NOT_FOUND' });

  // Flip the active flag, then write the lifecycle event. Reason captured
  // at the event (override allowed; defaults to the mod's creation reason).
  const overrideReason = typeof req.body?.reason === 'string' && req.body.reason.trim()
    ? req.body.reason.trim()
    : existing.reason;
  const who = creatorFromUser(req.user);
  const when = nowIso();
  const event = active ? 'activated' : 'deactivated';

  await mods().updateOne({ _id: oid }, { $set: { active } });

  const auditDoc = buildAuditEvent(
    { _id: oid, character_id: existing.character_id, stat_path: existing.stat_path, delta: existing.delta, reason: overrideReason },
    event, who, when,
  );
  try {
    await audit().insertOne(auditDoc);
  } catch (err) {
    // Roll back the flag so the audit ledger and mod state stay consistent
    // (mirrors STM-1's create rollback). The ledger is the source of truth
    // for "what happened"; a flag change with no audit row would lie.
    try { await mods().updateOne({ _id: oid }, { $set: { active: existing.active !== false } }); } catch { /* best-effort */ }
    console.error('[st_mods] PATCH audit insert failed, rolled back active flag:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to write audit row' });
  }

  // STM-10 (§D18): op set widened. activate / deactivate are new ops.
  broadcastStModUpdate(String(existing.character_id), active ? 'activate' : 'deactivate', String(oid));

  const updated = await mods().findOne({ _id: oid });
  res.json(updated);
});

// ─── DELETE /api/st_mods/:id ─────────────────────────────────────────
// STM-10 (issue #434, ADR-004 Rev 4 §D17 — HALT-DAR LOAD-BEARING):
// tombstone-before-destroy. The `deleted` audit event MUST be written
// BEFORE the mod doc is removed. If the tombstone insert fails, the
// delete does NOT proceed (return 500). The audit ledger is immutable
// and outlives the mod doc — Position B retention contract: mod
// definitions are deletable for list cleanliness; the accountability
// ledger is permanent.
router.delete('/:id', requireRole('st'), async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid ID' });

  // Resolve the doc first — its fields populate the tombstone, and we need
  // the character_id for the broadcast.
  const existing = await mods().findOne({ _id: oid });
  if (!existing) return res.status(404).json({ error: 'NOT_FOUND' });

  // 1. Write the tombstone BEFORE destroying the mod doc.
  const who = creatorFromUser(req.user);
  const when = nowIso();
  const tombstone = buildAuditEvent(
    { _id: oid, character_id: existing.character_id, stat_path: existing.stat_path, delta: existing.delta, reason: existing.reason },
    'deleted', who, when,
  );
  try {
    await audit().insertOne(tombstone);
  } catch (err) {
    // Tombstone failed → do NOT delete. The mod survives, no ledger entry.
    // This is the HALT-DAR contract: never destroy without the tombstone.
    console.error('[st_mods] DELETE tombstone insert failed, aborting delete:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to write tombstone; delete aborted' });
  }

  // 2. Tombstone is durable — now destroy the mod doc.
  const result = await mods().deleteOne({ _id: oid });
  if (!result.deletedCount) {
    // Extremely rare (doc vanished between findOne and deleteOne). The
    // tombstone stays (immutable ledger); report the inconsistency.
    console.warn('[st_mods] DELETE: tombstone written but deleteOne removed 0 docs for', String(oid));
    return res.status(404).json({ error: 'NOT_FOUND' });
  }

  // STM-10 (§D18): 'revoke' op retired → 'delete'.
  broadcastStModUpdate(String(existing.character_id), 'delete', String(oid));
  res.json({ deleted: true });
});

export default router;

// ─── GET /api/st_mod_audit ───────────────────────────────────────────
// Mounted as its own router by server/index.js so the path namespace
// stays clean (POST/GET/DELETE /api/st_mods + GET /api/st_mod_audit).
//
// STM-6 (issue #379): extended with optional filters + pagination.
// STM-11 (issue #439): migrated to the lifecycle event-stream shape.
// Response: { rows, total, page, page_size }, each row carrying the
// canonical `event` / `by` / `at` fields.
//
// Aggregation coalesces legacy pre-STM-11 rows (which carry
// `created_by`/`created_at` and no `event`) into the canonical fields
// via $ifNull, so the reader is uniform across old + new rows WITHOUT
// depending on STM-13's backfill running first (ADR Rev 4 §D19):
//   at    = at    ?? created_at
//   by    = by    ?? created_by
//   event = event ?? 'created'
//
// Query params (all optional):
//   character_id — exact match
//   st           — match against by.discord_name (coalesced)
//   event        — filter by event type (created/activated/deactivated/deleted)
//   from / to    — ISO date range, inclusive, applied to at (coalesced)
//   page         — 1-indexed (default 1)
//   page_size    — default 50, clamped to [1, 100]
//
// Each returned row is decorated with { ...auditRow, active: <bool> }
// where active === (st_mods document with _id === auditRow.st_mod_id exists).
// The active lookup is batched into a single $in query (not N+1).
export const auditRouter = Router();

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const AUDIT_EVENT_TYPES = ['created', 'activated', 'deactivated', 'deleted'];

auditRouter.get('/', requireRole('st'), async (req, res) => {
  const { character_id, st, from, to, event } = req.query;

  // Parse pagination — clamp to safe bounds. Bad input falls back to defaults
  // rather than 400, matching the "filters are optional" spirit.
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(req.query.page_size, 10) || DEFAULT_PAGE_SIZE),
  );

  // Coalesce legacy fields → canonical so old + new rows filter/sort uniformly.
  const coalesce = {
    $addFields: {
      at: { $ifNull: ['$at', '$created_at'] },
      by: { $ifNull: ['$by', '$created_by'] },
      event: { $ifNull: ['$event', 'created'] },
    },
  };

  // Build the post-coalesce match.
  const match = {};
  if (character_id) match.character_id = String(character_id);
  if (st) match['by.discord_name'] = String(st);
  if (event && AUDIT_EVENT_TYPES.includes(String(event))) match.event = String(event);
  if (from || to) {
    match.at = {};
    if (from) match.at.$gte = String(from);
    if (to) match.at.$lte = String(to);
  }

  // Single aggregation: coalesce → match → facet { rows (sort/skip/limit), total }.
  const agg = await audit().aggregate([
    coalesce,
    { $match: match },
    {
      $facet: {
        rows: [
          { $sort: { at: -1 } },
          { $skip: (page - 1) * pageSize },
          { $limit: pageSize },
        ],
        total: [{ $count: 'n' }],
      },
    },
  ]).toArray();

  const rows = agg[0]?.rows || [];
  const total = agg[0]?.total?.[0]?.n || 0;

  // Batched active-check: one $in query against st_mods regardless of page size.
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
