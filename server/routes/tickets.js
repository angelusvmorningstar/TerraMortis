import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getCollection } from '../db.js';
import { validate } from '../middleware/validate.js';
import { isStRole } from '../middleware/auth.js';
import { ticketSchema } from '../schemas/ticket.schema.js';

const router = Router();
const col = () => getCollection('tickets');

const VALID_TYPES    = ['bug', 'feature', 'question', 'sheet', 'other'];
const VALID_STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
const VALID_PRIORITIES = ['normal', 'high'];

function parseId(id) {
  try { return new ObjectId(id); } catch { return null; }
}

// GET /api/tickets — players see only their own; STs see all
router.get('/', async (req, res) => {
  const filter = isStRole(req.user) ? {} : { player_id: req.user.player_id };
  const tickets = await col().find(filter).sort({ created_at: -1 }).toArray();
  res.json(tickets);
});

// POST /api/tickets — create a ticket
router.post('/', validate(ticketSchema), async (req, res) => {
  const { title, body, type } = req.body || {};

  if (!title || !String(title).trim()) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'title is required' });
  }
  if (!VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: `type must be one of: ${VALID_TYPES.join(', ')}` });
  }

  const doc = {
    title:        String(title).trim(),
    body:         body ? String(body).trim() : '',
    type,
    player_id:    req.user.player_id,
    submitted_by: req.user.global_name || req.user.username,
    status:       'open',
    priority:     'normal',
    st_note:      '',
    created_at:   new Date().toISOString(),
    resolved_at:  null,
  };

  const result = await col().insertOne(doc);
  const created = await col().findOne({ _id: result.insertedId });
  res.status(201).json(created);
});

// PUT /api/tickets/:id — players can update body on their own open tickets; STs can update status/priority/st_note/body
router.put('/:id', async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid ticket ID' });

  const ticket = await col().findOne({ _id: oid });
  if (!ticket) return res.status(404).json({ error: 'NOT_FOUND', message: 'Ticket not found' });

  const isPlayer = req.user.role === 'player';

  if (isPlayer) {
    // Players can only edit body on their own open tickets
    if (String(ticket.player_id) !== String(req.user.player_id)) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Not your ticket' });
    }
    if (ticket.status !== 'open') {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Can only edit open tickets' });
    }

    const $set = {};
    if (req.body.title !== undefined) {
      const t = String(req.body.title).trim();
      if (!t) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'title cannot be empty' });
      $set.title = t;
    }
    if (req.body.body !== undefined) $set.body = String(req.body.body).trim();

    if (!Object.keys($set).length) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Nothing to update' });
    }

    await col().updateOne({ _id: oid }, { $set });
  } else {
    // ST — can update status, priority, st_note, title, body
    const { status, priority, st_note, title, body } = req.body || {};
    const $set = {};

    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: `status must be one of: ${VALID_STATUSES.join(', ')}` });
      }
      $set.status = status;
      if (status === 'resolved' || status === 'closed') {
        $set.resolved_at = new Date().toISOString();
      }
    }
    if (priority !== undefined) {
      if (!VALID_PRIORITIES.includes(priority)) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: `priority must be one of: ${VALID_PRIORITIES.join(', ')}` });
      }
      $set.priority = priority;
    }
    if (st_note !== undefined) $set.st_note = String(st_note);
    if (title !== undefined) {
      const t = String(title).trim();
      if (!t) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'title cannot be empty' });
      $set.title = t;
    }
    if (body !== undefined)    $set.body    = String(body).trim();

    if (!Object.keys($set).length) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Nothing to update' });
    }

    await col().updateOne({ _id: oid }, { $set });
  }

  const updated = await col().findOne({ _id: oid });
  res.json(updated);
});

export default router;
