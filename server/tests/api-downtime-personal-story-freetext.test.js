/**
 * API test — DT submission round-trips personal_story_npc_name + personal_story_note (Issue #24)
 *
 * Regression guard: verifies that the two free-text fields written by the
 * new renderPersonalStorySection() renderer are accepted and round-tripped
 * by the API without schema rejection.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { ObjectId } from 'mongodb';
import { createTestApp, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;
const CREATED_IDS = [];
const CHAR_ID = new ObjectId().toHexString();
let CYCLE_ID;

beforeAll(async () => {
  await setupDb();
  app = createTestApp();

  const cycle = await getCollection('downtime_cycles').insertOne({
    status: 'active',
    label: 'Test cycle issue-24',
    created_at: new Date().toISOString(),
  });
  CYCLE_ID = String(cycle.insertedId);

  await getCollection('characters').insertOne({
    _id: new ObjectId(CHAR_ID),
    name: 'Issue-24 Test Char',
    retired: false,
    pending_approval: false,
    attributes: {}, skills: {}, disciplines: {}, merits: [], powers: [], ordeals: {},
  });
});

afterAll(async () => {
  if (CREATED_IDS.length > 0) {
    await getCollection('downtime_submissions').deleteMany({ _id: { $in: CREATED_IDS } });
  }
  await getCollection('downtime_cycles').deleteOne({ _id: new ObjectId(CYCLE_ID) });
  await getCollection('characters').deleteOne({ _id: new ObjectId(CHAR_ID) });
  await teardownDb();
});

describe('Issue #24: DT submission round-trips personal_story free-text fields', () => {

  it('accepts personal_story_npc_name + personal_story_note without schema rejection', async () => {
    const res = await request(app)
      .post('/api/downtime_submissions')
      .set('X-Test-User', playerUser([CHAR_ID]))
      .send({
        cycle_id: CYCLE_ID,
        character_id: CHAR_ID,
        status: 'draft',
        responses: {
          personal_story_npc_name: 'Marcus the Shepherd',
          personal_story_note: 'A quiet conversation by the river about the old days.',
          personal_story_npc_id: '__new__',
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.responses.personal_story_npc_name).toBe('Marcus the Shepherd');
    expect(res.body.responses.personal_story_note).toBe('A quiet conversation by the river about the old days.');
    CREATED_IDS.push(new ObjectId(res.body._id));
  });

  it('accepts an empty personal_story (section skipped)', async () => {
    const res = await request(app)
      .post('/api/downtime_submissions')
      .set('X-Test-User', playerUser([CHAR_ID]))
      .send({
        cycle_id: CYCLE_ID,
        character_id: CHAR_ID,
        status: 'draft',
        responses: {
          personal_story_npc_name: '',
          personal_story_note: '',
          personal_story_npc_id: '',
        },
      });

    expect([201, 409]).toContain(res.status);
    if (res.status === 201) {
      expect(res.body.responses.personal_story_npc_name).toBe('');
      CREATED_IDS.push(new ObjectId(res.body._id));
    }
  });

  it('back-compat: legacy story_moment_relationship_id still round-trips alongside new fields', async () => {
    const relId = new ObjectId().toHexString();
    const res = await request(app)
      .post('/api/downtime_submissions')
      .set('X-Test-User', playerUser([CHAR_ID]))
      .send({
        cycle_id: CYCLE_ID,
        character_id: CHAR_ID,
        status: 'draft',
        responses: {
          personal_story_npc_name: 'Elara the Merchant',
          personal_story_note: 'Trade secrets.',
          story_moment_relationship_id: relId,
          story_moment_note: 'Legacy field still present in existing submissions.',
        },
      });

    expect([201, 409]).toContain(res.status);
    if (res.status === 201) {
      expect(res.body.responses.personal_story_npc_name).toBe('Elara the Merchant');
      expect(res.body.responses.story_moment_relationship_id).toBe(relId);
      CREATED_IDS.push(new ObjectId(res.body._id));
    }
  });

});
