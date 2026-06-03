/**
 * delete-yusuf-empty-submissions.js — destructive (DRY-RUN by default).
 *
 * Group B of the orphaned-submission triage (2026-06-03). The character
 * "Yusuf Kalusicj" (69d720427fdd1b1f9498b0d4, Peter's char) carries a set of
 * empty test/dev submissions with NO cycle_id and no content (draft+submitted
 * pairs) left over from exercising the DT form. Delete only those — Yusuf's
 * real, cycle-bound submissions are untouched.
 *
 * Guard (ALL must hold per doc): character_id == Yusuf, cycle_id null/absent,
 * not published, and no feeding/project/sphere/story content. --apply backs up
 * first. Aborts if any matched doc fails the guard.
 *
 * Run:
 *   node server/scripts/delete-yusuf-empty-submissions.js          # dry-run
 *   node server/scripts/delete-yusuf-empty-submissions.js --apply  # execute
 */

import { MongoClient } from 'mongodb';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
try { await import('dotenv/config'); } catch { /* env already set */ }

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!MONGO_URI) { console.error('MONGO_URI / MONGODB_URI not set'); process.exit(1); }
const DB_NAME = 'tm_suite';
const APPLY = process.argv.includes('--apply');
const YUSUF = '69d720427fdd1b1f9498b0d4';

function hasContent(d) {
  const r = d.responses || {};
  for (const k of Object.keys(r)) {
    if (/personal_story|story_moment/.test(k) && r[k]) return true;
    if (/project_\d+_|sphere_\d+_/.test(k) && r[k]) return true;
    if (/feeding_territories/.test(k) && r[k] && r[k] !== '{}' && r[k] !== '') return true;
  }
  return false;
}

async function main() {
  const client = new MongoClient(MONGO_URI); await client.connect();
  const db = client.db(DB_NAME);

  const all = await db.collection('downtime_submissions').find({}).toArray();
  const yusufAll = all.filter(d => String(d.character_id) === YUSUF);
  const targets = yusufAll.filter(d => (d.cycle_id == null || d.cycle_id === '') && !d.published_outcome && !hasContent(d));
  const kept = yusufAll.filter(d => !targets.includes(d));

  console.log(`Yusuf submissions total: ${yusufAll.length}`);
  console.log(`  -> DELETE (no cycle, empty, unpublished): ${targets.length}`);
  targets.forEach(d => console.log(`     ${String(d._id).slice(-6)}  status=${d.status || '-'}  cycle=${d.cycle_id ?? 'null'}`));
  console.log(`  -> KEEP (cycle-bound / has content / published): ${kept.length}`);
  kept.forEach(d => console.log(`     ${String(d._id).slice(-6)}  status=${d.status || '-'}  cycle=${String(d.cycle_id ?? 'null').slice(-6)}  content=${hasContent(d)}  pub=${!!d.published_outcome}`));

  // guard
  const bad = targets.filter(d => (d.cycle_id != null && d.cycle_id !== '') || d.published_outcome || hasContent(d));
  if (bad.length) { console.error(`\nABORT: ${bad.length} target(s) fail the empty/no-cycle/unpublished guard.`); await client.close(); process.exit(2); }

  if (!APPLY) { console.log(`\nDRY-RUN. --apply backs up + deletes the ${targets.length} empty Yusuf test subs.`); await client.close(); return; }

  const stamp = new Date().toISOString().slice(0, 10);
  const backup = `st-working/audit/deleted-yusuf-empty-${stamp}.json`;
  mkdirSync(dirname(backup), { recursive: true });
  writeFileSync(backup, JSON.stringify(targets, null, 2));
  const res = await db.collection('downtime_submissions').deleteMany({ _id: { $in: targets.map(d => d._id) } });
  console.log(`\nDeleted ${res.deletedCount}. Backup: ${backup}`);
  await client.close();
}
main().catch(e => { console.error(e); process.exit(1); });
