/**
 * Issue #1132 — a forbidden write-once transition is RECORDED as well as refused.
 *
 * BL-5 (#1008) made `characters.clan` and `characters.bloodline` write-once and
 * refuses a forbidden change with `409 WRITE_ONCE_VIOLATION`. Nothing persisted
 * that the attempt happened. This story adds an append-only
 * `write_once_violations` collection, written at BOTH of `PUT /api/characters/:id`'s
 * existing 409 sites (the direct check and the compare-and-set race), plus a
 * minimal ST-only read endpoint.
 *
 * Purely additive: `server/lib/character-write-once.js` and the 409 response
 * shape are untouched, and AC5 below pins that.
 *
 * DB-backed: skips wholesale when MongoDB is unreachable (isDbAvailable()),
 * this project's established pattern. Runs against tm_game_test only.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Collection, ObjectId } from 'mongodb';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb, isDbAvailable } from './helpers/db-setup.js';
import { getCollection } from '../db.js';
import { writeOnceMessage, writeOnceRaceMessage } from '../lib/character-write-once.js';
import { writeOnceViolationSchema } from '../schemas/write_once_violations.schema.js';
import { actorFromUser, buildViolationDocs } from '../lib/write-once-violation-log.js';

const dbAvailable = await isDbAvailable();

const VIOLATIONS = () => getCollection('write_once_violations');

// ═════════════════════════════════════════════════════════════════════════════
//  AC1 — the schema file, documentation-of-intended-shape only
// ═════════════════════════════════════════════════════════════════════════════

describe('#1132 AC1 — write_once_violations schema file', () => {
  it('declares exactly the seven fields, nothing else', () => {
    expect(Object.keys(writeOnceViolationSchema.properties).sort()).toEqual([
      '_id', 'actor', 'at', 'attempted_value', 'character_id', 'field', 'stored_value',
    ]);
    expect(writeOnceViolationSchema.additionalProperties).toBe(false);
  });

  it('declares _id, so a real Mongo document would not be rejected', () => {
    // xp_ledger.schema.js's own code review (2026-08-15) found exactly this
    // omission: `additionalProperties: false` with no `_id` rejects every
    // document Mongo actually writes.
    expect(writeOnceViolationSchema.properties._id).toBeDefined();
  });

  it('types character_id as the 24-hex string a validator sees, not an object', () => {
    expect(writeOnceViolationSchema.properties.character_id).toMatchObject({
      type: 'string',
      pattern: '^[a-f0-9]{24}$',
    });
  });

  it('constrains field to the two write-once fields', () => {
    expect(writeOnceViolationSchema.properties.field.enum).toEqual(['clan', 'bloodline']);
  });

  it('requires everything except _id', () => {
    expect(writeOnceViolationSchema.required.sort()).toEqual([
      'actor', 'at', 'attempted_value', 'character_id', 'field', 'stored_value',
    ]);
  });

  it('is Draft-07', () => {
    expect(writeOnceViolationSchema.$schema).toBe('http://json-schema.org/draft-07/schema#');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  The actor helper — never write an unattributed row (xp_ledger's own lesson)
// ═════════════════════════════════════════════════════════════════════════════

describe('#1132 — actorFromUser', () => {
  it('prefers global_name, matching st_mods.js creatorFromUser', () => {
    expect(actorFromUser({ id: '42', global_name: 'Angelus', username: 'angelus_v' }))
      .toEqual({ discord_id: '42', discord_name: 'Angelus' });
  });

  it('falls back to username', () => {
    expect(actorFromUser({ id: '42', username: 'angelus_v' }))
      .toEqual({ discord_id: '42', discord_name: 'angelus_v' });
  });

  it('never returns an unattributed row for a user with nothing usable', () => {
    expect(actorFromUser(undefined)).toEqual({ discord_id: '', discord_name: 'unknown' });
    expect(actorFromUser({})).toEqual({ discord_id: '', discord_name: 'unknown' });
  });

  it('stringifies a non-string discord id', () => {
    expect(actorFromUser({ id: 42, username: 'x' }).discord_id).toBe('42');
  });
});

describe('#1132 — buildViolationDocs', () => {
  const oid = new ObjectId();

  it('builds one document per row, never conflating two fields', () => {
    const docs = buildViolationDocs(oid, [
      { field: 'clan', stored_value: 'Ventrue', attempted_value: 'Daeva' },
      { field: 'bloodline', stored_value: 'Malkovians', attempted_value: null },
    ], { id: 'u1', username: 'st' });
    expect(docs).toHaveLength(2);
    expect(docs.map(d => d.field)).toEqual(['clan', 'bloodline']);
    expect(docs[0].character_id).toBe(oid);
  });

  it('shares one timestamp across the rows of a single refusal', () => {
    const docs = buildViolationDocs(oid, [
      { field: 'clan', stored_value: 'Ventrue', attempted_value: 'Daeva' },
      { field: 'bloodline', stored_value: 'Malkovians', attempted_value: 'Gorgons' },
    ], {});
    expect(docs[0].at).toBe(docs[1].at);
    expect(docs[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('normalises an absent value to null so the key still persists', () => {
    const [doc] = buildViolationDocs(oid, [{ field: 'clan', stored_value: undefined, attempted_value: undefined }], {});
    expect(doc.stored_value).toBeNull();
    expect(doc.attempted_value).toBeNull();
  });

  it('does not trim, case-fold or otherwise normalise a real value', () => {
    const [doc] = buildViolationDocs(oid, [{ field: 'bloodline', stored_value: '  Malkovians  ', attempted_value: 'MALKOVIANS' }], {});
    expect(doc.stored_value).toBe('  Malkovians  ');
    expect(doc.attempted_value).toBe('MALKOVIANS');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  The route, behaviourally
// ═════════════════════════════════════════════════════════════════════════════

describe.skipIf(!dbAvailable)('#1132 — write_once_violations write path + read route', () => {
  let app;
  const seededIds = [];
  /** Whatever the shared test DB already held in `bloodlines`, restored in afterAll. */
  let bloodlineBackup = [];

  async function seedChar(overrides = {}) {
    const doc = {
      name: 'WOV-1132 Subject',
      retired: false,
      pending_approval: false,
      attributes: {}, skills: {}, disciplines: {}, merits: [], powers: [], ordeals: [],
      ...overrides,
    };
    const result = await getCollection('characters').insertOne(doc);
    seededIds.push(result.insertedId);
    return { ...doc, _id: result.insertedId };
  }

  function put(id, body, user = stUser()) {
    return request(app).put('/api/characters/' + String(id)).set('X-Test-User', user).send(body);
  }

  const rowsFor = id => VIOLATIONS().find({ character_id: id }).sort({ _id: 1 }).toArray();

  beforeAll(async () => {
    await setupDb();
    app = createTestApp();
    // BL-5's referential check on bloodline ACQUISITION reads this collection.
    // An empty collection must not be allowed to answer "no" (BL-5 AC 8), so
    // emptying it here keeps every acquisition below allowed and deterministic.
    bloodlineBackup = await getCollection('bloodlines').find({}).toArray();
    await getCollection('bloodlines').deleteMany({});
  });

  afterAll(async () => {
    // Scoped to THIS suite's own documents only. xp_ledger's code review (Low)
    // caught a cleanup filter that wiped every other suite's rows.
    for (const id of seededIds) {
      await getCollection('characters').deleteOne({ _id: id });
      await VIOLATIONS().deleteMany({ character_id: id });
    }
    await getCollection('bloodlines').deleteMany({});
    if (bloodlineBackup.length) await getCollection('bloodlines').insertMany(bloodlineBackup);
    await teardownDb();
  });

  // ── AC2 — the direct refusal is recorded ──────────────────────────────────

  it('AC2 — a forbidden clan change writes exactly one violation document', async () => {
    const char = await seedChar({ clan: 'Ventrue' });
    const res = await put(char._id, { clan: 'Daeva' });
    expect(res.status).toBe(409);

    const rows = await rowsFor(char._id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      field: 'clan',
      stored_value: 'Ventrue',
      attempted_value: 'Daeva',
      actor: { discord_id: 'test-st-001', discord_name: 'test_st' },
    });
    expect(String(rows[0].character_id)).toBe(String(char._id));
    expect(rows[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);

    // The character document itself is untouched.
    const after = await getCollection('characters').findOne({ _id: char._id });
    expect(after.clan).toBe('Ventrue');
  });

  it('AC2 — a forbidden bloodline change writes exactly one violation document', async () => {
    const char = await seedChar({ clan: 'Mekhet', bloodline: 'Malkovians' });
    const res = await put(char._id, { bloodline: 'Gorgons' });
    expect(res.status).toBe(409);

    const rows = await rowsFor(char._id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      field: 'bloodline', stored_value: 'Malkovians', attempted_value: 'Gorgons',
    });
  });

  it('AC2 — a clearing attempt records the attempted null, not a dropped key', async () => {
    const char = await seedChar({ clan: 'Mekhet', bloodline: 'Malkovians' });
    const res = await put(char._id, { bloodline: null });
    expect(res.status).toBe(409);

    const rows = await rowsFor(char._id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveProperty('attempted_value');
    expect(rows[0].attempted_value).toBeNull();
    expect(rows[0].stored_value).toBe('Malkovians');
  });

  it("AC2 — an empty-string clearing attempt records '' verbatim, not null", async () => {
    // The '' bypass BL-5's hasNoValue predicate closes. The record has to show
    // what was actually attempted, or the audit trail loses the distinction.
    const char = await seedChar({ clan: 'Mekhet', bloodline: 'Malkovians' });
    const res = await put(char._id, { bloodline: '' });
    expect(res.status).toBe(409);

    const rows = await rowsFor(char._id);
    expect(rows).toHaveLength(1);
    expect(rows[0].attempted_value).toBe('');
  });

  // ── AC4 — one document per field, never conflated ─────────────────────────

  it('AC4 — a body forbidding BOTH fields records one document per adjudicated field', async () => {
    // BL-5's direct loop returns on the FIRST refusal (unchanged by this
    // story), and WRITE_ONCE_FIELDS order is ['clan', 'bloodline'] — so clan
    // is the field adjudicated, and exactly one document is written. What must
    // never happen is one document carrying two fields.
    const char = await seedChar({ clan: 'Ventrue', bloodline: 'Malkovians' });
    const res = await put(char._id, { clan: 'Daeva', bloodline: 'Gorgons' });
    expect(res.status).toBe(409);

    const rows = await rowsFor(char._id);
    expect(rows).toHaveLength(1);
    expect(rows[0].field).toBe('clan');
    expect(Array.isArray(rows[0].field)).toBe(false);
  });

  // ── AC5 — the 409 contract is unchanged ───────────────────────────────────

  it('AC5 — the 409 status, error code and message are byte-identical to BL-5', async () => {
    const char = await seedChar({ clan: 'Ventrue' });
    const res = await put(char._id, { clan: 'Daeva' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('WRITE_ONCE_VIOLATION');
    expect(res.body.message).toBe(writeOnceMessage('clan', 'Ventrue', 'Daeva'));
    expect(Object.keys(res.body).sort()).toEqual(['error', 'message']);
  });

  // ── AC6 — a logging failure never changes the response ────────────────────

  it('AC6 — a violation-insert failure still returns the same 409', async () => {
    const char = await seedChar({ clan: 'Ventrue' });
    const spy = vi.spyOn(Collection.prototype, 'insertMany').mockImplementationOnce(() => {
      throw new Error('simulated write_once_violations insert failure');
    });
    const res = await put(char._id, { clan: 'Daeva' });
    spy.mockRestore();

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('WRITE_ONCE_VIOLATION');
    expect(res.body.message).toBe(writeOnceMessage('clan', 'Ventrue', 'Daeva'));
    // The insert genuinely failed — no row exists.
    expect(await rowsFor(char._id)).toHaveLength(0);
  });

  // ── AC3 — the compare-and-set race is recorded ────────────────────────────

  it('AC3 — a lost compare-and-set race records the value that actually landed', async () => {
    // Provoked deterministically rather than by two real requests: the stored
    // value is moved from underneath INSIDE the route's own read-to-write
    // window, which is exactly the condition the race branch exists for.
    const char = await seedChar({});
    const original = Collection.prototype.findOneAndUpdate;
    const spy = vi.spyOn(Collection.prototype, 'findOneAndUpdate')
      .mockImplementationOnce(async function racer(...args) {
        await getCollection('characters').updateOne({ _id: char._id }, { $set: { clan: 'Nosferatu' } });
        return original.apply(this, args);
      });

    const res = await put(char._id, { clan: 'Ventrue' });
    spy.mockRestore();

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('WRITE_ONCE_VIOLATION');
    expect(res.body.message).toBe(writeOnceRaceMessage(['clan']));

    const rows = await rowsFor(char._id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      field: 'clan',
      stored_value: 'Nosferatu',   // what actually landed
      attempted_value: 'Ventrue',  // what this request wanted
      actor: { discord_id: 'test-st-001', discord_name: 'test_st' },
    });
  });

  // ── AC8 — no regression on the allowed paths ──────────────────────────────

  it('AC8 — the load-bearing no-op full-document save writes zero violations', async () => {
    const char = await seedChar({ clan: 'Ventrue', bloodline: 'Malkovians' });
    const res = await put(char._id, { clan: 'Ventrue', bloodline: 'Malkovians', concept: 'Unchanged lineage' });
    expect(res.status).toBe(200);
    expect(await rowsFor(char._id)).toHaveLength(0);
  });

  it('AC8 — a legitimate acquisition writes zero violations', async () => {
    const char = await seedChar({});
    const res = await put(char._id, { clan: 'Gangrel', bloodline: 'Nelapsi' });
    expect(res.status).toBe(200);
    expect(await rowsFor(char._id)).toHaveLength(0);
    const after = await getCollection('characters').findOne({ _id: char._id });
    expect(after.clan).toBe('Gangrel');
  });

  it('AC8 — a save touching neither guarded field writes zero violations', async () => {
    const char = await seedChar({ clan: 'Ventrue' });
    const res = await put(char._id, { concept: 'Something else entirely' });
    expect(res.status).toBe(200);
    expect(await rowsFor(char._id)).toHaveLength(0);
  });

  // ── AC7 — the read surface ────────────────────────────────────────────────

  describe('AC7 — GET /api/write_once_violations', () => {
    let subject;

    beforeAll(async () => {
      subject = await seedChar({ clan: 'Ventrue', bloodline: 'Malkovians' });
      await VIOLATIONS().deleteMany({ character_id: subject._id });
      await put(subject._id, { clan: 'Daeva' });
      await put(subject._id, { bloodline: 'Gorgons' });
      await put(subject._id, { clan: 'Mekhet' });
    });

    it('is ST-only', async () => {
      const res = await request(app).get('/api/write_once_violations').set('X-Test-User', playerUser());
      expect(res.status).toBe(403);
    });

    it('returns rows newest-first', async () => {
      const res = await request(app).get('/api/write_once_violations').set('X-Test-User', stUser());
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const times = res.body.map(r => r.at);
      expect(times).toEqual([...times].sort().reverse());
    });

    it('filters by character_id', async () => {
      const res = await request(app)
        .get('/api/write_once_violations?character_id=' + String(subject._id))
        .set('X-Test-User', stUser());
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(3);
      expect(res.body.every(r => String(r.character_id) === String(subject._id))).toBe(true);
      expect(res.body.map(r => r.field).sort()).toEqual(['bloodline', 'clan', 'clan']);
    });

    it('rejects a malformed character_id with 400', async () => {
      const res = await request(app)
        .get('/api/write_once_violations?character_id=not-an-oid')
        .set('X-Test-User', stUser());
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });

    it('honours an explicit limit', async () => {
      const res = await request(app)
        .get('/api/write_once_violations?character_id=' + String(subject._id) + '&limit=2')
        .set('X-Test-User', stUser());
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });

    it('falls back to the default limit for a non-numeric limit', async () => {
      const res = await request(app)
        .get('/api/write_once_violations?character_id=' + String(subject._id) + '&limit=banana')
        .set('X-Test-User', stUser());
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(3);
    });

    it('caps an absurd limit rather than honouring it', async () => {
      const res = await request(app)
        .get('/api/write_once_violations?limit=100000')
        .set('X-Test-User', stUser());
      expect(res.status).toBe(200);
      expect(res.body.length).toBeLessThanOrEqual(500);
    });

    it('returns documents matching the declared schema shape', async () => {
      const res = await request(app)
        .get('/api/write_once_violations?character_id=' + String(subject._id))
        .set('X-Test-User', stUser());
      const declared = Object.keys(writeOnceViolationSchema.properties);
      for (const row of res.body) {
        expect(Object.keys(row).sort()).toEqual([...declared].sort());
        expect(String(row.character_id)).toMatch(/^[a-f0-9]{24}$/);
      }
    });
  });
});
