#!/usr/bin/env node
// READ-ONLY: dump the most recent st_narrative-touching oplog ops, newest
// first, so we can verify the oplog read is complete and current (it should
// show very recent edits/deletes made in the DT Story tab).
// Usage: cd server && node scripts/oplog-tail-narrative.js

import { MongoClient } from 'mongodb';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI not set.'); process.exit(1); }

function tsToISO(ts) {
  const secs = ts?.getHighBits ? ts.getHighBits() : (ts?.high ?? 0);
  return new Date(secs * 1000).toISOString();
}

async function run() {
  const c = new MongoClient(MONGODB_URI);
  await c.connect();
  const oplog = c.db('local').collection('oplog.rs');

  // Newest-first scan; collect last 50 st_narrative ops.
  const cursor = oplog.find({ ns: 'tm_suite.downtime_submissions' }).sort({ $natural: -1 });
  const hits = [];
  for await (const e of cursor) {
    if (e.op !== 'u' && e.op !== 'i') continue;
    const oStr = JSON.stringify(e.o || {});
    if (!oStr.includes('st_narrative')) continue;
    hits.push({ ts: tsToISO(e.ts), id: String(e.o2?._id || e.o?._id || ''),
                hasRev: oStr.includes('revision_note'),
                hasNeedsRev: oStr.includes('needs_revision'),
                o: oStr });
    if (hits.length >= 50) break;
  }

  console.log(`Most recent ${hits.length} st_narrative oplog ops (newest first):\n`);
  for (const h of hits) {
    let tag = '';
    if (h.hasRev) tag += ' [revision_note]';
    if (h.hasNeedsRev) tag += ' [needs_revision]';
    console.log(`[${h.ts}] sub=${h.id}${tag}`);
    if (h.hasRev || h.hasNeedsRev) {
      let p = h.o; if (p.length > 500) p = p.slice(0, 500) + ' …';
      console.log(`   ${p}`);
    }
  }

  await c.close();
}

run().catch(err => { console.error(err); process.exit(1); });
