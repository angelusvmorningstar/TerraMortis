/**
 * cleanup-sessions-and-cycles.js
 *
 * Cleans up orphaned game_sessions and test downtime_cycles.
 *
 * Operations:
 *   DELETE  6 orphaned sessions (date 2026-05-01, zero attendance)
 *   PATCH   Game 1: set game_number=1, session_date="2026-02-21"
 *   PATCH   Game 2: set game_number=2
 *   PATCH   Game 3: set game_number=3
 *   DELETE  3 test cycles (game_number=99)
 *
 * Run: node --env-file=../.env scripts/cleanup-sessions-and-cycles.js
 *      node --env-file=../.env scripts/cleanup-sessions-and-cycles.js --apply
 */

import { MongoClient, ObjectId } from 'mongodb';

const DRY_RUN = !process.argv.includes('--apply');
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!MONGO_URI) { console.error('MONGO_URI not set'); process.exit(1); }

const DB_NAME = 'tm_suite';

const ORPHAN_SESSION_IDS = [
  '69fc0b9189cbae1cbdcaeb9a',
  '69fc0b9289cbae1cbdcaeb9b',
  '6a0c1e611b85125e3bed32b1',
  '6a0c1e621b85125e3bed32b2',
  '6a0c1e866b75f53426e22954',
  '6a0c1e866b75f53426e22955',
].map(id => new ObjectId(id));

const SESSION_PATCHES = [
  { _id: new ObjectId('69ccd6e4327efb46ce373f45'), $set: { game_number: 1, session_date: '2026-02-21' } },
  { _id: new ObjectId('69ccd95f327efb46ce373f46'), $set: { game_number: 2 } },
  { _id: new ObjectId('69e21a343205c7c7574c769e'), $set: { game_number: 3 } },
];

const ORPHAN_CYCLE_IDS = [
  '69fc0b8de083123d75ab3a1a',
  '6a0c1e5cec036c394a6028af',
  '6a0c1e85c890f59f2faba4c4',
].map(id => new ObjectId(id));

const REAL_SESSION_IDS = [
  '69ccd6e4327efb46ce373f45', // Game 1
  '69ccd95f327efb46ce373f46', // Game 2
  '69e21a343205c7c7574c769e', // Game 3
  '69e998779061c095792fd40c', // Game 4
  '6a1676167fb601cb0460a67e', // Game 5
];

const REAL_CYCLE_IDS = [
  '69f2dc48a77e2f00eb39a43c', // DT1
  '69d0a3c5052b57f6be774e69', // DT2
  '69e955c784bbfc821bed2810', // DT3
  '6a11a3814fce658310cdee80', // DT4
];

async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  const sessions = db.collection('game_sessions');
  const cycles   = db.collection('downtime_cycles');

  console.log(DRY_RUN ? '[DRY RUN] No changes will be made.\n' : '[APPLY] Writing to database.\n');

  // ── Safety checks ─────────────────────────────────────────────────────────

  // 1. Orphaned sessions must exist and have zero attendance
  for (const id of ORPHAN_SESSION_IDS) {
    const doc = await sessions.findOne({ _id: id });
    if (!doc) { console.error(`ABORT: Orphan session ${id} not found — IDs may have changed.`); process.exit(1); }
    const count = (doc.attendance || []).length;
    if (count > 0) { console.error(`ABORT: Session ${id} has ${count} attendance entries — refusing to delete.`); process.exit(1); }
  }

  // 2. Sessions to patch must exist and have attendance (confirms we have the right documents)
  for (const { _id } of SESSION_PATCHES) {
    const doc = await sessions.findOne({ _id });
    if (!doc) { console.error(`ABORT: Session ${_id} not found — IDs may have changed.`); process.exit(1); }
    const count = (doc.attendance || []).length;
    if (count === 0) { console.error(`ABORT: Session ${_id} has no attendance — refusing to patch (wrong document?).`); process.exit(1); }
  }

  // 3. Test cycles must exist and have game_number=99
  for (const id of ORPHAN_CYCLE_IDS) {
    const doc = await cycles.findOne({ _id: id });
    if (!doc) { console.error(`ABORT: Test cycle ${id} not found — IDs may have changed.`); process.exit(1); }
    if (doc.game_number !== 99) { console.error(`ABORT: Cycle ${id} has game_number=${doc.game_number}, not 99 — refusing to delete.`); process.exit(1); }
  }

  console.log('Safety checks passed.\n');

  // ── Operations ────────────────────────────────────────────────────────────

  // Delete orphaned sessions
  if (DRY_RUN) {
    console.log(`[DRY RUN] Would delete ${ORPHAN_SESSION_IDS.length} orphaned sessions:`);
    for (const id of ORPHAN_SESSION_IDS) console.log(`  - ${id}`);
  } else {
    const result = await sessions.deleteMany({ _id: { $in: ORPHAN_SESSION_IDS } });
    console.log(`Deleted ${result.deletedCount} orphaned sessions.`);
  }

  // Patch Games 1–3
  const patchDescriptions = [
    'game_number=1, session_date=2026-02-21',
    'game_number=2',
    'game_number=3',
  ];
  for (let i = 0; i < SESSION_PATCHES.length; i++) {
    const { _id, $set } = SESSION_PATCHES[i];
    if (DRY_RUN) {
      console.log(`[DRY RUN] Would patch ${_id}: ${patchDescriptions[i]}`);
    } else {
      await sessions.updateOne({ _id }, { $set });
      console.log(`Patched session ${_id}: ${patchDescriptions[i]}`);
    }
  }

  // Delete test cycles
  if (DRY_RUN) {
    console.log(`[DRY RUN] Would delete ${ORPHAN_CYCLE_IDS.length} test cycles (game_number=99):`);
    for (const id of ORPHAN_CYCLE_IDS) console.log(`  - ${id}`);
  } else {
    const result = await cycles.deleteMany({ _id: { $in: ORPHAN_CYCLE_IDS } });
    console.log(`Deleted ${result.deletedCount} test cycles.`);
  }

  if (DRY_RUN) {
    console.log('\nRun with --apply to execute.');
  } else {
    // Post-apply verification
    console.log('\n── Verification ──');
    const remainingSessions = await sessions.find({}).toArray();
    console.log(`game_sessions count: ${remainingSessions.length} (expected 5)`);
    for (const s of remainingSessions.sort((a, b) => (a.game_number ?? 0) - (b.game_number ?? 0))) {
      console.log(`  Game ${s.game_number ?? '?'} — ${s.session_date} — ${(s.attendance || []).length} attendance entries`);
    }
    const remainingCycles = await cycles.find({}).toArray();
    console.log(`downtime_cycles count: ${remainingCycles.length} (expected 4)`);
    for (const c of remainingCycles.sort((a, b) => (a.game_number ?? 0) - (b.game_number ?? 0))) {
      console.log(`  DT${c.game_number} — status: ${c.status ?? '—'}`);
    }
  }

  await client.close();
}

main().catch(err => { console.error(err); process.exit(1); });
