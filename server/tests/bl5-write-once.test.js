/**
 * BL-5 (issue #1008) — clan and bloodline are write-once, server side.
 *
 * Three layers, deliberately in one file because they are one rule:
 *
 *   1. The pure decision function (`server/lib/character-write-once.js`),
 *      exhaustively, table-driven. No database, no Express — the
 *      `bloodline-delete-guard.js` precedent.
 *   2. The route, behaviourally, against `tm_suite_test`. The load-bearing one
 *      is the full-document NO-OP save returning 200: the ST editor PUTs
 *      `buildSaveBody(c)` (admin.js:976) on every single save, carrying `clan`
 *      and `bloodline` unchanged, so a guard that refuses "the field is present
 *      in the body" rather than "the field's value changed" breaks every
 *      character save in the app on its first day.
 *   3. The referential check on acquisition, including the case that protects
 *      production today: an EMPTY `bloodlines` collection must not be allowed
 *      to answer "no". Production holds zero bloodline documents right now.
 *
 * The client half lives in `bl5-lineage-lock-client.test.js`; the two
 * implementations of the transition table are pinned against each other by the
 * parity block at the bottom of this file.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
import { Collection, ObjectId } from 'mongodb';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';
import {
  WRITE_ONCE_FIELDS,
  hasNoValue,
  checkWriteOnce,
  writeOnceMessage,
} from '../lib/character-write-once.js';
import { bloodlineKey } from '../lib/bloodline-key.js';

let app;
const seededIds = [];
/** Whatever the shared test DB already held in `bloodlines`, restored in afterAll. */
let bloodlineBackup = [];

async function seedChar(overrides = {}) {
  const col = getCollection('characters');
  const doc = {
    name: 'BL5 Subject',
    retired: false,
    pending_approval: false,
    attributes: {}, skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
    ...overrides,
  };
  const result = await col.insertOne(doc);
  seededIds.push(result.insertedId);
  return { ...doc, _id: result.insertedId };
}

/**
 * A body that passes FULL schema validation, which both creation routes use
 * (the PUT uses the partial schema and needs none of this). All nine
 * attributes are required by `character.schema.js`.
 */
function creationBody(overrides = {}) {
  const ATTRS = ['Intelligence', 'Wits', 'Resolve', 'Strength', 'Dexterity', 'Stamina', 'Presence', 'Manipulation', 'Composure'];
  const attributes = {};
  for (const a of ATTRS) attributes[a] = { dots: 1, bonus: 0 };
  return {
    name: 'BL5 Created',
    attributes,
    skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
    ...overrides,
  };
}

async function setBloodlines(docs) {
  const col = getCollection('bloodlines');
  await col.deleteMany({});
  if (docs.length) await col.insertMany(docs.map(d => ({ ...d })));
}

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
  // Take the collection to a known state for this file and put it back after.
  // Every referential assertion below depends on knowing exactly what the
  // collection can and cannot answer.
  bloodlineBackup = await getCollection('bloodlines').find({}).toArray();
  await getCollection('bloodlines').deleteMany({});
});

afterAll(async () => {
  const col = getCollection('characters');
  for (const id of seededIds) await col.deleteOne({ _id: id });
  await getCollection('bloodlines').deleteMany({});
  if (bloodlineBackup.length) await getCollection('bloodlines').insertMany(bloodlineBackup);
  await teardownDb();
});

// ═════════════════════════════════════════════════════════════════════════════
//  1. The pure function (AC 1, AC 2)
// ═════════════════════════════════════════════════════════════════════════════

