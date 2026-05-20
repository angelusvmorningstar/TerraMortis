/**
 * STM-10 (issue #434) — lifecycle backend.
 *
 * ADR-004 Rev 4 §D15-D20: persistent toggleable mods. Covers:
 *   - active:true default on create + 'created' audit event
 *   - PATCH activate/deactivate → flag flip + audit event + WS op
 *   - overlay skips inactive mods (active !== false)
 *   - DELETE tombstone-before-destroy (HALT-DAR LOAD-BEARING merge gate)
 *   - DELETE rollback when tombstone insert fails → mod survives
 *   - backwards-compat audit read: pre-Rev4 row without `event` reads 'created'
 *   - WS op set: create / activate / deactivate / delete ('revoke' retired)
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { ObjectId } from 'mongodb';
import { createTestApp, stUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';
import * as dbModule from '../db.js';
import * as wsModule from '../ws.js';

let app;
const CHAR_ID = new ObjectId().toHexString();
const CREATED_IDS = [];
let broadcastSpy;

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
  await getCollection('st_mods').deleteMany({ character_id: CHAR_ID });
  await getCollection('st_mod_audit').deleteMany({ character_id: CHAR_ID });
  broadcastSpy = vi.spyOn(wsModule, 'broadcastStModUpdate');
});

afterAll(async () => {
  await getCollection('st_mods').deleteMany({ character_id: CHAR_ID });
  await getCollection('st_mod_audit').deleteMany({ character_id: CHAR_ID });
  broadcastSpy.mockRestore();
  await teardownDb();
});

async function createMod(stat_path = 'attributes.Presence.dots', delta = 1) {
  const res = await request(app).post('/api/st_mods').set('X-Test-User', stUser()).send({
    character_id: CHAR_ID, stat_path, delta, reason: 'lifecycle test', show_reason_to_player: false,
  });
  expect(res.status).toBe(201);
  CREATED_IDS.push(res.body._id);
  return res.body;
}

// ── create: active default + 'created' event ────────────────────────

describe('STM-10 — POST sets active:true + writes created event', () => {
  it('mod doc has active:true', async () => {
    const mod = await createMod();
    expect(mod.active).toBe(true);
  });

  it('audit row has event:created with canonical by/at and no legacy aliases', async () => {
    const mod = await createMod();
    const auditRow = await getCollection('st_mod_audit').findOne({ st_mod_id: new ObjectId(mod._id), event: 'created' });
    expect(auditRow).toBeTruthy();
    expect(auditRow.event).toBe('created');
    expect(auditRow.by).toMatchObject({ discord_id: 'test-st-001' });
    expect(typeof auditRow.at).toBe('string');
    // STM-11 (issue #439) closed the dual-stamp transition window: new rows
    // write canonical by/at ONLY. The STM-6 reader was migrated to coalesce
    // legacy created_by/created_at, so the write-side aliases are gone.
    expect(auditRow.created_by).toBeUndefined();
    expect(auditRow.created_at).toBeUndefined();
  });

  it('POST broadcasts create op', async () => {
    broadcastSpy.mockClear();
    const mod = await createMod();
    expect(broadcastSpy).toHaveBeenCalledWith(CHAR_ID, 'create', String(mod._id));
  });
});

// ── PATCH: activate / deactivate ────────────────────────────────────

describe('STM-10 — PATCH toggles active + writes lifecycle event + WS op', () => {
  it('PATCH { active: false } → mod inactive + deactivated audit + deactivate broadcast', async () => {
    const mod = await createMod();
    broadcastSpy.mockClear();
    const res = await request(app)
      .patch(`/api/st_mods/${mod._id}`)
      .set('X-Test-User', stUser())
      .send({ active: false });
    expect(res.status).toBe(200);
    expect(res.body.active).toBe(false);

    const stored = await getCollection('st_mods').findOne({ _id: new ObjectId(mod._id) });
    expect(stored.active).toBe(false);

    const auditRow = await getCollection('st_mod_audit').findOne({ st_mod_id: new ObjectId(mod._id), event: 'deactivated' });
    expect(auditRow).toBeTruthy();
    expect(auditRow.delta).toBe(1);     // captured at the event
    expect(auditRow.reason).toBe('lifecycle test');

    expect(broadcastSpy).toHaveBeenCalledWith(CHAR_ID, 'deactivate', String(mod._id));
  });

  it('PATCH { active: true } on a deactivated mod → reactivated + activated audit + activate broadcast', async () => {
    const mod = await createMod();
    await request(app).patch(`/api/st_mods/${mod._id}`).set('X-Test-User', stUser()).send({ active: false });
    broadcastSpy.mockClear();
    const res = await request(app)
      .patch(`/api/st_mods/${mod._id}`)
      .set('X-Test-User', stUser())
      .send({ active: true });
    expect(res.status).toBe(200);
    expect(res.body.active).toBe(true);

    const auditRow = await getCollection('st_mod_audit').findOne({ st_mod_id: new ObjectId(mod._id), event: 'activated' });
    expect(auditRow).toBeTruthy();
    expect(broadcastSpy).toHaveBeenCalledWith(CHAR_ID, 'activate', String(mod._id));
  });

  it('PATCH 400 on non-boolean active', async () => {
    const mod = await createMod();
    const res = await request(app).patch(`/api/st_mods/${mod._id}`).set('X-Test-User', stUser()).send({ active: 'yes' });
    expect(res.status).toBe(400);
  });

  it('PATCH 404 on unknown id', async () => {
    const res = await request(app).patch(`/api/st_mods/${new ObjectId().toHexString()}`).set('X-Test-User', stUser()).send({ active: false });
    expect(res.status).toBe(404);
  });
});

// ── Overlay skips inactive (client-side filter, asserted via shape) ──

describe('STM-10 — GET returns all mods (active + inactive)', () => {
  it('single GET returns both active and inactive mods', async () => {
    const charB = new ObjectId().toHexString();
    const m1 = await request(app).post('/api/st_mods').set('X-Test-User', stUser()).send({
      character_id: charB, stat_path: 'attributes.Wits.dots', delta: 1, reason: 'a',
    });
    const m2 = await request(app).post('/api/st_mods').set('X-Test-User', stUser()).send({
      character_id: charB, stat_path: 'attributes.Wits.bonus', delta: 1, reason: 'b',
    });
    await request(app).patch(`/api/st_mods/${m2.body._id}`).set('X-Test-User', stUser()).send({ active: false });

    const res = await request(app).get(`/api/st_mods?character_id=${charB}`).set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    const byId = Object.fromEntries(res.body.map(m => [String(m._id), m]));
    expect(byId[String(m1.body._id)].active).toBe(true);
    expect(byId[String(m2.body._id)].active).toBe(false);

    await getCollection('st_mods').deleteMany({ character_id: charB });
    await getCollection('st_mod_audit').deleteMany({ character_id: charB });
  });
});

// ── DELETE tombstone-before-destroy (HALT-DAR merge gate) ───────────

describe('STM-10 — DELETE tombstone-before-destroy (HALT-DAR LOAD-BEARING)', () => {
  it('tombstone audit row SURVIVES the permanent delete of the mod doc', async () => {
    const mod = await createMod();
    broadcastSpy.mockClear();

    const delRes = await request(app).delete(`/api/st_mods/${mod._id}`).set('X-Test-User', stUser());
    expect(delRes.status).toBe(200);

    // Mod doc is gone
    const modDoc = await getCollection('st_mods').findOne({ _id: new ObjectId(mod._id) });
    expect(modDoc).toBeNull();

    // Tombstone survives — THE merge gate
    const tombstone = await getCollection('st_mod_audit').findOne({ st_mod_id: new ObjectId(mod._id), event: 'deleted' });
    expect(tombstone).toBeTruthy();
    expect(tombstone.event).toBe('deleted');
    expect(tombstone.stat_path).toBe('attributes.Presence.dots');
    expect(tombstone.delta).toBe(1);

    // The 'created' audit row also survives (full lifecycle ledger intact)
    const created = await getCollection('st_mod_audit').findOne({ st_mod_id: new ObjectId(mod._id), event: 'created' });
    expect(created).toBeTruthy();

    // 'delete' op broadcast (not the retired 'revoke')
    expect(broadcastSpy).toHaveBeenCalledWith(CHAR_ID, 'delete', String(mod._id));
  });

  it('rollback: when tombstone insert fails, the mod doc is NOT deleted', async () => {
    const mod = await createMod();

    // getCollection returns a fresh Collection per call, so spying a single
    // instance won't catch the route's call. Spy getCollection itself and
    // return a Proxy that rejects st_mod_audit.insertOne once, delegating
    // everything else to the real collection.
    let failNextAuditInsert = true;
    const realGet = dbModule.getCollection;
    const gcSpy = vi.spyOn(dbModule, 'getCollection').mockImplementation((name) => {
      const coll = realGet(name);
      if (name !== 'st_mod_audit') return coll;
      return new Proxy(coll, {
        get(target, prop) {
          if (prop === 'insertOne' && failNextAuditInsert) {
            failNextAuditInsert = false;
            return () => Promise.reject(new Error('simulated tombstone failure'));
          }
          const v = target[prop];
          return typeof v === 'function' ? v.bind(target) : v;
        },
      });
    });

    const delRes = await request(app).delete(`/api/st_mods/${mod._id}`).set('X-Test-User', stUser());
    expect(delRes.status).toBe(500);

    gcSpy.mockRestore();

    // The mod doc MUST still exist — destroy never proceeded
    const modDoc = await getCollection('st_mods').findOne({ _id: new ObjectId(mod._id) });
    expect(modDoc).toBeTruthy();
    expect(modDoc.active).toBe(true);

    // No tombstone was written (the insert was rejected)
    const tombstone = await getCollection('st_mod_audit').findOne({ st_mod_id: new ObjectId(mod._id), event: 'deleted' });
    expect(tombstone).toBeNull();
  });

  it('DELETE 404 on unknown id (no tombstone written)', async () => {
    const fakeId = new ObjectId().toHexString();
    const res = await request(app).delete(`/api/st_mods/${fakeId}`).set('X-Test-User', stUser());
    expect(res.status).toBe(404);
    const tombstone = await getCollection('st_mod_audit').findOne({ st_mod_id: new ObjectId(fakeId), event: 'deleted' });
    expect(tombstone).toBeNull();
  });
});

// ── Backwards-compat: pre-Rev4 audit row without `event` ────────────

describe('STM-10 — backwards-compat audit read (event ?? created)', () => {
  it('audit GET surfaces a pre-Rev4 row (no event field) as event:created', async () => {
    const charC = new ObjectId().toHexString();
    // Insert a legacy-shaped audit row directly (no `event` field) —
    // mimics a pre-Rev4 STM-1 creation row.
    const legacyMod = new ObjectId();
    await getCollection('st_mods').insertOne({
      _id: legacyMod, character_id: charC, stat_path: 'attributes.Resolve.dots',
      delta: 1, reason: 'legacy', created_by: { discord_id: 'x', discord_name: 'Legacy ST' },
      created_at: new Date().toISOString(),
      // note: no `active` field — pre-Rev4 doc
    });
    await getCollection('st_mod_audit').insertOne({
      st_mod_id: legacyMod, character_id: charC, stat_path: 'attributes.Resolve.dots',
      delta: 1, reason: 'legacy', created_by: { discord_id: 'x', discord_name: 'Legacy ST' },
      created_at: new Date().toISOString(),
      // note: no `event` field
    });

    const res = await request(app).get(`/api/st_mod_audit?character_id=${charC}`).set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    const row = res.body.rows.find(r => String(r.st_mod_id) === String(legacyMod));
    expect(row).toBeTruthy();
    expect(row.event).toBe('created');   // defaulted from missing field

    await getCollection('st_mods').deleteMany({ character_id: charC });
    await getCollection('st_mod_audit').deleteMany({ character_id: charC });
  });

  it('legacy mod with no active field still composes into overlay (active !== false)', async () => {
    // The overlay filter is client-side (applyStMods); this asserts the
    // server returns the legacy doc so the client can include it.
    const charD = new ObjectId().toHexString();
    const legacyMod = new ObjectId();
    await getCollection('st_mods').insertOne({
      _id: legacyMod, character_id: charD, stat_path: 'attributes.Stamina.dots',
      delta: 2, reason: 'legacy active', created_at: new Date().toISOString(),
      // no `active` field
    });
    const res = await request(app).get(`/api/st_mods?character_id=${charD}`).set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].active).toBeUndefined();   // missing → client treats as active

    await getCollection('st_mods').deleteMany({ character_id: charD });
  });
});
