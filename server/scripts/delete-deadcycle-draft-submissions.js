/**
 * delete-deadcycle-draft-submissions.js — destructive (DRY-RUN by default).
 *
 * Group C of the orphaned-submission triage (2026-06-03). A few DRAFT
 * submissions point at cycle_ids that no longer exist — the test DT cycles
 * cleaned up in #546. Their characters are real (Alice Vunder, Livia) but the
 * cycle is gone, the draft was never published, and it is stranded.
 *
 * Guard (ALL must hold per doc): cycle_id is non-null, cycle_id is NOT a current
 * downtime_cycle, status is draft, and not published. Aborts otherwise.
 * --apply backs up first.
 *
 * NOTE: only deletes drafts whose cycle is genuinely missing. A draft on a LIVE
 * cycle, or a published/submitted record, is never touched.
 *
 * Run:
 *   node server/scripts/delete-deadcycle-draft-submissions.js          # dry-run
 *   node server/scripts/delete-deadcycle-draft-submissions.js --apply  # execute
 */

import { MongoClient } from 'mongodb';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
try { await import('dotenv/config'); } catch { /* env already set */ }

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!MONGO_URI) { console.error('MONGO_URI / MONGODB_URI not set'); process.exit(1); }
const DB_NAME = 'tm_suite';
const APPLY = process.argv.includes('--apply');

async function main() {
  const client = new MongoClient(MONGO_URI); await client.connect();
  const db = client.db(DB_NAME);

  const cycleIds = new Set((await db.collection('downtime_cycles').find({}, { projection: { _id: 1 } }).toArray()).map(c => String(c._id)));
  const chars = new Map((await db.collection('characters').find({}, { projection: { name: 1 } }).toArray()).map(c => [String(c._id), c.name]));
  const all = await db.collection('downtime_submissions').find({}).toArray();

  const targets = all.filter(d => d.cycle_id != null && d.cycle_id !== '' && !cycleIds.has(String(d.cycle_id)) && d.status === 'draft' && !d.published_outcome);

  console.log(`Draft submissions on a MISSING cycle (unpublished): ${targets.length}`);
  targets.forEach(d => console.log(`  ${String(d._id).slice(-6)}  char=${chars.get(String(d.character_id)) || String(d.character_id).slice(-8)}  dead-cycle=${String(d.cycle_id).slice(-8)}  status=${d.status}`));

  const bad = targets.filter(d => cycleIds.has(String(d.cycle_id)) || d.status !== 'draft' || d.published_outcome);
  if (bad.length) { console.error(`\nABORT: ${bad.length} target(s) fail the dead-cycle/draft/unpublished guard.`); await client.close(); process.exit(2); }

  if (!APPLY) { console.log(`\nDRY-RUN. --apply backs up + deletes the ${targets.length} dead-cycle drafts.`); await client.close(); return; }

  const stamp = new Date().toISOString().slice(0, 10);
  const backup = `st-working/audit/deleted-deadcycle-drafts-${stamp}.json`;
  mkdirSync(dirname(backup), { recursive: true });
  writeFileSync(backup, JSON.stringify(targets, null, 2));
  const res = await db.collection('downtime_submissions').deleteMany({ _id: { $in: targets.map(d => d._id) } });
  console.log(`\nDeleted ${res.deletedCount}. Backup: ${backup}`);
  await client.close();
}
main().catch(e => { console.error(e); process.exit(1); });
