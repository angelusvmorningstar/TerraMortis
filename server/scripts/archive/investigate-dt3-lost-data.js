#!/usr/bin/env node
// READ-ONLY investigation: compare DT3 backups against live MongoDB to find
// erased ST notes (resolved-array st_note / notes_thread / etc.) and DT Story
// revision notes (st_narrative.*.revision_note / status).
// Usage: cd server && node scripts/investigate-dt3-lost-data.js

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

const RESOLVED_ARRAYS = [
  'projects_resolved', 'acquisitions_resolved', 'merit_actions_resolved',
  'sorcery_review', 'feeding_review',
];
// Note-bearing fields inside each resolved-array entry
const NOTE_FIELDS = [
  'st_note', 'player_facing_note', 'player_feedback',
  'outcome_summary', 'story_context',
];

function isNonEmptyStr(v) { return typeof v === 'string' && v.trim().length > 0; }
function isNonEmptyArr(v) { return Array.isArray(v) && v.length > 0; }

// Resolved arrays may be stored as a true array OR an object keyed by index.
// Normalise to an array of [key, entry] pairs.
function entriesOf(v) {
  if (Array.isArray(v)) return v.map((e, i) => [String(i), e]);
  if (v && typeof v === 'object') return Object.entries(v);
  return [];
}

function loadBackup(name) {
  const arr = JSON.parse(readFileSync(join(REPO_ROOT, name), 'utf8'));
  const map = new Map();
  for (const s of arr) map.set(String(s._id?.$oid || s._id), s);
  return map;
}

// Compare one backup record against one live record, return list of losses
function diffRecord(backup, live, label) {
  const losses = [];
  const name = backup.character_name || live?.character_name || '?';

  // ── Resolved-array ST notes ──
  for (const arrKey of RESOLVED_ARRAYS) {
    const bEntries = entriesOf(backup[arrKey]);
    const lMap = new Map(entriesOf(live?.[arrKey]));
    for (const [key, bEntryRaw] of bEntries) {
      const bEntry = bEntryRaw || {};
      const lEntry = lMap.get(key) || {};
      for (const f of NOTE_FIELDS) {
        if (isNonEmptyStr(bEntry[f]) && !isNonEmptyStr(lEntry[f])) {
          losses.push({
            name, label, where: `${arrKey}[${key}].${f}`,
            backupValue: bEntry[f], liveValue: lEntry[f] ?? '(missing)',
          });
        }
      }
      // notes_thread is an array of message objects
      const bThread = bEntry.notes_thread;
      const lThread = lEntry.notes_thread;
      if (isNonEmptyArr(bThread) && (bThread.length > (lThread?.length || 0))) {
        losses.push({
          name, label, where: `${arrKey}[${key}].notes_thread`,
          backupValue: `${bThread.length} message(s): ` +
            bThread.map(m => `"${(m.text || '').slice(0, 60)}"`).join(' | '),
          liveValue: `${lThread?.length || 0} message(s)`,
        });
      }
    }
  }

  // ── Top-level st_notes ──
  if (isNonEmptyStr(backup.st_notes) && !isNonEmptyStr(live?.st_notes)) {
    losses.push({
      name, label, where: 'st_notes (top-level)',
      backupValue: backup.st_notes, liveValue: live?.st_notes ?? '(missing)',
    });
  }

  // ── st_narrative revision notes / statuses ──
  const bN = backup.st_narrative || {};
  const lN = live?.st_narrative || {};
  for (const section of Object.keys(bN)) {
    const bSec = bN[section];
    const lSec = lN[section];
    if (Array.isArray(bSec)) {
      for (let i = 0; i < bSec.length; i++) {
        const be = bSec[i] || {}, le = (Array.isArray(lSec) ? lSec[i] : null) || {};
        if (isNonEmptyStr(be.revision_note) && !isNonEmptyStr(le.revision_note)) {
          losses.push({ name, label, where: `st_narrative.${section}[${i}].revision_note`,
            backupValue: be.revision_note, liveValue: le.revision_note ?? '(missing)' });
        }
        if (be.status === 'needs_revision' && le.status !== 'needs_revision') {
          losses.push({ name, label, where: `st_narrative.${section}[${i}].status`,
            backupValue: 'needs_revision', liveValue: le.status ?? '(missing)' });
        }
      }
    } else if (bSec && typeof bSec === 'object') {
      if (isNonEmptyStr(bSec.revision_note) && !isNonEmptyStr(lSec?.revision_note)) {
        losses.push({ name, label, where: `st_narrative.${section}.revision_note`,
          backupValue: bSec.revision_note, liveValue: lSec?.revision_note ?? '(missing)' });
      }
      if (bSec.status === 'needs_revision' && lSec?.status !== 'needs_revision') {
        losses.push({ name, label, where: `st_narrative.${section}.status`,
          backupValue: 'needs_revision', liveValue: lSec?.status ?? '(missing)' });
      }
    }
  }

  return losses;
}

