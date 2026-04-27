/**
 * API tests — JDT-2 endpoints:
 *   POST /api/downtime_cycles/:cycleId/joint_projects
 *   GET  /api/project_invitations?cycle_id=...
 *
 * Covers auth, action-type whitelist, atomic creation of joint + invitations,
 * lead-ownership enforcement, duplicate-slot rejection, and the player-scoped
 * invitations read (lead-sent ∪ invitee-received).
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

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
  testChars = await getTestCharacterIds(3);
});

afterEach(async () => {
  const cycleCol = getCollection('downtime_cycles');
  for (const id of createdCycleIds) await cycleCol.deleteOne({ _id: id });
  createdCycleIds = [];

  const subCol = getCollection('downtime_submissions');
  for (const id of createdSubIds) await subCol.deleteOne({ _id: id });
  createdSubIds = [];

  // Invitations: clean up by cycle_id (string)
  await getCollection('project_invitations').deleteMany({ _test_seeded: true });
});

afterAll(async () => {
  await teardownDb();
});

async function insertCycle(overrides = {}) {
  const col = getCollection('downtime_cycles');
  const doc = { label: 'JDT-2 Test', game_number: 999, status: 'active', ...overrides };
  const r = await col.insertOne(doc);
  createdCycleIds.push(r.insertedId);
  return { ...doc, _id: r.insertedId };
}

async function insertSub(charId, cycleId) {
  const col = getCollection('downtime_submissions');
  const doc = {
    character_id: new ObjectId(charId),
    cycle_id: cycleId,
    status: 'draft',
    responses: {},
  };
  const r = await col.insertOne(doc);
  createdSubIds.push(r.insertedId);
  return { ...doc, _id: r.insertedId };
}

function jointBody(leadCharId, leadSubId, leadSlot, inviteeIds, overrides = {}) {
  return {
    lead_character_id: leadCharId,
    lead_submission_id: String(leadSubId),
    lead_project_slot: leadSlot,
    description: 'Burn down the Wallflower together',
    action_type: 'attack',
    target_type: 'territory',
    target_value: 'academy',
    invitee_character_ids: inviteeIds,
    ...overrides,
  };
}

describe('POST /api/downtime_cycles/:cycleId/joint_projects', () => {
  it('lead creates a joint with one invitee; cycle and invitations updated atomically', async () => {
    const cycle = await insertCycle();
    const leadSub = await insertSub(testChars[0].id, cycle._id);

    const res = await request(app)
      .post(`/api/downtime_cycles/${cycle._id}/joint_projects`)
      .set('X-Test-User', playerUser([testChars[0].id]))
      .send(jointBody(testChars[0].id, leadSub._id, 1, [testChars[1].id]));

    expect(res.status).toBe(201);
    expect(res.body.joint).toBeTruthy();
    expect(res.body.joint.lead_character_id).toBe(testChars[0].id);
    expect(res.body.joint.lead_project_slot).toBe(1);
    expect(res.body.joint.action_type).toBe('attack');
    expect(res.body.invitations).toHaveLength(1);
    expect(res.body.invitations[0].invited_character_id).toBe(testChars[1].id);
    expect(res.body.invitations[0].status).toBe('pending');

    // Verify side-effects in storage
    const updated = await getCollection('downtime_cycles').findOne({ _id: cycle._id });
    expect(updated.joint_projects).toHaveLength(1);
    expect(updated.joint_projects[0]._id).toBe(res.body.joint._id);

    const inv = await getCollection('project_invitations')
      .findOne({ joint_project_id: res.body.joint._id });
    expect(inv).toBeTruthy();
    expect(inv.status).toBe('pending');

    // Clean up the seeded invitation
    await getCollection('project_invitations').deleteOne({ _id: inv._id });
  });

  it('rejects unauthenticated requests', async () => {
    const cycle = await insertCycle();
    const res = await request(app)
      .post(`/api/downtime_cycles/${cycle._id}/joint_projects`)
      .send({});
    expect(res.status).toBe(401);
  });

  it('blocks a player who does not own lead_character_id', async () => {
    const cycle = await insertCycle();
    const leadSub = await insertSub(testChars[0].id, cycle._id);

    const res = await request(app)
      .post(`/api/downtime_cycles/${cycle._id}/joint_projects`)
      .set('X-Test-User', playerUser([testChars[2].id])) // owns 2, not 0
      .send(jointBody(testChars[0].id, leadSub._id, 1, [testChars[1].id]));

    expect(res.status).toBe(403);
  });

  it('rejects non-eligible action types (e.g. xp_spend)', async () => {
    const cycle = await insertCycle();
    const leadSub = await insertSub(testChars[0].id, cycle._id);

    const res = await request(app)
      .post(`/api/downtime_cycles/${cycle._id}/joint_projects`)
      .set('X-Test-User', playerUser([testChars[0].id]))
      .send(jointBody(testChars[0].id, leadSub._id, 1, [testChars[1].id], { action_type: 'xp_spend' }));

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/joint-eligible/);
    expect(res.body.allowed).toContain('attack');
  });

  it('rejects when lead invites themselves', async () => {
    const cycle = await insertCycle();
    const leadSub = await insertSub(testChars[0].id, cycle._id);

    const res = await request(app)
      .post(`/api/downtime_cycles/${cycle._id}/joint_projects`)
      .set('X-Test-User', playerUser([testChars[0].id]))
      .send(jointBody(testChars[0].id, leadSub._id, 1, [testChars[0].id]));

    expect(res.status).toBe(400);
  });

  it('rejects empty invitee list', async () => {
    const cycle = await insertCycle();
    const leadSub = await insertSub(testChars[0].id, cycle._id);

    const res = await request(app)
      .post(`/api/downtime_cycles/${cycle._id}/joint_projects`)
      .set('X-Test-User', playerUser([testChars[0].id]))
      .send(jointBody(testChars[0].id, leadSub._id, 1, []));

    expect(res.status).toBe(400);
  });

  it('rejects when lead_submission_id does not belong to lead_character_id', async () => {
    const cycle = await insertCycle();
    const otherSub = await insertSub(testChars[2].id, cycle._id);

    const res = await request(app)
      .post(`/api/downtime_cycles/${cycle._id}/joint_projects`)
      .set('X-Test-User', playerUser([testChars[0].id]))
      .send(jointBody(testChars[0].id, otherSub._id, 1, [testChars[1].id]));

    expect(res.status).toBe(409);
  });

  it('rejects a duplicate joint on the same lead slot', async () => {
    const cycle = await insertCycle();
    const leadSub = await insertSub(testChars[0].id, cycle._id);
    const userHeader = playerUser([testChars[0].id]);

    const r1 = await request(app)
      .post(`/api/downtime_cycles/${cycle._id}/joint_projects`)
      .set('X-Test-User', userHeader)
      .send(jointBody(testChars[0].id, leadSub._id, 2, [testChars[1].id]));
    expect(r1.status).toBe(201);

    const r2 = await request(app)
      .post(`/api/downtime_cycles/${cycle._id}/joint_projects`)
      .set('X-Test-User', userHeader)
      .send(jointBody(testChars[0].id, leadSub._id, 2, [testChars[2].id]));
    expect(r2.status).toBe(409);
    expect(r2.body.joint_id).toBe(r1.body.joint._id);

    // Clean up invitation seeded by r1
    await getCollection('project_invitations').deleteOne({ joint_project_id: r1.body.joint._id });
  });

  it('rejects invalid lead_project_slot', async () => {
    const cycle = await insertCycle();
    const leadSub = await insertSub(testChars[0].id, cycle._id);

    const res = await request(app)
      .post(`/api/downtime_cycles/${cycle._id}/joint_projects`)
      .set('X-Test-User', playerUser([testChars[0].id]))
      .send(jointBody(testChars[0].id, leadSub._id, 7, [testChars[1].id]));

    expect(res.status).toBe(400);
  });

  it('returns 409 if cycle is closed', async () => {
    const cycle = await insertCycle({ status: 'closed' });
    const leadSub = await insertSub(testChars[0].id, cycle._id);

    const res = await request(app)
      .post(`/api/downtime_cycles/${cycle._id}/joint_projects`)
      .set('X-Test-User', playerUser([testChars[0].id]))
      .send(jointBody(testChars[0].id, leadSub._id, 1, [testChars[1].id]));

    expect(res.status).toBe(409);
  });
});

describe('GET /api/project_invitations', () => {
  it('returns 400 when cycle_id missing', async () => {
    const res = await request(app)
      .get('/api/project_invitations')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(400);
  });

  it('ST sees all invitations on a cycle', async () => {
    const cycle = await insertCycle();
    const leadSub = await insertSub(testChars[0].id, cycle._id);

    const created = await request(app)
      .post(`/api/downtime_cycles/${cycle._id}/joint_projects`)
      .set('X-Test-User', playerUser([testChars[0].id]))
      .send(jointBody(testChars[0].id, leadSub._id, 1, [testChars[1].id, testChars[2].id]));
    expect(created.status).toBe(201);

    const res = await request(app)
      .get(`/api/project_invitations?cycle_id=${cycle._id}`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);

    // Clean up
    for (const inv of created.body.invitations) {
      await getCollection('project_invitations').deleteOne({ _id: inv._id });
    }
  });

  it('player sees invitations they received and invitations they sent (lead)', async () => {
    const cycle = await insertCycle();

    // Lead is char 0; invites char 1 + char 2
    const leadSub = await insertSub(testChars[0].id, cycle._id);
    const created = await request(app)
      .post(`/api/downtime_cycles/${cycle._id}/joint_projects`)
      .set('X-Test-User', playerUser([testChars[0].id]))
      .send(jointBody(testChars[0].id, leadSub._id, 1, [testChars[1].id, testChars[2].id]));
    expect(created.status).toBe(201);

    // Char 1 (an invitee) — sees one invitation, addressed to them
    const invitee = await request(app)
      .get(`/api/project_invitations?cycle_id=${cycle._id}`)
      .set('X-Test-User', playerUser([testChars[1].id]));
    expect(invitee.status).toBe(200);
    expect(invitee.body).toHaveLength(1);
    expect(invitee.body[0].invited_character_id).toBe(testChars[1].id);

    // Char 0 (the lead) — sees both invitations they sent
    const lead = await request(app)
      .get(`/api/project_invitations?cycle_id=${cycle._id}`)
      .set('X-Test-User', playerUser([testChars[0].id]));
    expect(lead.status).toBe(200);
    expect(lead.body).toHaveLength(2);

    // A bystander (no relation) sees nothing
    const bystander = await request(app)
      .get(`/api/project_invitations?cycle_id=${cycle._id}`)
      .set('X-Test-User', playerUser(['000000000000000000000000']));
    expect(bystander.status).toBe(200);
    expect(bystander.body).toHaveLength(0);

    // Clean up
    for (const inv of created.body.invitations) {
      await getCollection('project_invitations').deleteOne({ _id: inv._id });
    }
  });
});
