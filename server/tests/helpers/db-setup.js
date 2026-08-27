/**
 * Test DB setup/teardown — connects to real MongoDB for integration tests.
 */

import { connectDb, closeDb, getCollection, getDb } from '../../db.js';
import { ensureOfficeContentIndexes } from '../../lib/office-content-index.js';
import { OFFICE_DATA, MERIT_DOT_CAPS, buildSeedDocs } from '../../scripts/seed-office-content.js';

export async function setupDb() {
  try {
    await connectDb(); // No-op if already connected (idempotent)
  } catch (err) {
    console.error('[setupDb] connectDb() failed:', err.message);
    throw err;
  }

  // Belt-and-braces: catches the case where a connection was already
  // established (by earlier-running code) before setup-env.js's override
  // took effect. connectDb()'s own guard only fires on the connection that
  // creates `db`; this re-checks whatever connection setupDb() ends up with.
  const dbName = getDb().databaseName;
  if (!dbName.endsWith('_test')) {
    throw new Error(
      `Refusing test run: connected database '${dbName}' does not end with '_test'. ` +
        `Tests must use a *_test database — check tests/helpers/setup-env.js ordering.`
    );
  }

  // Non-fatal: a small number of DB-adjacent suites mock '../db.js' with a
  // minimal surface (connectDb/getDb only, e.g. issue-1143-db-setup-skip.test.js's
  // own positive control) that has no working getCollection(). Letting a
  // seeding failure abort setupDb() itself would fail EVERY DB-backed suite
  // over a concern most of them never touch; a suite that actually needs
  // office_content and doesn't have it will fail its own specific assertion
  // instead, which is a clearer signal than an opaque setupDb() rejection.
  try {
    await ensureOfficeContentSeeded();
  } catch (err) {
    console.error('[setupDb] office_content auto-seed failed (non-fatal):', err.message);
  }
}

/**
 * oxp.10: every office-purchase route (`office-merit-dots.js`,
 * `office-manoeuvre-rank.js`, `office-purchase.js`) now resolves a seat's
 * office rules by READING the `office_content` collection, not a static
 * import — so any DB-backed suite that PUTs against a real office category
 * needs real documents there, the same way `getTestCharacterIds` auto-seeds
 * minimal characters above. Upserted (not deleted-then-inserted) and keyed on
 * the real natural keys, so this is safe to call from every test file's
 * `setupDb()` without one file's call racing or clobbering another's.
 */
async function ensureOfficeContentSeeded() {
  const col = getCollection('office_content');
  await ensureOfficeContentIndexes(col);
  const docs = buildSeedDocs({ officeData: OFFICE_DATA, meritCaps: MERIT_DOT_CAPS, now: '2026-08-27T00:00:00.000Z' });
  await Promise.all(docs.map(doc => {
    const filter = doc.kind === 'office' ? { kind: 'office', category: doc.category } : { kind: 'merit_caps' };
    return col.updateOne(filter, { $setOnInsert: doc }, { upsert: true });
  }));
}

export async function teardownDb() {
  // No-op — closing mid-run causes failures when test files share a process.
  // The connection closes naturally when the process exits.
}

/**
 * issue-1143 (AC5): non-throwing connectivity probe, for suites that want a
 * clean vitest skip rather than a failed beforeAll + a second erroring
 * afterAll cleanup. setupDb() itself keeps its existing throw-on-failure
 * contract unchanged (other suites already depend on that shape) — this is
 * a separate, additive helper. Usage:
 *
 *   const dbAvailable = await isDbAvailable();
 *   describe.skipIf(!dbAvailable)('suite name', () => {
 *     beforeAll(async () => { await setupDb(); ... });
 *     ...
 *   });
 *
 * The top-level `await` works because vitest test files are ESM modules.
 */
export async function isDbAvailable() {
  try {
    await setupDb();
    return true;
  } catch {
    return false;
  }
}

/**
 * Get a few character IDs for testing player filtering.
 *
 * Against tm_suite_test (the default under vitest), the characters collection
 * is usually empty. Auto-seed minimal stub characters when we don't have
 * enough, so tests that just need "some valid character IDs" work without
 * every test file having to roll its own fixtures.
 */
export async function getTestCharacterIds(count = 2) {
  const col = getCollection('characters');
  let chars = await col
    .find({ retired: { $ne: true } })
    .limit(count)
    .project({ _id: 1, name: 1 })
    .toArray();

  if (chars.length < count) {
    const need = count - chars.length;
    const stubs = Array.from({ length: need }, (_, i) => ({
      name: `Test Character ${Date.now()}_${i}`,
      retired: false,
      _test_seeded: true,
    }));
    const result = await col.insertMany(stubs);
    const seededIds = Object.values(result.insertedIds);
    const seededDocs = await col
      .find({ _id: { $in: seededIds } })
      .project({ _id: 1, name: 1 })
      .toArray();
    chars = [...chars, ...seededDocs];
  }

  return chars.map(c => ({ id: c._id.toString(), name: c.name }));
}
