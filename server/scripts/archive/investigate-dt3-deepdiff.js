#!/usr/bin/env node
// READ-ONLY: recursive deep-diff of every DT3 submission, backup vs live.
// Reports ANY path where the backup holds a non-empty string/array and live
// has it empty or missing. Catches erased fields the targeted scan missed.
// Usage: cd server && node scripts/investigate-dt3-deepdiff.js

import { MongoClient, ObjectId } from 'mongodb';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI not set.'); process.exit(1); }

const DT3_CYCLE_ID = '69e955c784bbfc821bed2810';
// Paths we don't care about (volatile / derived / not ST content)
const IGNORE = /(^_id|\.\$oid$|submitted_at|resolved_at|created_at|updated_at|_chkSlotMap)/;

function loadBackup(name) {
  const arr = JSON.parse(readFileSync(join(REPO_ROOT, name), 'utf8'));
  return new Map(arr.map(s => [String(s._id?.$oid || s._id), s]));
}

function isEmpty(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim().length === 0;
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

// Walk backup doc; for every leaf with content, check live has equivalent content
function deepDiff(backup, live, path, out) {
  if (backup === null || backup === undefined) return;
  if (Array.isArray(backup)) {
    for (let i = 0; i < backup.length; i++) {
      deepDiff(backup[i], Array.isArray(live) ? live[i] : undefined, `${path}[${i}]`, out);
    }
    return;
  }
  if (typeof backup === 'object') {
    for (const k of Object.keys(backup)) {
      const childPath = path ? `${path}.${k}` : k;
      if (IGNORE.test(childPath)) continue;
      const liveChild = (live && typeof live === 'object') ? live[k] : undefined;
      deepDiff(backup[k], liveChild, childPath, out);
    }
    return;
  }
  // Leaf (string / number / bool)
  if (typeof backup === 'string' && backup.trim().length > 0) {
    if (isEmpty(live)) {
      out.push({ path, backup, live: live === undefined ? '(missing)' : JSON.stringify(live) });
    }
  }
}

async function run() {
  const bk17 = loadBackup('backup_downtime_3_2026-05-17.json');
  const bk16 = loadBackup('backup_downtime_3_2026-05-16.json');

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const col = client.db('tm_suite').collection('downtime_submissions');
  const liveArr = await col.find({ cycle_id: new ObjectId(DT3_CYCLE_ID) }).toArray();
  const live = new Map(liveArr.map(s => [String(s._id), s]));

  for (const [label, bk] of [['05-17', bk17], ['05-16', bk16]]) {
    console.log(`\n${'='.repeat(72)}`);
    console.log(`DEEP-DIFF: content in ${label} backup, EMPTY/MISSING in LIVE now`);
    console.log('='.repeat(72));
    let totalFields = 0, totalChars = 0;
    for (const [id, backup] of bk) {
      const liveDoc = live.get(id);
      const out = [];
      deepDiff(backup, liveDoc, '', out);
      // Filter noise: ignore pure-numeric-string and very short tokens that are
      // likely IDs/enums rather than ST prose. Keep everything >2 chars.
      const real = out.filter(o => o.backup.trim().length > 2);
      if (real.length) {
        console.log(`\n--- ${backup.character_name} (${id})${liveDoc ? '' : '  [NOT IN LIVE]'} ---`);
        for (const o of real) {
          console.log(`  ${o.path}`);
          console.log(`    backup: ${o.backup.slice(0, 240)}`);
          console.log(`    live:   ${o.live}`);
          totalChars += o.backup.length;
        }
        totalFields += real.length;
      }
    }
    if (!totalFields) console.log('  (nothing erased — live has everything the backup had)');
    else console.log(`\n  >>> ${totalFields} field(s), ~${totalChars} chars of content recoverable from ${label}`);
  }

  // Also: which backup records are entirely absent from live, and vice versa
  console.log(`\n${'='.repeat(72)}`);
  console.log('RECORD-LEVEL presence');
  console.log('='.repeat(72));
  const inLiveNotBackup = [...live.keys()].filter(id => !bk17.has(id));
  const inBackupNotLive = [...bk17.keys()].filter(id => !live.has(id));
  console.log(`In LIVE but not 05-17 backup (${inLiveNotBackup.length}): ` +
    inLiveNotBackup.map(id => live.get(id).character_name).join(', '));
  console.log(`In 05-17 backup but not LIVE (${inBackupNotLive.length}): ` +
    inBackupNotLive.map(id => bk17.get(id).character_name).join(', '));

  await client.close();
}

run().catch(err => { console.error(err); process.exit(1); });
