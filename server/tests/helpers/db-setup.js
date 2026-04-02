/**
 * Test DB setup/teardown — connects to real MongoDB for integration tests.
 */

import { connectDb, closeDb, getCollection } from '../../db.js';

export async function setupDb() {
  await connectDb();
}

export async function teardownDb() {
  await closeDb();
}

/** Get a few character IDs for testing player filtering */
export async function getTestCharacterIds(count = 2) {
  const chars = await getCollection('characters')
    .find({ retired: { $ne: true } })
    .limit(count)
    .project({ _id: 1, name: 1 })
    .toArray();
  return chars.map(c => ({ id: c._id.toString(), name: c.name }));
}
