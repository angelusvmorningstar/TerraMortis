/**
 * API tests — /api/settings (Epic STM, issue #378)
 *
 * Covers AC#1..#4 from specs/stories/issue-378-stm-3-app-settings-and-override.story.md:
 *   - GET auto-seeds the global doc on first call (AC#1)
 *   - PATCH flips a whitelisted key and stamps updated_at/updated_by (AC#2)
 *   - PATCH rejects unknown keys with 400 (AC#3)
 *   - Both routes 401 unauthenticated (AC#4)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';
import { getCollection } from '../db.js';

let app;

beforeAll(async () => {
  await setupDb();
  app = createTestApp();
  // Drop any prior test residue so the AC#1 "auto-seed on first call"
  // assertion is meaningful across runs.
  await getCollection('app_settings').deleteOne({ _id: 'global' });
});

afterAll(async () => {
  await getCollection('app_settings').deleteOne({ _id: 'global' });
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
  it('403 on GET as player', async () => {
    const res = await request(app).get('/api/settings').set('X-Test-User', playerUser());
    expect(res.status).toBe(403);
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
