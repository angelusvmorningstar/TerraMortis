/**
 * OATH-B (issue #1111, ADR-010 D6 / D7) — the exit log and the forfeiture
 * schedule, through the API.
 *
 * A fixture proves the CODE wrote a field. It does not prove the schema and
 * the PUT allowlist let it through — which is the whole D8 lesson, and how
 * the five oath rows came to exist while failing their own validator. So
 * AC3's `chapter_number` and AC9's forfeiture params are asserted on the
 * PERSISTED DOCUMENT, fetched back after a round-trip.
 *
 * DB-backed: skips wholesale when MongoDB is unreachable. Runs against
 * `tm_suite_test` (setup-env.js hard-overrides MONGODB_DB and db.js refuses
 * any non-`_test` name under vitest), so it needs no production write.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp, stUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;
const RULE_KEY = 'oath-b-roundtrip-probe';
const CHAR_NAME = 'OATH-B Round Trip Probe';
let charId;

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
  await getCollection('purchasable_powers').deleteMany({ key: RULE_KEY });
  await getCollection('characters').deleteMany({ name: CHAR_NAME });
});

afterAll(async () => {
  await getCollection('purchasable_powers').deleteMany({ key: RULE_KEY });
  await getCollection('characters').deleteMany({ name: CHAR_NAME });
  await teardownDb();
});

// ─────────────────────────────────────────────────────────────────────────────
// AC9 / AC10 — the forfeiture schedule, through POST and PUT
// ─────────────────────────────────────────────────────────────────────────────

describe('OATH-B AC9 — the forfeiture schedule is reachable through the API', () => {
  it('POST accepts the default variant with both parameters', async () => {
    const res = await request(app).post('/api/rules').set('X-Test-User', stUser()).send({
      key: RULE_KEY,
      name: 'Oath Of The Round Trip',
      category: 'merit',
      cost_model: 'swear_by',
      forfeiture: { type: 'chapter_span_then_monthly', chapters: 2, restore_per_month: 1 },
    });
    expect(res.status).toBe(201);
    expect(res.body.forfeiture).toEqual({
      type: 'chapter_span_then_monthly', chapters: 2, restore_per_month: 1,
    });
  });

  it('the parameters are PERSISTED, not merely echoed', async () => {
    // Nothing reads either yet — they are restoration parameters. That is
    // acceptable only because they are declared, valid and ST-editable.
    const doc = await getCollection('purchasable_powers').findOne({ key: RULE_KEY });
    expect(doc.forfeiture.chapters).toBe(2);
    expect(doc.forfeiture.restore_per_month).toBe(1);
  });

  it('PUT lets an ST edit them through the allowlist', async () => {
    const res = await request(app).put('/api/rules/' + RULE_KEY).set('X-Test-User', stUser())
      .send({ forfeiture: { type: 'chapter_span_then_monthly', chapters: 4, restore_per_month: 2 } });
    expect(res.status).toBe(200);
    const doc = await getCollection('purchasable_powers').findOne({ key: RULE_KEY });
    expect(doc.forfeiture.chapters).toBe(4);
  });

  it('AC10 — POST REJECTS the session variant', async () => {
    // Its whole content is "this ends at the end of the session"; with
    // restoration deferred nothing ends it, so accepting it would let an ST
    // author a suspension that never terminates. Refused at the schema so it
    // cannot be seeded around.
    const res = await request(app).post('/api/rules').set('X-Test-User', stUser()).send({
      key: RULE_KEY + '-session',
      name: 'Oath Of The Session',
      category: 'merit',
      forfeiture: { type: 'session', sessions: 1 },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('REJECTS an unknown forfeiture type', async () => {
    const res = await request(app).post('/api/rules').set('X-Test-User', stUser()).send({
      key: RULE_KEY + '-bad',
      name: 'Oath Of The Unknown',
      category: 'merit',
      forfeiture: { type: 'some_future_schedule' },
    });
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC3 — chapter_number on the PERSISTED event
// ─────────────────────────────────────────────────────────────────────────────

describe('OATH-B AC3 — the exit log survives persistence with chapter_number', () => {
  const REASONS = ['broken', 'abandoned', 'released_by_liege', 'fulfilled', 'st_void'];

  it('a character carrying a full exit + restore log round-trips whole', async () => {
    const res = await request(app).post('/api/characters').set('X-Test-User', stUser()).send({
      name: CHAR_NAME,
      covenant: 'Invictus',
      merits: [
        { category: 'general', name: 'Resources', cp: 4 },
        {
          category: 'general', name: 'Oath Of The Round Trip', cp: 0,
          sworn_by: {
            dots_required: 3,
            attachments: [{ name: 'Resources', qualifier: null, dots: 3 }],
            sworn_at: { chapter_number: 1, iso: '2026-08-07' },
            history: [
              { event: 'exited', reason: 'broken', chapter_number: 4, at: '2026-08-07' },
              { event: 'restored', dots: 1, chapter_number: 6, at: '2026-09-07' },
            ],
          },
        },
      ],
    });
    expect(res.status).toBe(201);
    charId = res.body._id;

    // Fetched back from the collection, not read off the response body.
    const doc = await getCollection('characters').findOne({ name: CHAR_NAME });
    const oath = doc.merits.find(m => m.sworn_by);
    expect(oath.sworn_by.history).toHaveLength(2);
    expect(oath.sworn_by.history[0]).toMatchObject({
      event: 'exited', reason: 'broken', chapter_number: 4,
    });
    expect(oath.sworn_by.history[1]).toMatchObject({
      event: 'restored', dots: 1, chapter_number: 6,
    });
  });

  for (const reason of REASONS) {
    it(`an exit event with reason '${reason}' persists with its chapter_number`, async () => {
      const name = CHAR_NAME + ' ' + reason;
      const res = await request(app).post('/api/characters').set('X-Test-User', stUser()).send({
        name,
        merits: [{
          category: 'general', name: 'Oath Of The Round Trip', cp: 0,
          sworn_by: {
            dots_required: 1,
            attachments: [{ name: 'Resources', qualifier: null, dots: 1 }],
            history: [{ event: 'exited', reason, chapter_number: 9, at: '2026-08-07' }],
          },
        }],
      });
      expect(res.status).toBe(201);
      const doc = await getCollection('characters').findOne({ name });
      expect(doc.merits[0].sworn_by.history[0].chapter_number).toBe(9);
      await getCollection('characters').deleteMany({ name });
    });
  }

  it('AC11 — a null chapter_number persists rather than being dropped', async () => {
    // Null is the honest record when no chapter context was loaded. It must
    // survive as null: an absent key and a null value are different, and the
    // deferred restoration work needs to tell them apart.
    const name = CHAR_NAME + ' null-chapter';
    const res = await request(app).post('/api/characters').set('X-Test-User', stUser()).send({
      name,
      merits: [{
        category: 'general', name: 'Oath Of The Round Trip', cp: 0,
        sworn_by: {
          dots_required: 1,
          attachments: [{ name: 'Resources', qualifier: null, dots: 1 }],
          history: [{ event: 'exited', reason: 'broken', chapter_number: null, at: '2026-08-07' }],
        },
      }],
    });
    expect(res.status).toBe(201);
    const doc = await getCollection('characters').findOne({ name });
    expect(doc.merits[0].sworn_by.history[0]).toHaveProperty('chapter_number');
    expect(doc.merits[0].sworn_by.history[0].chapter_number).toBeNull();
    await getCollection('characters').deleteMany({ name });
  });

  it('REJECTS an exit event with an unknown reason', async () => {
    const res = await request(app).post('/api/characters').set('X-Test-User', stUser()).send({
      name: CHAR_NAME + ' bad-reason',
      merits: [{
        category: 'general', name: 'Oath Of The Round Trip', cp: 0,
        sworn_by: {
          dots_required: 1,
          attachments: [{ name: 'Resources', qualifier: null, dots: 1 }],
          history: [{ event: 'exited', reason: 'ghosted', chapter_number: 1 }],
        },
      }],
    });
    expect(res.status).toBe(400);
  });

  it('REJECTS an exit event with chapter_number absent entirely', async () => {
    // Required-but-nullable. Absent is the shape that loses the anchor
    // silently, so the schema refuses it outright.
    const res = await request(app).post('/api/characters').set('X-Test-User', stUser()).send({
      name: CHAR_NAME + ' no-chapter',
      merits: [{
        category: 'general', name: 'Oath Of The Round Trip', cp: 0,
        sworn_by: {
          dots_required: 1,
          attachments: [{ name: 'Resources', qualifier: null, dots: 1 }],
          history: [{ event: 'exited', reason: 'broken', at: '2026-08-07' }],
        },
      }],
    });
    expect(res.status).toBe(400);
  });

  it('_suspended_dots is NOT accepted by the character schema', async () => {
    // It is transient and derived. If it could persist, a stale value would
    // survive a reload and suspend dots no live history justifies.
    const res = await request(app).post('/api/characters').set('X-Test-User', stUser()).send({
      name: CHAR_NAME + ' transient',
      merits: [{ category: 'general', name: 'Resources', cp: 4, _suspended_dots: 3 }],
    });
    expect(res.status).toBe(400);
  });
});
