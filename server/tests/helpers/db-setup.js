/**
 * Test DB setup/teardown — connects to real MongoDB for integration tests.
 */

import { connectDb, closeDb, getCollection, getDb } from '../../db.js';

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
}

export async function teardownDb() {
  // No-op — closing mid-run causes failures when test files share a process.
  // The connection closes naturally when the process exits.
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
