import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getCollection } from '../db.js';
import { requireRole } from '../middleware/auth.js';

// cm-2: this router was `chapters.js` serving `/api/chapters` off a `chapters`
// collection. The collection never held Chapters — under the settled cycle
// model (cycle-model.md §3) a Chapter is one game plus its downtime, i.e. a
// `downtime_cycles` document, and what this collection actually groups is the
// multi-game tier above that: a Story. Collection, route, file and field all
// renamed together. Behaviour is unchanged: same five endpoints, same auth,
// same status codes, same inline {number, label} validation.
const col = () => getCollection('story_cycles');
const cycles = () => getCollection('downtime_cycles');

function parseId(id) {
  try { return new ObjectId(id); } catch { return null; }
}

export const storyCyclesRouter = Router();

// GET /api/story_cycles — list all story cycles sorted by number asc (public read)
storyCyclesRouter.get('/', async (req, res) => {
  const docs = await col().find().sort({ number: 1 }).toArray();
  res.json(docs);
});

// GET /api/story_cycles/:id — single story cycle (public read)
storyCyclesRouter.get('/:id', async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid story cycle ID format' });
  const doc = await col().findOne({ _id: oid });
  if (!doc) return res.status(404).json({ error: 'NOT_FOUND', message: 'Story cycle not found' });
  res.json(doc);
});

// POST /api/story_cycles — create story cycle (ST only)
storyCyclesRouter.post('/', requireRole('st'), async (req, res) => {
  const { number, label } = req.body;
  if (typeof number !== 'number' || !Number.isInteger(number) || number < 1) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'number must be a positive integer' });
  }
  if (typeof label !== 'string' || !label.trim()) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'label must be a non-empty string' });
  }
  const doc = { number, label: label.trim(), created_at: new Date().toISOString() };
  const result = await col().insertOne(doc);
  const created = await col().findOne({ _id: result.insertedId });
  res.status(201).json(created);
});

// PATCH /api/story_cycles/:id — update number, label and/or final_chapter_id (ST only)
storyCyclesRouter.patch('/:id', requireRole('st'), async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid story cycle ID format' });

  const updates = {};
  if (req.body.number !== undefined) {
    const n = req.body.number;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'number must be a positive integer' });
    }
    updates.number = n;
  }
  if (req.body.label !== undefined) {
    if (typeof req.body.label !== 'string' || !req.body.label.trim()) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'label must be a non-empty string' });
    }
    updates.label = req.body.label.trim();
  }
  // cm-3: `final_chapter_id` names the ONE cycle the ST has chosen as this
  // Story's final chapter. It is the only manual input behind
  // isFinalChapterOfStory (public/js/downtime/db.js), and it replaces BOTH
  // the per-chapter downtime_cycles.is_chapter_finale checkbox and any
  // separate "closed" flag: a Story is closed exactly when this field is set.
  //
  // Why a pointer rather than a flag plus a max-game_number computation (the
  // shape cm-3's own first pass shipped, replaced after review): a computed
  // finale silently relocates when Story membership changes, and this
  // project's ST revises Story length mid-stream. A pointer cannot relocate,
  // cannot be affected by a tied or non-numeric game_number, and needs no
  // sibling-cycle list to evaluate.
  //
  // This is the one place a bad pointer could be written, so validate it at
  // the write: the value must resolve to a real downtime_cycles document that
  // belongs to THIS Story. Validated inline, same shape as number/label; this
  // collection has no JSON-schema file and cm-3 deliberately does not add one.
  if (req.body.final_chapter_id !== undefined) {
    const raw = req.body.final_chapter_id;
    if (raw === null) {
      updates.final_chapter_id = null;        // clears unconditionally
    } else {
      if (typeof raw !== 'string' || !raw.trim()) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'final_chapter_id must be a cycle _id string or null' });
      }
      const cycleOid = parseId(raw.trim());
      if (!cycleOid) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'final_chapter_id is not a valid cycle ID format' });
      }
      const target = await cycles().findOne({ _id: cycleOid });
      if (!target) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'final_chapter_id does not match any downtime cycle' });
      }
      if (String(target.story_cycle_id ?? '') !== String(oid)) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'final_chapter_id names a cycle that does not belong to this Story',
        });
      }
      updates.final_chapter_id = String(cycleOid);
    }
  }
  if (!Object.keys(updates).length) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'At least one of number, label or final_chapter_id is required' });
  }

  const result = await col().findOneAndUpdate(
    { _id: oid },
    { $set: updates },
    { returnDocument: 'after' },
  );
  if (!result) return res.status(404).json({ error: 'NOT_FOUND', message: 'Story cycle not found' });
  res.json(result);
});

// DELETE /api/story_cycles/:id — delete story cycle (ST only); 409 if any cycles reference it
storyCyclesRouter.delete('/:id', requireRole('st'), async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid story cycle ID format' });

  const idStr = req.params.id;
  const linkedCount = await cycles().countDocuments({ story_cycle_id: idStr });
  if (linkedCount > 0) {
    return res.status(409).json({
      error: 'STORY_CYCLE_IN_USE',
      message: `Story cycle is linked to ${linkedCount} downtime cycle(s) and cannot be deleted`,
      linked_cycles: linkedCount,
    });
  }

  const result = await col().findOneAndDelete({ _id: oid });
  if (!result) return res.status(404).json({ error: 'NOT_FOUND', message: 'Story cycle not found' });
  res.json({ deleted: true, _id: req.params.id });
});

export default storyCyclesRouter;
