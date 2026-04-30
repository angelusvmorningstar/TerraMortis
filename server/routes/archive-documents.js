import { Router } from 'express';
import { ObjectId } from 'mongodb';
import mammoth from 'mammoth';
import { getCollection } from '../db.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();
const col = () => getCollection('archive_documents');

function parseId(id) {
  try { return new ObjectId(id); } catch { return null; }
}

// GET /api/archive_documents?character_id=...
// Player: only their own characters. ST: any character.
router.get('/', async (req, res) => {
  const { character_id } = req.query;
  if (!character_id) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'character_id required' });

  const oid = parseId(character_id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid character_id' });

  if (req.user.role === 'player') {
    const owns = (req.user.character_ids || []).some(id => id.toString() === oid.toString());
    if (!owns) return res.status(403).json({ error: 'FORBIDDEN', message: 'Not your character' });
  }

  const filter = { character_id: { $in: [oid, oid.toString()] }, visible_to_player: true };
  const docs = await col().find(filter, { projection: { content_html: 0 } }).toArray();
  res.json(docs);
});

// Named routes must come before /:id to avoid being swallowed by the param handler.

// GET /api/archive_documents/primer — any authenticated user; returns full primer doc
router.get('/primer', async (req, res) => {
  const doc = await col().findOne({ type: 'primer' });
  if (!doc) return res.status(404).json({ error: 'NOT_FOUND', message: 'Primer not yet available' });
  res.json(doc);
});

// GET /api/archive_documents/all — ST only, no content_html
router.get('/all', requireRole('st'), async (req, res) => {
  const docs = await col().find({}, { projection: { content_html: 0 } }).toArray();
  res.json(docs);
});

// GET /api/archive_documents/:id
// Player: only if the doc belongs to one of their characters.
router.get('/:id', async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid ID' });

  const doc = await col().findOne({ _id: oid });
  if (!doc) return res.status(404).json({ error: 'NOT_FOUND', message: 'Document not found' });

  if (req.user.role === 'player') {
    const owns = (req.user.character_ids || []).some(id => id.toString() === doc.character_id?.toString());
    if (!owns) return res.status(403).json({ error: 'FORBIDDEN', message: 'Not your character' });
    if (!doc.visible_to_player) return res.status(403).json({ error: 'FORBIDDEN', message: 'Document not visible' });
  }

  res.json(doc);
});

// PUT /api/archive_documents/:id — ST only; update refined HTML and/or title in place.
// Body: { content_html?: string, title?: string }. Any other fields are ignored.
router.put('/:id', requireRole('st'), async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid ID' });

  const doc = await col().findOne({ _id: oid });
  if (!doc) return res.status(404).json({ error: 'NOT_FOUND', message: 'Document not found' });

  const updates = { updated_at: new Date().toISOString() };
  if (typeof req.body?.content_html === 'string') updates.content_html = req.body.content_html;
  if (typeof req.body?.title === 'string' && req.body.title.trim()) updates.title = req.body.title.trim();

  if (Object.keys(updates).length === 1) {
    // Only updated_at — nothing to actually change
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'No updatable fields supplied' });
  }

  await col().updateOne({ _id: oid }, { $set: updates });
  const updated = await col().findOne({ _id: oid }, { projection: { content_html: 0 } });
  res.json(updated);
});

