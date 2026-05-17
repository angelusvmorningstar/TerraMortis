/**
 * Read-only audit: report gaps between characters and players collections.
 *
 * Checks:
 *   1. Active characters with no player doc claiming them via character_ids
 *   2. Player docs with an empty or missing character_ids array
 *   3. Player docs whose character_ids reference non-existent characters
 *
 * No writes. Run from server/ directory:
 *   cd server && node scripts/audit-player-records.js
 */

import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';

const client = new MongoClient(process.env.MONGODB_URI);

try {
  await client.connect();
  const db = client.db('tm_suite');

  const chars   = await db.collection('characters').find(
    { retired: { $ne: true } },
    { projection: { _id: 1, name: 1, moniker: 1 } }
  ).toArray();

  const players = await db.collection('players').find({}).toArray();

  const charById = new Map(chars.map(c => [c._id.toString(), c]));

  // Build set of char IDs that are claimed by at least one player
  const claimedCharIds = new Set();
  for (const p of players) {
    for (const id of (p.character_ids || [])) {
      claimedCharIds.add(id.toString());
    }
  }

  // 1. Active characters not claimed by any player
  const unclaimed = chars.filter(c => !claimedCharIds.has(c._id.toString()));

  // 2. Player docs with empty character_ids
  const emptyCharIds = players.filter(p => !(p.character_ids?.length));

  // 3. Player docs referencing non-existent characters
  const staleRefs = [];
  for (const p of players) {
    const missing = (p.character_ids || []).filter(id => !charById.has(id.toString()));
    if (missing.length) staleRefs.push({ player: p, missingIds: missing });
  }

  const displayName = c => c.moniker ? `${c.moniker} (${c.name})` : c.name;

  console.log('\n=== Player Record Audit ===\n');

  console.log(`Active characters: ${chars.length}`);
  console.log(`Player docs:       ${players.length}`);

  console.log('\n--- Unclaimed characters (no player doc references them) ---');
  if (!unclaimed.length) {
    console.log('  None — all active characters are claimed.');
  } else {
    for (const c of unclaimed) {
      console.log(`  ${displayName(c)}  (${c._id})`);
    }
  }

  console.log('\n--- Player docs with empty character_ids ---');
  if (!emptyCharIds.length) {
    console.log('  None — all player docs have at least one character_id.');
  } else {
    for (const p of emptyCharIds) {
      console.log(`  Discord: ${p.discord_id}  Role: ${p.role}  ID: ${p._id}`);
    }
  }

  console.log('\n--- Player docs with stale character_ids (character not found) ---');
  if (!staleRefs.length) {
    console.log('  None — all character_ids resolve to active characters.');
  } else {
    for (const { player: p, missingIds } of staleRefs) {
      console.log(`  Discord: ${p.discord_id}  ID: ${p._id}`);
      for (const id of missingIds) {
        console.log(`    Missing character: ${id}`);
      }
    }
  }

  console.log('\n=== Summary ===');
  console.log(`  Unclaimed characters:       ${unclaimed.length}`);
  console.log(`  Players with no characters: ${emptyCharIds.length}`);
  console.log(`  Players with stale refs:    ${staleRefs.length}`);
  console.log('');

} finally {
  await client.close();
}
