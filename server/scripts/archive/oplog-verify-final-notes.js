#!/usr/bin/env node
// READ-ONLY: pull the exact, complete oplog text + path for the 6 confirmed
// deleted notes, so the recovery document is verbatim-accurate.
// Usage: cd server && node scripts/oplog-verify-final-notes.js

import { MongoClient } from 'mongodb';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI not set.'); process.exit(1); }

function tsToISO(ts) {
  const secs = ts?.getHighBits ? ts.getHighBits() : (ts?.high ?? 0);
  return new Date(secs * 1000).toISOString();
}

// Submissions of interest and what we're hunting for in each.
const TARGETS = {
  '6a07bfeec1170f2c750bbdff': 'Cyrus Reynolds',
  '6a02b2c6ea37682fcf168494': 'Don Ezzelino Rocio',
  '6a06a9fdc1170f2c750bbdfe': 'Julia Dolancia',
  '6a059958ea86ccb92f7aa59a': 'Edna Judge',
  '69fd4db79005f6883eb1d620': 'Reed Justice',
  '69fd4e6a9005f6883eb1d622': 'Conrad Sondergaard',
};

// Recursively find every (keyName, fullValue) for the keys we care about.
function harvest(value, path, sink) {
  if (value === null || typeof value !== 'object') return;
  const ctor = value.constructor && value.constructor.name;
  if (ctor && ['ObjectId','Date','Timestamp','Binary','Long','Decimal128'].includes(ctor)) return;
  for (const [k, v] of Object.entries(value)) {
    const p = path ? `${path}.${k}` : k;
    if ((k === 'revision_note' || k === 'player_facing_note')
        && typeof v === 'string' && v.trim()) {
      sink.push({ key: k, path: p, value: v });
    }
    if (v && typeof v === 'object') harvest(v, p, sink);
  }
}

async function run() {
  const c = new MongoClient(MONGODB_URI);
  await c.connect();
  const oplog = c.db('local').collection('oplog.rs');
  const cursor = oplog.find({ ns: 'tm_suite.downtime_submissions' }).sort({ $natural: 1 });

  // id -> key -> [{ ts, value }]  (deduped by value)
  const found = new Map();
  for await (const e of cursor) {
    if (e.op !== 'u' && e.op !== 'i') continue;
    const id = String(e.o2?._id || e.o?._id || '');
    if (!TARGETS[id]) continue;
    const sink = [];
    harvest(e.o, '', sink);
    if (!sink.length) continue;
    if (!found.has(id)) found.set(id, []);
    const ts = tsToISO(e.ts);
    for (const s of sink) {
      found.get(id).push({ ts, key: s.key, value: s.value.trim() });
    }
  }

  for (const [id, name] of Object.entries(TARGETS)) {
    console.log('='.repeat(74));
    console.log(`${name}  [${id}]`);
    console.log('='.repeat(74));
    const hits = found.get(id) || [];
    // collapse consecutive identical values, keep distinct ones with first ts
    const distinct = [];
    for (const h of hits) {
      const prev = distinct.find(d => d.key === h.key && d.value === h.value);
      if (!prev) distinct.push(h);
    }
    if (!distinct.length) { console.log('  (no revision_note / player_facing_note in oplog)\n'); continue; }
    for (const d of distinct) {
      console.log(`\n  [${d.ts}]  ${d.key}`);
      console.log(`  FULL VALUE (${d.value.length} chars):`);
      console.log(`  >>>${d.value}<<<`);
    }
    console.log('');
  }

  await c.close();
}

run().catch(err => { console.error(err); process.exit(1); });