// POST /api/archive_documents — ST only; create a blank document without uploading a file.
// Body JSON: { character_id (required unless type=primer), type, title?, content_html?, visible_to_player? }
router.post('/', requireRole('st'), async (req, res) => {
  const { character_id, type, title, content_html, visible_to_player } = req.body || {};

  const ALLOWED_TYPES = ['dossier', 'history_submission', 'downtime_response', 'primer'];
  if (!type || !ALLOWED_TYPES.includes(type)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: `type must be one of: ${ALLOWED_TYPES.join(', ')}` });
  }

  const isPrimer = type === 'primer';

  if (!isPrimer && !character_id) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'character_id required' });
  }

  let charOid = null;
  if (!isPrimer) {
    charOid = parseId(character_id);
    if (!charOid) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid character_id' });
    }
    const charExists = await getCollection('characters').findOne({ _id: charOid }, { projection: { _id: 1 } });
    if (!charExists) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Character not found' });
    }
  }

  if (isPrimer) {
    const existing = await col().findOne({ type: 'primer' });
    if (existing) {
      return res.status(409).json({ error: 'CONFLICT', message: 'Primer already exists. Open it to edit.' });
    }
  } else if (type === 'dossier' || type === 'history_submission') {
    const existing = await col().findOne({ character_id: { $in: [charOid, charOid.toString()] }, type });
    if (existing) {
      const label = type === 'dossier' ? 'dossier' : 'character history';
      return res.status(409).json({ error: 'CONFLICT', message: `This character already has a ${label}. Open it to edit.` });
    }
  }

  const DEFAULT_TITLES = {
    dossier: 'Dossier',
    history_submission: 'Character History',
    downtime_response: 'Downtime Response',
    primer: 'Primer',
  };

  const doc = {
    ...(charOid ? { character_id: charOid } : {}),
    type,
    title:             (typeof title === 'string' && title.trim()) ? title.trim() : DEFAULT_TITLES[type],
    content_html:      typeof content_html === 'string' ? content_html : '',
    visible_to_player: visible_to_player !== false,
    created_at:        new Date().toISOString(),
  };

  const result = await col().insertOne(doc);
  const created = await col().findOne({ _id: result.insertedId });
  res.status(201).json(created);
});

// POST /api/archive_documents/upload — ST only; raw .docx → mammoth → store
// Query params: type (required), character_id (required unless type=primer), cycle, title
router.post('/upload', requireRole('st'),
  (req, res, next) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => { req.rawBody = Buffer.concat(chunks); next(); });
    req.on('error', next);
  },
  async (req, res) => {
    const { character_id, type, cycle, title } = req.query;

    if (!type) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'type required' });

    const isPrimer = type === 'primer';

    if (!isPrimer && !character_id)
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'character_id required' });

    const charOid = (!isPrimer && character_id) ? parseId(character_id) : null;
    if (!isPrimer && !charOid)
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid character_id' });

    if (!req.rawBody?.length)
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'No file data received' });

    let html;
    try {
      const result = await mammoth.convertToHtml({ buffer: req.rawBody });
      html = result.value
        .replace(/<img[^>]*>/gi, '')
        .replace(/<p><\/p>/g, '')
        .trim();
    } catch (err) {
      return res.status(422).json({ error: 'CONVERSION_ERROR', message: `Mammoth conversion failed: ${err.message}` });
    }

    if (isPrimer) {
      // Upsert: only one primer document exists at a time
      await col().updateOne(
        { type: 'primer' },
        {
          $set:        { type: 'primer', title: 'Primer', content_html: html, visible_to_player: true, updated_at: new Date().toISOString() },
          $setOnInsert: { created_at: new Date().toISOString() },
        },
        { upsert: true }
      );
      const updated = await col().findOne({ type: 'primer' }, { projection: { content_html: 0 } });
      return res.status(200).json(updated);
    }

    const cycleNum = cycle ? parseInt(cycle, 10) : null;
    const docTitle = title || (type === 'downtime_response' ? `Downtime ${cycleNum ?? ''} Response`.trim() : type);

    const doc = {
      character_id:      charOid,
      type,
      cycle:             cycleNum,
      title:             docTitle,
      content_html:      html,
      visible_to_player: true,
      created_at:        new Date().toISOString(),
    };

    const result = await col().insertOne(doc);
    const created = await col().findOne({ _id: result.insertedId }, { projection: { content_html: 0 } });
    res.status(201).json(created);
  }
);

export default router;
