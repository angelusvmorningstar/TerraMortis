#!/usr/bin/env node
// READ-ONLY: reconstruct, per submission, the full timeline of every
// st_narrative section's {status, revision_note} from the oplog, identify
// revision notes / needs_revision flags that were set then later erased,
// and compare against the live DB. Produces a recovery report.
// Usage: cd server && node scripts/oplog-recover-revision-notes.js

import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI not set.'); process.exit(1); }
const DT3_CYCLE_ID = '69e955c784bbfc821bed2810';

function tsToISO(ts) {
  const secs = ts?.getHighBits ? ts.getHighBits() : (ts?.high ?? 0);
  return new Date(secs * 1000).toISOString();
}

// Walk a $v:2 diff, yielding [dottedPath, value]. Handles s-prefixed sub-diffs.
function* walkDiff(diff, prefix = '') {
  if (!diff || typeof diff !== 'object') return;
  for (const [k, v] of Object.entries(diff)) {
    if (k === 'i' || k === 'u') {
      for (const [f, val] of Object.entries(v || {})) {
        yield [prefix ? `${prefix}.${f}` : f, val];
      }
    } else if (k.startsWith('s')) {
      const field = k.slice(1);
      yield* walkDiff(v, prefix ? `${prefix}.${field}` : field);
    }
  }
}

// From any write payload, extract { section -> {status?, revision_note?} } touched.
function extractSections(o) {
  const out = {}; // section -> { status, revision_note } (only keys actually set)
  const noteSection = (section, val) => {
    if (!val || typeof val !== 'object' || Array.isArray(val)) return;
    out[section] = out[section] || {};
    if ('status' in val)        out[section].status = val.status;
    if ('revision_note' in val) out[section].revision_note = val.revision_note;
    if ('response' in val)      out[section].response_len = (val.response || '').length;
  };
  const consider = (path, value) => {
    // Case A: whole st_narrative object set/inserted at once
    if (path === 'st_narrative' && value && typeof value === 'object') {
      for (const [section, val] of Object.entries(value)) noteSection(section, val);
      return;
    }
    // Case B: path like st_narrative.story_moment OR st_narrative.story_moment.revision_note
    const m = path.match(/^st_narrative\.([a-z_]+)(?:\.(.+))?$/);
    if (!m) return;
    const section = m[1], sub = m[2];
    out[section] = out[section] || {};
    if (!sub) {
      noteSection(section, value);
    } else if (sub === 'status')        out[section].status = value;
    else if (sub === 'revision_note')   out[section].revision_note = value;
    else if (sub === 'response')        out[section].response_len = (value || '').length;
  };
  if (o?.diff) {
    for (const [path, value] of walkDiff(o.diff)) consider(path, value);
  } else if (o && typeof o === 'object') {
    // replacement-style: whole doc
    const n = o.st_narrative;
    if (n) for (const [section, val] of Object.entries(n)) {
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        out[section] = {
          status: val.status, revision_note: val.revision_note,
          response_len: (val.response || '').length,
        };
      }
    }
  }
  return out;
}

