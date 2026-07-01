#!/usr/bin/env node
// READ-ONLY: analyse the 240 downtime_submissions inserts in the oplog.
// Are submissions being re-imported (purge + reinsert)? Do the inserted docs
// carry st_narrative, or does each re-import wipe ST story work?
// Usage: cd server && node scripts/investigate-submission-inserts.js

import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI not set.'); process.exit(1); }
const DT3_CYCLE_ID = '69e955c784bbfc821bed2810';

function tsToISO(ts) {
  const secs = ts?.getHighBits ? ts.getHighBits() : (ts?.high ?? 0);
  return new Date(secs * 1000).toISOString();
}
function dayBucket(iso) { return iso.slice(0, 13); } // yyyy-mm-ddTHH

async function run() {
  const c = new MongoClient(MONGODB_URI);
  await c.connect();
  const db = c.db('tm_suite');

  // Live DT3 submission ids
  const live = await db.collection('downtime_submissions')
    .find({ cycle_id: new ObjectId(DT3_CYCLE_ID) }, { projection: { _id: 1 } }).toArray();
  const liveIds = new Set(live.map(s => String(s._id)));

  const oplog = c.db('local').collection('oplog.rs');
  const cursor = oplog.find({ ns: 'tm_suite.downtime_submissions' }).sort({ $natural: 1 });

  let inserts = 0, deletes = 0;
  let insertsWithNarrative = 0, insertsDt3 = 0;
  const insertIds = new Set();
  const insertBuckets = {};   // hour bucket -> count
  const deleteBuckets = {};
  let firstInsert = null, lastInsert = null;

  for await (const e of cursor) {
    const ts = tsToISO(e.ts);
    if (e.op === 'i') {
      inserts++;
      if (!firstInsert) firstInsert = ts;
      lastInsert = ts;
      insertIds.add(String(e.o?._id));
      const isDt3 = String(e.o?.cycle_id) === DT3_CYCLE_ID
        || String(e.o?.cycle_id?.$oid) === DT3_CYCLE_ID;
      if (isDt3) insertsDt3++;
      if (e.o?.st_narrative && Object.keys(e.o.st_narrative).length) insertsWithNarrative++;
      const b = dayBucket(ts);
      insertBuckets[b] = (insertBuckets[b] || 0) + 1;
    } else if (e.op === 'd') {
      deletes++;
      const b = dayBucket(ts);
      deleteBuckets[b] = (deleteBuckets[b] || 0) + 1;
    }
  }

  console.log('='.repeat(68));
  console.log('SUBMISSION INSERT / DELETE ANALYSIS (oplog window)');
  console.log('='.repeat(68));
  console.log(`  Total inserts: ${inserts}   (distinct _ids: ${insertIds.size})`);
  console.log(`  Total deletes: ${deletes}`);
  console.log(`  Inserts for DT3 cycle: ${insertsDt3}`);
  console.log(`  Inserts that carried st_narrative: ${insertsWithNarrative}`);
  console.log(`  First insert: ${firstInsert}`);
  console.log(`  Last  insert: ${lastInsert}`);

  // How many inserted ids match current live DT3 ids?
  let insertIdsLiveDt3 = 0;
  for (const id of insertIds) if (liveIds.has(id)) insertIdsLiveDt3++;
  console.log(`  Inserted _ids that are current live DT3 submissions: ${insertIdsLiveDt3} / ${liveIds.size}`);

  console.log('\n  Inserts by hour:');
  for (const [b, n] of Object.entries(insertBuckets).sort()) {
    console.log(`    ${b}:00  inserts=${n}  deletes=${deleteBuckets[b] || 0}`);
  }
  console.log('\n  Delete-only hours:');
  for (const [b, n] of Object.entries(deleteBuckets).sort()) {
    if (!insertBuckets[b]) console.log(`    ${b}:00  deletes=${n}`);
  }

  console.log('\n  Interpretation:');
  console.log('  - inserts carrying st_narrative = 0 means every re-import/insert');
  console.log('    starts a submission with NO ST story work.');
  console.log('  - if inserted _ids match live ids, the re-import REPLACED the');
  console.log('    same submissions in place (wiping st_narrative each time).');

  await c.close();
}

run().catch(err => { console.error(err); process.exit(1); });
