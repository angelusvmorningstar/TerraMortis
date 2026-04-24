import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getCollection } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  relationshipSchema,
  KIND_ENUM,
  STATUS_ENUM,
} from '../schemas/relationship.schema.js';

const router = Router();
const col = () => getCollection('relationships');

function parseId(id) {
  try { return new ObjectId(id); } catch { return null; }
}

function nowIso() { return new Date().toISOString(); }

function actorFromReq(req) {
  const role = req.user?.role;
  const type = (role === 'st' || role === 'dev') ? 'st' : 'player';
  return { type, id: String(req.user?.id || '') };
}

function sameEndpoint(a, b) {
  return !!(a && b && a.type === b.type && String(a.id) === String(b.id));
}

function customLabelMissing(body) {
  return body.kind === 'other' && (!body.custom_label || !String(body.custom_label).trim());
}

function touchstoneShapeError(body) {
  if (body.kind !== 'touchstone') return null;
  const hum = body.touchstone_meta?.humanity;
  if (!Number.isInteger(hum) || hum < 1 || hum > 10) {
    return "kind='touchstone' requires touchstone_meta.humanity (integer 1..10)";
  }
  const types = [body.a?.type, body.b?.type].sort();
  if (types[0] !== 'npc' || types[1] !== 'pc') {
    return "kind='touchstone' requires one pc and one npc endpoint";
  }
  return null;
}

// NPCR.6: player-readable endpoint. Registered BEFORE the ST-only
// router.use below. Caller must own the character or be ST. Player
// callers receive only active / pending_confirmation edges where
// st_hidden !== true; ST callers receive every status including
// retired and hidden.
router.get('/for-character/:characterId', async (req, res) => {
  const { characterId } = req.params;
  if (!ObjectId.isValid(String(characterId))) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid characterId' });
  }
  const isSt = req.user?.role === 'st' || req.user?.role === 'dev';
  const userCharIds = (req.user?.character_ids || []).map(String);
  if (!isSt && !userCharIds.includes(String(characterId))) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Not your character' });
  }

  const filter = {
    $or: [{ 'a.id': String(characterId) }, { 'b.id': String(characterId) }],
  };
  if (!isSt) {
    filter.status = { $in: ['active', 'pending_confirmation'] };
    filter.st_hidden = { $ne: true };
  }
  const docs = await col().find(filter).sort({ updated_at: -1 }).toArray();

  // Enrich each edge with _other_name so the player tab can render without
  // needing ST-only GETs on npcs / characters. "Other" = whichever endpoint
  // isn't this character.
  const charIdStr = String(characterId);
  const npcIds = new Set();
  const pcIds = new Set();
  for (const e of docs) {
    const other = String(e.a?.id) === charIdStr ? e.b : e.a;
    if (!other) continue;
    if (other.type === 'npc' && other.id) npcIds.add(String(other.id));
    if (other.type === 'pc'  && other.id) pcIds.add(String(other.id));
  }

  const npcOids = [];
  for (const id of npcIds) {
    try { npcOids.push(new ObjectId(id)); } catch { /* skip */ }
  }
  const npcsList = npcOids.length
    ? await getCollection('npcs').find(
        { _id: { $in: npcOids } },
        { projection: { name: 1 } }
      ).toArray()
    : [];
  const npcById = new Map(npcsList.map(n => [String(n._id), n]));

  const pcOids = [];
  for (const id of pcIds) {
    try { pcOids.push(new ObjectId(id)); } catch { /* skip */ }
  }
  const pcsList = pcOids.length
    ? await getCollection('characters').find(
        { _id: { $in: pcOids } },
        { projection: { name: 1, moniker: 1, honorific: 1 } }
      ).toArray()
    : [];
  const pcById = new Map(pcsList.map(c => [String(c._id), c]));

  for (const e of docs) {
    const other = String(e.a?.id) === charIdStr ? e.b : e.a;
    if (!other) { e._other_name = null; continue; }
    if (other.type === 'npc') {
      e._other_name = npcById.get(String(other.id))?.name || null;
    } else if (other.type === 'pc') {
      const c = pcById.get(String(other.id));
      if (c) {
        const honorific = c.honorific ? `${c.honorific} ` : '';
        e._other_name = `${honorific}${c.moniker || c.name || ''}`.trim();
      } else {
        e._other_name = null;
      }
    }
  }

  res.json(docs);
});

