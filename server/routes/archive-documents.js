import { Router } from 'express';
import { ObjectId } from 'mongodb';
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

export default router;
