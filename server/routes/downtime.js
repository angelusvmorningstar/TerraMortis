import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getCollection } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { stripStReview } from '../helpers/strip-st-review.js';
import { validate } from '../middleware/validate.js';
import { downtimeSubmissionSchema, downtimeCycleSchema } from '../schemas/downtime_submission.schema.js';
import { sendDowntimePublishedEmail } from '../helpers/email.js';

// JDT-2: action types eligible for the Solo/Joint toggle on a project slot.
// Mirrors JOINT_ELIGIBLE_ACTIONS in public/js/tabs/downtime-data.js.
// `support` (recursive role conflict), `xp_spend` (personal), and
// `maintenance` (personal) are excluded.
const JOINT_ELIGIBLE_ACTIONS = [
  'ambience_increase',
  'ambience_decrease',
  'attack',
  'hide_protect',
  'investigate',
  'patrol_scout',
  'misc',
];

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

// ── JDT-2: Joint projects on a cycle ─────────────────────────────────
// POST /api/downtime_cycles/:cycleId/joint_projects
// Caller is the lead. Creates one cycle.joint_projects[] entry plus one
// project_invitations doc per invitee, atomically.
cyclesRouter.post('/:cycleId/joint_projects', async (req, res) => {
  const cycleOid = parseId(req.params.cycleId);
  if (!cycleOid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid cycle ID format' });

  const {
    lead_character_id,
    lead_submission_id,
    lead_project_slot,
    description,
    action_type,
    target_type,
    target_value,
    invitee_character_ids,
  } = req.body || {};

  // ── Body validation ──
  if (!lead_character_id) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'lead_character_id required' });
  if (!lead_submission_id) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'lead_submission_id required' });
  const slot = Number(lead_project_slot);
  if (!Number.isInteger(slot) || slot < 1 || slot > 4) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'lead_project_slot must be 1-4' });
  }
  if (typeof action_type !== 'string' || !JOINT_ELIGIBLE_ACTIONS.includes(action_type)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'action_type not joint-eligible', allowed: JOINT_ELIGIBLE_ACTIONS });
  }
  if (!Array.isArray(invitee_character_ids) || invitee_character_ids.length === 0) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'invitee_character_ids must be a non-empty array' });
  }
  const inviteeIds = [...new Set(invitee_character_ids.map(String))];
  if (inviteeIds.includes(String(lead_character_id))) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Lead cannot invite themselves' });
  }

  // ── Auth: player must own lead_character_id ──
  if (req.user.role !== 'st') {
    const userCharIds = (req.user.character_ids || []).map(id => String(id));
    if (!userCharIds.includes(String(lead_character_id))) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Cannot create a joint as another character' });
    }
  }

  // ── Cycle must exist and be live ──
  const cycle = await cycles().findOne({ _id: cycleOid });
  if (!cycle) return res.status(404).json({ error: 'NOT_FOUND', message: 'Cycle not found' });
  const liveStatuses = ['prep', 'game', 'active', 'open'];
  if (!liveStatuses.includes(cycle.status)) {
    return res.status(409).json({ error: 'CONFLICT', message: 'Cycle is not accepting joint projects' });
  }

  // ── Lead submission must exist and belong to lead_character_id ──
  const subOid = parseId(lead_submission_id);
  if (!subOid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid lead_submission_id' });
  const leadSub = await submissions().findOne({ _id: subOid });
  if (!leadSub) return res.status(404).json({ error: 'NOT_FOUND', message: 'Lead submission not found' });
  const leadCharStr = leadSub.character_id?.toString();
  if (leadCharStr !== String(lead_character_id)) {
    return res.status(409).json({ error: 'CONFLICT', message: 'lead_submission_id does not belong to lead_character_id' });
  }

  // ── Reject duplicate joint for the same lead slot ──
  const existing = (cycle.joint_projects || []).find(j =>
    String(j.lead_submission_id) === String(lead_submission_id) &&
    Number(j.lead_project_slot) === slot &&
    !j.cancelled_at
  );
  if (existing) {
    return res.status(409).json({ error: 'CONFLICT', message: 'A joint already exists for this slot', joint_id: existing._id });
  }

  const now = new Date().toISOString();
  const jointId = new ObjectId().toString();

  const joint = {
    _id: jointId,
    lead_character_id: String(lead_character_id),
    lead_submission_id: String(lead_submission_id),
    lead_project_slot: slot,
    description: typeof description === 'string' ? description : '',
    action_type,
    target_type: target_type || null,
    target_value: target_value || null,
    description_updated_at: null,
    st_joint_outcome: '',
    participants: [],
    created_at: now,
    cancelled_at: null,
    cancelled_reason: null,
  };

  const invitations = inviteeIds.map(charId => ({
    _id: new ObjectId().toString(),
    joint_project_id: jointId,
    cycle_id: String(req.params.cycleId),
    invited_character_id: charId,
    invited_submission_id: null,
    status: 'pending',
    created_at: now,
    responded_at: null,
    decoupled_at: null,
    cancelled_at: null,
  }));

  await getCollection('project_invitations').insertMany(invitations);
  await cycles().updateOne({ _id: cycleOid }, { $push: { joint_projects: joint } });

  res.status(201).json({ joint, invitations });
});