// POST / — create edge. Split auth:
//   ST: any endpoints, any kind.
//   Player: a.type='pc' with a.id in caller's character_ids, b.type='npc',
//           kind !== 'touchstone' (touchstones live on character.touchstones[]
//           via the sheet picker from NPCR.4), created_by={type:'player', id:discord_id},
//           created_by_char_id = a.id (for NPCR.9 edit-rights scoping).
// Both auths: strict 409 CONFLICT on a duplicate active {a, b, kind} edge.
router.post('/', validate(relationshipSchema), async (req, res) => {
  const body = req.body;
  const role = req.user?.role;
  const isSt = role === 'st' || role === 'dev';

  if (sameEndpoint(body.a, body.b)) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Endpoints must differ (same type and id on both sides)',
    });
  }
  if (customLabelMissing(body)) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: "kind='other' requires a non-empty custom_label",
    });
  }
  const tsErr = touchstoneShapeError(body);
  if (tsErr) return res.status(400).json({ error: 'VALIDATION_ERROR', message: tsErr });

  // Player-specific constraints
  if (!isSt) {
    const charIds = (req.user?.character_ids || []).map(String);
    if (body.a?.type !== 'pc' || !charIds.includes(String(body.a?.id))) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Player-created edges must have a.type=pc with a.id matching one of your characters',
      });
    }
    if (body.b?.type !== 'npc') {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Player-created edges require b.type=npc',
      });
    }
    if (body.kind === 'touchstone') {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: "Touchstones are managed from the character sheet, not the Relationships tab",
      });
    }
  }

  // Strict duplicate-active-edge check: same a, b, and kind, status='active'.
  const dup = await col().findOne({
    'a.type': body.a.type, 'a.id': String(body.a.id),
    'b.type': body.b.type, 'b.id': String(body.b.id),
    kind: body.kind,
    status: 'active',
  });
  if (dup) {
    return res.status(409).json({
      error: 'CONFLICT',
      message: 'An active edge with these endpoints and kind already exists.',
      existing_id: String(dup._id),
    });
  }

  const actor = actorFromReq(req);
  const now = nowIso();
  const doc = {
    a: body.a,
    b: body.b,
    kind: body.kind,
    direction: body.direction || 'a_to_b',
    state: body.state || '',
    st_hidden: !!body.st_hidden,
    status: 'active',
    created_by: actor,
    history: [{ at: now, by: actor, change: 'created' }],
    created_at: now,
    updated_at: now,
  };
  if (body.kind === 'other' && body.custom_label) {
    doc.custom_label = String(body.custom_label).trim();
  }
  if (body.disposition) doc.disposition = body.disposition;
  if (body.kind === 'touchstone') {
    doc.touchstone_meta = { humanity: body.touchstone_meta.humanity };
  }
  // NPCR.7: stamp the owning char id on player-created edges for NPCR.9 scoping.
  if (!isSt) {
    doc.created_by_char_id = String(body.a.id);
  }

  const result = await col().insertOne(doc);
  const created = await col().findOne({ _id: result.insertedId });
  res.status(201).json(created);
});

// All other routes ST-only.
router.use(requireRole('st'));

// GET / — list edges
//   ?endpoint=<id>        edges involving this id on either side
//   ?a_id=<id>            edges with this id on side a
//   ?b_id=<id>            edges with this id on side b
//   ?kind=<code>          filter by kind
//   ?status=<enum>        filter by status
router.get('/', async (req, res) => {
  const { endpoint, a_id, b_id, kind, status } = req.query;

  for (const [name, val] of [['endpoint', endpoint], ['a_id', a_id], ['b_id', b_id]]) {
    if (val !== undefined && !ObjectId.isValid(String(val))) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: `Invalid ObjectId in query param '${name}'`,
      });
    }
  }
  if (kind !== undefined && !KIND_ENUM.includes(String(kind))) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: `Unknown kind '${kind}'`,
    });
  }
  if (status !== undefined && !STATUS_ENUM.includes(String(status))) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: `Unknown status '${status}'`,
    });
  }

  const filter = {};
  if (endpoint) {
    filter.$or = [{ 'a.id': String(endpoint) }, { 'b.id': String(endpoint) }];
  }
  if (a_id) filter['a.id'] = String(a_id);
  if (b_id) filter['b.id'] = String(b_id);
  if (kind) filter.kind = String(kind);
  if (status) filter.status = String(status);
  const docs = await col().find(filter).sort({ updated_at: -1 }).toArray();
  res.json(docs);
});

// GET /:id
router.get('/:id', async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid ID' });
  const doc = await col().findOne({ _id: oid });
  if (!doc) return res.status(404).json({ error: 'NOT_FOUND', message: 'Relationship not found' });
  res.json(doc);
});

