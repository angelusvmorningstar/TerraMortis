#!/usr/bin/env node
// READ-ONLY: dump the current live state of DT3 ST-authored content —
// st_narrative (DT Story responses + revision notes + statuses) and the
// cycle's action_queue_state (triage notes). Shows what exists NOW.
// Usage: cd server && node scripts/investigate-dt3-live-state.js

import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI not set.'); process.exit(1); }
const DT3_CYCLE_ID = '69e955c784bbfc821bed2810';

function summariseNarrativeSection(section) {
  const list = Array.isArray(section) ? section : [section];
  return list.map((e, i) => {
    if (!e || typeof e !== 'object') return null;
    const resp = (e.response || '').trim();
    const rev  = (e.revision_note || '').trim();
    const parts = [];
    parts.push(`status=${e.status || '(none)'}`);
    if (resp) parts.push(`response=${resp.length}ch`);
    if (rev)  parts.push(`revision_note="${rev.slice(0, 80)}"`);
    return `    [${i}] ${parts.join('  ')}`;
  }).filter(Boolean).join('\n');
}

async function run() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db('tm_suite');

  // ── st_narrative across all DT3 submissions ──
  const subs = await db.collection('downtime_submissions')
    .find({ cycle_id: new ObjectId(DT3_CYCLE_ID) }).toArray();

  console.log('='.repeat(72));
  console.log(`DT3 st_narrative — live state (${subs.length} submissions)`);
  console.log('='.repeat(72));
  let withNarrative = 0, totalRevNotes = 0, totalNeedsRev = 0;
  for (const s of subs) {
    const n = s.st_narrative;
    if (!n || Object.keys(n).length === 0) continue;
    withNarrative++;
    console.log(`\n${s.character_name}:`);
    for (const [secKey, secVal] of Object.entries(n)) {
      console.log(`  ${secKey}:`);
      const summary = summariseNarrativeSection(secVal);
      if (summary) console.log(summary);
      const list = Array.isArray(secVal) ? secVal : [secVal];
      for (const e of list) {
        if (e && typeof e === 'object') {
          if ((e.revision_note || '').trim()) totalRevNotes++;
          if (e.status === 'needs_revision') totalNeedsRev++;
        }
      }
    }
  }
  console.log(`\n  Submissions with st_narrative: ${withNarrative}/${subs.length}`);
  console.log(`  Total revision_note strings:   ${totalRevNotes}`);
  console.log(`  Total needs_revision statuses: ${totalNeedsRev}`);

  // ── cycle action_queue_state (triage notes) ──
  const cycle = await db.collection('downtime_cycles')
    .findOne({ _id: new ObjectId(DT3_CYCLE_ID) });
  console.log(`\n${'='.repeat(72)}`);
  console.log('DT3 cycle.action_queue_state — triage notes');
  console.log('='.repeat(72));
  const aqs = cycle?.action_queue_state || {};
  const keys = Object.keys(aqs);
  console.log(`  Total action_queue_state entries: ${keys.length}`);
  let withNote = 0;
  for (const k of keys) {
    const entry = aqs[k] || {};
    if ((entry.note || '').trim()) {
      withNote++;
      console.log(`  ${k}: state=${entry.state}  note="${entry.note}"`);
    }
  }
  console.log(`  Entries with a non-empty note: ${withNote}`);
  if (!withNote && keys.length) console.log('  (all triage notes are empty)');

  // ── show all top-level keys on the cycle doc (for context) ──
  console.log(`\n  Cycle doc keys: ${Object.keys(cycle || {}).join(', ')}`);

  await client.close();
}

run().catch(err => { console.error(err); process.exit(1); });
