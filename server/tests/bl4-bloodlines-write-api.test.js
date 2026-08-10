/**
 * BL-4 (issue #1008) — ST-gated write endpoints on /api/bloodlines.
 *
 * AC 1-8, 14. BL-1 built the collection read-only and BL-2/BL-3a made every
 * costing surface read it; this suite covers the epic's first WRITE surface.
 *
 * The three things this suite exists to hold down, because each of them
 * silently produces a wrong XP cost rather than an error:
 *
 *   1. PATCH validates the MERGED document, not the patch body. A partial
 *      update that leaves three disciplines behind must 400 (AC 2).
 *   2. `name` collision is checked on the normalised (trim + case-fold) key,
 *      not the case-SENSITIVE unique index, because the cache keys on the
 *      normalised form and the second document would become unreachable (AC 4).
 *   3. DELETE is guarded on the same normalised key plus any referencing
 *      `rule_grant`, so a bloodline resolving perfectly well for a character
 *      carrying " Khaibit" cannot be deleted out from under them (AC 8).
 *
 * Fixture names are deliberately not real bloodlines: the seed suite creates a
 * unique index on `name` and inserts the real 23.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { ObjectId } from 'mongodb';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;

const seededBloodlines = [];
const seededChars = [];
const seededGrants = [];

const VALID_DISCS = ['Auspex', 'Celerity', 'Obfuscate', 'Vigour'];

function body(overrides = {}) {
  return {
    name: 'Zzz Bl4 Fixture',
    clan: 'Mekhet',
    disciplines: [...VALID_DISCS],
    notes: null,
    ...overrides,
  };
}

async function post(payload, user = stUser()) {
  const req = request(app).post('/api/bloodlines');
  if (user) req.set('X-Test-User', user);
  const res = await req.send(payload);
  if (res.status === 201 && res.body && res.body._id) seededBloodlines.push(new ObjectId(res.body._id));
  return res;
}

async function seedBloodline(overrides = {}) {
  const now = new Date().toISOString();
  const doc = {
    name: 'Zzz Bl4 Seeded',
    slug: 'zzz-bl4-seeded',
    clan: 'Mekhet',
    disciplines: [...VALID_DISCS],
    notes: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
  const result = await getCollection('bloodlines').insertOne(doc);
  seededBloodlines.push(result.insertedId);
  return { _id: result.insertedId, ...doc };
}

async function seedCharacter(bloodline, name = 'Zzz Bl4 Holder') {
  const result = await getCollection('characters').insertOne({ name, bloodline, _test_seeded: true });
  seededChars.push(result.insertedId);
  return result.insertedId;
}

async function seedGrant(bloodlineName) {
  const result = await getCollection('rule_grant').insertOne({
    source: 'Bloodline',
    condition: 'bloodline',
    bloodline_name: bloodlineName,
    grant_type: 'merit',
    target: 'Area of Expertise',
    amount: 1,
    amount_basis: 'flat',
  });
  seededGrants.push(result.insertedId);
  return result.insertedId;
}

async function clearSeeded() {
  if (seededBloodlines.length) {
    await getCollection('bloodlines').deleteMany({ _id: { $in: seededBloodlines } });
    seededBloodlines.length = 0;
  }
  if (seededChars.length) {
    await getCollection('characters').deleteMany({ _id: { $in: seededChars } });
    seededChars.length = 0;
  }
  if (seededGrants.length) {
    await getCollection('rule_grant').deleteMany({ _id: { $in: seededGrants } });
    seededGrants.length = 0;
  }
}

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
});

beforeEach(clearSeeded);

afterAll(async () => {
  await clearSeeded();
  await teardownDb();
});

// ─────────────────────────────────────────────────────────────────────────────
//  AC 1 — the auth matrix
// ─────────────────────────────────────────────────────────────────────────────

describe('BL-4 AC 1 — every write is ST-gated', () => {
  it('401s each write with no auth at all', async () => {
    const made = await seedBloodline({ name: 'Zzz Bl4 Auth', slug: 'zzz-bl4-auth' });
    const noAuth = [
      request(app).post('/api/bloodlines').send(body()),
      request(app).patch(`/api/bloodlines/${made._id}`).send({ notes: 'x' }),
      request(app).delete(`/api/bloodlines/${made._id}`),
      request(app).get('/api/bloodlines/admin'),
      request(app).get(`/api/bloodlines/${made._id}/impact`),
    ];
    for (const res of await Promise.all(noAuth)) {
      expect(res.status).toBe(401);
    }
  });

  it('403s each write for a player role', async () => {
    const made = await seedBloodline({ name: 'Zzz Bl4 Player', slug: 'zzz-bl4-player' });
    const asPlayer = [
      request(app).post('/api/bloodlines').set('X-Test-User', playerUser()).send(body()),
      request(app).patch(`/api/bloodlines/${made._id}`).set('X-Test-User', playerUser()).send({ notes: 'x' }),
      request(app).delete(`/api/bloodlines/${made._id}`).set('X-Test-User', playerUser()),
      request(app).get('/api/bloodlines/admin').set('X-Test-User', playerUser()),
      request(app).get(`/api/bloodlines/${made._id}/impact`).set('X-Test-User', playerUser()),
    ];
    for (const res of await Promise.all(asPlayer)) {
      expect(res.status).toBe(403);
    }
  });

  it('leaves the two public reads unauthenticated and unchanged in shape', async () => {
    const made = await seedBloodline({ name: 'Zzz Bl4 Public', slug: 'zzz-bl4-public', notes: 'ST ONLY' });
    const list = await request(app).get('/api/bloodlines');
    expect(list.status).toBe(200);
    const found = list.body.find(b => b.name === 'Zzz Bl4 Public');
    expect(found).toBeTruthy();
    expect(found).not.toHaveProperty('notes');

    const single = await request(app).get(`/api/bloodlines/${made._id}`);
    expect(single.status).toBe(200);
    expect(single.body).not.toHaveProperty('notes');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  AC 2, 3, 4, 7 — POST
// ─────────────────────────────────────────────────────────────────────────────

describe('BL-4 AC 2/3/4/7 — POST /api/bloodlines', () => {
  it('creates, derives the slug server-side, and stamps the timestamps', async () => {
    const res = await post(body({ name: '  Zzz Bl4 Lidérc  ' }));
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Zzz Bl4 Lidérc');       // trimmed
    expect(res.body.slug).toBe('zzz-bl4-liderc');       // diacritic stripped, not hyphenated through
    expect(res.body.clan).toBe('Mekhet');
    expect(res.body.disciplines).toEqual(VALID_DISCS);
    expect(typeof res.body.created_at).toBe('string');
    expect(res.body.created_at).toBe(res.body.updated_at);
  });

  it('ignores a client-supplied _id and a client-supplied slug', async () => {
    const rogue = new ObjectId();
    const res = await post({ ...body({ name: 'Zzz Bl4 Rogue Id' }), _id: String(rogue), slug: 'not-this-slug' });
    expect(res.status).toBe(201);
    expect(String(res.body._id)).not.toBe(String(rogue));
    expect(res.body.slug).toBe('zzz-bl4-rogue-id');
  });

  it('rejects three disciplines and five disciplines, both 400', async () => {
    const three = await post(body({ name: 'Zzz Bl4 Three', disciplines: ['Auspex', 'Celerity', 'Vigour'] }));
    expect(three.status).toBe(400);
    const five = await post(body({ name: 'Zzz Bl4 Five', disciplines: [...VALID_DISCS, 'Dominate'] }));
    expect(five.status).toBe(400);
  });

  it('rejects a repeated discipline and an empty-string discipline', async () => {
    const dupe = await post(body({ name: 'Zzz Bl4 Dupe', disciplines: ['Auspex', 'Auspex', 'Celerity', 'Vigour'] }));
    expect(dupe.status).toBe(400);
    const blank = await post(body({ name: 'Zzz Bl4 Blank Disc', disciplines: ['Auspex', '', 'Celerity', 'Vigour'] }));
    expect(blank.status).toBe(400);
  });

  it('rejects an unknown discipline name, and says which one', async () => {
    // "Vigor" is drift pattern #15 arriving through the discipline field: the
    // name resolves, the discipline never matches, and the character is charged
    // out-of-clan for it forever.
    const res = await post(body({ name: 'Zzz Bl4 Vigor', disciplines: ['Auspex', 'Celerity', 'Obfuscate', 'Vigor'] }));
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Vigor');
  });

  it('accepts the ritual disciplines — the known set is CORE_DISCS + RITUAL_DISCS', async () => {
    const res = await post(body({ name: 'Zzz Bl4 Ritual', disciplines: ['Cruac', 'Theban', 'Auspex', 'Vigour'] }));
    expect(res.status).toBe(201);
  });

  it('rejects a blank or whitespace-only name', async () => {
    for (const name of ['', '   ']) {
      const res = await post(body({ name }));
      expect(res.status, `expected 400 for name ${JSON.stringify(name)}`).toBe(400);
    }
  });

  it('rejects a name that derives an empty slug, with a readable message', async () => {
    const res = await post(body({ name: '???' }));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/letter|digit/i);
  });

  it('rejects a clan outside the five', async () => {
    const res = await post(body({ name: 'Zzz Bl4 Bad Clan', clan: 'Tremere' }));
    expect(res.status).toBe(400);
  });

  it('409s a case-differing duplicate name, never 500', async () => {
    const first = await post(body({ name: 'Zzz Bl4 Collide' }));
    expect(first.status).toBe(201);
    for (const variant of ['Zzz Bl4 Collide', 'zzz bl4 collide', 'ZZZ BL4 COLLIDE', '  Zzz Bl4 Collide  ']) {
      const res = await post(body({ name: variant }));
      expect(res.status, `expected 409 for ${JSON.stringify(variant)}`).toBe(409);
      expect(res.body.error).toBe('CONFLICT');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  AC 2, 6 — PATCH
// ─────────────────────────────────────────────────────────────────────────────

describe('BL-4 AC 2/6 — PATCH /api/bloodlines/:id', () => {
  it('writes clan, disciplines and notes, and bumps updated_at', async () => {
    const made = await seedBloodline({ name: 'Zzz Bl4 Patch', slug: 'zzz-bl4-patch', created_at: '2020-01-01T00:00:00.000Z', updated_at: '2020-01-01T00:00:00.000Z' });
    const res = await request(app)
      .patch(`/api/bloodlines/${made._id}`)
      .set('X-Test-User', stUser())
      .send({ clan: 'Daeva', disciplines: ['Majesty', 'Celerity', 'Vigour', 'Auspex'], notes: 'ST note' });
    expect(res.status).toBe(200);
    expect(res.body.clan).toBe('Daeva');
    expect(res.body.disciplines).toEqual(['Majesty', 'Celerity', 'Vigour', 'Auspex']);
    expect(res.body.notes).toBe('ST note');
    expect(res.body.updated_at).not.toBe('2020-01-01T00:00:00.000Z');
    expect(res.body.created_at).toBe('2020-01-01T00:00:00.000Z');
  });

  it('ignores name, slug and created_at — they are not in the allowlist', async () => {
    const made = await seedBloodline({ name: 'Zzz Bl4 Immutable', slug: 'zzz-bl4-immutable', created_at: '2020-01-01T00:00:00.000Z' });
    const res = await request(app)
      .patch(`/api/bloodlines/${made._id}`)
      .set('X-Test-User', stUser())
      .send({ name: 'Zzz Bl4 Renamed', slug: 'renamed', created_at: '1999-01-01T00:00:00.000Z', notes: 'kept' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Zzz Bl4 Immutable');
    expect(res.body.slug).toBe('zzz-bl4-immutable');
    expect(res.body.created_at).toBe('2020-01-01T00:00:00.000Z');
    expect(res.body.notes).toBe('kept');
  });

  it('400s when only immutable fields are named', async () => {
    const made = await seedBloodline({ name: 'Zzz Bl4 OnlyImmutable', slug: 'zzz-bl4-onlyimmutable' });
    const res = await request(app)
      .patch(`/api/bloodlines/${made._id}`)
      .set('X-Test-User', stUser())
      .send({ name: 'Nope', slug: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/No updatable fields/i);
  });

  it('400s on a MERGED document that breaks the four-discipline rule', async () => {
    // The ECM precedent runs an allowlist and no schema validation at all. Here
    // that would write a three-discipline bloodline straight past the count
    // rule and quietly re-cost every holder.
    const made = await seedBloodline({ name: 'Zzz Bl4 Merged', slug: 'zzz-bl4-merged' });
    const res = await request(app)
      .patch(`/api/bloodlines/${made._id}`)
      .set('X-Test-User', stUser())
      .send({ disciplines: ['Auspex', 'Celerity', 'Vigour'] });
    expect(res.status).toBe(400);
    const after = await getCollection('bloodlines').findOne({ _id: made._id });
    expect(after.disciplines).toEqual(VALID_DISCS);
  });

  it('400s on an unknown discipline name in a patch', async () => {
    const made = await seedBloodline({ name: 'Zzz Bl4 PatchDisc', slug: 'zzz-bl4-patchdisc' });
    const res = await request(app)
      .patch(`/api/bloodlines/${made._id}`)
      .set('X-Test-User', stUser())
      .send({ disciplines: ['Auspex', 'Celerity', 'Obfuscate', 'Vigor'] });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Vigor');
  });

  it('400s on a clan outside the five', async () => {
    const made = await seedBloodline({ name: 'Zzz Bl4 PatchClan', slug: 'zzz-bl4-patchclan' });
    const res = await request(app)
      .patch(`/api/bloodlines/${made._id}`)
      .set('X-Test-User', stUser())
      .send({ clan: 'Tremere' });
    expect(res.status).toBe(400);
  });

  it('404s on a well-formed id that does not exist', async () => {
    const res = await request(app)
      .patch(`/api/bloodlines/${new ObjectId()}`)
      .set('X-Test-User', stUser())
      .send({ notes: 'x' });
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  AC 5 — the ST-gated read
// ─────────────────────────────────────────────────────────────────────────────

describe('BL-4 AC 5 — GET /api/bloodlines/admin', () => {
  it('returns notes, which the public reads project out', async () => {
    await seedBloodline({ name: 'Zzz Bl4 Notes', slug: 'zzz-bl4-notes', notes: 'ST ONLY: extinct in Sydney since 1998.' });
    const res = await request(app).get('/api/bloodlines/admin').set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    const found = res.body.find(b => b.name === 'Zzz Bl4 Notes');
    expect(found.notes).toBe('ST ONLY: extinct in Sydney since 1998.');
  });

  it('is registered above /:id — "admin" is not read as a malformed ObjectId', async () => {
    const res = await request(app).get('/api/bloodlines/admin').set('X-Test-User', stUser());
    expect(res.status).not.toBe(404);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('sorts by name, as the public list does', async () => {
    await seedBloodline({ name: 'Zzz Bl4 Sort Bravo', slug: 'zzz-bl4-sort-bravo' });
    await seedBloodline({ name: 'Zzz Bl4 Sort Alpha', slug: 'zzz-bl4-sort-alpha' });
    const res = await request(app).get('/api/bloodlines/admin').set('X-Test-User', stUser());
    const names = res.body.map(b => b.name).filter(n => n.startsWith('Zzz Bl4 Sort'));
    expect(names).toEqual(['Zzz Bl4 Sort Alpha', 'Zzz Bl4 Sort Bravo']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  AC 8 — impact + the guarded delete
// ─────────────────────────────────────────────────────────────────────────────

describe('BL-4 AC 8 — GET /api/bloodlines/:id/impact', () => {
  it('reports zero references for a fresh bloodline', async () => {
    const made = await seedBloodline({ name: 'Zzz Bl4 Impact Clean', slug: 'zzz-bl4-impact-clean' });
    const res = await request(app).get(`/api/bloodlines/${made._id}/impact`).set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(res.body.holders).toBe(0);
    expect(res.body.character_names).toEqual([]);
    expect(res.body.grant_rules).toBe(0);
  });

  it('joins holders on the normalised key and lists the referencing grant rules', async () => {
    const made = await seedBloodline({ name: 'Zzz Bl4 Impact Held', slug: 'zzz-bl4-impact-held' });
    await seedCharacter('Zzz Bl4 Impact Held', 'Zzz Bl4 Exact');
    await seedCharacter('  zzz bl4 impact held  ', 'Zzz Bl4 Sloppy');
    await seedGrant('ZZZ BL4 IMPACT HELD');

    const res = await request(app).get(`/api/bloodlines/${made._id}/impact`).set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(res.body.holders).toBe(2);
    expect(res.body.character_names.sort()).toEqual(['Zzz Bl4 Exact', 'Zzz Bl4 Sloppy']);
    expect(res.body.grant_rules).toBe(1);
  });

  it('404s for a bloodline that does not exist', async () => {
    const res = await request(app).get(`/api/bloodlines/${new ObjectId()}/impact`).set('X-Test-User', stUser());
    expect(res.status).toBe(404);
  });
});

describe('BL-4 AC 8 — DELETE /api/bloodlines/:id', () => {
  it('204s and removes the document when nothing references it', async () => {
    const made = await seedBloodline({ name: 'Zzz Bl4 Del Clean', slug: 'zzz-bl4-del-clean' });
    const res = await request(app).delete(`/api/bloodlines/${made._id}`).set('X-Test-User', stUser());
    expect(res.status).toBe(204);
    expect(await getCollection('bloodlines').countDocuments({ _id: made._id })).toBe(0);
  });

  it('409s when a character holds the name exactly, and names the holder', async () => {
    const made = await seedBloodline({ name: 'Zzz Bl4 Del Held', slug: 'zzz-bl4-del-held' });
    await seedCharacter('Zzz Bl4 Del Held', 'Zzz Bl4 Holder One');
    const res = await request(app).delete(`/api/bloodlines/${made._id}`).set('X-Test-User', stUser());
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('CONFLICT');
    expect(res.body.holders).toBe(1);
    expect(res.body.character_names).toContain('Zzz Bl4 Holder One');
    expect(await getCollection('bloodlines').countDocuments({ _id: made._id })).toBe(1);
  });

  it('409s when the holder carries a case- or whitespace-differing variant', async () => {
    // An exact-match-only guard would delete a bloodline that is resolving
    // perfectly well through the cache's trim + case-fold key.
    const made = await seedBloodline({ name: 'Zzz Bl4 Del Sloppy', slug: 'zzz-bl4-del-sloppy' });
    await seedCharacter('  zzz bl4 del sloppy ', 'Zzz Bl4 Holder Two');
    const res = await request(app).delete(`/api/bloodlines/${made._id}`).set('X-Test-User', stUser());
    expect(res.status).toBe(409);
    expect(res.body.holders).toBe(1);
  });

  it('409s when a rule_grant references the name, even with no holders', async () => {
    const made = await seedBloodline({ name: 'Zzz Bl4 Del Granted', slug: 'zzz-bl4-del-granted' });
    await seedGrant('zzz bl4 del granted');
    const res = await request(app).delete(`/api/bloodlines/${made._id}`).set('X-Test-User', stUser());
    expect(res.status).toBe(409);
    expect(res.body.holders).toBe(0);
    expect(res.body.grant_rules).toBe(1);
    expect(await getCollection('bloodlines').countDocuments({ _id: made._id })).toBe(1);
  });

  it('404s on a well-formed id that does not exist', async () => {
    const res = await request(app).delete(`/api/bloodlines/${new ObjectId()}`).set('X-Test-User', stUser());
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  AC 7 — one deriveSlug, shared
// ─────────────────────────────────────────────────────────────────────────────

describe('BL-4 AC 7 — deriveSlug has exactly one implementation', () => {
  it('the shared module and the seed script export the same function', async () => {
    const shared = await import('../lib/bloodline-slug.js');
    const seed = await import('../scripts/seed-bloodlines.js');
    expect(seed.deriveSlug).toBe(shared.deriveSlug);
  });

  it('the route derives the same slug the seed would', async () => {
    const { deriveSlug } = await import('../lib/bloodline-slug.js');
    const res = await post(body({ name: 'Zzz Bl4 Scions of the First City' }));
    expect(res.status).toBe(201);
    expect(res.body.slug).toBe(deriveSlug('Zzz Bl4 Scions of the First City'));
  });
});