async function run() {
  const bk16 = loadBackup('backup_downtime_3_2026-05-16.json');
  const bk17 = loadBackup('backup_downtime_3_2026-05-17.json');
  console.log(`Backup 05-16: ${bk16.size} records`);
  console.log(`Backup 05-17: ${bk17.size} records`);

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const col = client.db('tm_suite').collection('downtime_submissions');
  const liveArr = await col.find({ cycle_id: new ObjectId(DT3_CYCLE_ID) }).toArray();
  const live = new Map(liveArr.map(s => [String(s._id), s]));
  console.log(`Live DT3:    ${live.size} records\n`);

  // Summary counts of note-bearing fields per source
  function countNotes(records) {
    let stNote = 0, thread = 0, otherNote = 0, revNote = 0, needsRev = 0;
    for (const s of records) {
      for (const arrKey of RESOLVED_ARRAYS) {
        for (const [, e] of entriesOf(s[arrKey])) {
          if (!e) continue;
          if (isNonEmptyStr(e.st_note)) stNote++;
          if (isNonEmptyArr(e.notes_thread)) thread += e.notes_thread.length;
          for (const f of NOTE_FIELDS) if (f !== 'st_note' && isNonEmptyStr(e[f])) otherNote++;
        }
      }
      const n = s.st_narrative || {};
      for (const sec of Object.values(n)) {
        const list = Array.isArray(sec) ? sec : [sec];
        for (const e of list) {
          if (e && isNonEmptyStr(e.revision_note)) revNote++;
          if (e && e.status === 'needs_revision') needsRev++;
        }
      }
    }
    return { stNote, thread, otherNote, revNote, needsRev };
  }
  const c16 = countNotes([...bk16.values()]);
  const c17 = countNotes([...bk17.values()]);
  const cLive = countNotes(liveArr);
  console.log('Field-population tally (st_note / notes_thread msgs / other-notes / revision_note / needs_revision):');
  console.log(`  05-16 backup: ${c16.stNote} / ${c16.thread} / ${c16.otherNote} / ${c16.revNote} / ${c16.needsRev}`);
  console.log(`  05-17 backup: ${c17.stNote} / ${c17.thread} / ${c17.otherNote} / ${c17.revNote} / ${c17.needsRev}`);
  console.log(`  LIVE now:     ${cLive.stNote} / ${cLive.thread} / ${cLive.otherNote} / ${cLive.revNote} / ${cLive.needsRev}`);
  console.log('');

  // Diff each backup against live
  for (const [label, bk] of [['05-17', bk17], ['05-16', bk16]]) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`LOSSES: present in ${label} backup, empty/missing in LIVE`);
    console.log('='.repeat(70));
    let total = 0;
    for (const [id, backup] of bk) {
      const losses = diffRecord(backup, live.get(id), label);
      if (losses.length) {
        console.log(`\n--- ${backup.character_name} (${id}) ---`);
        for (const l of losses) {
          console.log(`  [${l.where}]`);
          console.log(`    backup: ${String(l.backupValue).slice(0, 200)}`);
          console.log(`    live:   ${l.liveValue}`);
        }
        total += losses.length;
      }
    }
    if (!total) console.log('  (none)');
    else console.log(`\n  >>> ${total} lost field(s) recoverable from ${label} backup`);
  }

  await client.close();
}

run().catch(err => { console.error(err); process.exit(1); });