// JDT-6: Re-invite alternates while submissions are open. Lead-only.
// Adds new pending invitations for the supplied invitee_character_ids,
// skipping anyone who already has an active (pending|accepted) invitation
// on this joint. Returns the newly-created invitations.
cyclesRouter.post('/:cycleId/joint_projects/:jointId/reinvite', async (req, res) => {
  const cycleOid = parseId(req.params.cycleId);
  if (!cycleOid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid cycle ID format' });

  const cycle = await cycles().findOne({ _id: cycleOid });
  if (!cycle) return res.status(404).json({ error: 'NOT_FOUND', message: 'Cycle not found' });
  const joint = (cycle.joint_projects || []).find(j => String(j._id) === String(req.params.jointId));
  if (!joint) return res.status(404).json({ error: 'NOT_FOUND', message: 'Joint not found' });
  if (joint.cancelled_at) {
    return res.status(409).json({ error: 'CONFLICT', message: 'Joint is cancelled; cannot re-invite' });
  }

  if (req.user.role !== 'st') {
    const userCharIds = (req.user.character_ids || []).map(String);
    if (!userCharIds.includes(String(joint.lead_character_id))) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Only the lead can re-invite' });
    }
  }

  const liveStatuses = ['prep', 'game', 'active', 'open'];
  if (!liveStatuses.includes(cycle.status)) {
    return res.status(409).json({ error: 'CONFLICT', message: 'Cycle is not accepting invitations' });
  }

  const inviteeIdsRaw = req.body?.invitee_character_ids;
  if (!Array.isArray(inviteeIdsRaw) || inviteeIdsRaw.length === 0) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'invitee_character_ids must be a non-empty array' });
  }
  const inviteeIds = [...new Set(inviteeIdsRaw.map(String))];
  if (inviteeIds.includes(String(joint.lead_character_id))) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Lead cannot invite themselves' });
  }

  // Drop anyone who already has an active invitation on this joint.
  const existing = await getCollection('project_invitations')
    .find({ joint_project_id: String(joint._id), status: { $in: ['pending', 'accepted'] } })
    .toArray();
  const blocked = new Set(existing.map(i => String(i.invited_character_id)));
  const fresh = inviteeIds.filter(id => !blocked.has(id));
  if (!fresh.length) {
    return res.status(409).json({ error: 'CONFLICT', message: 'All supplied invitees already have an active invitation on this joint' });
  }

  const now = new Date().toISOString();
  const newInvitations = fresh.map(charId => ({
    _id: new ObjectId().toString(),
    joint_project_id: String(joint._id),
    cycle_id: String(req.params.cycleId),
    invited_character_id: charId,
    invited_submission_id: null,
    status: 'pending',
    created_at: now,
    responded_at: null,
    decoupled_at: null,
    cancelled_at: null,
  }));
  await getCollection('project_invitations').insertMany(newInvitations);

  res.status(201).json({ joint, invitations: newInvitations });
});

