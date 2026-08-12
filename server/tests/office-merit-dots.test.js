/**
 * office-merit-dots — minimal ST-editable purchase-state tracking for office
 * merits (e.g. the Enforcer/"Protector" office's Safe Place, Retainer
 * (Hound), Trained Observer suite).
 *
 * Deliberately NOT Epic OXP (still backlog): no accrual, no XP spend, no
 * approval-queue routing, no handover reset logic. Just "what dots does
 * this office's merit suite show right now", settable directly by an ST —
 * scoped this way ahead of Saturday's game per Angelus's explicit call.
 *
 * DB-backed: real MongoDB required. See db-setup.js.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp, stUser, playerUser } from './helpers/test-app.js';
import { setupDb, teardownDb, isDbAvailable } from './helpers/db-setup.js';
import { getCollection } from '../db.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
function readFile(rel) { return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'); }

const dbAvailable = await isDbAvailable();

let app;

beforeAll(async () => {
  if (!dbAvailable) return;
  await setupDb();
  app = createTestApp();
});

beforeEach(async () => {
  if (!dbAvailable) return;
  await getCollection('office_merit_dots').deleteMany({});
});

afterAll(async () => {
  if (!dbAvailable) return;
  await getCollection('office_merit_dots').deleteMany({});
  await teardownDb();
});

describe.skipIf(!dbAvailable)('office-merit-dots — GET /api/office_merit_dots', () => {
  it('returns {} when nothing has ever been set', async () => {
    const res = await request(app).get('/api/office_merit_dots').set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });

  it('reflects a prior PUT, keyed by category then merit name', async () => {
    await request(app).put('/api/office_merit_dots/Enforcer').set('X-Test-User', stUser())
      .send({ merit: 'Safe Place', dots: 2 });

    const res = await request(app).get('/api/office_merit_dots').set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(res.body.Enforcer['Safe Place']).toBe(2);
  });

  it('is readable by a player, not just an ST (reference info, not a secret)', async () => {
    const res = await request(app).get('/api/office_merit_dots')
      .set('X-Test-User', playerUser(['000000000000000000000001']));
    expect(res.status).toBe(200);
  });
});

describe.skipIf(!dbAvailable)('office-merit-dots — PUT /api/office_merit_dots/:category', () => {
  it('ST can set a merit\'s dots', async () => {
    const res = await request(app).put('/api/office_merit_dots/Enforcer').set('X-Test-User', stUser())
      .send({ merit: 'Trained Observer', dots: 3 });
    expect(res.status).toBe(200);
    expect(res.body.dots['Trained Observer']).toBe(3);

    const stored = await getCollection('office_merit_dots').findOne({ _id: 'Enforcer' });
    expect(stored.dots['Trained Observer']).toBe(3);
  });

  it('a second PUT for a different merit in the same category does not clobber the first', async () => {
    await request(app).put('/api/office_merit_dots/Enforcer').set('X-Test-User', stUser())
      .send({ merit: 'Safe Place', dots: 4 });
    await request(app).put('/api/office_merit_dots/Enforcer').set('X-Test-User', stUser())
      .send({ merit: 'Trained Observer', dots: 1 });

    const stored = await getCollection('office_merit_dots').findOne({ _id: 'Enforcer' });
    expect(stored.dots['Safe Place']).toBe(4);
    expect(stored.dots['Trained Observer']).toBe(1);
  });

  it('rejects a player (403)', async () => {
    const res = await request(app).put('/api/office_merit_dots/Enforcer')
      .set('X-Test-User', playerUser(['000000000000000000000001']))
      .send({ merit: 'Safe Place', dots: 2 });
    expect(res.status).toBe(403);
  });

  it('rejects an unknown office category', async () => {
    const res = await request(app).put('/api/office_merit_dots/NotAnOffice').set('X-Test-User', stUser())
      .send({ merit: 'Safe Place', dots: 2 });
    expect(res.status).toBe(400);
  });

  it('rejects a merit that does not belong to the given category', async () => {
    // "Safe Place" is Enforcer's, not Socialite's.
    const res = await request(app).put('/api/office_merit_dots/Socialite').set('X-Test-User', stUser())
      .send({ merit: 'Safe Place', dots: 2 });
    expect(res.status).toBe(400);
  });

  it('enforces the three-dot cap on Trained Observer', async () => {
    const res = await request(app).put('/api/office_merit_dots/Enforcer').set('X-Test-User', stUser())
      .send({ merit: 'Trained Observer', dots: 4 });
    expect(res.status).toBe(400);
  });

  it('enforces the five-dot cap on an ordinary merit', async () => {
    const res = await request(app).put('/api/office_merit_dots/Enforcer').set('X-Test-User', stUser())
      .send({ merit: 'Safe Place', dots: 6 });
    expect(res.status).toBe(400);
  });

  it('rejects a negative value', async () => {
    const res = await request(app).put('/api/office_merit_dots/Enforcer').set('X-Test-User', stUser())
      .send({ merit: 'Safe Place', dots: -1 });
    expect(res.status).toBe(400);
  });

  it('rejects a non-integer value', async () => {
    const res = await request(app).put('/api/office_merit_dots/Enforcer').set('X-Test-User', stUser())
      .send({ merit: 'Safe Place', dots: 2.5 });
    expect(res.status).toBe(400);
  });

  it('allows setting a merit back down to 0', async () => {
    await request(app).put('/api/office_merit_dots/Enforcer').set('X-Test-User', stUser())
      .send({ merit: 'Safe Place', dots: 3 });
    const res = await request(app).put('/api/office_merit_dots/Enforcer').set('X-Test-User', stUser())
      .send({ merit: 'Safe Place', dots: 0 });
    expect(res.status).toBe(200);
    expect(res.body.dots['Safe Place']).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Client wiring — office-tab.js's merit-dot rendering (static-analysis, no
// browser harness in this repo — see issue-873-ecm-6-admin-sidebar.test.js)
// ─────────────────────────────────────────────────────────────────────────────

describe('office-merit-dots — office-tab.js client wiring', () => {
  it('fetches GET /api/office_merit_dots and PUTs via apiPut', () => {
    const src = readFile('public/js/tabs/office-tab.js');
    expect(src).toMatch(/apiGet\(['"]\/api\/office_merit_dots['"]\)/);
    expect(src).toMatch(/apiPut\(`\/api\/office_merit_dots\/\$\{encodeURIComponent\(category\)\}`/);
  });

  it('gates the +/- stepper controls on ST/dev role', () => {
    const src = readFile('public/js/tabs/office-tab.js');
    expect(src).toMatch(/getRole\(\)\s*===\s*['"]st['"]\s*\|\|\s*getRole\(\)\s*===\s*['"]dev['"]/);
  });

  it('reuses existing component classes (cs-step-btn, office-merit-chip) — no inline style attributes', () => {
    const src = readFile('public/js/tabs/office-tab.js');
    expect(src).toMatch(/cs-step-btn/);
    expect(src).toMatch(/office-merit-chip/);
    expect(src).not.toMatch(/style="/);
  });

  it('imports MERIT_DOT_CAPS from office-data.js and applies per-merit caps client-side too', () => {
    const src = readFile('public/js/tabs/office-tab.js');
    expect(src).toMatch(/import\s*\{\s*OFFICE_DATA,\s*MERIT_DOT_CAPS\s*\}\s*from\s*['"]\.\/office-data\.js['"]/);
  });

  it('MERIT_DOT_CAPS caps Trained Observer and Cacophony Savvy at 3, everything else at 5', () => {
    const src = readFile('public/js/tabs/office-data.js');
    expect(src).toMatch(/'Trained Observer':\s*3/);
    expect(src).toMatch(/'Cacophony Savvy':\s*3/);
    expect(src).toMatch(/'Safe Place':\s*5/);
  });
});
