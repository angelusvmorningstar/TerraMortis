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

// All routes ST-only. Player-readable endpoints land in NPCR.6.
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

// POST / — create edge
router.post('/', validate(relationshipSchema), async (req, res) => {
  const body = req.body;
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
  // Only store custom_label when kind === 'other', regardless of what the client sent.
  if (body.kind === 'other' && body.custom_label) {
    doc.custom_label = String(body.custom_label).trim();
  }
  if (body.disposition) doc.disposition = body.disposition;

  const result = await col().insertOne(doc);
  const created = await col().findOne({ _id: result.insertedId });
  res.status(201).json(created);
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

  const CLEARABLE = new Set(['custom_label', 'disposition']);
  const isCleared = (name, v) => CLEARABLE.has(name) && (v === '' || v === null);

  const TRACKED = ['a', 'b', 'kind', 'custom_label', 'direction', 'disposition', 'state', 'st_hidden', 'status'];

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
