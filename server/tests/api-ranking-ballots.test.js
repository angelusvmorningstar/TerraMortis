/**
 * API tests — /api/ranking_ballots (#624).
 *
 * Per-cycle clan/covenant ranking ballot. Players write their OWN ballot
 * (ownership-gated); STs read an aggregate (points totals per character),
 * which players must NOT be able to read. Points: 1st=5, 2nd=4, 3rd=3, 4th=2, 5th=1.
 *
 * Seeds characters directly to DB (same pattern as the CRUD / safe-place suites).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { ObjectId } from 'mongodb';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;
const seededChars = [];
const CYCLE = 'cycle-rank-test';

async function seedChar(overrides = {}) {
  const col = getCollection('characters');
  const doc = {
    name: 'Rank Test Char', retired: false, pending_approval: false,
    clan: 'Mekhet', covenant: 'Invictus',
    status: { city: 1, clan: 1, covenant: {} },
    attributes: {}, skills: {}, disciplines: {}, merits: [], powers: [], ordeals: {},
    ...overrides,
  };
  const result = await col.insertOne(doc);
  seededChars.push(result.insertedId);
  return { ...doc, _id: result.insertedId, id: result.insertedId.toString() };
}

let voter, clanmate1, clanmate2, covmate1, covmate2, outsider;

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
  voter     = await seedChar({ name: 'Voter',     clan: 'Mekhet',  covenant: 'Invictus' });
  clanmate1 = await seedChar({ name: 'Clanmate1', clan: 'Mekhet',  covenant: 'Carthian Movement' });
  clanmate2 = await seedChar({ name: 'Clanmate2', clan: 'Mekhet',  covenant: 'Ordo Dracul' });
  covmate1  = await seedChar({ name: 'Covmate1',  clan: 'Daeva',   covenant: 'Invictus' });
  // covmate2 belongs to Invictus via covenant status, not primary covenant
  covmate2  = await seedChar({ name: 'Covmate2',  clan: 'Ventrue', covenant: 'Unaligned', status: { city: 1, clan: 1, covenant: { Invictus: 2 } } });
  outsider  = await seedChar({ name: 'Outsider',  clan: 'Daeva',   covenant: 'Carthian Movement' });
});

afterAll(async () => {
  const cc = getCollection('characters');
  for (const id of seededChars) await cc.deleteOne({ _id: id });
  await getCollection('ranking_ballots').deleteMany({ cycle_id: CYCLE });
  await teardownDb();
});

describe('PUT /api/ranking_ballots — player writes own ballot', () => {
  it('owning player persists a clan + covenant ballot (200)', async () => {
    const res = await request(app)
      .put('/api/ranking_ballots')
      .set('X-Test-User', playerUser([voter.id]))
      .send({
        cycle_id: CYCLE, voter_character_id: voter.id,
        clan_ranking:     { 1: clanmate1.id, 2: clanmate2.id },
        covenant_ranking: { 1: covmate1.id,  2: covmate2.id },
      });
    expect(res.status).toBe(200);

    const stored = await getCollection('ranking_ballots').findOne({ cycle_id: CYCLE, voter_character_id: voter.id });
    expect(stored.clan_ranking).toEqual({ 1: clanmate1.id, 2: clanmate2.id });
    expect(stored.covenant_ranking['1']).toBe(covmate1.id);
    expect(stored.covenant_ranking['2']).toBe(covmate2.id); // member via status.covenant
  });

  it('partial ballot is allowed (only 1st filled)', async () => {
    const res = await request(app)
      .put('/api/ranking_ballots')
      .set('X-Test-User', playerUser([voter.id]))
      .send({ cycle_id: CYCLE, voter_character_id: voter.id, clan_ranking: { 1: clanmate1.id } });
    expect(res.status).toBe(200);
  });

  it('403 when a player writes a ballot for a character they do not own', async () => {
    const res = await request(app)
      .put('/api/ranking_ballots')
      .set('X-Test-User', playerUser([outsider.id]))
      .send({ cycle_id: CYCLE, voter_character_id: voter.id, clan_ranking: { 1: clanmate1.id } });
    expect(res.status).toBe(403);
  });

  it('400 when ranking yourself', async () => {
    const res = await request(app)
      .put('/api/ranking_ballots')
      .set('X-Test-User', playerUser([voter.id]))
      .send({ cycle_id: CYCLE, voter_character_id: voter.id, clan_ranking: { 1: voter.id } });
    expect(res.status).toBe(400);
  });

  it('400 when a clan slot holds a non-clan-member', async () => {
    const res = await request(app)
      .put('/api/ranking_ballots')
      .set('X-Test-User', playerUser([voter.id]))
      .send({ cycle_id: CYCLE, voter_character_id: voter.id, clan_ranking: { 1: outsider.id } });
    expect(res.status).toBe(400);
  });

  it('400 when a covenant slot holds a non-covenant-member', async () => {
    const res = await request(app)
      .put('/api/ranking_ballots')
      .set('X-Test-User', playerUser([voter.id]))
      .send({ cycle_id: CYCLE, voter_character_id: voter.id, covenant_ranking: { 1: outsider.id } });
    expect(res.status).toBe(400);
  });

  it('400 on a duplicate character within one ranking', async () => {
    const res = await request(app)
      .put('/api/ranking_ballots')
      .set('X-Test-User', playerUser([voter.id]))
      .send({ cycle_id: CYCLE, voter_character_id: voter.id, clan_ranking: { 1: clanmate1.id, 2: clanmate1.id } });
    expect(res.status).toBe(400);
  });

  it('401 without auth', async () => {
    const res = await request(app)
      .put('/api/ranking_ballots')
      .send({ cycle_id: CYCLE, voter_character_id: voter.id });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/ranking_ballots/mine — own ballot', () => {
  it('owning player reads their own ballot', async () => {
    await request(app).put('/api/ranking_ballots').set('X-Test-User', playerUser([voter.id]))
      .send({ cycle_id: CYCLE, voter_character_id: voter.id, clan_ranking: { 1: clanmate1.id } });
    const res = await request(app)
      .get(`/api/ranking_ballots/mine?cycle_id=${CYCLE}&voter=${voter.id}`)
      .set('X-Test-User', playerUser([voter.id]));
    expect(res.status).toBe(200);
    expect(res.body.voter_character_id).toBe(voter.id);
  });

  it('403 reading another character\'s ballot', async () => {
    const res = await request(app)
      .get(`/api/ranking_ballots/mine?cycle_id=${CYCLE}&voter=${voter.id}`)
      .set('X-Test-User', playerUser([outsider.id]));
    expect(res.status).toBe(403);
  });
});

describe('GET /api/ranking_ballots/aggregate — ST only, points totals', () => {
  it('sums 5/4/3/2/1 per character across all ballots in the cycle', async () => {
    // voter ranks clanmate1 1st (5), clanmate2 2nd (4); covmate1 1st (5), covmate2 2nd (4)
    await request(app).put('/api/ranking_ballots').set('X-Test-User', playerUser([voter.id]))
      .send({ cycle_id: CYCLE, voter_character_id: voter.id,
        clan_ranking: { 1: clanmate1.id, 2: clanmate2.id },
        covenant_ranking: { 1: covmate1.id, 2: covmate2.id } });
    // a second voter (clanmate1) ranks clanmate2 1st (+5 clan)
    await request(app).put('/api/ranking_ballots').set('X-Test-User', playerUser([clanmate1.id]))
      .send({ cycle_id: CYCLE, voter_character_id: clanmate1.id, clan_ranking: { 1: clanmate2.id } });

    const res = await request(app)
      .get(`/api/ranking_ballots/aggregate?cycle_id=${CYCLE}`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    // clanmate2: 4 (from voter) + 5 (from clanmate1) = 9; clanmate1: 5
    expect(res.body.clan_points[clanmate2.id]).toBe(9);
    expect(res.body.clan_points[clanmate1.id]).toBe(5);
    expect(res.body.covenant_points[covmate1.id]).toBe(5);
    expect(res.body.covenant_points[covmate2.id]).toBe(4);
  });

  it('403 — a player cannot read the aggregate', async () => {
    const res = await request(app)
      .get(`/api/ranking_ballots/aggregate?cycle_id=${CYCLE}`)
      .set('X-Test-User', playerUser([voter.id]));
    expect(res.status).toBe(403);
  });
});