// JDT-6: Cancel a joint. Lead-only path requires zero non-decoupled
// participants AND zero pending invitations. ST-override path (body
// st_override=true) bypasses the participant check and clears all
// remaining accepted supports' slots as a safety valve.
cyclesRouter.post('/:cycleId/joint_projects/:jointId/cancel', async (req, res) => {
  const cycleOid = parseId(req.params.cycleId);
  if (!cycleOid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid cycle ID format' });

  const cycle = await cycles().findOne({ _id: cycleOid });
  if (!cycle) return res.status(404).json({ error: 'NOT_FOUND', message: 'Cycle not found' });
  const joint = (cycle.joint_projects || []).find(j => String(j._id) === String(req.params.jointId));
  if (!joint) return res.status(404).json({ error: 'NOT_FOUND', message: 'Joint not found' });
  if (joint.cancelled_at) {
    return res.status(409).json({ error: 'CONFLICT', message: 'Joint already cancelled' });
  }

  const isST = req.user.role === 'st' || req.user.role === 'dev';
  const userCharIds = (req.user.character_ids || []).map(String);
  const isLead = userCharIds.includes(String(joint.lead_character_id));
  const stOverride = !!(isST && req.body?.st_override);

  if (!isLead && !stOverride) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Only the lead may cancel this joint' });
  }

  const activeParticipants = (joint.participants || []).filter(p => !p.decoupled_at);
  const pendingInvs = await getCollection('project_invitations')
    .find({ joint_project_id: String(joint._id), status: 'pending' })
    .toArray();

  if (isLead && !stOverride) {
    if (activeParticipants.length > 0) {
      return res.status(409).json({
        error: 'CONFLICT',
        message: 'Cannot cancel while accepted supports remain; ask them to decouple first',
        accepted_supports: activeParticipants.length,
      });
    }
    if (pendingInvs.length > 0) {
      return res.status(409).json({
        error: 'CONFLICT',
        message: 'Cancel pending invitations first or wait for their response',
        pending_invitations: pendingInvs.length,
      });
    }
  }

  const now = new Date().toISOString();
  const cancelledReason = stOverride ? 'st-override' : 'lead-cancelled';

  // Mutations: joint, pending invitations, lead's slot. ST override also
  // clears any remaining accepted supports' slots.
  await cycles().updateOne(
    { _id: cycleOid, 'joint_projects._id': joint._id },
    { $set: {
      'joint_projects.$.cancelled_at': now,
      'joint_projects.$.cancelled_reason': cancelledReason,
    }},
  );

  if (pendingInvs.length) {
    await getCollection('project_invitations').updateMany(
      { joint_project_id: String(joint._id), status: 'pending' },
      { $set: { status: 'cancelled-by-lead', cancelled_at: now } },
    );
  }

  // Clear lead's slot
  const leadSubOid = parseId(String(joint.lead_submission_id));
  if (leadSubOid) {
    const slot = Number(joint.lead_project_slot);
    await submissions().updateOne(
      { _id: leadSubOid },
      { $set: {
        [`responses.project_${slot}_action`]: '',
        [`responses.project_${slot}_is_joint`]: '',
        [`responses.project_${slot}_joint_id`]: null,
        [`responses.project_${slot}_joint_role`]: null,
        [`responses.project_${slot}_joint_description`]: '',
        [`responses.project_${slot}_joint_invited_ids`]: '[]',
        [`responses.project_${slot}_description`]: '',
      }},
    );
  }

  // ST override — clear active supports' slots too
  if (stOverride && activeParticipants.length) {
    for (const p of activeParticipants) {
      const subOid = parseId(String(p.submission_id));
      if (!subOid) continue;
      const slot = Number(p.project_slot);
      await submissions().updateOne(
        { _id: subOid },
        { $set: {
          [`responses.project_${slot}_action`]: '',
          [`responses.project_${slot}_joint_id`]: null,
          [`responses.project_${slot}_joint_role`]: null,
          [`responses.project_${slot}_description`]: '',
          [`responses.project_${slot}_personal_notes`]: '',
        }},
      );
      // Also flip the accepted invitation to decoupled so the badge reads truthfully.
      await getCollection('project_invitations').updateOne(
        { _id: p.invitation_id },
        { $set: { status: 'decoupled', decoupled_at: now } },
      );
      await cycles().updateOne(
        { _id: cycleOid, 'joint_projects._id': joint._id, 'joint_projects.participants.invitation_id': p.invitation_id },
        { $set: { 'joint_projects.$[j].participants.$[pp].decoupled_at': now } },
        { arrayFilters: [{ 'j._id': joint._id }, { 'pp.invitation_id': p.invitation_id }] },
      );
    }
  }

  const updatedCycle = await cycles().findOne({ _id: cycleOid });
  const updatedJoint = (updatedCycle.joint_projects || []).find(j => String(j._id) === String(joint._id));
  res.json({ joint: updatedJoint, cancelled_reason: cancelledReason });
});

