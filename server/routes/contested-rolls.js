import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getCollection } from '../db.js';
import { validate } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';
import { contestedRollRequestSchema } from '../schemas/contested_roll_request.schema.js';

const router = Router();
const col     = () => getCollection('contested_roll_requests');
const logCol  = () => getCollection('session_logs');

// POST /api/contested_roll_requests — player creates a challenge
router.post('/', validate(contestedRollRequestSchema), async (req, res) => {
  const { challenger_character_id } = req.body;

  // Challenger must own the character they're challenging as
  const charIds = (req.user.character_ids || []).map(id => String(id));
  if (!charIds.includes(challenger_character_id)) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Character does not belong to you' });
  }

  const doc = {
    ...req.body,
    status:     'pending',
    outcome:    null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const result  = await col().insertOne(doc);
  const created = await col().findOne({ _id: result.insertedId });
  res.status(201).json(created);
});

// GET /api/contested_roll_requests/mine — pending challenges targeting me
router.get('/mine', async (req, res) => {
  const charIds = (req.user.character_ids || []).map(id => String(id));
  if (!charIds.length) return res.json([]);

  const docs = await col()
    .find({ target_character_id: { $in: charIds }, status: 'pending' })
    .sort({ created_at: -1 })
    .toArray();

  res.json(docs);
});

// PUT /api/contested_roll_requests/:id/accept — target accepts; dice rolled server-side
router.put('/:id/accept', async (req, res) => {
  const challenge = await _findChallenge(req, res);
  if (!challenge) return;

  const charIds = (req.user.character_ids || []).map(id => String(id));
  if (!charIds.includes(challenge.target_character_id)) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'You are not the target of this challenge' });
  }

  // Roll dice server-side for both sides
  const atkCols = _roll(challenge.challenger_pool);
  const defCols = _roll(challenge.defender_pool);
  const atkSuc  = _countSuc(atkCols);
  const defSuc  = _countSuc(defCols);

  let outcome, margin;
  if (atkSuc > defSuc)      { outcome = 'attacker'; margin = atkSuc - defSuc; }
  else if (defSuc > atkSuc) { outcome = 'defender'; margin = defSuc - atkSuc; }
  else                       { outcome = 'draw';     margin = 0; }

  const outcomeData = {
    attacker: { name: challenge.challenger_character_name, pool: challenge.challenger_pool, successes: atkSuc, rolls: atkCols },
    defender: { name: challenge.target_character_name,    pool: challenge.defender_pool,   successes: defSuc, rolls: defCols },
    outcome,
    margin,
  };

  await col().updateOne(
    { _id: challenge._id },
    { $set: { status: 'resolved', outcome: outcomeData, updated_at: new Date().toISOString() } }
  );

  // Log to session_logs directly (session_logs HTTP endpoint is ST-only)
  try {
    await logCol().insertOne({
      session_date:  new Date().toISOString().slice(0, 10),
      type:          'player_contested_roll',
      roll_type:     challenge.roll_type,
      power_name:    challenge.power_name || null,
      challenge_id:  String(challenge._id),
      attacker:      outcomeData.attacker,
      defender:      outcomeData.defender,
      outcome,
      margin,
      timestamp:     new Date().toISOString(),
    });
  } catch { /* log failure is non-fatal */ }

  res.json(await col().findOne({ _id: challenge._id }));
});

// PUT /api/contested_roll_requests/:id/decline — target declines
router.put('/:id/decline', async (req, res) => {
  const challenge = await _findChallenge(req, res);
  if (!challenge) return;

  const charIds = (req.user.character_ids || []).map(id => String(id));
  if (!charIds.includes(challenge.target_character_id)) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'You are not the target of this challenge' });
  }

  await col().updateOne(
    { _id: challenge._id },
    { $set: { status: 'declined', updated_at: new Date().toISOString() } }
  );

  res.json({ declined: true });
});

// PUT /api/contested_roll_requests/:id/void — ST override
router.put('/:id/void', requireRole('st'), async (req, res) => {
  let oid;
  try { oid = new ObjectId(req.params.id); } catch {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid ID format' });
  }

  const result = await col().updateOne(
    { _id: oid },
    { $set: { status: 'voided', updated_at: new Date().toISOString() } }
  );
  if (!result.matchedCount) return res.status(404).json({ error: 'NOT_FOUND' });

  res.json(await col().findOne({ _id: oid }));
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function _findChallenge(req, res) {
  let oid;
  try { oid = new ObjectId(req.params.id); } catch {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid ID format' });
    return null;
  }
  const doc = await col().findOne({ _id: oid });
  if (!doc) { res.status(404).json({ error: 'NOT_FOUND' }); return null; }
  if (doc.status !== 'pending') {
    res.status(409).json({ error: 'CONFLICT', message: 'Challenge is no longer pending' });
    return null;
  }
  return doc;
}

function d10() { return Math.floor(Math.random() * 10) + 1; }

function _roll(n) {
  const cols = [];
  for (let i = 0; i < Math.max(0, n); i++) {
    const v = d10();
    const r = { v, s: v >= 8, x: v === 10 };
    const ch = [];
    let last = r;
    while (last.x) { const cv = d10(); last = { v: cv, s: cv >= 8, x: cv === 10 }; ch.push(last); }
    cols.push({ r, ch });
  }
  return cols;
}

function _countSuc(cols) {
  let s = 0;
  for (const col of cols) {
    if (col.r.s) s++;
    for (const d of col.ch) if (d.s) s++;
  }
  return s;
}

export default router;
