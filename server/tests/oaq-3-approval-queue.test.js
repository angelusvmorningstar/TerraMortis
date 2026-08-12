/**
 * oaq.3 — real behavioural coverage for the new ST approval-queue surface:
 *
 *   AC1 — GET /api/office_actions/pending (ST-only) returns every pending
 *         status_action record, oldest-first, and nothing else.
 *   AC4 — accept()/decline() additively capture WHICH ST resolved a record
 *         (resolved_by / declined_by = req.user.username).
 *   AC5 — a stale accept/decline attempt on an already-resolved record gets
 *         a 409 whose body names who already actioned it.
 *
 * AC2/AC3/AC6/AC7 (list rendering, poll refresh, empty state) are covered
 * by the admin-tab wiring block below via static-analysis assertions,
 * matching this project's own established pattern for admin-app modules
 * (no browser harness — see issue-873-ecm-6-admin-sidebar.test.js's own
 * stated rationale).
 *
 * Follows the pattern established by oaq-2-pending-status-actions.test.js:
 * real Supertest requests against the mounted app + tm_suite_test, prefixed
 * test fixtures, describe.skipIf(!dbAvailable) for a clean skip when MongoDB
 * is unreachable.
 *
 * DB-backed: real MongoDB required. See db-setup.js.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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
function fileExists(rel) { return fs.existsSync(path.join(REPO_ROOT, rel)); }

const dbAvailable = await isDbAvailable();

let app;
const NAME_PREFIX = 'OAQ-3 Probe';

async function cleanup() {
  await getCollection('characters').deleteMany({ name: { $regex: `^${NAME_PREFIX}` } });
  await getCollection('downtime_cycles').deleteMany({ label: { $regex: `^${NAME_PREFIX}` } });
  await getCollection('game_sessions').deleteMany({ title: { $regex: `^${NAME_PREFIX}` } });
  await getCollection('office_actions').deleteMany({ actor_name: { $regex: `^${NAME_PREFIX}` } });
  await getCollection('contested_roll_requests').deleteMany({ actor_name: { $regex: `^${NAME_PREFIX}` } });
  await getCollection('office_action_budgets').deleteMany({});
}

async function seedGameSessionAndCycle() {
  const today = new Date().toISOString().slice(0, 10);
  await getCollection('game_sessions').deleteMany({ session_date: { $lte: today } });
  await getCollection('game_sessions').insertOne({
    title: `${NAME_PREFIX} Session`, session_date: today, game_number: 999,
  });
  await getCollection('downtime_cycles').deleteMany({});
  await getCollection('downtime_cycles').insertOne({
    label: `${NAME_PREFIX} Cycle`, phase: 'game', game_number: 999,
  });
}

async function seedActor({ city = 0, courtCategory = 'Head of State' } = {}) {
  const { insertedId } = await getCollection('characters').insertOne({
    name: `${NAME_PREFIX} Actor ${Date.now()}_${Math.random()}`,
    court_category: courtCategory, status: { city }, retired: false,
  });
  return insertedId;
}

async function seedTargets(count, startingCity = 1) {
  const docs = Array.from({ length: count }, (_, i) => ({
    name: `${NAME_PREFIX} Target ${Date.now()}_${i}_${Math.random()}`,
    status: { city: startingCity }, retired: false,
  }));
  const result = await getCollection('characters').insertMany(docs);
  return Object.values(result.insertedIds);
}

async function submit(actorId, targetId, actionType, userHeader = stUser()) {
  return request(app).post('/api/office_actions').set('X-Test-User', userHeader).send({
    game_session_id: 'irrelevant', actor_id: String(actorId), target_id: String(targetId), action_type: actionType,
  });
}

beforeAll(async () => {
  if (!dbAvailable) return;
  await setupDb();
  app = createTestApp();
  await cleanup();
  await getCollection('contested_roll_requests').createIndex(
    { game_session_id: 1, actor_id: 1, target_id: 1 },
    { unique: true, partialFilterExpression: { request_type: 'status_action', status: 'pending' } },
  );
});

afterAll(async () => {
  if (!dbAvailable) return;
  await cleanup();
  await teardownDb();
});

describe.skipIf(!dbAvailable)('oaq.3 AC1 — GET /api/office_actions/pending', () => {
  it('returns only pending status_action records, oldest-first', async () => {
    await seedGameSessionAndCycle();
    const actorId = await seedActor({ city: 3 });
    const [target1, target2] = await seedTargets(2, 3);

    const first = await submit(actorId, target1, 'raise');
    expect(first.status).toBe(201);
    const second = await submit(actorId, target2, 'lower');
    expect(second.status).toBe(201);

    const res = await request(app).get('/api/office_actions/pending').set('X-Test-User', stUser());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const ours = res.body.filter(r => r.actor_name?.startsWith(NAME_PREFIX));
    expect(ours.length).toBe(2);
    expect(ours.every(r => r.request_type === 'status_action' && r.status === 'pending')).toBe(true);
    // oldest-first
    expect(new Date(ours[0].created_at).getTime()).toBeLessThanOrEqual(new Date(ours[1].created_at).getTime());
  });

  it('does not include resolved or declined records', async () => {
    await seedGameSessionAndCycle();
    const actorId = await seedActor({ city: 3 });
    const [targetId] = await seedTargets(1, 3);

    const submitRes = await submit(actorId, targetId, 'raise');
    const requestId = submitRes.body.request._id;
    await request(app).put(`/api/office_actions/${requestId}/accept`).set('X-Test-User', stUser());

    const res = await request(app).get('/api/office_actions/pending').set('X-Test-User', stUser());
    const ours = res.body.filter(r => r.actor_id === String(actorId));
    expect(ours.length).toBe(0);
  });

  it('REGRESSION (external review): excludes a pending record of a DIFFERENT request_type (a real contested_roll), not just resolved/declined status_actions', async () => {
    await seedGameSessionAndCycle();
    const actorId = await seedActor({ city: 3 });
    const [targetId] = await seedTargets(1, 3);

    // A genuine contested_roll pending doc — shares the collection but is a
    // different request family entirely.
    await getCollection('contested_roll_requests').insertOne({
      request_type: 'contested_roll', status: 'pending', outcome: null,
      challenger_character_id: '000000000000000000000001',
      challenger_character_name: `${NAME_PREFIX} Challenger`,
      target_character_id: '000000000000000000000002',
      target_character_name: `${NAME_PREFIX} Target`,
      roll_type: 'custom', challenger_pool: 3, defender_pool: 3,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    });

    const submitRes = await submit(actorId, targetId, 'raise');
    expect(submitRes.status).toBe(201);

    const res = await request(app).get('/api/office_actions/pending').set('X-Test-User', stUser());
    const contestedRolls = res.body.filter(r => r.request_type === 'contested_roll');
    expect(contestedRolls.length, 'GET /pending must never surface a non-status_action pending record').toBe(0);
  });

  it('is ST-role gated (403 for a player)', async () => {
    const res = await request(app).get('/api/office_actions/pending')
      .set('X-Test-User', playerUser(['000000000000000000000001']));
    expect(res.status).toBe(403);
  });
});

describe.skipIf(!dbAvailable)('oaq.3 AC4/AC5 — resolved_by/declined_by capture', () => {
  it('accept() records resolved_by = the accepting ST\'s username', async () => {
    await seedGameSessionAndCycle();
    const actorId = await seedActor({ city: 3 });
    const [targetId] = await seedTargets(1, 3);

    const submitRes = await submit(actorId, targetId, 'raise');
    const requestId = submitRes.body.request._id;

    const acceptRes = await request(app).put(`/api/office_actions/${requestId}/accept`).set('X-Test-User', stUser());
    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.request.resolved_by).toBe('test_st');

    const stored = await getCollection('contested_roll_requests').findOne({ actor_id: String(actorId) });
    expect(stored.resolved_by).toBe('test_st');
  });

  it('decline() records declined_by = the declining ST\'s username', async () => {
    await seedGameSessionAndCycle();
    const actorId = await seedActor({ city: 3 });
    const [targetId] = await seedTargets(1, 3);

    const submitRes = await submit(actorId, targetId, 'raise');
    const requestId = submitRes.body.request._id;

    const declineRes = await request(app).put(`/api/office_actions/${requestId}/decline`).set('X-Test-User', stUser());
    expect(declineRes.status).toBe(200);

    const stored = await getCollection('contested_roll_requests').findOne({ actor_id: String(actorId) });
    expect(stored.declined_by).toBe('test_st');
  });

  it('a stale accept attempt on an already-accepted record 409s naming who resolved it', async () => {
    await seedGameSessionAndCycle();
    const actorId = await seedActor({ city: 3 });
    const [targetId] = await seedTargets(1, 3);

    const submitRes = await submit(actorId, targetId, 'raise');
    const requestId = submitRes.body.request._id;
    await request(app).put(`/api/office_actions/${requestId}/accept`).set('X-Test-User', stUser());

    const staleAccept = await request(app).put(`/api/office_actions/${requestId}/accept`).set('X-Test-User', stUser());
    expect(staleAccept.status).toBe(409);
    expect(staleAccept.body.message).toMatch(/test_st/);
  });

  it('a stale decline attempt on an already-declined record 409s naming who declined it', async () => {
    await seedGameSessionAndCycle();
    const actorId = await seedActor({ city: 3 });
    const [targetId] = await seedTargets(1, 3);

    const submitRes = await submit(actorId, targetId, 'raise');
    const requestId = submitRes.body.request._id;
    await request(app).put(`/api/office_actions/${requestId}/decline`).set('X-Test-User', stUser());

    const staleDecline = await request(app).put(`/api/office_actions/${requestId}/decline`).set('X-Test-User', stUser());
    expect(staleDecline.status).toBe(409);
    expect(staleDecline.body.message).toMatch(/test_st/);
  });

  it('REGRESSION (external review): a TRUE concurrent accept race — the loser\'s 409 still names who resolved it', async () => {
    // _findPending's enrichment only covers a SEQUENTIAL stale attempt (the
    // prior test). Two requests racing via Promise.all both pass
    // _findPending's initial read before either commits, so the loser falls
    // through to the accept transaction's own inner conflict branch —
    // exactly the path this regression covers.
    await seedGameSessionAndCycle();
    const actorId = await seedActor({ city: 3 });
    const [targetId] = await seedTargets(1, 3);

    const submitRes = await submit(actorId, targetId, 'raise');
    const requestId = submitRes.body.request._id;

    const [r1, r2] = await Promise.all([
      request(app).put(`/api/office_actions/${requestId}/accept`).set('X-Test-User', stUser()),
      request(app).put(`/api/office_actions/${requestId}/accept`).set('X-Test-User', stUser()),
    ]);
    const loser = r1.status === 409 ? r1 : r2;
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    expect(loser.body.resolved_by, 'the loser\'s 409 must name who actually won, even under a true race').toBe('test_st');
    expect(loser.body.message).toMatch(/test_st/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Client wiring — admin sidebar, view module, dispatch (static-analysis, no
// browser harness in this repo — see issue-873-ecm-6-admin-sidebar.test.js)
// ─────────────────────────────────────────────────────────────────────────────

describe('oaq.3 — admin sidebar wires Approval Queue domain', () => {
  it('admin.html declares the sidebar button with data-domain="office-approvals"', () => {
    const src = readFile('public/admin.html');
    expect(src).toMatch(/data-domain="office-approvals"[^>]*>\s*Approval Queue/);
  });

  it('admin.html declares the domain section with id="d-office-approvals"', () => {
    const src = readFile('public/admin.html');
    expect(src).toMatch(/<section\s+id="d-office-approvals"\s+class="domain"/);
    expect(src).toMatch(/id="office-approvals-content"/);
  });

  it('admin.js imports initOfficeApprovals', () => {
    const src = readFile('public/js/admin.js');
    expect(src).toMatch(/import\s+\{\s*initOfficeApprovals\s*\}\s+from\s+['"]\.\/admin\/office-approvals\.js['"]/);
  });

  it('admin.js dispatches the office-approvals domain in switchDomain', () => {
    const src = readFile('public/js/admin.js');
    expect(src).toMatch(/domain\s*===\s*['"]office-approvals['"]\s*\)\s*initOfficeApprovals/);
  });
});

describe('oaq.3 — view module file shape', () => {
  it('public/js/admin/office-approvals.js exists', () => {
    expect(fileExists('public/js/admin/office-approvals.js')).toBe(true);
  });

  it('exports initOfficeApprovals', () => {
    const src = readFile('public/js/admin/office-approvals.js');
    expect(src).toMatch(/export\s+async\s+function\s+initOfficeApprovals\b/);
  });

  it('fetches GET /api/office_actions/pending and calls accept/decline via apiRaw (needs the full response body, not just a thrown message, to redact resolved_by/declined_by)', () => {
    const src = readFile('public/js/admin/office-approvals.js');
    expect(src).toMatch(/apiGet\(['"]\/api\/office_actions\/pending['"]\)/);
    expect(src).toMatch(/apiRaw\('PUT',\s*`\/api\/office_actions\/\$\{requestId\}\/\$\{action\}`/);
  });

  it('polls every 10 seconds, mirroring challenge-notification.js\'s POLL_MS', () => {
    const src = readFile('public/js/admin/office-approvals.js');
    expect(src).toMatch(/POLL_MS\s*=\s*10_000/);
    expect(src).toMatch(/setInterval\(/);
  });

  it('uses a single delegated listener, not per-render addEventListener (project convention)', () => {
    const src = readFile('public/js/admin/office-approvals.js');
    const addListenerCalls = src.match(/addEventListener\(/g) || [];
    expect(addListenerCalls.length, 'exactly one delegated root listener, no per-row handlers').toBe(1);
  });

  it('renders an empty state when there is nothing pending', () => {
    const src = readFile('public/js/admin/office-approvals.js');
    expect(src).toMatch(/Nothing pending/);
  });

  it('reuses existing component classes (dt-btn, or-list, derived-note) — no inline style attributes', () => {
    const src = readFile('public/js/admin/office-approvals.js');
    expect(src).toMatch(/dt-btn dt-btn-gold/);
    expect(src).toMatch(/dt-btn dt-btn-danger/);
    expect(src).toMatch(/or-list-item/);
    expect(src).not.toMatch(/style="/);
  });

  it('REGRESSION (external review): redacts actor/target character names and the acting ST\'s username for the privacy-redacted dev role', () => {
    const src = readFile('public/js/admin/office-approvals.js');
    expect(src).toMatch(/import\s*\{[^}]*redactCharName[^}]*\}\s*from\s*['"]\.\.\/data\/helpers\.js['"]/);
    expect(src).toMatch(/import\s*\{[^}]*redactPlayer[^}]*\}\s*from\s*['"]\.\.\/data\/helpers\.js['"]/);
    expect(src).toMatch(/redactCharName\(r\.actor_name/);
    expect(src).toMatch(/redactCharName\(r\.target_name/);
    expect(src).toMatch(/redactPlayer\(by\)/);
  });

  it('REGRESSION (external review): a failed fetch never renders as an empty queue, and a stale poll response cannot resurrect a just-resolved row', () => {
    const src = readFile('public/js/admin/office-approvals.js');
    expect(src).toMatch(/fetchFailed/);
    expect(src).toMatch(/_fetchGen/);
    expect(src).toMatch(/gen\s*!==\s*_fetchGen/);
  });
});