// JDT-6: Mid-cycle joint description edit by lead. Only fields in the
// allowlist may be updated; description_updated_at is bumped to now so
// support slots can show the "lead has updated" indicator.
cyclesRouter.patch('/:cycleId/joint_projects/:jointId', async (req, res) => {
  const cycleOid = parseId(req.params.cycleId);
  if (!cycleOid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid cycle ID format' });

  const cycle = await cycles().findOne({ _id: cycleOid });
  if (!cycle) return res.status(404).json({ error: 'NOT_FOUND', message: 'Cycle not found' });
  const joint = (cycle.joint_projects || []).find(j => String(j._id) === String(req.params.jointId));
  if (!joint) return res.status(404).json({ error: 'NOT_FOUND', message: 'Joint not found' });
  if (joint.cancelled_at) {
    return res.status(409).json({ error: 'CONFLICT', message: 'Joint is cancelled' });
  }

  const isST = req.user.role === 'st' || req.user.role === 'dev';
  const userCharIds = (req.user.character_ids || []).map(String);
  const isLead = userCharIds.includes(String(joint.lead_character_id));
  if (!isLead && !isST) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Only the lead may edit this joint' });
  }

  const allowed = ['description', 'target_type', 'target_value'];
  const setOps = {};
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, k)) {
      setOps[`joint_projects.$.${k}`] = req.body[k];
    }
  }
  if (Object.keys(setOps).length === 0) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'No editable fields supplied' });
  }
  const now = new Date().toISOString();
  setOps['joint_projects.$.description_updated_at'] = now;

  await cycles().updateOne(
    { _id: cycleOid, 'joint_projects._id': joint._id },
    { $set: setOps },
  );

  const updatedCycle = await cycles().findOne({ _id: cycleOid });
  const updatedJoint = (updatedCycle.joint_projects || []).find(j => String(j._id) === String(joint._id));
  res.json({ joint: updatedJoint });
});

