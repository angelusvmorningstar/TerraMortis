#!/usr/bin/env node
// READ-ONLY: current live state of the 6 confirmed-deleted notes.
// Usage: cd server && node scripts/check-final-notes-live.js

import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI not set.'); process.exit(1); }

const SUBS = {
  '6a07bfeec1170f2c750bbdff': { name: 'Cyrus Reynolds',     section: 'story_moment' },
  '6a02b2c6ea37682fcf168494': { name: 'Don Ezzelino Rocio', section: 'story_moment' },
  '6a06a9fdc1170f2c750bbdfe': { name: 'Julia Dolancia',     section: 'story_moment' },
  '6a059958ea86ccb92f7aa59a': { name: 'Edna Judge',         section: 'feeding_narrative' },
  '69fd4db79005f6883eb1d620': { name: 'Reed Justice',       section: null },
  '69fd4e6a9005f6883eb1d622': { name: 'Conrad Sondergaard', section: null },
};

function harvestPFN(value, path, sink) {
  if (value === null || typeof value !== 'object') return;
  const ctor = value.constructor && value.constructor.name;
  if (ctor && ['ObjectId','Date','Timestamp','Binary','Long','Decimal128'].includes(ctor)) return;
  for (const [k, v] of Object.entries(value)) {
    const p = path ? `${path}.${k}` : k;
    if (k === 'player_facing_note' && typeof v === 'string' && v.trim()) {
      sink.push({ path: p, value: v.trim() });
    }
    if (v && typeof v === 'object') harvestPFN(v, p, sink);
  }
}

async function run() {
  const c = new MongoClient(MONGODB_URI);
  await c.connect();
  const col = c.db('tm_suite').collection('downtime_submissions');

  for (const [id, meta] of Object.entries(SUBS)) {
    const doc = await col.findOne({ _id: new ObjectId(id) });
    console.log('='.repeat(70));
    console.log(`${meta.name}  [${id}]`);
    if (!doc) { console.log('  DOC NOT FOUND\n'); continue; }
    if (meta.section) {
      const sec = doc.st_narrative?.[meta.section];
      console.log(`  st_narrative.${meta.section}:`);
      console.log(`    status:        ${sec?.status ?? '(none)'}`);
      console.log(`    revision_note: "${sec?.revision_note ?? ''}"`);
    } else {
      const sink = [];
      harvestPFN(doc, '', sink);
      console.log(`  player_facing_note values live: ${sink.length}`);
      for (const s of sink) console.log(`    ${s.path}: "${s.value.slice(0,120)}"`);
    }
    console.log('');
  }
  await c.close();
}

run().catch(err => { console.error(err); process.exit(1); });
