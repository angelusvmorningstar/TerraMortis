/**
 * API tests — PATCH /api/characters/:id/carthian_pull (#508 + #510).
 *
 * The single Carthian Pull dot is allocated to Allies/Contacts/Haven/Herd as a
 * live `free_carthian` bonus dot. #510 corrects the Allies/Contacts sphere path:
 *   - sphere must be a valid INFLUENCE_SPHERES value (not free text);
 *   - match the EXISTING merit by sphere qualifier and augment it, else create;
 *   - Allies stores its sphere in `area`; Contacts in `spheres[]` (+ a
 *     carthian_sphere marker so the strip pops exactly that sphere);
 *   - per-merit 5-dot cap; one bonus at a time (strip-then-apply).
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
    // #522: Carthian Pull pool = Carthian (Covenant) Status. Default high so the
    // single-dot (#508/#510) tests below pass the pool gate; per-test overrides
    // set a lower pool where the gate itself is under test.
    status: { covenant: { 'Carthian Movement': 5 } },
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

describe('PATCH /api/characters/:id/carthian_pull — Allies (#510)', () => {
  it('sphere not held → creates a bonus-only Allies merit keyed by area (not spheres)', async () => {
    const char = await seedChar({ name: 'CP Allies New', merits: [cpMerit()] });
    const idStr = char._id.toString();

    const res = await patch(app, idStr, { target: 'allies', sphere: 'Underworld' }, playerUser([idStr]));
    expect(res.status).toBe(200);

    const stored = await getCollection('characters').findOne({ _id: char._id });
    const bonus = stored.merits.find(m => m.granted_by === 'Carthian Pull');
    expect(bonus.name).toBe('Allies');
    expect(bonus.area).toBe('Underworld');
    expect('spheres' in bonus).toBe(false); // Allies uses area, never spheres
    expect(bonus.free_carthian).toBe(1);
    expect(bonus.rating).toBe(1);
  });

  it('sphere held below 5 → augments the existing Allies(area) by one dot, no new instance', async () => {
    const char = await seedChar({ name: 'CP Allies Aug', merits: [cpMerit(), { category: 'influence', name: 'Allies', area: 'Underworld', cp: 2, rating: 2 }] });
    const idStr = char._id.toString();

    await patch(app, idStr, { target: 'allies', sphere: 'Underworld' }, playerUser([idStr]));
    const stored = await getCollection('characters').findOne({ _id: char._id });
    const allies = stored.merits.filter(m => m.name === 'Allies' && (m.area || '') === 'Underworld');
    expect(allies).toHaveLength(1); // augmented, not duplicated
    expect(allies[0].free_carthian).toBe(1);
    expect(allies[0].rating).toBe(3); // 2 + 1, re-synced
  });

  it('Allies sphere already at 5 dots → 400', async () => {
    const char = await seedChar({ name: 'CP Allies Cap', merits: [cpMerit(), { category: 'influence', name: 'Allies', area: 'Street', cp: 5, rating: 5 }] });
    const res = await patch(app, char._id.toString(), { target: 'allies', sphere: 'Street' }, playerUser([char._id.toString()]));
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/characters/:id/carthian_pull — Contacts (#510)', () => {
  it('no Contacts merit → creates a bonus-only Contacts with spheres:[X]', async () => {
    const char = await seedChar({ name: 'CP Contacts New', merits: [cpMerit()] });
    const idStr = char._id.toString();

    await patch(app, idStr, { target: 'contacts', sphere: 'Legal' }, playerUser([idStr]));
    const stored = await getCollection('characters').findOne({ _id: char._id });
    const bonus = stored.merits.find(m => m.granted_by === 'Carthian Pull');
    expect(bonus.name).toBe('Contacts');
    expect(bonus.spheres).toEqual(['Legal']);
    expect(bonus.free_carthian).toBe(1);
  });

  it('existing Contacts, sphere not held → pushes the sphere + dot and tags carthian_sphere', async () => {
    const char = await seedChar({ name: 'CP Contacts Aug', merits: [cpMerit(), { category: 'influence', name: 'Contacts', spheres: ['Legal', 'Street'], cp: 2, rating: 2 }] });
    const idStr = char._id.toString();

    await patch(app, idStr, { target: 'contacts', sphere: 'Underworld' }, playerUser([idStr]));
    const stored = await getCollection('characters').findOne({ _id: char._id });
    const contacts = stored.merits.filter(m => m.name === 'Contacts');
    expect(contacts).toHaveLength(1); // augmented in place, not duplicated
    expect(contacts[0].spheres).toEqual(['Legal', 'Street', 'Underworld']);
    expect(contacts[0].carthian_spheres).toEqual(['Underworld']); // #522: plural marker (was singular carthian_sphere in #510)
    expect(contacts[0].free_carthian).toBe(1);
    expect(contacts[0].rating).toBe(3); // === spheres.length, re-synced
  });

  it('Contacts sphere already held → 400', async () => {
    const char = await seedChar({ name: 'CP Contacts Dup', merits: [cpMerit(), { category: 'influence', name: 'Contacts', spheres: ['Legal'], cp: 1, rating: 1 }] });
    const res = await patch(app, char._id.toString(), { target: 'contacts', sphere: 'Legal' }, playerUser([char._id.toString()]));
    expect(res.status).toBe(400);
  });

  it('clearing an augmented Contacts pops the sphere + dot and restores rating', async () => {
    const char = await seedChar({ name: 'CP Contacts Clear', merits: [cpMerit(), { category: 'influence', name: 'Contacts', spheres: ['Legal', 'Street'], cp: 2, rating: 2 }] });
    const idStr = char._id.toString();

    await patch(app, idStr, { target: 'contacts', sphere: 'Underworld' }, playerUser([idStr]));
    await patch(app, idStr, { target: '' }, playerUser([idStr]));

    const stored = await getCollection('characters').findOne({ _id: char._id });
    const contacts = stored.merits.find(m => m.name === 'Contacts');
    expect(contacts.spheres).toEqual(['Legal', 'Street']); // pushed sphere removed
    expect('carthian_sphere' in contacts).toBe(false);
    expect('free_carthian' in contacts).toBe(false);
    expect(contacts.rating).toBe(2); // back to base
  });
});

describe('PATCH /api/characters/:id/carthian_pull — shared (#508/#510)', () => {
  it('round-trip: Contacts-augment → retarget to Herd leaves zero residue on Contacts', async () => {
    const char = await seedChar({ name: 'CP RT Contacts', merits: [cpMerit(), { category: 'domain', name: 'Herd', cp: 1, rating: 1 }, { category: 'influence', name: 'Contacts', spheres: ['Legal', 'Street'], cp: 2, rating: 2 }] });
    const idStr = char._id.toString();

    await patch(app, idStr, { target: 'contacts', sphere: 'Underworld' }, playerUser([idStr]));
    await patch(app, idStr, { target: 'herd' }, playerUser([idStr]));

    const stored = await getCollection('characters').findOne({ _id: char._id });
    const contacts = stored.merits.find(m => m.name === 'Contacts');
    expect(contacts.spheres).toEqual(['Legal', 'Street']); // no orphan sphere
    expect(contacts.rating).toBe(2); // rating === spheres.length
    expect('free_carthian' in contacts).toBe(false);
    expect('carthian_sphere' in contacts).toBe(false);
    // exactly one bonus, now on Herd
    expect(stored.merits.filter(m => (m.free_carthian || 0) > 0).map(m => m.name)).toEqual(['Herd']);
  });

  it('round-trip: Allies-augment → clear restores the merit exactly', async () => {
    const char = await seedChar({ name: 'CP RT Allies', merits: [cpMerit(), { category: 'influence', name: 'Allies', area: 'Police', cp: 3, rating: 3 }] });
    const idStr = char._id.toString();

    await patch(app, idStr, { target: 'allies', sphere: 'Police' }, playerUser([idStr]));
    await patch(app, idStr, { target: '' }, playerUser([idStr]));

    const stored = await getCollection('characters').findOne({ _id: char._id });
    const allies = stored.merits.filter(m => m.name === 'Allies');
    expect(allies).toHaveLength(1);
    expect(allies[0].rating).toBe(3);
    expect('free_carthian' in allies[0]).toBe(false);
    expect(stored.merits.some(m => (m.free_carthian || 0) > 0)).toBe(false);
  });

  it('non-enum sphere → 400', async () => {
    const char = await seedChar({ name: 'CP Bad Sphere', merits: [cpMerit()] });
    const res = await patch(app, char._id.toString(), { target: 'allies', sphere: 'Nonsense' }, playerUser([char._id.toString()]));
    expect(res.status).toBe(400);
  });

  it('retarget moves the bonus — only one Carthian bonus exists', async () => {
    const char = await seedChar({ name: 'CP Retarget', merits: [cpMerit(), { category: 'domain', name: 'Herd', cp: 2, rating: 2 }] });
    const idStr = char._id.toString();

    await patch(app, idStr, { target: 'allies', sphere: 'Police' }, playerUser([idStr]));
    await patch(app, idStr, { target: 'herd' }, playerUser([idStr]));

    const stored = await getCollection('characters').findOne({ _id: char._id });
    expect(stored.merits.some(m => m.granted_by === 'Carthian Pull' && m.name === 'Allies')).toBe(false);
    const withBonus = stored.merits.filter(m => (m.free_carthian || 0) > 0);
    expect(withBonus).toHaveLength(1);
    expect(withBonus[0].name).toBe('Herd');
  });

  it('herd augments an existing Herd in place (no duplicate)', async () => {
    const char = await seedChar({ name: 'CP Herd', merits: [cpMerit(), { category: 'domain', name: 'Herd', cp: 2, rating: 2 }] });
    await patch(app, char._id.toString(), { target: 'herd' }, playerUser([char._id.toString()]));
    const stored = await getCollection('characters').findOne({ _id: char._id });
    expect(stored.merits.filter(m => m.name === 'Herd')).toHaveLength(1);
    expect(stored.merits.find(m => m.name === 'Herd').rating).toBe(3);
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
    const char = await seedChar({ name: 'CP Bad Target', merits: [cpMerit()] });
    const res = await patch(app, char._id.toString(), { target: 'nonsense' }, playerUser([char._id.toString()]));
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

describe('PATCH /api/characters/:id/carthian_pull — #522 multi-dot pool', () => {
  it('allocates N dots across targets when N = Carthian Status', async () => {
    const char = await seedChar({
      name: 'CP Multi',
      status: { covenant: { 'Carthian Movement': 3 } },
      merits: [cpMerit()],
    });
    const idStr = char._id.toString();
    const res = await patch(app, idStr, { allocations: [
      { target: 'allies', sphere: 'Police' },
      { target: 'contacts', sphere: 'Legal' },
      { target: 'herd' },
    ] }, playerUser([idStr]));
    expect(res.status).toBe(200);

    const stored = await getCollection('characters').findOne({ _id: char._id });
    const total = stored.merits.reduce((s, m) => s + (m.free_carthian || 0), 0);
    expect(total).toBe(3);
    expect(stored.merits.find(m => m.name === 'Allies' && m.area === 'Police').free_carthian).toBe(1);
    expect(stored.merits.find(m => m.name === 'Contacts').spheres).toEqual(['Legal']);
    expect(stored.merits.find(m => m.name === 'Herd').free_carthian).toBe(1);
  });

  it('rejects any allocation when Carthian Status is 0 (no pool)', async () => {
    const char = await seedChar({
      name: 'CP Zero Pool',
      status: { covenant: { 'Carthian Movement': 0 } },
      merits: [cpMerit()],
    });
    const idStr = char._id.toString();
    const res = await patch(app, idStr, { allocations: [{ target: 'herd' }] }, playerUser([idStr]));
    expect(res.status).toBe(400);
  });

  it('allows clearing (empty set) even when Carthian Status is 0', async () => {
    const char = await seedChar({
      name: 'CP Zero Clear',
      status: { covenant: { 'Carthian Movement': 0 } },
      merits: [cpMerit()],
    });
    const idStr = char._id.toString();
    const res = await patch(app, idStr, { allocations: [] }, playerUser([idStr]));
    expect(res.status).toBe(200);
  });

  it('rejects an allocation count greater than the pool (400)', async () => {
    const char = await seedChar({
      name: 'CP Over Pool',
      status: { covenant: { 'Carthian Movement': 1 } },
      merits: [cpMerit()],
    });
    const idStr = char._id.toString();
    const res = await patch(app, idStr, { allocations: [
      { target: 'herd' },
      { target: 'haven' },
    ] }, playerUser([idStr]));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Carthian Status/i);
  });

  it('stacks two dots on the same Allies sphere (+2)', async () => {
    const char = await seedChar({
      name: 'CP Stack',
      status: { covenant: { 'Carthian Movement': 2 } },
      merits: [cpMerit(), { category: 'influence', name: 'Allies', area: 'Police', cp: 1, rating: 1 }],
    });
    const idStr = char._id.toString();
    const res = await patch(app, idStr, { allocations: [
      { target: 'allies', sphere: 'Police' },
      { target: 'allies', sphere: 'Police' },
    ] }, playerUser([idStr]));
    expect(res.status).toBe(200);
    const stored = await getCollection('characters').findOne({ _id: char._id });
    const allies = stored.merits.filter(m => m.name === 'Allies' && m.area === 'Police');
    expect(allies).toHaveLength(1);
    expect(allies[0].free_carthian).toBe(2);
    expect(allies[0].rating).toBe(3); // base 1 + 2
  });

  it('rejects stacking that would exceed the 5-dot Allies cap', async () => {
    const char = await seedChar({
      name: 'CP Stack Cap',
      status: { covenant: { 'Carthian Movement': 3 } },
      merits: [cpMerit(), { category: 'influence', name: 'Allies', area: 'Police', cp: 4, rating: 4 }],
    });
    const idStr = char._id.toString();
    const res = await patch(app, idStr, { allocations: [
      { target: 'allies', sphere: 'Police' },
      { target: 'allies', sphere: 'Police' },
    ] }, playerUser([idStr]));
    expect(res.status).toBe(400); // 4 + 2 > 5
  });

  it('adds multiple distinct Contacts spheres and strips them all on clear', async () => {
    const char = await seedChar({
      name: 'CP Contacts Multi',
      status: { covenant: { 'Carthian Movement': 2 } },
      merits: [cpMerit(), { category: 'influence', name: 'Contacts', spheres: ['Legal'], cp: 1, rating: 1 }],
    });
    const idStr = char._id.toString();
    await patch(app, idStr, { allocations: [
      { target: 'contacts', sphere: 'Street' },
      { target: 'contacts', sphere: 'Underworld' },
    ] }, playerUser([idStr]));

    let stored = await getCollection('characters').findOne({ _id: char._id });
    let contacts = stored.merits.find(m => m.name === 'Contacts');
    expect(contacts.spheres).toEqual(['Legal', 'Street', 'Underworld']);
    expect(contacts.carthian_spheres).toEqual(['Street', 'Underworld']);
    expect(contacts.free_carthian).toBe(2);
    expect(contacts.rating).toBe(3);

    // Clear: both pushed spheres come back out, base restored exactly.
    await patch(app, idStr, { allocations: [] }, playerUser([idStr]));
    stored = await getCollection('characters').findOne({ _id: char._id });
    contacts = stored.merits.find(m => m.name === 'Contacts');
    expect(contacts.spheres).toEqual(['Legal']);
    expect('carthian_spheres' in contacts).toBe(false);
    expect('free_carthian' in contacts).toBe(false);
    expect(contacts.rating).toBe(1);
  });

  it('rejects the same Contacts sphere allocated twice', async () => {
    const char = await seedChar({
      name: 'CP Contacts Twice',
      status: { covenant: { 'Carthian Movement': 2 } },
      merits: [cpMerit()],
    });
    const idStr = char._id.toString();
    const res = await patch(app, idStr, { allocations: [
      { target: 'contacts', sphere: 'Legal' },
      { target: 'contacts', sphere: 'Legal' },
    ] }, playerUser([idStr]));
    expect(res.status).toBe(400);
  });

  it('re-applying the same multi-dot set is idempotent', async () => {
    const char = await seedChar({
      name: 'CP Idempotent',
      status: { covenant: { 'Carthian Movement': 2 } },
      merits: [cpMerit()],
    });
    const idStr = char._id.toString();
    const set = { allocations: [
      { target: 'allies', sphere: 'Police' },
      { target: 'herd' },
    ] };
    await patch(app, idStr, set, playerUser([idStr]));
    await patch(app, idStr, set, playerUser([idStr]));
    const stored = await getCollection('characters').findOne({ _id: char._id });
    const total = stored.merits.reduce((s, m) => s + (m.free_carthian || 0), 0);
    expect(total).toBe(2); // not 4 — no compounding
    expect(stored.merits.filter(m => m.name === 'Allies' && m.area === 'Police')).toHaveLength(1);
  });
});
