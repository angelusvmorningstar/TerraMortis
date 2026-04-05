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

// GET /api/archive_documents/:id
// Player: only if the doc belongs to one of their characters.
router.get('/:id', async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid ID' });

  const doc = await col().findOne({ _id: oid });
  if (!doc) return res.status(404).json({ error: 'NOT_FOUND', message: 'Document not found' });

  if (req.user.role === 'player') {
    const owns = (req.user.character_ids || []).some(id => id.toString() === doc.character_id.toString());
    if (!owns) return res.status(403).json({ error: 'FORBIDDEN', message: 'Not your character' });
    if (!doc.visible_to_player) return res.status(403).json({ error: 'FORBIDDEN', message: 'Document not visible' });
  }

  res.json(doc);
});

// GET /api/archive_documents/all — ST only, no content_html
router.get('/all', requireRole('st'), async (req, res) => {
  const docs = await col().find({}, { projection: { content_html: 0 } }).toArray();
  res.json(docs);
});

// POST /api/archive_documents/upload — ST only; multipart .docx → mammoth → store
// Expects Content-Type: application/octet-stream with query params:
//   character_id, type, cycle (optional), title (optional)
router.post('/upload', requireRole('st'),
  (req, res, next) => {
    // Collect raw body chunks
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => { req.rawBody = Buffer.concat(chunks); next(); });
    req.on('error', next);
  },
  async (req, res) => {
    const { character_id, type, cycle, title } = req.query;

    if (!character_id) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'character_id required' });
    if (!type) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'type required' });

    const charOid = parseId(character_id);
    if (!charOid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid character_id' });

    if (!req.rawBody?.length) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'No file data received' });

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
