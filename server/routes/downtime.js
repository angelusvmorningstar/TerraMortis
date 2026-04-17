import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getCollection } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { stripStReview } from '../helpers/strip-st-review.js';
import { validate } from '../middleware/validate.js';
import { downtimeSubmissionSchema, downtimeCycleSchema } from '../schemas/downtime_submission.schema.js';
import { sendDowntimePublishedEmail } from '../helpers/email.js';

function parseId(id) {
  try {
    return new ObjectId(id);
  } catch {
    return null;
  }
}

// --- Cycles: /api/downtime_cycles ---

export const cyclesRouter = Router();
const cycles = () => getCollection('downtime_cycles');

// GET /api/downtime_cycles — list all (both roles can see cycles)
cyclesRouter.get('/', async (req, res) => {
  const docs = await cycles().find().toArray();
  res.json(docs);
});

// POST /api/downtime_cycles — ST only
cyclesRouter.post('/', requireRole('st'), validate(downtimeCycleSchema), async (req, res) => {
  const doc = req.body;
  const result = await cycles().insertOne(doc);
  const created = await cycles().findOne({ _id: result.insertedId });
  res.status(201).json(created);
});

// POST /api/downtime_cycles/:id/confirm-feeding — both roles (Regents are players)
cyclesRouter.post('/:id/confirm-feeding', async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid cycle ID format' });

  const { territory_id, rights } = req.body;
  if (!territory_id || !Array.isArray(rights)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'territory_id and rights[] are required' });
  }

  // 1. Load cycle; must exist and be active
  const cycle = await cycles().findOne({ _id: oid });
  if (!cycle) return res.status(404).json({ error: 'NOT_FOUND', message: 'Cycle not found' });
  if (cycle.status !== 'active') {
    return res.status(409).json({ error: 'CONFLICT', message: 'Cycle is not active' });
  }

  // 2. Load territory; verify regent identity (ST may bypass)
  const terrCollection = () => getCollection('territories');
  const terrDoc = await terrCollection().findOne({ id: territory_id });
  if (!terrDoc) return res.status(404).json({ error: 'NOT_FOUND', message: 'Territory not found' });

  if (req.user.role !== 'st') {
    const userCharIds = (req.user.character_ids || []).map(id => String(id));
    if (!userCharIds.includes(String(terrDoc.regent_id))) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'You are not the Regent of this territory' });
    }
  }

  const regentCharId = String(terrDoc.regent_id);

  // 3. Append-only check — new rights must be a superset of previous
  const existing = (cycle.regent_confirmations || []).find(c => c.territory_id === territory_id);
  if (existing) {
    const removed = existing.rights.filter(r => !rights.includes(r));
    if (removed.length > 0) {
      return res.status(409).json({ error: 'CONFLICT', message: 'Cannot remove previously confirmed rights', removed });
    }
  }

  // 4. Upsert confirmation entry
  const newEntry = {
    territory_id,
    regent_char_id: regentCharId,
    confirmed_at: new Date().toISOString(),
    rights,
  };
  const updatedConfirmations = [
    ...(cycle.regent_confirmations || []).filter(c => c.territory_id !== territory_id),
    newEntry,
  ];

  // 5. Recompute gate: all territories with regent_id must have a confirmation
  const allTerrs = await terrCollection().find({ regent_id: { $exists: true, $ne: null } }).toArray();
  const confirmedTerritoryIds = new Set(updatedConfirmations.map(c => c.territory_id));
  const allConfirmed = allTerrs.length === 0 || allTerrs.every(t => confirmedTerritoryIds.has(t.id));

  const updateFields = {
    regent_confirmations: updatedConfirmations,
    feeding_rights_confirmed: allConfirmed,
  };

  // 6. Return updated cycle doc
  const updated = await cycles().findOneAndUpdate(
    { _id: oid },
    { $set: updateFields },
    { returnDocument: 'after' }
  );
  res.json(updated);
});

// PUT /api/downtime_cycles/:id — ST only
cyclesRouter.put('/:id', requireRole('st'), async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid cycle ID format' });

  const { _id, ...updates } = req.body;
  const result = await cycles().findOneAndUpdate(
    { _id: oid },
    { $set: updates },
    { returnDocument: 'after' }
  );

  if (!result) return res.status(404).json({ error: 'NOT_FOUND', message: 'Cycle not found' });
  res.json(result);
});

// --- Submissions: /api/downtime_submissions ---

export const submissionsRouter = Router();
const submissions = () => getCollection('downtime_submissions');

// POST /api/downtime_submissions — both roles can create
submissionsRouter.post('/', validate(downtimeSubmissionSchema), async (req, res) => {
  const doc = { ...req.body };
  // Normalise ID fields to ObjectId so GET queries match correctly
  if (doc.cycle_id) {
    const oid = parseId(String(doc.cycle_id));
    if (oid) doc.cycle_id = oid;
  }
  if (doc.character_id) {
    const oid = parseId(String(doc.character_id));
    if (oid) doc.character_id = oid;
  }
  const result = await submissions().insertOne(doc);
  const created = await submissions().findOne({ _id: result.insertedId });
  res.status(201).json(created);
});

