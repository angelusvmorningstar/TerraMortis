/**
 * One-shot migration: convert prereq nodes from
 *   { type: 'merit', name: 'Status', qualifier: '...' }
 * to
 *   { type: 'status', qualifier: '...' }
 * and from
 *   { type: 'not', name: 'Status', qualifier: '...' }
 * to
 *   { type: 'not_status', qualifier: '...' }
 *
 * Run: cd server && node scripts/migrate-status-prereqs.js
 */

import 'dotenv/config';
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI not set.');
  process.exit(1);
}
console.log(`Using URI: ${MONGODB_URI.replace(/\/\/[^@]+@/, '//***@')}`);

/** Recursively walk a prereq tree and mutate status nodes in place. */
function migrateNode(node) {
  if (!node) return false;
  let changed = false;

  if (node.all) { for (const n of node.all) { if (migrateNode(n)) changed = true; } return changed; }
  if (node.any) { for (const n of node.any) { if (migrateNode(n)) changed = true; } return changed; }

  // merit Status → status
  if (node.type === 'merit' && node.name === 'Status' && node.qualifier) {
    node.type = 'status';
    delete node.name;
    return true;
  }

  // not Status → not_status
  if (node.type === 'not' && node.name === 'Status' && node.qualifier) {
    node.type = 'not_status';
    delete node.name;
    return true;
  }

  return false;
}

const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
try {
  await client.connect();
  const col = client.db('tm_suite').collection('purchasable_powers');

  // Find all docs with a prereq containing "Status"
  const docs = await col.find({ prereq: { $ne: null } }).toArray();

  let updated = 0;
  for (const doc of docs) {
    if (migrateNode(doc.prereq)) {
      await col.updateOne({ _id: doc._id }, { $set: { prereq: doc.prereq } });
      updated++;
      console.log(`  migrated: ${doc.key} (${doc.category})`);
    }
  }

  console.log(`\nDone. ${updated} document(s) updated out of ${docs.length} with prereqs.`);
} finally {
  await client.close();
}