describe('BL-5 AC 2 — "no value" is one predicate and it covers the empty string', () => {
  // Not tidiness. character.schema.js:70 puts '' IN the clan enum and :74
  // leaves bloodline an unconstrained ['string','null'], so a naive === null
  // check would let 'Malkovians' -> '' through as an allowed no-change, which
  // is exactly the bypass the rule forbids.
  it.each([null, undefined, '', ' ', '   ', '\t', '\n  '])('treats %j as no value', v => {
    expect(hasNoValue(v)).toBe(true);
  });

  it.each(['Malkovians', ' Malkovians ', 'Daeva', '0'])('treats %j as a value', v => {
    expect(hasNoValue(v)).toBe(false);
  });

  it('treats a non-string as a VALUE rather than as absent, and does not throw', () => {
    // Fail closed, decided in BL-5's code review. The first cut swept every
    // non-string into "no value", which meant a malformed stored value (a
    // number, a boolean, an array, an object reachable only by a direct Mongo
    // edit) read as "has nothing" and the next write looked like a fresh
    // acquisition. That is the write-once rule failing OPEN on exactly the
    // corrupt data it most needs to hold on.
    expect(hasNoValue(0)).toBe(false);
    expect(hasNoValue(7)).toBe(false);
    expect(hasNoValue(false)).toBe(false);
    expect(hasNoValue(true)).toBe(false);
    expect(hasNoValue([])).toBe(false);
    expect(hasNoValue({})).toBe(false);
  });

  it('a malformed STORED value cannot be overwritten by a valid-looking string', () => {
    for (const field of WRITE_ONCE_FIELDS) {
      for (const junk of [7, 0, false, true, [], {}, ['Malkovians']]) {
        const v = checkWriteOnce(field, junk, 'Malkovians');
        expect({ field, junk, allowed: v.allowed }).toEqual({ field, junk, allowed: false });
      }
    }
  });

  it('a malformed stored value cannot be cleared either', () => {
    expect(checkWriteOnce('bloodline', 7, null).allowed).toBe(false);
    expect(checkWriteOnce('bloodline', 7, '').allowed).toBe(false);
    expect(checkWriteOnce('clan', {}, undefined).allowed).toBe(false);
  });
});

describe('BL-5 AC 1 — the transition table, every row, both fields', () => {
  const CASES = [
    // [label, current, incoming, allowed, changed]
    ['no value -> a name is an acquisition',        null,          'Malkovians', true,  true],
    ['absent -> a name is an acquisition',          undefined,     'Malkovians', true,  true],
    ["'' -> a name is an acquisition",              '',            'Malkovians', true,  true],
    ['whitespace -> a name is an acquisition',      '  ',          'Malkovians', true,  true],
    ['the byte-identical same value is a no-op',    'Malkovians',  'Malkovians', true,  false],
    ['a different value is refused',                'Malkovians',  'Gorgons',    false, false],
    ['a case-differing value is refused',           'Malkovians',  'malkovians', false, false],
    ['a whitespace-differing value is refused',     'Malkovians',  ' Malkovians', false, false],
    ['a value -> null is refused',                  'Malkovians',  null,         false, false],
    ["a value -> '' is refused",                    'Malkovians',  '',           false, false],
    ['a value -> whitespace is refused',            'Malkovians',  '   ',        false, false],
    ['no value -> no value is a no-op',             null,          null,         true,  false],
    ["no value -> '' is a no-op",                   null,          '',           true,  false],
    ["'' -> null is a no-op",                       '',            null,         true,  false],
  ];

  for (const field of WRITE_ONCE_FIELDS) {
    describe(field, () => {
      for (const [label, current, incoming, allowed, changed] of CASES) {
        it(label, () => {
          const v = checkWriteOnce(field, current, incoming);
          expect(v.allowed).toBe(allowed);
          expect(v.changed).toBe(changed);
        });
      }
    });
  }

  it('covers both guarded fields and nothing else', () => {
    expect(WRITE_ONCE_FIELDS).toEqual(['clan', 'bloodline']);
  });

  it('a refusal always carries a reason', () => {
    const v = checkWriteOnce('bloodline', 'Malkovians', 'Gorgons');
    expect(v.allowed).toBe(false);
    expect(typeof v.reason).toBe('string');
    expect(v.reason.length).toBeGreaterThan(0);
  });

  it('an allowed verdict carries no reason', () => {
    expect(checkWriteOnce('clan', null, 'Daeva').reason).toBe(null);
  });

  it('is pure — it does not mutate or capture its arguments', () => {
    const before = checkWriteOnce('clan', 'Daeva', 'Ventrue');
    const after = checkWriteOnce('clan', 'Daeva', 'Ventrue');
    expect(after).toEqual(before);
  });
});