// JDT-6: Support acknowledges that they've seen the lead's description
// change. Sets participant.description_change_acknowledged_at to now.
cyclesRouter.post('/:cycleId/joint_projects/:jointId/participants/:charId/acknowledge', async (req, res) => {
  const cycleOid = parseId(req.params.cycleId);
  if (!cycleOid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid cycle ID format' });

  const cycle = await cycles().findOne({ _id: cycleOid });
  if (!cycle) return res.status(404).json({ error: 'NOT_FOUND', message: 'Cycle not found' });
  const joint = (cycle.joint_projects || []).find(j => String(j._id) === String(req.params.jointId));
  if (!joint) return res.status(404).json({ error: 'NOT_FOUND', message: 'Joint not found' });

  const charId = String(req.params.charId);
  if (req.user.role !== 'st') {
    const userCharIds = (req.user.character_ids || []).map(String);
    if (!userCharIds.includes(charId)) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Not your participant entry' });
    }
  }

  const participant = (joint.participants || []).find(p => String(p.character_id) === charId && !p.decoupled_at);
  if (!participant) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Participant not found or has decoupled' });
  }

  const now = new Date().toISOString();
  await cycles().updateOne(
    { _id: cycleOid, 'joint_projects._id': joint._id },
    { $set: { 'joint_projects.$[j].participants.$[p].description_change_acknowledged_at': now } },
    { arrayFilters: [{ 'j._id': joint._id }, { 'p.character_id': charId, 'p.decoupled_at': null }] },
  );

  const updatedCycle = await cycles().findOne({ _id: cycleOid });
  const updatedJoint = (updatedCycle.joint_projects || []).find(j => String(j._id) === String(joint._id));
  res.json({ joint: updatedJoint, acknowledged_at: now });
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

// ── DTSR-8 / DTSR-9: section flags ──────────────────────────────────
// Players flag a section of their published outcome they want their
// ST to review. STs resolve flags via the DT Story inbox (DTSR-9).

const VALID_FLAG_CATEGORIES = ['inconsistent', 'wrong_story', 'other'];

// POST /api/downtime_submissions/:id/section-flag — players only, own submission
submissionsRouter.post('/:id/section-flag', async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid submission ID' });

  if (req.user.role !== 'player') return res.status(403).json({ error: 'FORBIDDEN', message: 'Only players may flag a section' });

  const sub = await submissions().findOne({ _id: oid });
  if (!sub) return res.status(404).json({ error: 'NOT_FOUND', message: 'Submission not found' });

  const charIds = (req.user.character_ids || []).map(id => id.toString());
  if (!charIds.includes(sub.character_id?.toString())) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Not your submission' });
  }

  const { section_key, section_idx, category, reason } = req.body || {};
  if (!section_key || typeof section_key !== 'string') {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'section_key required' });
  }
  if (!VALID_FLAG_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'invalid category' });
  }
  const reasonText = (reason || '').toString().trim();
  if (category === 'other' && reasonText.length < 5) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'reason required for other (min 5 chars)' });
  }

  const flag = {
    _id: new ObjectId().toString(),
    section_key,
    section_idx: section_idx == null ? null : Number(section_idx),
    category,
    reason: reasonText,
    created_at: new Date().toISOString(),
    player_id: String(req.user._id || req.user.id || ''),
    status: 'open',
    resolved_at: null,
    resolution_note: null,
  };

  await submissions().updateOne({ _id: oid }, { $push: { section_flags: flag } });
  res.status(201).json(flag);
});

// PATCH /api/downtime_submissions/:id/section-flag/:flagId
// Player path: status: 'recalled' (only own submission, only own flag)
// ST path:     status: 'resolved' + resolution_note
submissionsRouter.patch('/:id/section-flag/:flagId', async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid submission ID' });

  const sub = await submissions().findOne({ _id: oid });
  if (!sub) return res.status(404).json({ error: 'NOT_FOUND', message: 'Submission not found' });

  const flag = (sub.section_flags || []).find(f => String(f._id) === String(req.params.flagId));
  if (!flag) return res.status(404).json({ error: 'NOT_FOUND', message: 'Flag not found' });

  const newStatus = req.body?.status;
  if (newStatus === 'recalled') {
    if (req.user.role !== 'player') return res.status(403).json({ error: 'FORBIDDEN', message: 'Players recall their own flags' });
    const charIds = (req.user.character_ids || []).map(id => id.toString());
    if (!charIds.includes(sub.character_id?.toString())) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Not your submission' });
    }
    if (String(flag.player_id) !== String(req.user._id || req.user.id || '')) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Not your flag' });
    }
    flag.status = 'recalled';
  } else if (newStatus === 'resolved') {
    if (req.user.role !== 'st') return res.status(403).json({ error: 'FORBIDDEN', message: 'Only STs may resolve flags' });
    flag.status = 'resolved';
    flag.resolved_at = new Date().toISOString();
    flag.resolution_note = (req.body?.resolution_note || '').toString().trim() || null;
  } else {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'status must be "recalled" or "resolved"' });
  }

  await submissions().updateOne(
    { _id: oid, 'section_flags._id': flag._id },
    { $set: { 'section_flags.$': flag } }
  );
  res.json(flag);
});

