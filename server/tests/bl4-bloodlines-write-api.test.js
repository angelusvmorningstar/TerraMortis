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
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ObjectId } from 'mongodb';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { BLOODLINE_FIXTURES } from './helpers/bloodline-fixtures.js';
import { bloodlineSchema } from '../schemas/bloodline.schema.js';
import { getCollection } from '../db.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Every `.js` under `dir`, skipping `node_modules`. */
function walkJs(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (e.name !== 'node_modules') walkJs(path.join(dir, e.name), out); }
    else if (e.name.endsWith('.js')) out.push(path.join(dir, e.name));
  }
  return out;
}

/** A source grep must not pass (or fail) on prose. */
const stripComments = src => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

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

  it('trims a discipline, and adopts the canonical spelling of a case variant', async () => {
    // Both used to be rejected as "Unknown discipline" even though the value
    // resolves exactly. What is STORED must be canonical either way: the
    // character's own discipline keys are matched against it literally, so a
    // stored "auspex" would resolve the bloodline and then never match the
    // discipline, which is the silent mis-costing the known-set check exists
    // to prevent.
    const res = await post(body({ name: 'Zzz Bl4 Sloppy Discs', disciplines: ['Auspex ', ' celerity', 'OBFUSCATE', 'Vigour'] }));
    expect(res.status).toBe(201);
    expect(res.body.disciplines).toEqual(['Auspex', 'Celerity', 'Obfuscate', 'Vigour']);
  });

  it('still rejects two spellings of the SAME discipline once they are canonicalised', async () => {
    const res = await post(body({ name: 'Zzz Bl4 Same Twice', disciplines: ['Auspex', 'auspex ', 'Celerity', 'Vigour'] }));
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  AC 4 — the index is what actually forbids the second document
//
//  The route's pre-insert scan is a read-then-write with no lock, so two
//  concurrent POSTs for "Khaibit" and "khaibit" can both clear it. Only the
//  index is atomic, and BL-4 shipped it case-SENSITIVE, which cannot see the
//  clash at all. Found by this story's review.
// ─────────────────────────────────────────────────────────────────────────────

describe('BL-4 AC 4 — bloodline_name_unique is case-insensitive at the DATABASE', () => {
  // Drop it first. The index survives between runs in `tm_suite_test`, and a
  // test that inherits a collated index from a previous run passes whatever
  // the code now says — which is exactly how this pair first failed to
  // discriminate when the collation was reverted to check it.
  beforeEach(async () => {
    try { await getCollection('bloodlines').dropIndex('bloodline_name_unique'); }
    catch { /* IndexNotFound / NamespaceNotFound — nothing to drop */ }
    // A fresh router too: the route memoises the ensure once per process, so a
    // router that has already ensured would not notice the drop.
    app = createTestApp();
  });

  it('a write ensures the index exists, with a case-insensitive collation', async () => {
    const res = await post(body({ name: 'Zzz Bl4 Index Ensure' }));
    expect(res.status).toBe(201);
    const idx = (await getCollection('bloodlines').indexes()).find(i => i.name === 'bloodline_name_unique');
    expect(idx, 'expected the route to ensure bloodline_name_unique').toBeTruthy();
    expect(idx.unique).toBe(true);
    expect(idx.collation?.strength).toBe(2);
  });

  it('refuses a case-different duplicate that never passes through the route at all', async () => {
    // Driver-level, deliberately bypassing the pre-insert scan: this is the
    // half of the rule the application cannot enforce, and the half the race
    // needs. If this insert succeeds, two documents collapse onto one cache
    // key and one of them is permanently unreachable for costing.
    // Through the route, so the index is ensured whatever order this file runs in.
    const made = await post(body({ name: 'Zzz Bl4 Collate' }));
    expect(made.status).toBe(201);
    let code = null;
    try {
      const dupe = await getCollection('bloodlines').insertOne({
        name: 'zzz bl4 COLLATE', slug: 'zzz-bl4-collate-2', clan: 'Mekhet',
        disciplines: [...VALID_DISCS], notes: null,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });
      seededBloodlines.push(dupe.insertedId);
    } catch (err) {
      code = err?.code;
    }
    expect(code, 'expected E11000 from the collated unique index').toBe(11000);
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
//  AC 8 — the delete guard is not a read-then-write
//
//  BL-4 read the references, then deleted. A character assigned the name (or a
//  grant created against it) in that gap was invisible to the guard and the
//  delete went through on a referenced bloodline, leaving the holder costed
//  fully out-of-clan. Found by this story's review.
//
//  Injected collection touches, because the ordering is the thing under test
//  and racing a real database would test the scheduler instead.
// ─────────────────────────────────────────────────────────────────────────────

describe('BL-4 AC 8 — deleteBloodlineGuarded re-checks after the delete', () => {
  const CLEAN = { holders: 0, character_names: [], grant_rules: 0, grant_rule_labels: [] };
  const HELD = { holders: 1, character_names: ['Ocka Keats'], grant_rules: 0, grant_rule_labels: [] };

  it('deletes when nothing references the bloodline, before or after', async () => {
    const { deleteBloodlineGuarded } = await import('../lib/bloodline-delete-guard.js');
    let restored = 0;
    const out = await deleteBloodlineGuarded({
      findReferences: async () => CLEAN,
      deleteDoc: async () => 1,
      restoreDoc: async () => { restored += 1; },
    });
    expect(out).toMatchObject({ deleted: true, found: true, restored: false });
    expect(restored).toBe(0);
  });

  it('refuses without touching the document when the reference is already there', async () => {
    const { deleteBloodlineGuarded } = await import('../lib/bloodline-delete-guard.js');
    let deletes = 0;
    const out = await deleteBloodlineGuarded({
      findReferences: async () => HELD,
      deleteDoc: async () => { deletes += 1; return 1; },
      restoreDoc: async () => {},
    });
    expect(out).toMatchObject({ deleted: false, found: true, restored: false });
    expect(deletes).toBe(0);
  });

  it('puts the document back when a reference lands DURING the delete', async () => {
    const { deleteBloodlineGuarded } = await import('../lib/bloodline-delete-guard.js');
    let call = 0;
    let restored = 0;
    const out = await deleteBloodlineGuarded({
      // Clean on the way in, referenced on the way out: the write raced the delete.
      findReferences: async () => (++call === 1 ? CLEAN : HELD),
      deleteDoc: async () => 1,
      restoreDoc: async () => { restored += 1; },
    });
    expect(out.deleted).toBe(false);
    expect(out.restored).toBe(true);
    expect(out.refs.holders).toBe(1);
    expect(restored, 'the bloodline must be put back, not left deleted-but-referenced').toBe(1);
  });

  it('reports not-found rather than restoring when someone else deleted it first', async () => {
    const { deleteBloodlineGuarded } = await import('../lib/bloodline-delete-guard.js');
    let restored = 0;
    const out = await deleteBloodlineGuarded({
      findReferences: async () => CLEAN,
      deleteDoc: async () => 0,
      restoreDoc: async () => { restored += 1; },
    });
    expect(out).toMatchObject({ deleted: false, found: false, restored: false });
    expect(restored).toBe(0);
  });

  it('the route wires the guard, and a clean delete still 204s end to end', async () => {
    const made = await seedBloodline({ name: 'Zzz Bl4 Guarded', slug: 'zzz-bl4-guarded' });
    const res = await request(app).delete(`/api/bloodlines/${made._id}`).set('X-Test-User', stUser());
    expect(res.status).toBe(204);
    expect(await getCollection('bloodlines').findOne({ _id: made._id })).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  AC 12's server half — the admin list carries the grant reference count
// ─────────────────────────────────────────────────────────────────────────────

describe('BL-4 AC 12 — GET /api/bloodlines/admin reports grant references', () => {
  it('counts referencing grant rules per bloodline, in the list read', async () => {
    // The admin screen's Delete button has to mirror the delete gate, and the
    // client cannot join `rule_grant` at all. Without this the only Delete
    // control was enabled for a grant-referenced bloodline, taking the ST
    // through a destructive confirmation the API then refuses with a 409.
    const held = await seedBloodline({ name: 'Zzz Bl4 Granted', slug: 'zzz-bl4-granted' });
    const clean = await seedBloodline({ name: 'Zzz Bl4 Ungranted', slug: 'zzz-bl4-ungranted' });
    await seedGrant('  zzz bl4 granted ');   // normalised key, as the guard matches
    await seedGrant('Zzz Bl4 Granted');

    const res = await request(app).get('/api/bloodlines/admin').set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    const rows = Object.fromEntries(res.body.map(b => [String(b._id), b]));
    expect(rows[String(held._id)].grant_rule_count).toBe(2);
    expect(rows[String(clean._id)].grant_rule_count).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  AC 7 — one deriveSlug, shared
// ─────────────────────────────────────────────────────────────────────────────

describe('BL-4 AC 7 — deriveSlug has exactly one implementation', () => {
  /**
   * BL-3b replacement for the old `seed.deriveSlug === shared.deriveSlug`
   * identity check.
   *
   * That assertion imported `scripts/seed-bloodlines.js` for its re-export, and
   * BL-3b deleted the re-export when it moved the script to `scripts/archive/`.
   * Re-pointing it at the archived path would have asserted something weaker
   * than it looks — that a retired file still re-exports — while the thing BL-4
   * actually bought is that no SECOND derivation exists anywhere live. So walk
   * `server/` and check for one, which is the assertion the identity check was
   * standing in for.
   */
  it('no file under server/ outside scripts/archive defines a second slug derivation', () => {
    const SERVER = path.join(REPO_ROOT, 'server');
    const offenders = [];
    for (const file of walkJs(SERVER)) {
      const rel = path.relative(REPO_ROOT, file).replace(/\\/g, '/');
      if (rel === 'server/lib/bloodline-slug.js') continue;       // the one implementation
      if (rel.startsWith('server/scripts/archive/')) continue;    // retired, frozen, not live
      const src = stripComments(fs.readFileSync(file, 'utf8'));
      if (/(function|const|let|var)\s+deriveSlug\b/.test(src)) offenders.push(rel);
    }
    expect(offenders, 'deriveSlug must have exactly one live implementation').toEqual([]);
  });

  it('everything that CALLS deriveSlug imports the shared module', () => {
    // Call sites, not mentions. BL-3a's post-mortem is the reason: a grep for
    // the declaration passed while two live CALLS to a deleted function
    // survived. The same discipline in the other direction here — a file that
    // invokes `deriveSlug(...)` without importing it is either a second
    // implementation or a ReferenceError waiting to happen.
    const SERVER = path.join(REPO_ROOT, 'server');
    const offenders = [];
    for (const file of walkJs(SERVER)) {
      const rel = path.relative(REPO_ROOT, file).replace(/\\/g, '/');
      if (rel === 'server/lib/bloodline-slug.js') continue;
      const src = stripComments(fs.readFileSync(file, 'utf8'));
      if (!/(^|[^.\w])deriveSlug\s*\(/.test(src)) continue;
      if (!/bloodline-slug\.js/.test(src)) offenders.push(rel);
    }
    expect(offenders, 'these call deriveSlug without importing lib/bloodline-slug.js').toEqual([]);
  });

  // ── Relocated from `bl1-seed-bloodlines.test.js` (BL-3b) ────────────────────
  // That file retired with the script it tested, but this block never tested
  // the script: `deriveSlug` moved to the live `server/lib/bloodline-slug.js`
  // in BL-4, and it is what the write route derives every new bloodline's slug
  // with. Losing the coverage with the retirement would have been a real gap,
  // so it moves here, to the suite that owns the live module.

  it('lowercases a single word', async () => {
    const { deriveSlug } = await import('../lib/bloodline-slug.js');
    expect(deriveSlug('Khaibit')).toBe('khaibit');
  });

  it('hyphenates spaces', async () => {
    const { deriveSlug } = await import('../lib/bloodline-slug.js');
    expect(deriveSlug('Order of Sir Martin')).toBe('order-of-sir-martin');
    expect(deriveSlug('Scions of the First City')).toBe('scions-of-the-first-city');
    expect(deriveSlug('Hounds of Actaeon')).toBe('hounds-of-actaeon');
  });

  it('strips diacritics rather than hyphenating through them', async () => {
    // Naive non-alphanumeric replacement would give "lid-rc", which is a legal
    // kebab string but a nonsense identifier.
    const { deriveSlug } = await import('../lib/bloodline-slug.js');
    expect(deriveSlug('Lidérc')).toBe('liderc');
  });

  it('collapses runs of separators and trims the ends', async () => {
    const { deriveSlug } = await import('../lib/bloodline-slug.js');
    expect(deriveSlug("  The O'Hara  Line  ")).toBe('the-o-hara-line');
  });

  it('derives a schema-legal slug for every migrated bloodline', async () => {
    // Re-pointed at the frozen fixture: the constants this used to walk are
    // deleted, and the 23 as migrated is what it always meant.
    const { deriveSlug } = await import('../lib/bloodline-slug.js');
    const slugPattern = new RegExp(bloodlineSchema.properties.slug.pattern);
    expect(BLOODLINE_FIXTURES).toHaveLength(23);
    for (const { name, slug } of BLOODLINE_FIXTURES) {
      const derived = deriveSlug(name);
      expect(slugPattern.test(derived), `slug "${derived}" from "${name}" is not schema-legal`).toBe(true);
      // ...and it still agrees with the slug the migration actually wrote.
      expect(derived, `derivation drifted for "${name}"`).toBe(slug);
    }
  });

  it('the route derives the same slug the seed would', async () => {
    const { deriveSlug } = await import('../lib/bloodline-slug.js');
    const res = await post(body({ name: 'Zzz Bl4 Scions of the First City' }));
    expect(res.status).toBe(201);
    expect(res.body.slug).toBe(deriveSlug('Zzz Bl4 Scions of the First City'));
  });
});
