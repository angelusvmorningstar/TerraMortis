/**
 * API tests — /api/st_mods + /api/st_mod_audit (Epic STM, issue #358)
 *
 * Covers AC#1..#8 from specs/stories/issue-358-stm-1-backend-st-mods.story.md.
 * In place of the literal curl smoke (AC#8): the create → list → revoke →
 * audit-survives sequence runs as the first test in this file, top to bottom,
 * so its output is the smoke artefact.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { ObjectId } from 'mongodb';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;
const CHAR_ID = new ObjectId().toHexString();
const CREATED_MOD_IDS = [];
const CREATED_AUDIT_IDS = [];

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
  // Clean any prior test residue for this character (idempotent across runs).
  await getCollection('st_mods').deleteMany({ character_id: CHAR_ID });
  await getCollection('st_mod_audit').deleteMany({ character_id: CHAR_ID });
});

afterAll(async () => {
  if (CREATED_MOD_IDS.length) {
    await getCollection('st_mods').deleteMany({
      _id: { $in: CREATED_MOD_IDS.map(id => new ObjectId(id)) },
    });
  }
  if (CREATED_AUDIT_IDS.length) {
    await getCollection('st_mod_audit').deleteMany({
      _id: { $in: CREATED_AUDIT_IDS.map(id => new ObjectId(id)) },
    });
  }
  // Also clear any audit rows tied to the test character — these survive
  // mod deletion by design (AC#5) so the _id-based cleanup above misses them
  // when the test under "audit survives revoke" already deleted the mod.
  await getCollection('st_mod_audit').deleteMany({ character_id: CHAR_ID });
  await teardownDb();
});

// ── End-to-end smoke (AC#8) ──────────────────────────────────────────

describe('AC#8 — end-to-end smoke (create → list → revoke → audit survives)', () => {
  it('walks the full lifecycle', async () => {
    // 1. CREATE
    const createRes = await request(app)
      .post('/api/st_mods')
      .set('X-Test-User', stUser())
      .send({
        character_id: CHAR_ID,
        stat_path: 'attributes.Strength.dots',
        delta: 1,
        reason: 'Smoke-test grant',
        show_reason_to_player: true,
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body._id).toBeTruthy();
    expect(createRes.body.delta).toBe(1);
    expect(createRes.body.stat_path).toBe('attributes.Strength.dots');
    expect(createRes.body.show_reason_to_player).toBe(true);
    expect(createRes.body.created_by).toMatchObject({ discord_id: 'test-st-001' });
    const modId = createRes.body._id;
    CREATED_MOD_IDS.push(modId);

    // 2. LIST (active mods for the character)
    const listRes = await request(app)
      .get(`/api/st_mods?character_id=${CHAR_ID}`)
      .set('X-Test-User', stUser());
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body.find(m => String(m._id) === String(modId))).toBeTruthy();

    // 3. REVOKE (hard-delete)
    const delRes = await request(app)
      .delete(`/api/st_mods/${modId}`)
      .set('X-Test-User', stUser());
    expect(delRes.status).toBe(200);
    expect(delRes.body).toEqual({ deleted: true });

    // 4. CONFIRM gone from st_mods
    const listAfter = await request(app)
      .get(`/api/st_mods?character_id=${CHAR_ID}`)
      .set('X-Test-User', stUser());
    expect(listAfter.status).toBe(200);
    expect(listAfter.body.find(m => String(m._id) === String(modId))).toBeUndefined();

    // 5. AUDIT SURVIVES (AC#5, AC#6)
    const auditRes = await request(app)
      .get(`/api/st_mod_audit?character_id=${CHAR_ID}`)
      .set('X-Test-User', stUser());
    expect(auditRes.status).toBe(200);
    const auditRow = auditRes.body.find(a => String(a.st_mod_id) === String(modId));
    expect(auditRow).toBeTruthy();
    expect(auditRow.stat_path).toBe('attributes.Strength.dots');
    expect(auditRow.delta).toBe(1);
    expect(auditRow.reason).toBe('Smoke-test grant');
    // AC#2: audit row shape = mod minus show_reason_to_player
    expect(auditRow.show_reason_to_player).toBeUndefined();
    CREATED_AUDIT_IDS.push(auditRow._id);
  });
});

// ── Auth (AC#7) ──────────────────────────────────────────────────────

describe('AC#7 — authentication', () => {
  it('401 on GET /api/st_mods without auth', async () => {
    const res = await request(app).get(`/api/st_mods?character_id=${CHAR_ID}`);
    expect(res.status).toBe(401);
  });
  it('401 on POST /api/st_mods without auth', async () => {
    const res = await request(app).post('/api/st_mods').send({});
    expect(res.status).toBe(401);
  });
  it('401 on DELETE /api/st_mods/:id without auth', async () => {
    const res = await request(app).delete(`/api/st_mods/${new ObjectId().toHexString()}`);
    expect(res.status).toBe(401);
  });
  it('401 on GET /api/st_mod_audit without auth', async () => {
    const res = await request(app).get(`/api/st_mod_audit?character_id=${CHAR_ID}`);
    expect(res.status).toBe(401);
  });

  it('403 to non-ST callers (player) on POST', async () => {
    const res = await request(app)
      .post('/api/st_mods')
      .set('X-Test-User', playerUser([CHAR_ID]))
      .send({ character_id: CHAR_ID, stat_path: 'attributes.Wits.dots', delta: 1, reason: 'x' });
    expect(res.status).toBe(403);
  });
  it('403 to non-ST callers (player) on GET', async () => {
    const res = await request(app)
      .get(`/api/st_mods?character_id=${CHAR_ID}`)
      .set('X-Test-User', playerUser([CHAR_ID]));
    expect(res.status).toBe(403);
  });
});

// ── Validation (AC#3) ────────────────────────────────────────────────

describe('AC#3 — input validation', () => {
  it('400 when delta is non-integer (float)', async () => {
    const res = await request(app).post('/api/st_mods').set('X-Test-User', stUser()).send({
      character_id: CHAR_ID, stat_path: 'attributes.Wits.dots', delta: 1.5, reason: 'x',
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/delta must be integer/);
  });
  it('400 when delta is string', async () => {
    const res = await request(app).post('/api/st_mods').set('X-Test-User', stUser()).send({
      character_id: CHAR_ID, stat_path: 'attributes.Wits.dots', delta: '1', reason: 'x',
    });
    expect(res.status).toBe(400);
  });
  it('400 when delta is null', async () => {
    const res = await request(app).post('/api/st_mods').set('X-Test-User', stUser()).send({
      character_id: CHAR_ID, stat_path: 'attributes.Wits.dots', delta: null, reason: 'x',
    });
    expect(res.status).toBe(400);
  });
  it('400 when reason is empty', async () => {
    const res = await request(app).post('/api/st_mods').set('X-Test-User', stUser()).send({
      character_id: CHAR_ID, stat_path: 'attributes.Wits.dots', delta: 1, reason: '',
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/reason is required/);
  });
  it('400 when reason is whitespace only', async () => {
    const res = await request(app).post('/api/st_mods').set('X-Test-User', stUser()).send({
      character_id: CHAR_ID, stat_path: 'attributes.Wits.dots', delta: 1, reason: '   ',
    });
    expect(res.status).toBe(400);
  });
  it('400 when stat_path is off-whitelist', async () => {
    const res = await request(app).post('/api/st_mods').set('X-Test-User', stUser()).send({
      character_id: CHAR_ID, stat_path: 'bogus.field.path', delta: 1, reason: 'x',
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid stat_path/);
  });
  it('accepts merits[N].dots regex path', async () => {
    const res = await request(app).post('/api/st_mods').set('X-Test-User', stUser()).send({
      character_id: CHAR_ID, stat_path: 'merits.3.dots', delta: 1, reason: 'merit dot grant',
    });
    expect(res.status).toBe(201);
    CREATED_MOD_IDS.push(res.body._id);
  });
  it('accepts disciplines[N].dots regex path', async () => {
    const res = await request(app).post('/api/st_mods').set('X-Test-User', stUser()).send({
      character_id: CHAR_ID, stat_path: 'disciplines.0.dots', delta: 1, reason: 'discipline dot',
    });
    expect(res.status).toBe(201);
    CREATED_MOD_IDS.push(res.body._id);
  });

  // STM-2 (issue #372): five current.* paths re-added to STATIC_WHITELIST.
  // Pre-STM-2 these returned 400 (per the STM-1 comment block); they must
  // now return 201. Cover one to assert the wiring; the path-resolve
  // sanity check covers exhaustive resolution.
  it.each([
    'current.damage_bashing',
    'current.damage_lethal',
    'current.damage_aggravated',
    'current.willpower',
    'current.vitae',
  ])('accepts current.* path: %s', async (statPath) => {
    const res = await request(app).post('/api/st_mods').set('X-Test-User', stUser()).send({
      character_id: CHAR_ID, stat_path: statPath, delta: -1, reason: 'STM-2 whitelist re-add',
    });
    expect(res.status).toBe(201);
    expect(res.body.stat_path).toBe(statPath);
    CREATED_MOD_IDS.push(res.body._id);
  });
  it('rejects merits.X.dots where X is not numeric', async () => {
    const res = await request(app).post('/api/st_mods').set('X-Test-User', stUser()).send({
      character_id: CHAR_ID, stat_path: 'merits.foo.dots', delta: 1, reason: 'x',
    });
    expect(res.status).toBe(400);
  });
});

// ── Ordering (AC#4) ──────────────────────────────────────────────────

describe('AC#4 — GET returns mods ordered by created_at ascending', () => {
  it('returns mods in creation order', async () => {
    const orderChar = new ObjectId().toHexString();
    const a = await request(app).post('/api/st_mods').set('X-Test-User', stUser()).send({
      character_id: orderChar, stat_path: 'derived.defence', delta: 1, reason: 'first',
    });
    // Force a measurable created_at gap — the route stamps ISO strings with
    // millisecond precision; same-tick inserts can tie.
    await new Promise(r => setTimeout(r, 5));
    const b = await request(app).post('/api/st_mods').set('X-Test-User', stUser()).send({
      character_id: orderChar, stat_path: 'derived.defence', delta: -1, reason: 'second',
    });
    CREATED_MOD_IDS.push(a.body._id, b.body._id);

    const list = await request(app)
      .get(`/api/st_mods?character_id=${orderChar}`)
      .set('X-Test-User', stUser());
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(2);
    expect(list.body[0].reason).toBe('first');
    expect(list.body[1].reason).toBe('second');

    // Cleanup
    await getCollection('st_mods').deleteMany({ character_id: orderChar });
    await getCollection('st_mod_audit').deleteMany({ character_id: orderChar });
  });
});

// ── Persistence shape (AC#1, AC#2) ───────────────────────────────────

describe('AC#1, AC#2 — collection shapes', () => {
  it('persists the documented mod shape', async () => {
    const res = await request(app).post('/api/st_mods').set('X-Test-User', stUser()).send({
      character_id: CHAR_ID,
      stat_path: 'skills.Animal Ken.dots',
      delta: 2,
      reason: 'Shape check',
      show_reason_to_player: false,
    });
    expect(res.status).toBe(201);
    CREATED_MOD_IDS.push(res.body._id);

    const stored = await getCollection('st_mods').findOne({ _id: new ObjectId(res.body._id) });
    expect(stored).toMatchObject({
      character_id: CHAR_ID,
      stat_path: 'skills.Animal Ken.dots',
      delta: 2,
      reason: 'Shape check',
      show_reason_to_player: false,
      created_by: { discord_id: 'test-st-001' },
    });
    expect(typeof stored.created_at).toBe('string');

    // Audit row written in the same request (AC#2)
    const auditRow = await getCollection('st_mod_audit').findOne({
      st_mod_id: stored._id,
    });
    expect(auditRow).toBeTruthy();
    expect(auditRow.show_reason_to_player).toBeUndefined();
    expect(auditRow.reason).toBe('Shape check');
    expect(auditRow.character_id).toBe(CHAR_ID);
    CREATED_AUDIT_IDS.push(auditRow._id);
  });
});

// ── DELETE 404 (defensive) ───────────────────────────────────────────

describe('DELETE /:id edge cases', () => {
  it('404 on unknown id', async () => {
    const res = await request(app)
      .delete(`/api/st_mods/${new ObjectId().toHexString()}`)
      .set('X-Test-User', stUser());
    expect(res.status).toBe(404);
  });
  it('400 on invalid id format', async () => {
    const res = await request(app)
      .delete('/api/st_mods/not-an-objectid')
      .set('X-Test-User', stUser());
    expect(res.status).toBe(400);
  });
});