// ── JDT-2: Project invitations: /api/project_invitations ─────────────

export const projectInvitationsRouter = Router();
const projectInvitations = () => getCollection('project_invitations');

// GET /api/project_invitations?cycle_id=...&character_id=...&status=...
//
// ST: returns all invitations on the cycle.
// Player: returns invitations they sent (lead) ∪ invitations they received
//   (invited_character_id ∈ user.character_ids). Used by JDT-2 for the
//   lead's status badges and by JDT-3 for the invitee inbox.
//
// Optional filters:
//   - character_id: narrow to invitations targeted at a specific character
//     (player can only filter to one of their own characters).
//   - status: narrow to a specific lifecycle state (pending, accepted, ...).
//
// Each invitation is enriched with `_joint`, the cycle.joint_projects[]
// entry it points to (or null if missing), so the client has the joint
// description / action_type / lead inline without a second fetch.
projectInvitationsRouter.get('/', async (req, res) => {
  const cycleIdRaw = req.query.cycle_id;
  if (!cycleIdRaw) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'cycle_id required' });
  }

  const filter = { cycle_id: String(cycleIdRaw) };
  if (req.query.status) filter.status = String(req.query.status);

  if (req.user.role !== 'st') {
    const userCharIds = (req.user.character_ids || []).map(id => String(id));
    if (userCharIds.length === 0) return res.json([]);

    if (req.query.character_id) {
      // Explicit character filter — must be one of caller's characters.
      const requested = String(req.query.character_id);
      if (!userCharIds.includes(requested)) return res.json([]);
      filter.invited_character_id = requested;
    } else {
      // No explicit filter — return invitee-received ∪ lead-sent.
      const cycleOid = parseId(cycleIdRaw);
      let leadJointIds = [];
      if (cycleOid) {
        const cycle = await cycles().findOne({ _id: cycleOid });
        leadJointIds = (cycle?.joint_projects || [])
          .filter(j => userCharIds.includes(String(j.lead_character_id)))
          .map(j => String(j._id));
      }
      filter.$or = [
        { invited_character_id: { $in: userCharIds } },
        ...(leadJointIds.length ? [{ joint_project_id: { $in: leadJointIds } }] : []),
      ];
    }
  } else if (req.query.character_id) {
    // ST may filter freely.
    filter.invited_character_id = String(req.query.character_id);
  }

  const docs = await projectInvitations().find(filter).toArray();

  // Enrich with _joint
  const cycleOid = parseId(cycleIdRaw);
  let jointsById = {};
  if (cycleOid) {
    const cycle = await cycles().findOne({ _id: cycleOid });
    for (const j of (cycle?.joint_projects || [])) {
      jointsById[String(j._id)] = j;
    }
  }
  for (const inv of docs) {
    inv._joint = jointsById[String(inv.joint_project_id)] || null;
  }

  res.json(docs);
});

