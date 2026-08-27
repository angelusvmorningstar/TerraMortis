/**
 * issue-1143 AC5 — server/tests/helpers/db-setup.js's isDbAvailable() must
 * catch a failed connection and resolve false, not throw/rethrow. This is
 * what `describe.skipIf(!(await isDbAvailable()))` in a DB-backed suite
 * needs to produce a clean vitest skip instead of the failed-beforeAll +
 * erroring-afterAll double-error the bare setupDb()/teardownDb() pairing
 * produces when MongoDB is unreachable.
 *
 * Deliberately its OWN file, isolated from every other DB-backed suite: it
 * mocks '../db.js' to simulate a connection failure, which would corrupt
 * the real shared connection state (the module-level `db` singleton in
 * server/db.js) if run inside a file that also does real DB work in the
 * same process. vi.resetModules() + vi.doMock() give this file its own
 * module graph for db.js/db-setup.js without touching the real one other
 * suites depend on.
 *
 * This test needs no real MongoDB — it is intentionally NOT DB-backed.
 *
 * `getCollection` mocks below return a minimal fake collection (oxp-10):
 * `setupDb()` now also runs `ensureOfficeContentSeeded()`
 * (`createIndex`/`updateOne` against `office_content`), unconditionally and
 * without a swallowing try/catch around it on purpose (Codex review, oxp-10
 * — a blanket catch there would mask a REAL seeding failure for every other
 * DB-backed suite, not just this file's own synthetic one). This file's own
 * mock completing that surface is the correct fix, not weakening the shared
 * function's contract.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => {
  vi.doUnmock('../db.js');
  vi.resetModules();
});

describe('issue-1143 AC5 — isDbAvailable() clean-skip contract', () => {
  it('resolves false, and does not throw, when the underlying connection fails', async () => {
    vi.resetModules();
    vi.doMock('../db.js', () => ({
      connectDb: vi.fn().mockRejectedValue(new Error('ECONNREFUSED (simulated)')),
      closeDb: vi.fn(),
      getCollection: vi.fn(),
      getDb: vi.fn(() => { throw new Error('Database not connected — call connectDb() first'); }),
    }));

    const { isDbAvailable } = await import('./helpers/db-setup.js');
    await expect(isDbAvailable()).resolves.toBe(false);
  });

  it('resolves true when the underlying connection succeeds (positive control)', async () => {
    vi.resetModules();
    // oxp-10: setupDb() now also runs ensureOfficeContentSeeded() against
    // whatever getCollection('office_content') returns — this fake supports
    // exactly the two calls that function makes (createIndex, updateOne),
    // both resolving immediately, so the positive control still proves what
    // it always did (connectDb succeeds + getDb reports a *_test database
    // -> isDbAvailable() resolves true) without depending on real MongoDB.
    const fakeCollection = { createIndex: vi.fn().mockResolvedValue(undefined), updateOne: vi.fn().mockResolvedValue(undefined) };
    vi.doMock('../db.js', () => ({
      connectDb: vi.fn().mockResolvedValue(undefined),
      closeDb: vi.fn(),
      getCollection: vi.fn(() => fakeCollection),
      getDb: vi.fn(() => ({ databaseName: 'tm_game_test' })),
    }));

    const { isDbAvailable } = await import('./helpers/db-setup.js');
    await expect(isDbAvailable()).resolves.toBe(true);
  });

  it('still rejects when the DB connects but to a non-_test database (safety guard preserved)', async () => {
    vi.resetModules();
    vi.doMock('../db.js', () => ({
      connectDb: vi.fn().mockResolvedValue(undefined),
      closeDb: vi.fn(),
      getCollection: vi.fn(),
      getDb: vi.fn(() => ({ databaseName: 'tm_suite' })), // NOT *_test
    }));

    const { isDbAvailable } = await import('./helpers/db-setup.js');
    // Connecting to a non-test DB under vitest is a hard safety violation,
    // not a "DB unreachable" case — isDbAvailable() still catches it (it
    // wraps the full setupDb() call, guard included) and resolves false
    // rather than letting a live connection to the wrong database through.
    await expect(isDbAvailable()).resolves.toBe(false);
  });
});
