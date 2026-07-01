#!/usr/bin/env node
// READ-ONLY: dump every revision_note + status across all st_narrative
// sections of Alice Vunder's DT3 submission. Calibration check.
// Usage: cd server && node scripts/find-alice-revision-notes.js

import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI not set.'); process.exit(1); }
const ALICE_SUB_ID = '69f0360f42ba4e4a3005b750';

function dumpSection(label, sec) {
  if (sec === null || sec === undefined) { console.log(`  ${label}: (absent)`); return; }
  if (Array.isArray(sec)) {
    if (!sec.length) { console.log(`  ${label}: (empty array)`); return; }
    sec.forEach((e, i) => {
      if (!e || typeof e !== 'object') { console.log(`  ${label}[${i}]: ${JSON.stringify(e)}`); return; }
      const rn = (e.revision_note || '').trim();
      console.log(`  ${label}[${i}]: status=${e.status ?? '(none)'}  response=${(e.response||'').length}ch`
        + `  revision_note=${rn ? `"${rn}"` : '(empty)'}`);
    });
    return;
  }
  if (typeof sec === 'object') {
    const rn = (sec.revision_note || '').trim();
    console.log(`  ${label}: status=${sec.status ?? '(none)'}  response=${(sec.response||'').length}ch`
      + `  revision_note=${rn ? `"${rn}"` : '(empty)'}`);
    return;
  }
  console.log(`  ${label}: ${JSON.stringify(sec)}`);
}

async function run() {
  const c = new MongoClient(MONGODB_URI);
  await c.connect();
  const doc = await c.db('tm_suite').collection('downtime_submissions')
    .findOne({ _id: new ObjectId(ALICE_SUB_ID) });

  if (!doc) { console.log('Alice submission not found.'); await c.close(); return; }

  console.log(`Character: ${doc.character_name}`);
  console.log(`Submission: ${doc._id}`);
  console.log(`st_narrative keys: ${Object.keys(doc.st_narrative || {}).join(', ') || '(none)'}`);
  console.log('');
  console.log('='.repeat(70));
  console.log('EVERY st_narrative SECTION — live DB state');
  console.log('='.repeat(70));
  const n = doc.st_narrative || {};
  for (const key of Object.keys(n)) dumpSection(key, n[key]);

  // Also scan the WHOLE document for any "claude code test" string, anywhere.
  console.log(`\n${'='.repeat(70)}`);
  console.log('FULL-DOCUMENT SCAN for "claude code test" (any field, any depth)');
  console.log('='.repeat(70));
  const hits = [];
  (function walk(v, path) {
    if (v === null || v === undefined) return;
    if (typeof v === 'string') {
      if (v.toLowerCase().includes('claude code test')) hits.push({ path, value: v });
      return;
    }
    if (typeof v !== 'object') return;
    const ctor = v.constructor && v.constructor.name;
    if (ctor && ['ObjectId','Date','Timestamp','Binary','Long','Decimal128'].includes(ctor)) return;
    for (const [k, val] of Object.entries(v)) walk(val, path ? `${path}.${k}` : k);
  })(doc, '');
  if (!hits.length) console.log('  (no "claude code test" string anywhere in the document)');
  for (const h of hits) console.log(`  ${h.path}\n    "${h.value}"`);

  await c.close();
}

run().catch(err => { console.error(err); process.exit(1); });