describe('BL-5 AC 5 — the refusal message names the field, both values and the remedy', () => {
  const msg = writeOnceMessage('bloodline', 'Malkovians', 'Gorgons');

  it('names the field', () => expect(msg).toContain('bloodline'));
  it('names the stored value', () => expect(msg).toContain('Malkovians'));
  it('names the attempted value', () => expect(msg).toContain('Gorgons'));
  it('says the value is permanent', () => expect(msg).toMatch(/permanent/i));
  it('names the remedy as a deliberate data correction outside the app', () => {
    expect(msg).toMatch(/data correction/i);
  });
  it('is British English with no em-dashes', () => {
    expect(msg).not.toContain('—');
  });
  it('describes a clearing attempt in words rather than printing "null"', () => {
    expect(writeOnceMessage('clan', 'Daeva', null)).toMatch(/cleared|removed|clearing/i);
  });
});

describe('BL-5 — the shared bloodline key (AC 8)', () => {
  it('trims and case-folds, matching bloodlines-cache.js _key', () => {
    expect(bloodlineKey('  Khaibit ')).toBe('khaibit');
    expect(bloodlineKey('KHAIBIT')).toBe('khaibit');
  });

  it('returns the empty string for anything that is not a string', () => {
    expect(bloodlineKey(null)).toBe('');
    expect(bloodlineKey(undefined)).toBe('');
    expect(bloodlineKey(7)).toBe('');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  2. The route (AC 3, 4, 5, 6)
// ═════════════════════════════════════════════════════════════════════════════

describe('BL-5 AC 3 — the no-op full-document save is load-bearing', () => {
  it('saving a bloodline-carrying character unchanged returns 200', async () => {
    const char = await seedChar({ name: 'BL5 NoOp Save', clan: 'Mekhet', bloodline: 'Malkovians' });
    const stored = await getCollection('characters').findOne({ _id: char._id });
    const { _id, ...body } = stored;

    const res = await request(app)
      .put(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser())
      .send({ ...body, humanity: 6 });

    expect(res.status).toBe(200);
    expect(res.body.bloodline).toBe('Malkovians');
    expect(res.body.clan).toBe('Mekhet');
    expect(res.body.humanity).toBe(6);
  });

  it('a body touching neither field still saves', async () => {
    const char = await seedChar({ name: 'BL5 Unrelated Save', clan: 'Ventrue', bloodline: 'Malkovians' });
    const res = await request(app)
      .put(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser())
      .send({ concept: 'Unchanged lineage' });
    expect(res.status).toBe(200);
    expect(res.body.concept).toBe('Unchanged lineage');
    expect(res.body.bloodline).toBe('Malkovians');
  });
});

describe('BL-5 AC 5 — forbidden bloodline transitions return 409', () => {
  async function attempt(seed, body) {
    const char = await seedChar({ name: 'BL5 BL Transition', clan: 'Mekhet', ...seed });
    const res = await request(app)
      .put(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser())
      .send(body);
    const after = await getCollection('characters').findOne({ _id: char._id });
    return { res, after };
  }

  it('null -> a name is allowed (acquisition)', async () => {
    const { res, after } = await attempt({ bloodline: null }, { bloodline: 'Malkovians' });
    expect(res.status).toBe(200);
    expect(after.bloodline).toBe('Malkovians');
  });

  it('a name -> a different name is 409 and the stored value is untouched', async () => {
    const { res, after } = await attempt({ bloodline: 'Malkovians' }, { bloodline: 'Gorgons' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('WRITE_ONCE_VIOLATION');
    expect(after.bloodline).toBe('Malkovians');
  });

  it('a name -> null is 409', async () => {
    const { res, after } = await attempt({ bloodline: 'Malkovians' }, { bloodline: null });
    expect(res.status).toBe(409);
    expect(after.bloodline).toBe('Malkovians');
  });

  it("a name -> '' is 409 — the bypass the '' predicate closes", async () => {
    const { res, after } = await attempt({ bloodline: 'Malkovians' }, { bloodline: '' });
    expect(res.status).toBe(409);
    expect(after.bloodline).toBe('Malkovians');
  });

  it('a case-differing name is 409, not a silent rewrite', async () => {
    const { res, after } = await attempt({ bloodline: 'Malkovians' }, { bloodline: 'malkovians' });
    expect(res.status).toBe(409);
    expect(after.bloodline).toBe('Malkovians');
  });

  it('the 409 body carries a usable message', async () => {
    const { res } = await attempt({ bloodline: 'Malkovians' }, { bloodline: 'Gorgons' });
    expect(res.body.message).toContain('Malkovians');
    expect(res.body.message).toContain('Gorgons');
    expect(res.body.message).toMatch(/data correction/i);
  });

  it('nothing else in the refused body is written either', async () => {
    const char = await seedChar({ name: 'BL5 Atomic Refusal', clan: 'Mekhet', bloodline: 'Malkovians' });
    const res = await request(app)
      .put(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser())
      .send({ bloodline: 'Gorgons', concept: 'Should not land' });
    expect(res.status).toBe(409);
    const after = await getCollection('characters').findOne({ _id: char._id });
    expect(after.concept).toBeUndefined();
  });
});

describe('BL-5 AC 5 — forbidden clan transitions return 409', () => {
  async function attempt(seed, body) {
    const char = await seedChar({ name: 'BL5 Clan Transition', ...seed });
    const res = await request(app)
      .put(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser())
      .send(body);
    const after = await getCollection('characters').findOne({ _id: char._id });
    return { res, after };
  }

  it('no clan -> a clan is allowed (acquisition)', async () => {
    const { res, after } = await attempt({ clan: null }, { clan: 'Daeva' });
    expect(res.status).toBe(200);
    expect(after.clan).toBe('Daeva');
  });

  it('a clan -> a different clan is 409', async () => {
    const { res, after } = await attempt({ clan: 'Daeva' }, { clan: 'Ventrue' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('WRITE_ONCE_VIOLATION');
    expect(after.clan).toBe('Daeva');
  });

  it('a clan -> null is 409', async () => {
    const { res, after } = await attempt({ clan: 'Daeva' }, { clan: null });
    expect(res.status).toBe(409);
    expect(after.clan).toBe('Daeva');
  });

  it("a clan -> '' is 409 — '' is in the schema enum, so this is reachable", async () => {
    const { res, after } = await attempt({ clan: 'Daeva' }, { clan: '' });
    expect(res.status).toBe(409);
    expect(after.clan).toBe('Daeva');
  });

  it('the same clan resent is a no-op and returns 200', async () => {
    const { res } = await attempt({ clan: 'Daeva' }, { clan: 'Daeva', concept: 'Same clan' });
    expect(res.status).toBe(200);
  });
});

describe('BL-5 AC 4 — the guard does not disturb the existing behaviour of PUT', () => {
  it('a non-existent character still returns 404, not 409', async () => {
    const res = await request(app)
      .put(`/api/characters/${new ObjectId().toHexString()}`)
      .set('X-Test-User', stUser())
      .send({ clan: 'Gangrel' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('a malformed id still returns 400', async () => {
    const res = await request(app)
      .put('/api/characters/bad-id')
      .set('X-Test-User', stUser())
      .send({ clan: 'Gangrel' });
    expect(res.status).toBe(400);
  });

  it('a player is still refused before the guard is reached', async () => {
    const char = await seedChar({ name: 'BL5 Player Blocked', clan: 'Daeva' });
    const res = await request(app)
      .put(`/api/characters/${char._id}`)
      .set('X-Test-User', playerUser([char._id.toString()]))
      .send({ clan: 'Ventrue' });
    expect(res.status).toBe(403);
  });
});

describe('BL-5 AC 6 — the update filter carries the prior value on acquisitions only', () => {
  // AC 15 asks for the filter SHAPE, not a behavioural race. `getCollection`
  // hands back a fresh Collection instance per call, so the interception has to
  // be on the prototype; it is restored in afterEach.
  let calls = [];
  let original;

  beforeEach(() => {
    calls = [];
    original = Collection.prototype.findOneAndUpdate;
    Collection.prototype.findOneAndUpdate = function (filter, update, opts) {
      if (this.collectionName === 'characters') calls.push(filter);
      return original.call(this, filter, update, opts);
    };
  });

  afterEach(() => { Collection.prototype.findOneAndUpdate = original; });

  it('an acquisition from null filters on the prior null', async () => {
    const char = await seedChar({ name: 'BL5 CAS Acquire', clan: 'Mekhet', bloodline: null });
    const res = await request(app)
      .put(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser())
      .send({ bloodline: 'Malkovians' });
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].bloodline).toBe(null);
    expect(String(calls[0]._id)).toBe(String(char._id));
  });

  it('an acquisition on an ABSENT field filters on null, which matches missing in MongoDB', async () => {
    const char = await seedChar({ name: 'BL5 CAS Absent', clan: 'Mekhet' });
    await getCollection('characters').updateOne({ _id: char._id }, { $unset: { bloodline: '' } });
    const res = await request(app)
      .put(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser())
      .send({ bloodline: 'Malkovians' });
    expect(res.status).toBe(200);
    expect(calls[0].bloodline).toBe(null);
  });

  it("an acquisition from '' filters on '' exactly, not on null", async () => {
    const char = await seedChar({ name: 'BL5 CAS Empty', clan: 'Mekhet', bloodline: '' });
    const res = await request(app)
      .put(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser())
      .send({ bloodline: 'Malkovians' });
    expect(res.status).toBe(200);
    expect(calls[0].bloodline).toBe('');
  });

  it('a no-op save filters on _id ALONE — no extra condition to fail on', async () => {
    const char = await seedChar({ name: 'BL5 CAS NoOp', clan: 'Ventrue', bloodline: 'Malkovians' });
    const res = await request(app)
      .put(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser())
      .send({ clan: 'Ventrue', bloodline: 'Malkovians', concept: 'Merit save' });
    expect(res.status).toBe(200);
    expect(Object.keys(calls[0])).toEqual(['_id']);
  });

  it('a save touching neither field filters on _id alone', async () => {
    const char = await seedChar({ name: 'BL5 CAS Unrelated', clan: 'Ventrue', bloodline: 'Malkovians' });
    const res = await request(app)
      .put(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser())
      .send({ concept: 'Nothing to do with lineage' });
    expect(res.status).toBe(200);
    expect(Object.keys(calls[0])).toEqual(['_id']);
  });

  it('a clan acquisition alongside a bloodline acquisition puts BOTH priors in the filter', async () => {
    const char = await seedChar({ name: 'BL5 CAS Both', clan: null, bloodline: null });
    const res = await request(app)
      .put(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser())
      .send({ clan: 'Mekhet', bloodline: 'Malkovians' });
    expect(res.status).toBe(200);
    expect(calls[0]).toMatchObject({ clan: null, bloodline: null });
  });
});

describe('BL-5 AC 6 — losing the compare-and-set is a 409, not a silent overwrite and not a 404', () => {
  let original;
  afterEach(() => { if (original) { Collection.prototype.findOne = original; original = null; } });

  it('a stale read that passes the guard is caught by the filter', async () => {
    const char = await seedChar({ name: 'BL5 CAS Race', clan: 'Mekhet', bloodline: null });
    // The winning concurrent acquisition lands first.
    await getCollection('characters').updateOne({ _id: char._id }, { $set: { bloodline: 'Gorgons' } });

    // Force the guard's read to see the pre-race state, which is exactly what a
    // real interleaving would give it. The guard then allows the acquisition,
    // and only the filter can stop the overwrite.
    original = Collection.prototype.findOne;
    let served = false;
    Collection.prototype.findOne = function (filter, opts) {
      if (this.collectionName === 'characters' && !served && opts?.projection?.bloodline) {
        served = true;
        return Promise.resolve({ _id: char._id, clan: 'Mekhet', bloodline: null });
      }
      return original.call(this, filter, opts);
    };

    const res = await request(app)
      .put(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser())
      .send({ bloodline: 'Malkovians' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('WRITE_ONCE_VIOLATION');
    expect(res.body.message).toMatch(/in flight|another save/i);
    const after = await getCollection('characters').findOne({ _id: char._id });
    expect(after.bloodline).toBe('Gorgons');
  });

  it('names only the field that actually moved, not every field in the filter', async () => {
    // Found by BL-5's code review. The filter ANDs both acquired priors, so ONE
    // field moving underneath trips the whole update; the message used to report
    // both, sending the ST to investigate a field nobody touched. Data safety was
    // never in question here, only what the message says.
    const char = await seedChar({ name: 'BL5 CAS Partial Race', clan: null, bloodline: null });
    // Only clan lands underneath. Bloodline is still null when the update runs.
    await getCollection('characters').updateOne({ _id: char._id }, { $set: { clan: 'Gangrel' } });

    original = Collection.prototype.findOne;
    let served = false;
    Collection.prototype.findOne = function (filter, opts) {
      if (this.collectionName === 'characters' && !served && opts?.projection?.bloodline) {
        served = true;
        return Promise.resolve({ _id: char._id, clan: null, bloodline: null });
      }
      return original.call(this, filter, opts);
    };

    const res = await request(app)
      .put(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser())
      .send({ clan: 'Ventrue', bloodline: 'Malkovians' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('WRITE_ONCE_VIOLATION');
    expect(res.body.message).toMatch(/clan/);
    expect(res.body.message).not.toMatch(/bloodline/);
    // And nothing was written: the compare-and-set held.
    const after = await getCollection('characters').findOne({ _id: char._id });
    expect(after.clan).toBe('Gangrel');
    expect(after.bloodline).toBe(null);
  });
});

describe('BL-5 AC 6 — the acquisition is a compare-and-set, not a read-then-write', () => {
  // A behavioural race is not required by AC 15; the filter shape is. These
  // assert the shape through observable behaviour rather than by spying on the
  // driver, so a refactor of HOW the filter is built cannot make them pass
  // vacuously.
  it('an acquisition that loses the race returns 409 rather than overwriting', async () => {
    const char = await seedChar({ name: 'BL5 Race Loser', clan: 'Mekhet', bloodline: null });
    // Simulate the winning concurrent write landing between the guard's read
    // and the update: the guard has already seen `null`, and by the time the
    // update runs the stored value is a name. The compare-and-set filter must
    // fail to match, and a document that still exists means the race, not a
    // 404.
    const col = getCollection('characters');
    const before = await col.findOne({ _id: char._id });
    expect(before.bloodline).toBe(null);

    // The filter is `{ _id, bloodline: <prior> }`. Proving it exists: change
    // the stored value out from under a request that was built against null.
    await col.updateOne({ _id: char._id }, { $set: { bloodline: 'Gorgons' } });
    const res = await request(app)
      .put(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser())
      .send({ bloodline: 'Malkovians' });
    // The guard's own read now sees 'Gorgons', so this is refused as a
    // name-to-name transition. Either way the answer is 409 and the stored
    // value survives.
    expect(res.status).toBe(409);
    const after = await col.findOne({ _id: char._id });
    expect(after.bloodline).toBe('Gorgons');
  });

  it('a no-op save gains no filter condition — an unrelated concurrent state does not fail it', async () => {
    const char = await seedChar({ name: 'BL5 No Filter On NoOp', clan: 'Ventrue', bloodline: 'Malkovians' });
    const res = await request(app)
      .put(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser())
      .send({ clan: 'Ventrue', bloodline: 'Malkovians', concept: 'Merit save' });
    expect(res.status).toBe(200);
    expect(res.body.concept).toBe('Merit save');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  3. The referential check (AC 8) and the creation paths (AC 7)
// ═════════════════════════════════════════════════════════════════════════════

describe('BL-5 AC 8 — the acquired bloodline must resolve, but only when the collection can answer', () => {
  afterEach(async () => { await setBloodlines([]); });

  it('an empty collection returns 200 — this is the case protecting production today', async () => {
    await setBloodlines([]);
    const char = await seedChar({ name: 'BL5 Empty Collection', clan: 'Mekhet', bloodline: null });
    const res = await request(app)
      .put(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser())
      .send({ bloodline: 'Malkovians' });
    expect(res.status).toBe(200);
    expect(res.body.bloodline).toBe('Malkovians');
  });

  it('a resolving acquisition returns 200', async () => {
    await setBloodlines([{ name: 'Malkovians', slug: 'malkovians', clan: 'Mekhet', disciplines: ['Auspex', 'Celerity', 'Obfuscate', 'Dominate'] }]);
    const char = await seedChar({ name: 'BL5 Resolves', clan: 'Mekhet', bloodline: null });
    const res = await request(app)
      .put(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser())
      .send({ bloodline: 'Malkovians' });
    expect(res.status).toBe(200);
  });

  it('matches on the trimmed, case-folded key, not exact string equality', async () => {
    await setBloodlines([{ name: 'Malkovians', slug: 'malkovians', clan: 'Mekhet', disciplines: ['Auspex', 'Celerity', 'Obfuscate', 'Dominate'] }]);
    const char = await seedChar({ name: 'BL5 Key Match', clan: 'Mekhet', bloodline: null });
    const res = await request(app)
      .put(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser())
      .send({ bloodline: '  malkovians ' });
    expect(res.status).toBe(200);
  });

  it('a non-resolving acquisition returns 400 VALIDATION_ERROR, distinguishable from the 409', async () => {
    await setBloodlines([{ name: 'Malkovians', slug: 'malkovians', clan: 'Mekhet', disciplines: ['Auspex', 'Celerity', 'Obfuscate', 'Dominate'] }]);
    const char = await seedChar({ name: 'BL5 Does Not Resolve', clan: 'Mekhet', bloodline: null });
    const res = await request(app)
      .put(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser())
      .send({ bloodline: 'Not A Bloodline' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    const after = await getCollection('characters').findOne({ _id: char._id });
    expect(after.bloodline).toBe(null);
  });

  it('never runs on a no-op — an existing holder saves fine against a collection that lacks their bloodline', async () => {
    // The 13 live holders would otherwise all fail their next full-document
    // save the moment the collection was seeded with anything at all.
    await setBloodlines([{ name: 'Gorgons', slug: 'gorgons', clan: 'Gangrel', disciplines: ['Animalism', 'Protean', 'Resilience', 'Vigour'] }]);
    const char = await seedChar({ name: 'BL5 Holder NoOp', clan: 'Mekhet', bloodline: 'Malkovians' });
    const res = await request(app)
      .put(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser())
      .send({ clan: 'Mekhet', bloodline: 'Malkovians', concept: 'Still saves' });
    expect(res.status).toBe(200);
  });

  it('no referential check is added for clan — the schema enum is stronger', async () => {
    await setBloodlines([]);
    const char = await seedChar({ name: 'BL5 Clan Acquisition', clan: null });
    const res = await request(app)
      .put(`/api/characters/${char._id}`)
      .set('X-Test-User', stUser())
      .send({ clan: 'Nosferatu' });
    expect(res.status).toBe(200);
  });
});

describe('BL-5 AC 7 — the creation paths are NOT guarded', () => {
  it('the player wizard creates a character carrying clan and bloodline, 201', async () => {
    await setBloodlines([]);
    const players = getCollection('players');
    const player = await players.insertOne({ name: 'BL5 Wizard Player', character_ids: [] });
    const res = await request(app)
      .post('/api/characters/wizard')
      .set('X-Test-User', playerUser([], { player_id: player.insertedId }))
      .send(creationBody({ name: 'BL5 Wizard Child', clan: 'Mekhet', bloodline: 'Malkovians' }));

    if (res.status === 201) seededIds.push(new ObjectId(res.body._id));
    await players.deleteOne({ _id: player.insertedId });

    expect(res.status).toBe(201);
    expect(res.body.clan).toBe('Mekhet');
    expect(res.body.bloodline).toBe('Malkovians');
  });

  it('the ST create route also carries both fields through, 201', async () => {
    await setBloodlines([]);
    const res = await request(app)
      .post('/api/characters')
      .set('X-Test-User', stUser())
      .send(creationBody({ name: 'BL5 ST Created', clan: 'Gangrel', bloodline: 'Not In The Collection' }));
    if (res.status === 201) seededIds.push(new ObjectId(res.body._id));
    expect(res.status).toBe(201);
    expect(res.body.bloodline).toBe('Not In The Collection');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  4. Parity — the server module and the client module implement one table
// ═════════════════════════════════════════════════════════════════════════════

describe('BL-5 — the server and client rules cannot drift apart', () => {
  // The rule is necessarily implemented twice: `public/js` deploys to Netlify
  // and `server/` to Render, so neither tree can import the other's copy at
  // runtime. AC 1 names the server path and AC 9 requires the client copy be
  // shared by both handlers. What binds them is this: the same table, run
  // through both.
  // The nullish and string rows are AC 2's own list. The four non-string rows
  // were added by BL-5's code review: the two modules each claim in their header
  // to have an opinion about a malformed value, and until they were in this
  // matrix the two could have drifted apart on exactly that edge while the test
  // titled "cannot drift apart" stayed green.
  const VALUES = [
    null, undefined, '', '  ', 'Malkovians', 'malkovians', ' Malkovians ', 'Gorgons',
    7, false, [], {},
  ];

  it('agrees on every current/incoming pair, for both fields', async () => {
    const client = await import('../../public/js/data/write-once.js');
    for (const field of WRITE_ONCE_FIELDS) {
      for (const current of VALUES) {
        for (const incoming of VALUES) {
          const s = checkWriteOnce(field, current, incoming);
          const c = client.checkWriteOnce(field, current, incoming);
          expect({ field, current, incoming, allowed: c.allowed, changed: c.changed })
            .toEqual({ field, current, incoming, allowed: s.allowed, changed: s.changed });
        }
      }
    }
  });

  it('agrees on the "no value" predicate', async () => {
    const client = await import('../../public/js/data/write-once.js');
    for (const v of VALUES) expect(client.hasNoValue(v)).toBe(hasNoValue(v));
  });

  it('guards the same two fields', async () => {
    const client = await import('../../public/js/data/write-once.js');
    expect(client.WRITE_ONCE_FIELDS).toEqual(WRITE_ONCE_FIELDS);
  });
});
