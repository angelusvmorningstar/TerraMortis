/**
 * Unit + integration tests — Cache-Control middleware (issue #255 perf).
 *
 * The middleware factories live at server/middleware/cache-control.js.
 * The integration assertions exercise the same test-app wire-up the
 * other API suites use, so a header-mounting regression in test-app or
 * routes/* surfaces here.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import 'dotenv/config';
import { cacheControl, noCache } from '../middleware/cache-control.js';
import { createTestApp, stUser } from './helpers/test-app.js';
import { setupDb, teardownDb } from './helpers/db-setup.js';

describe('cache-control middleware — unit (#255)', () => {
  it('cacheControl() sets `private, max-age=<seconds>` and Vary: Authorization', async () => {
    const app = express();
    app.use(cacheControl(300));
    app.get('/probe', (req, res) => res.json({ ok: true }));
    const res = await request(app).get('/probe');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('private, max-age=300');
    expect(res.headers['vary']).toBe('Authorization');
  });

  it('cacheControl() defaults to 300 seconds when no arg given', async () => {
    const app = express();
    app.use(cacheControl());
    app.get('/probe', (req, res) => res.json({ ok: true }));
    const res = await request(app).get('/probe');
    expect(res.headers['cache-control']).toBe('private, max-age=300');
  });

  it('cacheControl() honours a custom TTL', async () => {
    const app = express();
    app.use(cacheControl(60));
    app.get('/probe', (req, res) => res.json({ ok: true }));
    const res = await request(app).get('/probe');
    expect(res.headers['cache-control']).toBe('private, max-age=60');
  });

  it('noCache() sets `no-cache, no-store, must-revalidate`', async () => {
    const app = express();
    app.use(noCache());
    app.get('/probe', (req, res) => res.json({ ok: true }));
    const res = await request(app).get('/probe');
    expect(res.headers['cache-control']).toBe('no-cache, no-store, must-revalidate');
  });
});

describe('cache-control wiring — integration via test-app (#255)', () => {
  let app;
  beforeAll(async () => {
    await setupDb();
    app = createTestApp();
  });
  afterAll(async () => {
    await teardownDb();
  });

  it('/api/territories is cacheable (5 minutes)', async () => {
    const res = await request(app).get('/api/territories').set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('private, max-age=300');
    expect(res.headers['vary']).toBe('Authorization');
  });

  it('/api/rules/grant is cacheable (rule docs change rarely)', async () => {
    const res = await request(app).get('/api/rules/grant').set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('private, max-age=300');
  });

  it('/api/rules (purchasable powers) is cacheable', async () => {
    const res = await request(app).get('/api/rules').set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('private, max-age=300');
  });

  it('/api/characters is no-cache (per-role variation + frequent mutation)', async () => {
    const res = await request(app).get('/api/characters').set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-cache, no-store, must-revalidate');
  });

  it('/api/downtime_cycles is no-cache (mutates per-cycle)', async () => {
    const res = await request(app).get('/api/downtime_cycles').set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-cache, no-store, must-revalidate');
  });

  it('/api/downtime_submissions is no-cache (mutates per-cycle, varies by role)', async () => {
    const res = await request(app).get('/api/downtime_submissions').set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-cache, no-store, must-revalidate');
  });

  it('/api/players is no-cache (per-user data)', async () => {
    const res = await request(app).get('/api/players').set('X-Test-User', stUser());
    expect([200, 404]).toContain(res.status);
    expect(res.headers['cache-control']).toBe('no-cache, no-store, must-revalidate');
  });
});
