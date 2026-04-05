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

  const filter = { character_id: oid, visible_to_player: true };
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
