import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getCollection } from '../db.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();
const col  = () => getCollection('ordeal_submissions');

const ORDEAL_NAME_MAP = {
  lore_mastery:            'lore',
  rules_mastery:           'rules',
  covenant_questionnaire:  'covenant',
  character_history:       'history',
};

function parseId(id) {
  try { return new ObjectId(id); } catch { return null; }
}

/**
 * Upsert a completed ordeal entry onto the character's ordeals array,
 * then cascade to all player characters for player-level ordeals.
 */
async function cascadeComplete(submission) {
  const ordealName = ORDEAL_NAME_MAP[submission.ordeal_type];
  if (!ordealName) return;

  const chars   = getCollection('characters');
  const players = getCollection('players');
  const now     = new Date().toISOString();

  const upsertOrdeal = async (charId) => {
    const upd = await chars.updateOne(
      { _id: charId, 'ordeals.name': ordealName },
      { $set: { 'ordeals.$.complete': true, 'ordeals.$.approved_at': now } }
    );
    if (upd.matchedCount === 0) {
      await chars.updateOne(
        { _id: charId },
        { $push: { ordeals: { name: ordealName, complete: true, approved_at: now } } }
      );
    }
  };

  if (submission.ordeal_type === 'character_history') {
    // Character-level: only that character
    if (submission.character_id) await upsertOrdeal(submission.character_id);
  } else {
    // Player-level: all of that player's characters
    if (submission.player_id) {
      const player = await players.findOne({ _id: submission.player_id });
      for (const charId of (player?.character_ids || [])) {
        await upsertOrdeal(charId);
      }
    }
  }
}

// GET /api/ordeal_submissions — ST only; optional ?type= and ?player_id= filters
router.get('/', requireRole('st'), async (req, res) => {
  const filter = {};
  if (req.query.type)      filter.ordeal_type = req.query.type;
  if (req.query.player_id) {
    const pid = parseId(req.query.player_id);
    if (pid) filter.player_id = pid;
  }
  const docs = await col().find(filter).toArray();
  res.json(docs);
});

// GET /api/ordeal_submissions/mine — player gets their own (status only, no rubric)
router.get('/mine', async (req, res) => {
  const playerId = req.user.player_id;
  const charIds  = (req.user.character_ids || []).map(id =>
    id instanceof ObjectId ? id : new ObjectId(id)
  );
  const docs = await col().find({
    $or: [
      { player_id: playerId },
      { character_id: { $in: charIds } },
    ],
  }).toArray();

  // Strip rubric/marking details — players only see status + overall feedback if complete
  const stripped = docs.map(d => ({
    _id:          d._id,
    ordeal_type:  d.ordeal_type,
    covenant:     d.covenant,
    submitted_at: d.submitted_at,
    source:       d.source,
    character_id: d.character_id,
    marking: d.marking ? {
      status:           d.marking.status,
      overall_feedback: d.marking.status === 'complete' ? d.marking.overall_feedback : null,
      answers: d.marking.status === 'complete'
        ? (d.marking.answers || []).map(a => ({
            question_index: a.question_index,
            result:         a.result,
            feedback:       a.feedback,
          }))
        : [],
    } : null,
  }));

  res.json(stripped);
});

// GET /api/ordeal_submissions/:id — ST only
router.get('/:id', requireRole('st'), async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid ID' });
  const doc = await col().findOne({ _id: oid });
  if (!doc) return res.status(404).json({ error: 'NOT_FOUND', message: 'Submission not found' });
  res.json(doc);
});

// PUT /api/ordeal_submissions/:id — ST only; updates marking fields
router.put('/:id', requireRole('st'), async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid ID' });

  const existing = await col().findOne({ _id: oid });
  if (!existing) return res.status(404).json({ error: 'NOT_FOUND', message: 'Submission not found' });

  const { _id, ...updates } = req.body;

  // If marking complete, record who and when
  if (updates.marking?.status === 'complete') {
    updates.marking.marked_at = new Date().toISOString();
    updates.marking.xp_awarded = 3;
  }

  const result = await col().findOneAndUpdate(
    { _id: oid },
    { $set: updates },
    { returnDocument: 'after' }
  );

  // Cascade XP if newly marked complete
  if (updates.marking?.status === 'complete' && existing.marking?.status !== 'complete') {
    await cascadeComplete(existing);
  }

  res.json(result);
});

export default router;