// PUT /:id — edit edge; appends history row with field delta
router.put('/:id', validate(relationshipSchema), async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid ID' });

  const existing = await col().findOne({ _id: oid });
  if (!existing) return res.status(404).json({ error: 'NOT_FOUND', message: 'Relationship not found' });

  const body = req.body;
  if (sameEndpoint(body.a, body.b)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Endpoints must differ' });
  }
  if (customLabelMissing(body)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: "kind='other' requires a non-empty custom_label" });
  }
  const tsErr = touchstoneShapeError(body);
  if (tsErr) return res.status(400).json({ error: 'VALIDATION_ERROR', message: tsErr });

  // Guard against resurrecting a retired edge from stale client cache.
  // Allow only explicit status='retired' echoes (no-op) through.
  if (existing.status === 'retired' && body.status !== 'retired') {
    return res.status(409).json({
      error: 'CONFLICT',
      message: 'This edge is retired. Reload the list before editing.',
    });
  }

  // Normalise "optional, clearable" fields so empty / null / missing all
  // collapse to a single "unset" intent. Prevents phantom history entries
  // when a client echoes a field that was never set, and lets us $unset
  // when the user explicitly clears.
  const kindForSave = body.kind ?? existing.kind;
  if (kindForSave !== 'other') body.custom_label = '';
  else if (typeof body.custom_label === 'string') body.custom_label = body.custom_label.trim();
  // When kind shifts away from 'touchstone', drop any stale touchstone_meta echoed by the client.
  if (kindForSave !== 'touchstone') body.touchstone_meta = null;

  const CLEARABLE = new Set(['custom_label', 'disposition', 'touchstone_meta']);
  const isCleared = (name, v) => CLEARABLE.has(name) && (v === '' || v === null);

  const TRACKED = ['a', 'b', 'kind', 'custom_label', 'direction', 'disposition', 'state', 'st_hidden', 'status', 'touchstone_meta'];

  const fields = [];
  const updates = {};
  const unsets = {};
  for (const name of TRACKED) {
    if (!(name in body)) continue;
    const beforeRaw = existing[name];
    const afterRaw = body[name];
    const beforeCleared = isCleared(name, beforeRaw) || beforeRaw === undefined;
    const afterCleared = isCleared(name, afterRaw);

    if (beforeCleared && afterCleared) continue; // no-op

    if (afterCleared) {
      // clear: unset the field and record delta showing it went away
      unsets[name] = '';
      fields.push({ name, ...(beforeRaw !== undefined ? { before: beforeRaw } : {}) });
      continue;
    }

    if (JSON.stringify(beforeRaw) !== JSON.stringify(afterRaw)) {
      const delta = { name };
      if (beforeRaw !== undefined) delta.before = beforeRaw;
      delta.after = afterRaw;
      fields.push(delta);
    }
    updates[name] = afterRaw;
  }

  const actor = actorFromReq(req);
  const now = nowIso();
  updates.updated_at = now;

  const update = { $set: updates };
  if (Object.keys(unsets).length > 0) update.$unset = unsets;
  if (fields.length > 0) {
    update.$push = { history: { at: now, by: actor, change: 'updated', fields } };
  }

  // Optimistic concurrency: the document must still match the updated_at we
  // read. If another PUT raced in between, this findOneAndUpdate matches
  // zero documents and we return 409.
  const result = await col().findOneAndUpdate(
    { _id: oid, updated_at: existing.updated_at },
    update,
    { returnDocument: 'after' }
  );
  if (!result) {
    return res.status(409).json({
      error: 'CONFLICT',
      message: 'This edge was modified by another request. Reload and retry.',
    });
  }
  res.json(result);
});

// DELETE /:id — retire (status='retired'); append history 'retired'
router.delete('/:id', async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid ID' });

  const existing = await col().findOne({ _id: oid });
  if (!existing) return res.status(404).json({ error: 'NOT_FOUND', message: 'Relationship not found' });

  if (existing.status === 'retired') {
    return res.json(existing);
  }

  const actor = actorFromReq(req);
  const now = nowIso();
  const historyRow = {
    at: now, by: actor, change: 'retired',
    fields: [{ name: 'status', before: existing.status, after: 'retired' }],
  };

  const result = await col().findOneAndUpdate(
    { _id: oid },
    { $set: { status: 'retired', updated_at: now }, $push: { history: historyRow } },
    { returnDocument: 'after' }
  );
  res.json(result);
});

export default router;
