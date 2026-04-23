import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getCollection } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { relationshipSchema } from '../schemas/relationship.schema.js';

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
  if (body.custom_label) doc.custom_label = String(body.custom_label).trim();
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

  const TRACKED = ['a', 'b', 'kind', 'custom_label', 'direction', 'disposition', 'state', 'st_hidden', 'status'];
  const fields = [];
  for (const name of TRACKED) {
    if (!(name in body)) continue;
    const before = existing[name];
    const after = body[name];
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      fields.push({ name, before, after });
    }
  }

  const actor = actorFromReq(req);
  const now = nowIso();

  // Client-managed fields only — never let client overwrite history/created_at/created_by.
  const updates = {};
  for (const name of TRACKED) {
    if (name in body) updates[name] = body[name];
  }
  updates.updated_at = now;

  const update = { $set: updates };
  if (fields.length > 0) {
    update.$push = { history: { at: now, by: actor, change: 'updated', fields } };
  }

  const result = await col().findOneAndUpdate({ _id: oid }, update, { returnDocument: 'after' });
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