// ── JDT-3: accept / decline lifecycle ────────────────────────────────
// Accept: race-safe — re-reads invitation, requires status=pending. Finds
// (or creates) the invitee's submission for the cycle, picks the lowest
// available slot, writes the joint markers onto that slot, appends the
// participant entry to joint.participants[]. Returns the bundled state.
projectInvitationsRouter.post('/:id/accept', async (req, res) => {
  const invId = req.params.id;
  const inv = await projectInvitations().findOne({ _id: invId });
  if (!inv) return res.status(404).json({ error: 'NOT_FOUND', message: 'Invitation not found' });

  // Auth: caller must own invited_character_id (ST may also accept on a
  // player's behalf for support, e.g. ST-driven testing).
  if (req.user.role !== 'st') {
    const userCharIds = (req.user.character_ids || []).map(String);
    if (!userCharIds.includes(String(inv.invited_character_id))) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Not your invitation' });
    }
  }

  if (inv.status !== 'pending') {
    return res.status(409).json({ error: 'CONFLICT', message: 'Invitation no longer pending', current_status: inv.status });
  }

  // Locate cycle + joint
  const cycleOid = parseId(inv.cycle_id);
  if (!cycleOid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid cycle_id on invitation' });
  const cycle = await cycles().findOne({ _id: cycleOid });
  if (!cycle) return res.status(404).json({ error: 'NOT_FOUND', message: 'Cycle not found' });
  const joint = (cycle.joint_projects || []).find(j => String(j._id) === String(inv.joint_project_id));
  if (!joint || joint.cancelled_at) {
    return res.status(409).json({ error: 'CONFLICT', message: 'Joint no longer available' });
  }

  // Find / create invitee submission for the cycle
  const charOid = parseId(inv.invited_character_id);
  let sub = null;
  if (charOid) {
    sub = await submissions().findOne({
      cycle_id: cycleOid,
      $or: [{ character_id: charOid }, { character_id: String(inv.invited_character_id) }],
    });
  }
  if (!sub) {
    const charValue = charOid || String(inv.invited_character_id);
    const insertResult = await submissions().insertOne({
      character_id: charValue,
      cycle_id: cycleOid,
      status: 'draft',
      responses: {},
    });
    sub = await submissions().findOne({ _id: insertResult.insertedId });
  }

  // Find lowest-numbered available slot (no action set)
  const responses = sub.responses || {};
  let slot = null;
  for (let n = 1; n <= 4; n++) {
    if (!responses[`project_${n}_action`]) { slot = n; break; }
  }
  if (!slot) {
    return res.status(409).json({ error: 'CONFLICT', message: 'No available project slots' });
  }

  const now = new Date().toISOString();

  // Mutate (sequence is fine at our scale; transactional wrap not required)
  await projectInvitations().updateOne(
    { _id: invId },
    { $set: {
      status: 'accepted',
      responded_at: now,
      invited_submission_id: String(sub._id),
    }},
  );

  await cycles().updateOne(
    { _id: cycleOid, 'joint_projects._id': joint._id },
    { $push: { 'joint_projects.$.participants': {
      invitation_id: invId,
      character_id: String(inv.invited_character_id),
      submission_id: String(sub._id),
      project_slot: slot,
      joined_at: now,
      decoupled_at: null,
      description_change_acknowledged_at: now,
    }}},
  );

  await submissions().updateOne(
    { _id: sub._id },
    { $set: {
      [`responses.project_${slot}_action`]: joint.action_type,
      [`responses.project_${slot}_joint_id`]: String(joint._id),
      [`responses.project_${slot}_joint_role`]: 'support',
      [`responses.project_${slot}_description`]: joint.description || '',
    }},
  );

  // Bundle the latest state for the client re-render
  const updatedInv = await projectInvitations().findOne({ _id: invId });
  const updatedSub = await submissions().findOne({ _id: sub._id });
  const updatedCycle = await cycles().findOne({ _id: cycleOid });
  const updatedJoint = (updatedCycle.joint_projects || []).find(j => String(j._id) === String(joint._id));

  res.json({ invitation: updatedInv, joint: updatedJoint, slot, submission: updatedSub });
});

