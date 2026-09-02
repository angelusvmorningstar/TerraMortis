/**
 * Kurtis W bug report (2026-09, deferred-work.md): a shared domain merit's
 * `shared_with` entry can be either a legacy character name or a 24-hex
 * ObjectId string (fix #820 moved the write side to ID-keying; see
 * fix.820.shared-domain-id-keying.test.js). The player-scoped GET
 * /api/characters partner-dots enrichment (server/routes/characters.js)
 * resolved by NAME only, so an ID-format entry silently matched nothing —
 * no partner dots, and no display name for the client to fall back to
 * (editor/sheet.js's _viewSharedSub only has the caller's own role-scoped
 * roster, which never contains the shared partner for a player's own view).
 *
 * This suite proves the fix at the HTTP layer: both formats resolve, mixed
 * arrays resolve both entries, and the new `_partner_names` field carries
 * everything displayName() needs (name/honorific/moniker) for an entry the
 * client can't resolve locally.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { createTestApp, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;
const insertedIds = [];

function domainMerit(name, sharedWith) {
  return { category: 'domain', name, rating: 1, cp: 1, xp: 0, shared_with: sharedWith };
}

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
});

afterAll(async () => {
  if (insertedIds.length) {
    await getCollection('characters').deleteMany({ _id: { $in: insertedIds } }).catch(() => {});
  }
  await teardownDb();
});

describe('Kurtis W — shared domain merit partner resolution (name vs _id shared_with)', () => {
  it('resolves a legacy name-format shared_with entry (regression guard)', async () => {
    const col = getCollection('characters');
    const partner = await col.insertOne({
      name: 'Partner By Name', honorific: 'Lord', clan: 'Daeva', covenant: 'Invictus',
      merits: [domainMerit('Safe Place', [])],
      _test_seeded: true,
    });
    insertedIds.push(partner.insertedId);
    const owner = await col.insertOne({
      name: 'Owner Char', clan: 'Daeva', covenant: 'Invictus',
      merits: [domainMerit('Safe Place', ['Partner By Name'])],
      _test_seeded: true,
    });
    insertedIds.push(owner.insertedId);

    const res = await request(app)
      .get('/api/characters?mine=1')
      .set('X-Test-User', playerUser([String(owner.insertedId)]));
    expect(res.status).toBe(200);
    const char = res.body.find(c => String(c._id) === String(owner.insertedId));
    const merit = char.merits.find(m => m.name === 'Safe Place');
    expect(merit._partner_names).toBeTruthy();
    expect(merit._partner_names['Partner By Name'].name).toBe('Partner By Name');
    expect(merit._partner_names['Partner By Name'].honorific).toBe('Lord');
  });

  it('resolves an _id-format shared_with entry (the fix — this used to silently match nothing)', async () => {
    const col = getCollection('characters');
    const partner = await col.insertOne({
      name: 'Ivana Horvat', honorific: null, moniker: 'Ivy', clan: 'Mekhet', covenant: 'Circle',
      merits: [domainMerit('Haven', [])],
      _test_seeded: true,
    });
    insertedIds.push(partner.insertedId);
    const partnerIdStr = String(partner.insertedId);
    const owner = await col.insertOne({
      name: 'Charlie-Style Owner', clan: 'Mekhet', covenant: 'Circle',
      merits: [domainMerit('Haven', [partnerIdStr])],
      _test_seeded: true,
    });
    insertedIds.push(owner.insertedId);

    const res = await request(app)
      .get('/api/characters?mine=1')
      .set('X-Test-User', playerUser([String(owner.insertedId)]));
    expect(res.status).toBe(200);
    const char = res.body.find(c => String(c._id) === String(owner.insertedId));
    const merit = char.merits.find(m => m.name === 'Haven');
    // Before the fix: merit._partner_names was undefined entirely, and the
    // client had no way to render anything but the raw 24-hex id string.
    expect(merit._partner_names).toBeTruthy();
    expect(merit._partner_names[partnerIdStr]).toBeTruthy();
    expect(merit._partner_names[partnerIdStr].name).toBe('Ivana Horvat');
    expect(merit._partner_names[partnerIdStr].moniker).toBe('Ivy');
  });

  it('resolves a mixed array (one name-format entry, one _id-format entry) — both, in the same merit', async () => {
    const col = getCollection('characters');
    const partnerByName = await col.insertOne({
      name: 'Henry St. John', clan: 'Ventrue', covenant: 'Invictus',
      merits: [domainMerit('Safe Place', [])],
      _test_seeded: true,
    });
    insertedIds.push(partnerByName.insertedId);
    const partnerById = await col.insertOne({
      name: 'Symon', clan: 'Ventrue', covenant: 'Invictus',
      merits: [domainMerit('Safe Place', [])],
      _test_seeded: true,
    });
    insertedIds.push(partnerById.insertedId);
    const partnerByIdStr = String(partnerById.insertedId);
    const owner = await col.insertOne({
      name: 'Mixed Shared Owner', clan: 'Ventrue', covenant: 'Invictus',
      merits: [domainMerit('Safe Place', ['Henry St. John', partnerByIdStr])],
      _test_seeded: true,
    });
    insertedIds.push(owner.insertedId);

    const res = await request(app)
      .get('/api/characters?mine=1')
      .set('X-Test-User', playerUser([String(owner.insertedId)]));
    expect(res.status).toBe(200);
    const char = res.body.find(c => String(c._id) === String(owner.insertedId));
    const merit = char.merits.find(m => m.name === 'Safe Place');
    expect(Object.keys(merit._partner_names).sort()).toEqual(
      ['Henry St. John', partnerByIdStr].sort()
    );
    expect(merit._partner_names['Henry St. John'].name).toBe('Henry St. John');
    expect(merit._partner_names[partnerByIdStr].name).toBe('Symon');
  });

  it('an unresolvable shared_with entry (partner character does not exist) attaches no _partner_names for that merit', async () => {
    const col = getCollection('characters');
    const owner = await col.insertOne({
      name: 'Orphaned Share Owner', clan: 'Nosferatu', covenant: 'Carthian',
      merits: [domainMerit('Haven', ['000000000000000000000000'])],
      _test_seeded: true,
    });
    insertedIds.push(owner.insertedId);

    const res = await request(app)
      .get('/api/characters?mine=1')
      .set('X-Test-User', playerUser([String(owner.insertedId)]));
    expect(res.status).toBe(200);
    const char = res.body.find(c => String(c._id) === String(owner.insertedId));
    const merit = char.merits.find(m => m.name === 'Haven');
    expect(merit._partner_names).toBeUndefined();
    expect(merit._partner_dots).toBeUndefined();
  });
});
