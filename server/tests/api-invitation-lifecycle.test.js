/**
 * API tests — JDT-3 invitation lifecycle endpoints:
 *   POST /api/project_invitations/:id/accept
 *   POST /api/project_invitations/:id/decline
 *
 * Covers: happy-path accept (slot found, participant pushed, slot fields set,
 * response bundle), happy-path decline, race-safety (double-accept, accept
 * after decline, decline after accept), 403 for wrong character, 409 when no
 * slots are available, and the GET endpoint's _joint enrichment + status filter.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { ObjectId } from 'mongodb';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb, getTestCharacterIds } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;
let testChars;
let createdCycleIds = [];
let createdSubIds = [];
let createdInvIds = [];

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
  testChars = await getTestCharacterIds(3);
});

afterEach(async () => {
  for (const id of createdCycleIds) await getCollection('downtime_cycles').deleteOne({ _id: id });
  createdCycleIds = [];
  for (const id of createdSubIds) await getCollection('downtime_submissions').deleteOne({ _id: id });
  createdSubIds = [];
  for (const id of createdInvIds) await getCollection('project_invitations').deleteOne({ _id: id });
  createdInvIds = [];
});

afterAll(async () => {
  await teardownDb();
});

async function insertCycle(overrides = {}) {
  const col = getCollection('downtime_cycles');
  const doc = { label: 'JDT-3 Test', game_number: 999, status: 'active', ...overrides };
  const r = await col.insertOne(doc);
  createdCycleIds.push(r.insertedId);
  return { ...doc, _id: r.insertedId };
}

async function insertSub(charId, cycleId, overrides = {}) {
  const col = getCollection('downtime_submissions');
  const doc = {
    character_id: new ObjectId(charId),
    cycle_id: cycleId,
    status: 'draft',
    responses: {},
    ...overrides,
  };
  const r = await col.insertOne(doc);
  createdSubIds.push(r.insertedId);
  return { ...doc, _id: r.insertedId };
}

// Helper: create joint via the lead-side endpoint, mirroring real flow.
async function createJoint(cycle, leadChar, leadSub, inviteeIds, overrides = {}) {
  const res = await request(app)
    .post(`/api/downtime_cycles/${cycle._id}/joint_projects`)
    .set('X-Test-User', playerUser([leadChar.id]))
    .send({
      lead_character_id: leadChar.id,
      lead_submission_id: String(leadSub._id),
      lead_project_slot: overrides.lead_project_slot || 1,
      description: overrides.description || 'Make plans together',
      action_type: overrides.action_type || 'investigate',
      target_type: overrides.target_type || 'territory',
      target_value: overrides.target_value || 'academy',
      invitee_character_ids: inviteeIds,
    });
  expect(res.status).toBe(201);
  for (const inv of res.body.invitations) createdInvIds.push(inv._id);
  return res.body;
}

describe('POST /api/project_invitations/:id/accept', () => {
  it('happy path: slot is consumed, participant pushed, slot fields set', async () => {
    const cycle = await insertCycle();
    const leadSub = await insertSub(testChars[0].id, cycle._id);
    const inviteeSub = await insertSub(testChars[1].id, cycle._id);

    const created = await createJoint(cycle, testChars[0], leadSub, [testChars[1].id]);
    const inv = created.invitations[0];

    const res = await request(app)
      .post(`/api/project_invitations/${inv._id}/accept`)
      .set('X-Test-User', playerUser([testChars[1].id]))
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.invitation.status).toBe('accepted');
    expect(res.body.invitation.responded_at).toBeTruthy();
    expect(res.body.invitation.invited_submission_id).toBe(String(inviteeSub._id));
    expect(res.body.slot).toBe(1); // empty submission, lowest available

    // Submission has the joint markers
    expect(res.body.submission.responses.project_1_action).toBe('investigate');
    expect(res.body.submission.responses.project_1_joint_id).toBe(String(created.joint._id));
    expect(res.body.submission.responses.project_1_joint_role).toBe('support');

    // Joint's participants array is populated
    expect(res.body.joint.participants).toHaveLength(1);
    expect(res.body.joint.participants[0].character_id).toBe(testChars[1].id);
    expect(res.body.joint.participants[0].project_slot).toBe(1);
    expect(res.body.joint.participants[0].invitation_id).toBe(inv._id);
  });

  it('lowest-numbered available slot is chosen when others are filled', async () => {
    const cycle = await insertCycle();
    const leadSub = await insertSub(testChars[0].id, cycle._id);
    const inviteeSub = await insertSub(testChars[1].id, cycle._id, {
      responses: { project_1_action: 'attack', project_2_action: 'investigate' },
    });

    const created = await createJoint(cycle, testChars[0], leadSub, [testChars[1].id]);

    const res = await request(app)
      .post(`/api/project_invitations/${created.invitations[0]._id}/accept`)
      .set('X-Test-User', playerUser([testChars[1].id]))
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.slot).toBe(3);
    expect(res.body.submission.responses.project_3_joint_role).toBe('support');
    // Existing slots untouched
    expect(res.body.submission.responses.project_1_action).toBe('attack');
    expect(res.body.submission.responses.project_2_action).toBe('investigate');
  });

  it('creates a submission for the invitee if none exists', async () => {
    const cycle = await insertCycle();
    const leadSub = await insertSub(testChars[0].id, cycle._id);
    // NB: no insertSub for testChars[1] — invitee has no submission yet

    const created = await createJoint(cycle, testChars[0], leadSub, [testChars[1].id]);

    const res = await request(app)
      .post(`/api/project_invitations/${created.invitations[0]._id}/accept`)
      .set('X-Test-User', playerUser([testChars[1].id]))
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.submission.character_id).toBeTruthy();
    expect(res.body.invitation.invited_submission_id).toBe(String(res.body.submission._id));
    // Track for cleanup
    createdSubIds.push(res.body.submission._id);
  });

  it('returns 403 when caller does not own the invited character', async () => {
    const cycle = await insertCycle();
    const leadSub = await insertSub(testChars[0].id, cycle._id);
    await insertSub(testChars[1].id, cycle._id);

    const created = await createJoint(cycle, testChars[0], leadSub, [testChars[1].id]);

    const res = await request(app)
      .post(`/api/project_invitations/${created.invitations[0]._id}/accept`)
      .set('X-Test-User', playerUser([testChars[2].id]))
      .send({});

    expect(res.status).toBe(403);
  });

  it('returns 409 on double-accept (race condition)', async () => {
    const cycle = await insertCycle();
    const leadSub = await insertSub(testChars[0].id, cycle._id);
    await insertSub(testChars[1].id, cycle._id);

    const created = await createJoint(cycle, testChars[0], leadSub, [testChars[1].id]);
    const invId = created.invitations[0]._id;
    const userHeader = playerUser([testChars[1].id]);

    const r1 = await request(app)
      .post(`/api/project_invitations/${invId}/accept`)
      .set('X-Test-User', userHeader)
      .send({});
    expect(r1.status).toBe(200);

    const r2 = await request(app)
      .post(`/api/project_invitations/${invId}/accept`)
      .set('X-Test-User', userHeader)
      .send({});
    expect(r2.status).toBe(409);
    expect(r2.body.current_status).toBe('accepted');
  });

  it('returns 409 when no project slots are available', async () => {
    const cycle = await insertCycle();
    const leadSub = await insertSub(testChars[0].id, cycle._id);
    await insertSub(testChars[1].id, cycle._id, {
      responses: {
        project_1_action: 'attack',
        project_2_action: 'investigate',
        project_3_action: 'misc',
        project_4_action: 'patrol_scout',
      },
    });

    const created = await createJoint(cycle, testChars[0], leadSub, [testChars[1].id]);

    const res = await request(app)
      .post(`/api/project_invitations/${created.invitations[0]._id}/accept`)
      .set('X-Test-User', playerUser([testChars[1].id]))
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/no available project slots/i);
  });

  it('returns 404 on missing invitation', async () => {
    const res = await request(app)
      .post(`/api/project_invitations/${new ObjectId().toString()}/accept`)
      .set('X-Test-User', playerUser([testChars[0].id]))
      .send({});
    expect(res.status).toBe(404);
  });
});

describe('POST /api/project_invitations/:id/decline', () => {
  it('happy path: status becomes declined; no slot consumed', async () => {
    const cycle = await insertCycle();
    const leadSub = await insertSub(testChars[0].id, cycle._id);
    const inviteeSub = await insertSub(testChars[1].id, cycle._id);

    const created = await createJoint(cycle, testChars[0], leadSub, [testChars[1].id]);

    const res = await request(app)
      .post(`/api/project_invitations/${created.invitations[0]._id}/decline`)
      .set('X-Test-User', playerUser([testChars[1].id]))
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('declined');
    expect(res.body.responded_at).toBeTruthy();

    // Invitee's submission untouched
    const stillEmpty = await getCollection('downtime_submissions').findOne({ _id: inviteeSub._id });
    expect(Object.keys(stillEmpty.responses || {})).toHaveLength(0);
  });

  it('returns 403 when caller does not own the invited character', async () => {
    const cycle = await insertCycle();
    const leadSub = await insertSub(testChars[0].id, cycle._id);
    const created = await createJoint(cycle, testChars[0], leadSub, [testChars[1].id]);

    const res = await request(app)
      .post(`/api/project_invitations/${created.invitations[0]._id}/decline`)
      .set('X-Test-User', playerUser([testChars[2].id]))
      .send({});
    expect(res.status).toBe(403);
  });

  it('returns 409 if invitation already accepted', async () => {
    const cycle = await insertCycle();
    const leadSub = await insertSub(testChars[0].id, cycle._id);
    await insertSub(testChars[1].id, cycle._id);

    const created = await createJoint(cycle, testChars[0], leadSub, [testChars[1].id]);
    const userHeader = playerUser([testChars[1].id]);

    const accept = await request(app)
      .post(`/api/project_invitations/${created.invitations[0]._id}/accept`)
      .set('X-Test-User', userHeader)
      .send({});
    expect(accept.status).toBe(200);

    const decline = await request(app)
      .post(`/api/project_invitations/${created.invitations[0]._id}/decline`)
      .set('X-Test-User', userHeader)
      .send({});
    expect(decline.status).toBe(409);
  });
});

describe('POST /api/project_invitations/:id/decouple — JDT-6', () => {
  // Helper: walk the full create → accept → decouple flow for a single
  // invitee. Returns the invitation, joint, cycle, and submission ids
  // ready for assertions.
  async function setupAcceptedJoint(testChars, leadIdx = 0, supportIdx = 1) {
    const cycle = await insertCycle();
    const leadSub = await insertSub(testChars[leadIdx].id, cycle._id);
    await insertSub(testChars[supportIdx].id, cycle._id);
    const created = await createJoint(cycle, testChars[leadIdx], leadSub, [testChars[supportIdx].id]);
    const invId = created.invitations[0]._id;
    const accept = await request(app)
      .post(`/api/project_invitations/${invId}/accept`)
      .set('X-Test-User', playerUser([testChars[supportIdx].id]))
      .send({});
    expect(accept.status).toBe(200);
    return { cycle, leadSub, invId, joint: created.joint, accept: accept.body };
  }

  it('happy path: invitation → decoupled, slot freed, participant marked', async () => {
    const { invId, joint, accept } = await setupAcceptedJoint(testChars);

    const res = await request(app)
      .post(`/api/project_invitations/${invId}/decouple`)
      .set('X-Test-User', playerUser([testChars[1].id]))
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.invitation.status).toBe('decoupled');
    expect(res.body.invitation.decoupled_at).toBeTruthy();

    // Participant entry has decoupled_at
    const p = (res.body.joint.participants || []).find(x => String(x.invitation_id) === String(invId));
    expect(p).toBeTruthy();
    expect(p.decoupled_at).toBeTruthy();

    // Submission slot fields cleared
    const sub = res.body.submission;
    const slot = accept.slot;
    expect(sub.responses[`project_${slot}_action`]).toBe('');
    expect(sub.responses[`project_${slot}_joint_id`]).toBeNull();
    expect(sub.responses[`project_${slot}_joint_role`]).toBeNull();
    expect(sub.responses[`project_${slot}_description`]).toBe('');
  });

  it('returns 403 when caller does not own invited character', async () => {
    const { invId } = await setupAcceptedJoint(testChars);
    const res = await request(app)
      .post(`/api/project_invitations/${invId}/decouple`)
      .set('X-Test-User', playerUser([testChars[2].id]))
      .send({});
    expect(res.status).toBe(403);
  });

  it('returns 409 when invitation is not accepted (still pending)', async () => {
    const cycle = await insertCycle();
    const leadSub = await insertSub(testChars[0].id, cycle._id);
    const created = await createJoint(cycle, testChars[0], leadSub, [testChars[1].id]);

    const res = await request(app)
      .post(`/api/project_invitations/${created.invitations[0]._id}/decouple`)
      .set('X-Test-User', playerUser([testChars[1].id]))
      .send({});
    expect(res.status).toBe(409);
    expect(res.body.current_status).toBe('pending');
  });

  it('returns 409 on double-decouple', async () => {
    const { invId } = await setupAcceptedJoint(testChars);
    const userHeader = playerUser([testChars[1].id]);

    const r1 = await request(app)
      .post(`/api/project_invitations/${invId}/decouple`)
      .set('X-Test-User', userHeader)
      .send({});
    expect(r1.status).toBe(200);

    const r2 = await request(app)
      .post(`/api/project_invitations/${invId}/decouple`)
      .set('X-Test-User', userHeader)
      .send({});
    expect(r2.status).toBe(409);
    expect(r2.body.current_status).toBe('decoupled');
  });

  it('ST may decouple on behalf of a player', async () => {
    const { invId } = await setupAcceptedJoint(testChars);
    const res = await request(app)
      .post(`/api/project_invitations/${invId}/decouple`)
      .set('X-Test-User', stUser())
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.invitation.status).toBe('decoupled');
  });

  it('returns 404 on missing invitation', async () => {
    const res = await request(app)
      .post(`/api/project_invitations/${new ObjectId().toString()}/decouple`)
      .set('X-Test-User', playerUser([testChars[0].id]))
      .send({});
    expect(res.status).toBe(404);
  });
});

describe('GET /api/project_invitations — JDT-3 enrichments', () => {
  it('enriches each invitation with its _joint document', async () => {
    const cycle = await insertCycle();
    const leadSub = await insertSub(testChars[0].id, cycle._id);
    const created = await createJoint(cycle, testChars[0], leadSub, [testChars[1].id]);

    const res = await request(app)
      .get(`/api/project_invitations?cycle_id=${cycle._id}`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]._joint).toBeTruthy();
    expect(res.body[0]._joint._id).toBe(created.joint._id);
    expect(res.body[0]._joint.description).toBe('Make plans together');
  });

  it('filters by status', async () => {
    const cycle = await insertCycle();
    const leadSub = await insertSub(testChars[0].id, cycle._id);
    await insertSub(testChars[1].id, cycle._id);

    const created = await createJoint(cycle, testChars[0], leadSub, [testChars[1].id, testChars[2].id]);

    // Decline the second invitation
    await request(app)
      .post(`/api/project_invitations/${created.invitations[1]._id}/decline`)
      .set('X-Test-User', playerUser([testChars[2].id]))
      .send({});

    const pending = await request(app)
      .get(`/api/project_invitations?cycle_id=${cycle._id}&status=pending`)
      .set('X-Test-User', stUser());
    expect(pending.body).toHaveLength(1);
    expect(pending.body[0].status).toBe('pending');

    const declined = await request(app)
      .get(`/api/project_invitations?cycle_id=${cycle._id}&status=declined`)
      .set('X-Test-User', stUser());
    expect(declined.body).toHaveLength(1);
    expect(declined.body[0].status).toBe('declined');
  });

  it('filters by character_id (player scoped)', async () => {
    const cycle = await insertCycle();
    const leadSub = await insertSub(testChars[0].id, cycle._id);
    const created = await createJoint(cycle, testChars[0], leadSub, [testChars[1].id, testChars[2].id]);

    const res = await request(app)
      .get(`/api/project_invitations?cycle_id=${cycle._id}&character_id=${testChars[1].id}`)
      .set('X-Test-User', playerUser([testChars[1].id]));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].invited_character_id).toBe(testChars[1].id);

    // Player asking about a character they don't own → empty
    const denied = await request(app)
      .get(`/api/project_invitations?cycle_id=${cycle._id}&character_id=${testChars[2].id}`)
      .set('X-Test-User', playerUser([testChars[1].id]));
    expect(denied.status).toBe(200);
    expect(denied.body).toHaveLength(0);
  });
});