projectInvitationsRouter.post('/:id/decline', async (req, res) => {
  const invId = req.params.id;
  const inv = await projectInvitations().findOne({ _id: invId });
  if (!inv) return res.status(404).json({ error: 'NOT_FOUND', message: 'Invitation not found' });

  if (req.user.role !== 'st') {
    const userCharIds = (req.user.character_ids || []).map(String);
    if (!userCharIds.includes(String(inv.invited_character_id))) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Not your invitation' });
    }
  }

  if (inv.status !== 'pending') {
    return res.status(409).json({ error: 'CONFLICT', message: 'Invitation no longer pending', current_status: inv.status });
  }

  const now = new Date().toISOString();
  await projectInvitations().updateOne(
    { _id: invId },
    { $set: { status: 'declined', responded_at: now } },
  );

  res.json(await projectInvitations().findOne({ _id: invId }));
});

// ── JDT-6: voluntary decouple by an accepted support ─────────────────
// Caller must own invitation.invited_character_id (or be ST). Invitation
// must currently be `accepted`. Atomically: invitation → decoupled,
// participant entry on joint gets decoupled_at, support's submission slot
// fields are cleared so the slot reverts to an empty solo project slot.
projectInvitationsRouter.post('/:id/decouple', async (req, res) => {
  const invId = req.params.id;
  const inv = await projectInvitations().findOne({ _id: invId });
  if (!inv) return res.status(404).json({ error: 'NOT_FOUND', message: 'Invitation not found' });

  if (req.user.role !== 'st') {
    const userCharIds = (req.user.character_ids || []).map(String);
    if (!userCharIds.includes(String(inv.invited_character_id))) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Not your invitation' });
    }
  }

  if (inv.status !== 'accepted') {
    return res.status(409).json({ error: 'CONFLICT', message: 'Invitation is not accepted; nothing to decouple', current_status: inv.status });
  }

  const cycleOid = parseId(inv.cycle_id);
  if (!cycleOid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid cycle_id on invitation' });
  const cycle = await cycles().findOne({ _id: cycleOid });
  if (!cycle) return res.status(404).json({ error: 'NOT_FOUND', message: 'Cycle not found' });
  const joint = (cycle.joint_projects || []).find(j => String(j._id) === String(inv.joint_project_id));
  if (!joint) return res.status(404).json({ error: 'NOT_FOUND', message: 'Joint not found' });

  const participant = (joint.participants || []).find(p => String(p.invitation_id) === String(invId));
  if (!participant) {
    return res.status(409).json({ error: 'CONFLICT', message: 'No participant entry for this invitation' });
  }

  const now = new Date().toISOString();

  // Mutations: invitation → decoupled, participant entry → decoupled_at,
  // submission slot fields cleared so the slot reverts to a free solo slot.
  await projectInvitations().updateOne(
    { _id: invId },
    { $set: { status: 'decoupled', decoupled_at: now } },
  );

  await cycles().updateOne(
    { _id: cycleOid, 'joint_projects._id': joint._id, 'joint_projects.participants.invitation_id': invId },
    { $set: { 'joint_projects.$[j].participants.$[p].decoupled_at': now } },
    { arrayFilters: [{ 'j._id': joint._id }, { 'p.invitation_id': invId }] },
  );

  const subOid = parseId(String(participant.submission_id));
  if (subOid) {
    const slot = Number(participant.project_slot);
    await submissions().updateOne(
      { _id: subOid },
      { $set: {
        [`responses.project_${slot}_action`]: '',
        [`responses.project_${slot}_joint_id`]: null,
        [`responses.project_${slot}_joint_role`]: null,
        [`responses.project_${slot}_description`]: '',
        [`responses.project_${slot}_personal_notes`]: '',
      }},
    );
  }

  const updatedInv = await projectInvitations().findOne({ _id: invId });
  const updatedCycle = await cycles().findOne({ _id: cycleOid });
  const updatedJoint = (updatedCycle.joint_projects || []).find(j => String(j._id) === String(joint._id));
  const updatedSub = subOid ? await submissions().findOne({ _id: subOid }) : null;

  res.json({ invitation: updatedInv, joint: updatedJoint, submission: updatedSub });
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
