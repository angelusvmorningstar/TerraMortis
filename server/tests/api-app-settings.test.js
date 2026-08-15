/**
 * API tests — /api/settings (Epic STM, issue #378; extended gdx.5, #986)
 *
 * Covers AC#1..#4 from specs/stories/issue-378-stm-3-app-settings-and-override.story.md:
 *   - GET auto-seeds the global doc on first call (AC#1)
 *   - PATCH flips a whitelisted key and stamps updated_at/updated_by (AC#2)
 *   - PATCH rejects unknown keys with 400 (AC#3)
 *   - Both routes 401 unauthenticated (AC#4)
 *
 * gdx.5 (specs/stories/gdx-5-game-in-progress-setting.md) additions:
 *   - game_in_progress key: default false, PATCH-settable, player-readable via GET
 *   - GET opened to any authenticated role (was ST-only) — flips the old
 *     '403 on GET as player' assertion to 200
 *   - broadcastSettingsUpdate fires on a successful PATCH, not on a rejected one
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';
import * as wsModule from '../ws.js';

let app;
let broadcastSpy;

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
  // Drop any prior test residue so the AC#1 "auto-seed on first call"
  // assertion is meaningful across runs.
  await getCollection('app_settings').deleteOne({ _id: 'global' });
  // gdx.5: spy on the broadcast so we can assert the calls. No-op when
  // _wss is null (test app doesn't attach a WS server) — the spy replaces
  // the no-op with a tracking shim that still no-ops. Same precedent as
  // stm-9-ws-broadcast.test.js's own broadcastStModUpdate spy.
  broadcastSpy = vi.spyOn(wsModule, 'broadcastSettingsUpdate');
});

afterAll(async () => {
  await getCollection('app_settings').deleteOne({ _id: 'global' });
  broadcastSpy.mockRestore();
  await teardownDb();
});

// ── Auth (AC#4) ──────────────────────────────────────────────────────

describe('AC#4 — auth', () => {
  it('401 on GET /api/settings without auth', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(401);
  });
  it('401 on PATCH /api/settings without auth', async () => {
    const res = await request(app).patch('/api/settings').send({ st_mods_enabled: false });
    expect(res.status).toBe(401);
  });
  it('200 on GET as player (gdx.5 — opened so any authenticated role can read the flag)', async () => {
    // Review finding: the cleanup below must run even if the assertion
    // throws, or a failed run leaves the doc seeded and the later
    // "first GET creates the global doc" test's own doc-absent
    // precondition breaks for every subsequent run in this file.
    try {
      const res = await request(app).get('/api/settings').set('X-Test-User', playerUser());
      expect(res.status).toBe(200);
    } finally {
      // This GET can auto-seed the doc (AC#1's own route behaviour) where a
      // player-role GET never reached the handler before gdx.5. Clean up so
      // the later "first GET creates the global doc" test's own
      // doc-absent precondition still holds for this file's own declared
      // (fixed) execution order.
      await getCollection('app_settings').deleteOne({ _id: 'global' });
    }
  });
  it('403 on PATCH as player', async () => {
    const res = await request(app).patch('/api/settings')
      .set('X-Test-User', playerUser())
      .send({ st_mods_enabled: false });
    expect(res.status).toBe(403);
  });
});

// ── GET seed (AC#1) ──────────────────────────────────────────────────

describe('AC#1 — GET auto-seeds the global doc on first call', () => {
  it('first GET creates the global doc with defaults', async () => {
    // Pre-condition: doc absent (beforeAll deletes)
    const pre = await getCollection('app_settings').findOne({ _id: 'global' });
    expect(pre).toBeNull();

    const res = await request(app).get('/api/settings').set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(res.body._id).toBe('global');
    expect(res.body.st_mods_enabled).toBe(true);
    expect(res.body.game_in_progress).toBe(false); // gdx.5 AC1: defaults false
    expect(typeof res.body.updated_at).toBe('string');
    expect(res.body.updated_by).toBeNull();
  });

  it('subsequent GETs are idempotent — same doc, no new insert', async () => {
    const before = await getCollection('app_settings').findOne({ _id: 'global' });
    const res = await request(app).get('/api/settings').set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    const after = await getCollection('app_settings').findOne({ _id: 'global' });
    expect(after.updated_at).toBe(before.updated_at);
    expect(await getCollection('app_settings').countDocuments({ _id: 'global' })).toBe(1);
  });

  it('review finding: GET backfills a missing key on a legacy/partial doc without writing it back', async () => {
    // Simulates a doc that predates game_in_progress (or one upserted by a
    // PATCH that only ever $set its own key) — no game_in_progress field
    // at all, not even a stored `false`.
    await getCollection('app_settings').deleteOne({ _id: 'global' });
    try {
      await getCollection('app_settings').insertOne({
        _id: 'global',
        st_mods_enabled: false,
        updated_at: '2026-01-01T00:00:00.000Z',
        updated_by: null,
      });

      const res = await request(app).get('/api/settings').set('X-Test-User', stUser());
      expect(res.status).toBe(200);
      expect(res.body.game_in_progress).toBe(false); // backfilled in the response...
      expect(res.body.st_mods_enabled).toBe(false);   // ...real stored values still win
      expect(res.body.updated_at).toBe('2026-01-01T00:00:00.000Z'); // audit fields never backfilled

      // ...but the backfill is response-only — the stored doc itself is untouched.
      const stored = await getCollection('app_settings').findOne({ _id: 'global' });
      expect('game_in_progress' in stored).toBe(false);
    } finally {
      // Reset for later tests
      await getCollection('app_settings').deleteOne({ _id: 'global' });
    }
  });
});

// ── PATCH (AC#2, AC#3) ────────────────────────────────────────────────

describe('AC#2 — PATCH flips the value and stamps audit fields', () => {
  it('flips st_mods_enabled and reflects on subsequent GET', async () => {
    const patchRes = await request(app).patch('/api/settings')
      .set('X-Test-User', stUser())
      .send({ st_mods_enabled: false });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.st_mods_enabled).toBe(false);
    expect(patchRes.body.updated_by).toMatchObject({ discord_id: 'test-st-001' });
    expect(typeof patchRes.body.updated_at).toBe('string');

    const getRes = await request(app).get('/api/settings').set('X-Test-User', stUser());
    expect(getRes.status).toBe(200);
    expect(getRes.body.st_mods_enabled).toBe(false);

    // Reset for next test
    await request(app).patch('/api/settings')
      .set('X-Test-User', stUser())
      .send({ st_mods_enabled: true });
  });
});

describe('gdx.5 AC1 — PATCH flips game_in_progress and reflects on subsequent GET', () => {
  it('flips game_in_progress and reflects on subsequent GET (player-readable)', async () => {
    // Review finding: the reset below must run even if an assertion above
    // throws, or game_in_progress: true leaks into every later test in
    // this file until afterAll's own full deleteOne.
    try {
      const patchRes = await request(app).patch('/api/settings')
        .set('X-Test-User', stUser())
        .send({ game_in_progress: true });
      expect(patchRes.status).toBe(200);
      expect(patchRes.body.game_in_progress).toBe(true);

      const getRes = await request(app).get('/api/settings').set('X-Test-User', playerUser());
      expect(getRes.status).toBe(200);
      expect(getRes.body.game_in_progress).toBe(true);
    } finally {
      // Reset for next test
      await request(app).patch('/api/settings')
        .set('X-Test-User', stUser())
        .send({ game_in_progress: false });
    }
  });

  it('400 on type mismatch (boolean expected)', async () => {
    const res = await request(app).patch('/api/settings')
      .set('X-Test-User', stUser())
      .send({ game_in_progress: 'yes' });
    expect(res.status).toBe(400);
    expect(res.body.key).toBe('game_in_progress');
  });

  it('403 on PATCH game_in_progress as player — writes stay ST-only', async () => {
    const res = await request(app).patch('/api/settings')
      .set('X-Test-User', playerUser())
      .send({ game_in_progress: true });
    expect(res.status).toBe(403);
  });
});

describe('gdx.5 AC3/AC4 — broadcastSettingsUpdate fires on a successful PATCH only', () => {
  it('emits broadcastSettingsUpdate() on a successful PATCH', async () => {
    broadcastSpy.mockClear();
    const res = await request(app).patch('/api/settings')
      .set('X-Test-User', stUser())
      .send({ st_mods_enabled: true }); // no-op value change, still a successful write
    expect(res.status).toBe(200);
    expect(broadcastSpy).toHaveBeenCalledTimes(1);
    expect(broadcastSpy).toHaveBeenCalledWith();
  });

  it('does NOT emit on a rejected PATCH (unknown key)', async () => {
    broadcastSpy.mockClear();
    const res = await request(app).patch('/api/settings')
      .set('X-Test-User', stUser())
      .send({ not_a_real_key: true });
    expect(res.status).toBe(400);
    expect(broadcastSpy).not.toHaveBeenCalled();
  });

  it('does NOT emit on a rejected PATCH (type mismatch)', async () => {
    broadcastSpy.mockClear();
    const res = await request(app).patch('/api/settings')
      .set('X-Test-User', stUser())
      .send({ st_mods_enabled: 'yes' });
    expect(res.status).toBe(400);
    expect(broadcastSpy).not.toHaveBeenCalled();
  });
});

describe('AC#3 — PATCH whitelist rejects unknown keys', () => {
  it('400 with key name on unknown key', async () => {
    const res = await request(app).patch('/api/settings')
      .set('X-Test-User', stUser())
      .send({ foo: 'bar' });
    expect(res.status).toBe(400);
    expect(res.body.key).toBe('foo');
  });
  it('400 on type mismatch (boolean expected)', async () => {
    const res = await request(app).patch('/api/settings')
      .set('X-Test-User', stUser())
      .send({ st_mods_enabled: 'yes' });
    expect(res.status).toBe(400);
    expect(res.body.key).toBe('st_mods_enabled');
  });
  it('400 on empty body', async () => {
    const res = await request(app).patch('/api/settings')
      .set('X-Test-User', stUser())
      .send({});
    expect(res.status).toBe(400);
  });
});
