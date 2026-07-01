#!/usr/bin/env node
// READ-ONLY: scan local.oplog.rs for writes to st_narrative (DT Story:
// revision notes / statuses) and action_queue_state (triage notes).
// Reconstructs the full history of every revision_note / needs_revision /
// triage-note value ever written in the oplog window.
// Usage: cd server && node scripts/oplog-scan-dt3.js

import { MongoClient } from 'mongodb';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI not set.'); process.exit(1); }

function tsToISO(ts) {
  const secs = ts?.getHighBits ? ts.getHighBits() : (ts?.high ?? 0);
  return new Date(secs * 1000).toISOString();
}

// Recursively walk a $v:2 diff, yielding [path, value] for every leaf set.
// Diff grammar: { i:{...}, u:{...}, d:{...}, s<field>:{<subdiff>} }
function* walkDiff(diff, prefix = '') {
  if (!diff || typeof diff !== 'object') return;
  for (const [k, v] of Object.entries(diff)) {
    if (k === 'i' || k === 'u') {
      // inserted / updated fields: v is { field: value }
      for (const [f, val] of Object.entries(v || {})) {
        yield [prefix ? `${prefix}.${f}` : f, val, k];
      }
    } else if (k === 'd') {
      for (const f of Object.keys(v || {})) {
        yield [prefix ? `${prefix}.${f}` : f, '<DELETED>', 'd'];
      }
    } else if (k.startsWith('s')) {
      // sub-diff into field k.slice(1)
      const field = k.slice(1);
      yield* walkDiff(v, prefix ? `${prefix}.${field}` : field);
    }
  }
}

// Pull every revision_note / status / triage-note out of an arbitrary value tree
function harvestNotes(value, path, sink) {
  if (value === null || value === undefined) return;
  if (typeof value === 'object') {
    if (Array.isArray(value)) {
      value.forEach((v, i) => harvestNotes(v, `${path}[${i}]`, sink));
    } else {
      for (const [k, v] of Object.entries(value)) {
        if (k === 'revision_note' && typeof v === 'string' && v.trim()) {
          sink.push({ path: `${path}.revision_note`, kind: 'revision_note', value: v });
        } else if (k === 'status' && v === 'needs_revision') {
          sink.push({ path: `${path}.status`, kind: 'needs_revision', value: v });
        } else if (k === 'note' && typeof v === 'string' && v.trim()) {
          sink.push({ path: `${path}.note`, kind: 'triage_note', value: v });
        } else {
          harvestNotes(v, `${path}.${k}`, sink);
        }
      }
    }
  }
}

async function run() {
  const c = new MongoClient(MONGODB_URI);
  await c.connect();
  const oplog = c.db('local').collection('oplog.rs');

  const cursor = oplog.find({
    ns: /^tm_suite\.downtime_(submissions|cycles)$/,
  }).sort({ $natural: 1 });

  const narrativeOps = [];   // writes touching st_narrative
  const queueOps     = [];   // writes touching action_queue_state
  const deletes      = [];
  const noteFindings = [];   // every non-empty revision_note / needs_revision / triage note seen

  for await (const e of cursor) {
    if (e.op === 'd') {
      deletes.push({ ts: tsToISO(e.ts), ns: e.ns, id: e.o?._id });
      continue;
    }
    if (e.op !== 'u' && e.op !== 'i') continue;
    const oStr = JSON.stringify(e.o || {});
    const touchesNarr  = oStr.includes('st_narrative');
    const touchesQueue = oStr.includes('action_queue_state');
    if (!touchesNarr && !touchesQueue) continue;

    const ts = tsToISO(e.ts);
    const id = e.o2?._id || e.o?._id;
    const rec = { ts, ns: e.ns, id, o: e.o };
    if (touchesNarr)  narrativeOps.push(rec);
    if (touchesQueue) queueOps.push(rec);

    // Harvest any notes set by this op
    const diff = e.o?.diff || e.o; // $v:2 has .diff; replacement has whole doc
    const sink = [];
    if (e.o?.diff) {
      for (const [path, val] of walkDiff(e.o.diff)) harvestNotes(val, path, sink);
    } else {
      harvestNotes(e.o, '', sink);
    }
    for (const s of sink) noteFindings.push({ ts, id, ...s });
  }

  console.log(`st_narrative writes:      ${narrativeOps.length}`);
  console.log(`action_queue_state writes:${queueOps.length}`);
  console.log(`deletes:                  ${deletes.length}`);
  console.log(`\n${'='.repeat(72)}`);
  console.log('EVERY non-empty revision_note / needs_revision / triage note in oplog');
  console.log('='.repeat(72));
  if (!noteFindings.length) {
    console.log('  (NONE — no revision note, needs_revision status, or triage note');
    console.log('   was ever written in the entire oplog window 05-16 -> now)');
  } else {
    for (const f of noteFindings) {
      console.log(`\n[${f.ts}] ${f.kind}  sub=${f.id}`);
      console.log(`  path:  ${f.path}`);
      console.log(`  value: ${String(f.value).slice(0, 300)}`);
    }
  }

  // Dump all st_narrative writes compactly so we can see status transitions
  console.log(`\n${'='.repeat(72)}`);
  console.log('ALL st_narrative writes (compact)');
  console.log('='.repeat(72));
  for (const r of narrativeOps) {
    let p = JSON.stringify(r.o);
    if (p.length > 600) p = p.slice(0, 600) + ' …';
    console.log(`[${r.ts}] sub=${r.id}\n  ${p}`);
  }

  console.log(`\n${'='.repeat(72)}`);
  console.log('ALL action_queue_state writes (compact)');
  console.log('='.repeat(72));
  for (const r of queueOps) {
    let p = JSON.stringify(r.o);
    if (p.length > 600) p = p.slice(0, 600) + ' …';
    console.log(`[${r.ts}] cycle=${r.id}\n  ${p}`);
  }

  await c.close();
}

run().catch(err => { console.error(err); process.exit(1); });
