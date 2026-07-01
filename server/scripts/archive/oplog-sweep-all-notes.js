#!/usr/bin/env node
// READ-ONLY: comprehensive sweep. Scans the full oplog for EVERY note/comment
// field across DT Processing + DT Story, on downtime_submissions and
// downtime_cycles. Reports any note/comment value that appears in the oplog
// history but is absent from the current live document = potential erasure.
// Usage: cd server && node scripts/oplog-sweep-all-notes.js

import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI not set.'); process.exit(1); }
const DT3_CYCLE_ID = '69e955c784bbfc821bed2810';

// Object keys that hold ST-authored notes / comments (NOT the main narrative
// `response` body or `outcome_text`, which are verified intact separately).
const NOTE_KEYS = new Set([
  'revision_note',       // DT Story: per-section revision note
  'general_notes',       // DT Story: per-submission ST note
  'st_note',             // DT Processing: per-action ST note
  'st_notes',            // DT Processing: top-level ST notes
  'player_facing_note',  // DT Processing: note shown to player
  'player_feedback',     // DT Processing: player feedback text
  'outcome_summary',     // DT Processing: merit outcome summary
  'story_context',       // DT Processing: story context note
  'voice_note',          // DT Story: story-moment ST voice note
  'text',                // notes_thread message body
  'note',                // xp_approvals[].note, action_queue_state[].note
  'st_court_synthesis_draft', // cycle: court synthesis draft
]);

function tsToISO(ts) {
  const secs = ts?.getHighBits ? ts.getHighBits() : (ts?.high ?? 0);
  return new Date(secs * 1000).toISOString();
}

// Recursively scan any value tree; collect [key, string] for every NOTE_KEYS
// key whose value is a non-empty string. Skips BSON scalar wrappers.
function harvest(value, sink) {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) { for (const v of value) harvest(v, sink); return; }
  if (typeof value !== 'object') return;
  // skip BSON types (ObjectId/Date/Timestamp/Binary) — no note keys inside
  const ctor = value.constructor && value.constructor.name;
  if (ctor && ['ObjectId', 'Date', 'Timestamp', 'Binary', 'Long', 'Decimal128'].includes(ctor)) return;
  for (const [k, v] of Object.entries(value)) {
    if (NOTE_KEYS.has(k) && typeof v === 'string' && v.trim().length > 0) {
      sink.push([k, v.trim()]);
    }
    if (v && typeof v === 'object') harvest(v, sink);
  }
}

async function scanCollection(client, nsRegex, liveDocs) {
  // liveDocs: Map(idStr -> liveDoc). Build live note-value sets per doc+key.
  const liveValues = new Map(); // idStr -> Map(key -> Set(values))
  for (const [id, doc] of liveDocs) {
    const sink = [];
    harvest(doc, sink);
    const km = new Map();
    for (const [k, v] of sink) {
      if (!km.has(k)) km.set(k, new Set());
      km.get(k).add(v);
    }
    liveValues.set(id, km);
  }

  // Walk oplog
  const oplog = client.db('local').collection('oplog.rs');
  const cursor = oplog.find({ ns: nsRegex }).sort({ $natural: 1 });
  // idStr -> key -> Map(value -> firstSeenTs)
  const seen = new Map();
  for await (const e of cursor) {
    if (e.op !== 'u' && e.op !== 'i') continue;
    const id = String(e.o2?._id || e.o?._id || '');
    if (!id) continue;
    const sink = [];
    harvest(e.o, sink);
    if (!sink.length) continue;
    if (!seen.has(id)) seen.set(id, new Map());
    const km = seen.get(id);
    const ts = tsToISO(e.ts);
    for (const [k, v] of sink) {
      if (!km.has(k)) km.set(k, new Map());
      if (!km.get(k).has(v)) km.get(k).set(v, ts);
    }
  }

  // Compare: oplog value not present in live = potential erasure
  const findings = [];
  for (const [id, km] of seen) {
    const live = liveValues.get(id) || new Map();
    for (const [k, valMap] of km) {
      const liveSet = live.get(k) || new Set();
      for (const [val, ts] of valMap) {
        if (!liveSet.has(val)) {
          findings.push({ id, key: k, val, ts, liveHasKey: liveSet.size > 0 });
        }
      }
    }
  }
  return findings;
}

async function run() {
  const c = new MongoClient(MONGODB_URI);
  await c.connect();
  const db = c.db('tm_suite');

  // Live DT3 submissions
  const subs = await db.collection('downtime_submissions')
    .find({ cycle_id: new ObjectId(DT3_CYCLE_ID) }).toArray();
  const subById = new Map(subs.map(s => [String(s._id), s]));
  const nameById = new Map(subs.map(s => [String(s._id), s.character_name]));

  // Live DT3 cycle
  const cycle = await db.collection('downtime_cycles')
    .findOne({ _id: new ObjectId(DT3_CYCLE_ID) });
  const cycleById = new Map([[String(cycle._id), cycle]]);

  console.log('Comprehensive note/comment erasure sweep — DT3');
  console.log(`Submissions: ${subs.length}   Note keys tracked: ${[...NOTE_KEYS].join(', ')}\n`);

  // --- downtime_submissions ---
  const subFindings = await scanCollection(
    c, /^tm_suite\.downtime_submissions$/, subById);
  console.log('='.repeat(74));
  console.log(`downtime_submissions — ${subFindings.length} note value(s) in oplog but NOT live`);
  console.log('='.repeat(74));
  if (!subFindings.length) console.log('  (none)');
  // group by submission
  const bySub = new Map();
  for (const f of subFindings) {
    if (!bySub.has(f.id)) bySub.set(f.id, []);
    bySub.get(f.id).push(f);
  }
  for (const [id, fs] of bySub) {
    console.log(`\n● ${nameById.get(id) || '(unknown sub)'}  [${id}]`);
    for (const f of fs) {
      const kind = f.liveHasKey ? 'replaced/edited' : 'fully removed';
      console.log(`  ${f.key}  (${kind}, first seen ${f.ts})`);
      console.log(`    "${f.val.slice(0, 260)}${f.val.length > 260 ? '…' : ''}"`);
    }
  }

  // --- downtime_cycles ---
  const cycFindings = await scanCollection(
    c, /^tm_suite\.downtime_cycles$/, cycleById);
  console.log(`\n${'='.repeat(74)}`);
  console.log(`downtime_cycles — ${cycFindings.length} note value(s) in oplog but NOT live`);
  console.log('='.repeat(74));
  if (!cycFindings.length) console.log('  (none)');
  for (const f of cycFindings) {
    const kind = f.liveHasKey ? 'replaced/edited' : 'fully removed';
    console.log(`\n● cycle ${f.id}`);
    console.log(`  ${f.key}  (${kind}, first seen ${f.ts})`);
    console.log(`    "${f.val.slice(0, 400)}${f.val.length > 400 ? '…' : ''}"`);
  }

  await c.close();
}

run().catch(err => { console.error(err); process.exit(1); });
