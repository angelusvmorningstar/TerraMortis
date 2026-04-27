#!/usr/bin/env node
// Delete all downtime_cycles whose label contains "test" (case-insensitive).
// Also flags any submissions tied to those cycles so they don't end up orphaned.
//
// Usage:
//   node server/scripts/purge-test-cycles.js            # dry-run (default)
//   node server/scripts/purge-test-cycles.js --apply    # actually delete

import { MongoClient } from 'mongodb';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI not set. Ensure .env exists in the project root or server/ directory.');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');

async function run() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db('tm_suite');
  const cycles = db.collection('downtime_cycles');
  const submissions = db.collection('downtime_submissions');

  const all = await cycles.find({}, { projection: { _id: 1, label: 1, status: 1, created_at: 1 } }).toArray();
  console.log(`Total cycles in tm_suite.downtime_cycles: ${all.length}`);
  all.forEach(c => console.log(`  [${c.status || '?'}] ${c.label || '(no label)'} — ${c._id}`));

  const toDelete = all.filter(c => /test/i.test(c.label || ''));
  if (!toDelete.length) {
    console.log('\nNo cycles with "test" in label — nothing to purge.');
    await client.close();
    return;
  }

  const ids = toDelete.map(c => c._id);
  const orphanCount = await submissions.countDocuments({ cycle_id: { $in: ids } });
  const orphanCountStr = await submissions.countDocuments({ cycle_id: { $in: ids.map(String) } });
  const totalOrphans = orphanCount + orphanCountStr;

  console.log(`\nWould delete ${toDelete.length} cycle(s):`);
  toDelete.forEach(c => console.log(`  → ${c.label || '(no label)'}  (status: ${c.status || '?'}, _id: ${c._id})`));

  if (totalOrphans > 0) {
    console.log(`\n⚠ WARNING: ${totalOrphans} submission(s) reference these cycles and will be orphaned.`);
    console.log('  Review tm_suite.downtime_submissions before applying. To clean those too, extend');
    console.log('  this script with a submissions deleteMany on the same cycle_id set.');
  } else {
    console.log('\n✓ No submissions reference these cycles.');
  }

  if (!APPLY) {
    console.log('\n[dry-run] Re-run with --apply to delete.');
    await client.close();
    return;
  }

  console.log('\nDeleting…');
  const result = await cycles.deleteMany({ _id: { $in: ids } });
  console.log(`Deleted ${result.deletedCount} cycle(s).`);
  await client.close();
}

run().catch(err => { console.error(err); process.exit(1); });
