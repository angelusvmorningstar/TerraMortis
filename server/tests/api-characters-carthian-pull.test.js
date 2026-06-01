/**
 * API tests — PATCH /api/characters/:id/carthian_pull (#508).
 *
 * The single Carthian Pull dot is allocated to Allies/Contacts/Haven/Herd as a
 * live `free_carthian` bonus dot on the character. At most one such bonus exists
 * at a time; every write is strip-then-apply. The endpoint must:
 *   - allow the owning player (and ST); 403 for non-owners
 *   - create a bonus-only instance for Allies/Contacts and absent targets
 *   - augment an existing Herd/Haven in place (no duplicate instance)
 *   - move the bonus on retarget (only ever one) and remove it on clear
 *   - keep merit `rating` in sync (= sum of channels) via the normalizer
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { ObjectId } from 'mongodb';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;
const seededIds = [];

async function seedChar(overrides = {}) {
  const col = getCollection('characters');
  const doc = {
    name: 'CP Test Char',
    retired: false, pending_approval: false,
    attributes: {}, skills: {}, disciplines: {}, merits: [], powers: [], ordeals: {},
    ...overrides,
  };
  const result = await col.insertOne(doc);
  seededIds.push(result.insertedId);
  return { ...doc, _id: result.insertedId };
}

const cpMerit = () => ({ category: 'general', name: 'Carthian Pull', cp: 1, rating: 1 });

function patch(app, id, body, user) {
  return request(app).patch(`/api/characters/${id}/carthian_pull`).set('X-Test-User', user).send(body);
}

beforeAll(async () => { await setupDb(); app = createTestApp(); });
afterAll(async () => {
  const col = getCollection('characters');
  for (const id of seededIds) await col.deleteOne({ _id: id });
  await teardownDb();
});

describe('PATCH /api/characters/:id/carthian_pull (#508)', () => {
  it('allies allocation creates a bonus-only Allies instance with free_carthian:1', async () => {
    const char = await seedChar({ name: 'CP Allies', merits: [cpMerit()] });
    const idStr = char._id.toString();

    const res = await patch(app, idStr, { target: 'allies', sphere: 'Street' }, playerUser([idStr]));
    expect(res.status).toBe(200);

    const stored = await getCollection('characters').findOne({ _id: char._id });
    const bonus = stored.merits.find(m => m.granted_by === 'Carthian Pull');
    expect(bonus).toBeTruthy();
    expect(bonus.name).toBe('Allies');
    expect(bonus.spheres).toEqual(['Street']);
    expect(bonus.free_carthian).toBe(1);
    expect(bonus.rating).toBe(1); // normalizer kept rating = sum
  });

  it('herd allocation augments an existing Herd in place (no duplicate)', async () => {
    const char = await seedChar({ name: 'CP Herd', merits: [cpMerit(), { category: 'domain', name: 'Herd', cp: 2, rating: 2 }] });
    const idStr = char._id.toString();

    const res = await patch(app, idStr, { target: 'herd' }, playerUser([idStr]));
    expect(res.status).toBe(200);

    const stored = await getCollection('characters').findOne({ _id: char._id });
    const herds = stored.merits.filter(m => m.category === 'domain' && m.name === 'Herd');
    expect(herds).toHaveLength(1); // augmented, not duplicated
    expect(herds[0].free_carthian).toBe(1);
    expect(herds[0].rating).toBe(3); // 2 cp + 1 free_carthian, re-synced
  });

  it('herd allocation with no existing Herd creates a bonus-only instance', async () => {
    const char = await seedChar({ name: 'CP Herd New', merits: [cpMerit()] });
    const idStr = char._id.toString();

    await patch(app, idStr, { target: 'herd' }, playerUser([idStr]));
    const stored = await getCollection('characters').findOne({ _id: char._id });
    const herd = stored.merits.find(m => m.name === 'Herd');
    expect(herd).toBeTruthy();
    expect(herd.granted_by).toBe('Carthian Pull');
    expect(herd.free_carthian).toBe(1);
  });

  it('retarget moves the bonus — only one Carthian-Pull bonus ever exists', async () => {
    const char = await seedChar({ name: 'CP Retarget', merits: [cpMerit(), { category: 'domain', name: 'Herd', cp: 2, rating: 2 }] });
    const idStr = char._id.toString();

    await patch(app, idStr, { target: 'allies', sphere: 'Street' }, playerUser([idStr]));
    await patch(app, idStr, { target: 'herd' }, playerUser([idStr]));

    const stored = await getCollection('characters').findOne({ _id: char._id });
    // The earlier bonus-only Allies instance is gone
    expect(stored.merits.some(m => m.granted_by === 'Carthian Pull' && m.name === 'Allies')).toBe(false);
    // Exactly one free_carthian dot, now on Herd
    const withBonus = stored.merits.filter(m => (m.free_carthian || 0) > 0);
    expect(withBonus).toHaveLength(1);
    expect(withBonus[0].name).toBe('Herd');
    expect(withBonus[0].rating).toBe(3);
  });

  it('clear (target:"") removes the bonus and restores the augmented merit', async () => {
    const char = await seedChar({ name: 'CP Clear', merits: [cpMerit(), { category: 'domain', name: 'Herd', cp: 2, rating: 2 }] });
    const idStr = char._id.toString();

    await patch(app, idStr, { target: 'herd' }, playerUser([idStr]));
    await patch(app, idStr, { target: '' }, playerUser([idStr]));

    const stored = await getCollection('characters').findOne({ _id: char._id });
    expect(stored.merits.some(m => (m.free_carthian || 0) > 0)).toBe(false);
    const herd = stored.merits.find(m => m.name === 'Herd');
    expect(herd.rating).toBe(2); // back to original
    expect('free_carthian' in herd).toBe(false);
  });

  it('ST can write any character', async () => {
    const char = await seedChar({ name: 'CP ST', merits: [cpMerit()] });
    const res = await patch(app, char._id.toString(), { target: 'haven' }, stUser());
    expect(res.status).toBe(200);
  });

  it('403 when a player writes a character they do not own', async () => {
    const owner = await seedChar({ name: 'CP Owner' });
    const target = await seedChar({ name: 'CP Other', merits: [cpMerit()] });
    const res = await patch(app, target._id.toString(), { target: 'haven' }, playerUser([owner._id.toString()]));
    expect(res.status).toBe(403);
  });

  it('400 on invalid target', async () => {
    const char = await seedChar({ name: 'CP Bad', merits: [cpMerit()] });
    const res = await patch(app, char._id.toString(), { target: 'nonsense' }, playerUser([char._id.toString()]));
    expect(res.status).toBe(400);
  });

  it('400 when allies/contacts has no sphere', async () => {
    const char = await seedChar({ name: 'CP NoSphere', merits: [cpMerit()] });
    const res = await patch(app, char._id.toString(), { target: 'contacts', sphere: '  ' }, playerUser([char._id.toString()]));
    expect(res.status).toBe(400);
  });

  it('404 unknown character', async () => {
    const res = await patch(app, new ObjectId().toHexString(), { target: 'haven' }, stUser());
    expect(res.status).toBe(404);
  });

  it('401 without auth', async () => {
    const char = await seedChar({ name: 'CP NoAuth', merits: [cpMerit()] });
    const res = await request(app).patch(`/api/characters/${char._id.toString()}/carthian_pull`).send({ target: 'haven' });
    expect(res.status).toBe(401);
  });
});