async function run() {
  const c = new MongoClient(MONGODB_URI);
  await c.connect();
  const db = c.db('tm_suite');

  // Map sub _id -> character name (live)
  const liveSubs = await db.collection('downtime_submissions')
    .find({ cycle_id: new ObjectId(DT3_CYCLE_ID) }).toArray();
  const nameById = new Map(liveSubs.map(s => [String(s._id), s.character_name]));
  const liveById = new Map(liveSubs.map(s => [String(s._id), s]));

  // Scan oplog: per submission, per section, ordered list of writes
  const oplog = c.db('local').collection('oplog.rs');
  const cursor = oplog.find({ ns: 'tm_suite.downtime_submissions' }).sort({ $natural: 1 });

  // timeline: subId -> section -> [ { ts, status, revision_note, response_len } ]
  const timeline = new Map();
  for await (const e of cursor) {
    if (e.op !== 'u' && e.op !== 'i') continue;
    const oStr = JSON.stringify(e.o || {});
    if (!oStr.includes('st_narrative')) continue;
    const id = String(e.o2?._id || e.o?._id);
    const sections = extractSections(e.o);
    const ts = tsToISO(e.ts);
    for (const [section, vals] of Object.entries(sections)) {
      if (!timeline.has(id)) timeline.set(id, new Map());
      const secMap = timeline.get(id);
      if (!secMap.has(section)) secMap.set(section, []);
      secMap.get(section).push({ ts, ...vals });
    }
  }

  // Analyse: for each sub/section, did a revision_note / needs_revision get
  // set and then erased (a later write with empty revision_note or non-revision status)?
  console.log('='.repeat(74));
  console.log('RECOVERY REPORT — revision notes / needs_revision flags set then erased');
  console.log('='.repeat(74));

  const recoverable = [];
  for (const [id, secMap] of timeline) {
    for (const [section, writes] of secMap) {
      // Last non-empty revision_note text ever written, and whether
      // needs_revision was ever set.
      let lastNote = null, lastNoteTs = null, everNeedsRev = null;
      for (const w of writes) {
        if (typeof w.revision_note === 'string' && w.revision_note.trim()) {
          lastNote = w.revision_note.trim(); lastNoteTs = w.ts;
        }
        if (w.status === 'needs_revision') everNeedsRev = w.ts;
      }
      if (!lastNote && !everNeedsRev) continue;

      // Current live state for this section
      const liveDoc = liveById.get(id);
      const liveSec = liveDoc?.st_narrative?.[section];
      const liveNote = (liveSec && !Array.isArray(liveSec)) ? (liveSec.revision_note || '') : '';
      const liveStatus = (liveSec && !Array.isArray(liveSec)) ? (liveSec.status || '') : '';

      const lostNote   = lastNote && liveNote.trim() !== lastNote;
      const lostStatus = everNeedsRev && liveStatus !== 'needs_revision';

      if (lostNote || lostStatus) {
        recoverable.push({
          id, section, noteText: lastNote || '', noteTs: lastNoteTs,
          needsRevTs: everNeedsRev, liveNote, liveStatus,
        });
      }
    }
  }

  if (!recoverable.length) {
    console.log('\n  (nothing erased — every revision note/flag in the oplog is still live)');
  } else {
    for (const r of recoverable) {
      console.log(`\n● ${nameById.get(r.id) || '(unknown)'}  [${r.id}]`);
      console.log(`  section:        st_narrative.${r.section}`);
      console.log(`  revision_note:  "${r.noteText}"${r.noteTs ? `  (written ${r.noteTs})` : ''}`);
      console.log(`  needs_revision: ${r.needsRevTs ? `set at ${r.needsRevTs}` : '(never)'}`);
      console.log(`  LIVE now:       revision_note="${r.liveNote}"  status="${r.liveStatus}"`);
    }
    console.log(`\n  >>> ${recoverable.length} erased revision note/flag(s) recoverable from oplog`);
  }

  // Full per-submission timeline for the affected sections (audit trail)
  console.log(`\n${'='.repeat(74)}`);
  console.log('AUDIT TRAIL — write timeline for each affected section');
  console.log('='.repeat(74));
  const affectedIds = new Set(recoverable.map(r => `${r.id}:${r.section}`));
  for (const r of recoverable) {
    console.log(`\n${nameById.get(r.id)} — st_narrative.${r.section}:`);
    for (const w of timeline.get(r.id).get(r.section)) {
      const note = w.revision_note === undefined ? '—'
        : (w.revision_note.trim() ? `"${w.revision_note.slice(0,50)}"` : '(empty)');
      const st = w.status === undefined ? '—' : w.status;
      const rl = w.response_len === undefined ? '—' : `${w.response_len}ch`;
      console.log(`  [${w.ts}]  status=${st}  revision_note=${note}  response=${rl}`);
    }
  }

  await c.close();
}

run().catch(err => { console.error(err); process.exit(1); });