// GET /api/downtime_submissions — ST gets all, player gets only their own (st_review stripped)
submissionsRouter.get('/', async (req, res) => {
  const filter = {};
  if (req.query.cycle_id) {
    const oid = parseId(req.query.cycle_id);
    if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid cycle_id format' });
    // Accept both ObjectId and legacy string representations
    filter.$or = [{ cycle_id: oid }, { cycle_id: req.query.cycle_id }];
  }

  // Player: restrict to their characters
  // Accept both ObjectId and legacy string-stored character_ids (CSV imports may store as string)
  if (req.user.role === 'player') {
    const charIdOids = (req.user.character_ids || []).map(id =>
      id instanceof ObjectId ? id : new ObjectId(id)
    );
    const charIdStrs = charIdOids.map(id => id.toString());
    filter.character_id = { $in: [...charIdOids, ...charIdStrs] };
  }

  const docs = await submissions().find(filter).toArray();

  // Strip st_review for player responses
  if (req.user.role === 'player') {
    docs.forEach(doc => stripStReview(doc));
  }

  res.json(docs);
});

// PUT /api/downtime_submissions/:id — ST can update any, player can update own (before deadline)
submissionsRouter.put('/:id', async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid submission ID format' });

  // Load existing doc for ownership check and publish-transition detection
  const existing = await submissions().findOne({ _id: oid });
  if (!existing) return res.status(404).json({ error: 'NOT_FOUND', message: 'Submission not found' });

  // Player: verify ownership and deadline
  if (req.user.role === 'player') {
    const charIds = (req.user.character_ids || []).map(id => id.toString());
    if (!charIds.includes(existing.character_id?.toString())) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Not your submission' });
    }

    // Enforce cycle deadline — but allow feeding-related fields through,
    // since feeding rolls happen at game time (after the submission deadline).
    const FEEDING_FIELDS = new Set(['feeding_roll_player', 'feeding_vitae_allocation', 'feeding_deferred']);
    const allFieldsFeeding = Object.keys(req.body).every(k => FEEDING_FIELDS.has(k));
    if (!allFieldsFeeding && existing.cycle_id) {
      const cycleOid = existing.cycle_id instanceof ObjectId ? existing.cycle_id : parseId(String(existing.cycle_id));
      if (cycleOid) {
        const cycle = await cycles().findOne({ _id: cycleOid });
        if (cycle?.deadline_at && new Date(cycle.deadline_at) < new Date()) {
          return res.status(403).json({ error: 'DEADLINE_PASSED', message: 'Submissions for this cycle are closed.' });
        }
      }
    }

    // Players cannot modify st_review fields (including dot-notation paths)
    delete req.body.st_review;
    for (const key of Object.keys(req.body)) {
      if (key.startsWith('st_review.')) delete req.body[key];
    }
  }

  // Detect publish transition (ST only — player requests can't reach this with st_review fields)
  const isPublishTransition =
    req.body['st_review.outcome_visibility'] === 'published' &&
    existing?.st_review?.outcome_visibility !== 'published';

  const { _id, ...updates } = req.body;
  const result = await submissions().findOneAndUpdate(
    { _id: oid },
    { $set: updates },
    { returnDocument: 'after' }
  );

  if (!result) return res.status(404).json({ error: 'NOT_FOUND', message: 'Submission not found' });

  // Strip st_review from player responses
  if (req.user.role === 'player') {
    stripStReview(result);
  }

  res.json(result);

  // Fire-and-forget email on publish transition
  if (isPublishTransition) {
    _sendPublishedEmail(result).catch(err =>
      console.error('[email] Publish email error:', err.message)
    );
  }
});

async function _sendPublishedEmail(submission) {
  try {
    const charId = submission.character_id instanceof ObjectId
      ? submission.character_id
      : parseId(String(submission.character_id));
    if (!charId) return;

    // Find player via character_ids reverse lookup
    const playersCol = getCollection('players');
    const player = await playersCol.findOne({ character_ids: charId });
    if (!player?.email) return;

    // Fetch cycle label
    const cycleId = submission.cycle_id instanceof ObjectId
      ? submission.cycle_id
      : parseId(String(submission.cycle_id));
    let cycleLabel = 'Downtime';
    if (cycleId) {
      const cycle = await cycles().findOne({ _id: cycleId });
      if (cycle?.label) cycleLabel = cycle.label;
    }

    // Resolve character display name
    const charsCol = getCollection('characters');
    const char = charId ? await charsCol.findOne({ _id: charId }) : null;
    const charName = char
      ? [char.honorific, char.moniker || char.name].filter(Boolean).join(' ')
      : 'Your character';

    await sendDowntimePublishedEmail({
      toEmail:      player.email,
      charName,
      cycleLabel,
      outcomeText:  submission.st_review?.outcome_text || '',
      feedMethodId: submission.responses?._feed_method || '',
    });
  } catch (err) {
    console.error('[email] _sendPublishedEmail failed:', err.message);
  }
}
