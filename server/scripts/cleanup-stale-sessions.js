#!/usr/bin/env node

/**
 * One-shot cleanup of stale rows in tm_suite.game_sessions
 * (spec: specs/stories/spec-next-session-deadline-fix.md).
 *
 * Removes 5 ghost duplicates and clears one stale downtime_deadline string
 * so /api/game_sessions/next resolves to the correct row and the active
 * downtime cycle's deadline merges into the public banner.
 *
 * Database: tm_suite (override with MONGODB_URI / MONGODB_DB)
 *
 * Usage:
 *   node server/scripts/cleanup-stale-sessions.js --dry-run
 *   node server/scripts/cleanup-stale-sessions.js --apply
 */

import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI not set.');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const DRY_RUN = process.argv.includes('--dry-run') || !APPLY;

const DELETE_IDS = [
  '69e9988e6cfcff98004f8fbd', // ghost 2026-05-01 Game 3
  '69e998f331c825dc1c592b6b', // ghost 2026-05-01 Game 3
  '69e9988e6cfcff98004f8fbe', // ghost 2026-05-01 Game 4
  '69e998779061c095792fd40d', // ghost 2026-05-01 Game 4
  '69e998f331c825dc1c592b6c', // ghost 2026-05-01 Game 4 (missed in initial scan; surfaced post-cleanup)
  '69e6b14021ebb452b36aa47c', // duplicate 2026-05-23 Game 4 (carried stale "April 13th" deadline string)
];

const UNSET_ID = '69e998779061c095792fd40c'; // canonical 2026-05-23 Game 4 — stale "April 13th" string

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (will write)' : 'DRY RUN (read only)'}`);
  const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DB || 'tm_suite');
    const col = db.collection('game_sessions');

    // ── Preview deletes ──────────────────────────────────────────────────────
    const deleteOids = DELETE_IDS.map(id => new ObjectId(id));
    const toDelete = await col
      .find({ _id: { $in: deleteOids } })
      .project({ session_date: 1, game_number: 1, doors_open: 1, downtime_deadline: 1 })
      .toArray();

    console.log(`\nFound ${toDelete.length} of ${DELETE_IDS.length} target rows to delete:`);
    for (const r of toDelete) {
      console.log(`  ${r._id} — ${r.session_date} game ${r.game_number} doors=${r.doors_open || '—'} deadline=${r.downtime_deadline || '—'}`);
    }

    // ── Preview unset ────────────────────────────────────────────────────────
    const unsetOid = new ObjectId(UNSET_ID);
    const unsetTarget = await col.findOne(
      { _id: unsetOid },
      { projection: { session_date: 1, game_number: 1, downtime_deadline: 1 } }
    );

    if (unsetTarget) {
      console.log(`\n$unset target: ${unsetTarget._id} — ${unsetTarget.session_date} game ${unsetTarget.game_number}`);
      console.log(`  current downtime_deadline: ${unsetTarget.downtime_deadline ?? '(already absent)'}`);
    } else {
      console.log(`\n$unset target ${UNSET_ID} NOT FOUND. Skipping unset.`);
    }

    // ── Apply or dry-run summary ─────────────────────────────────────────────
    if (!APPLY) {
      console.log(`\nDRY RUN — would delete ${toDelete.length} rows and ${unsetTarget?.downtime_deadline ? 'unset' : 'no-op unset'}. Re-run with --apply to commit.`);
      return;
    }

    if (toDelete.length > 0) {
      const delResult = await col.deleteMany({ _id: { $in: deleteOids } });
      console.log(`\nDeleted ${delResult.deletedCount} rows.`);
    } else {
      console.log('\nNo rows matched delete filter (already cleaned).');
    }

    if (unsetTarget?.downtime_deadline !== undefined) {
      const unsetResult = await col.updateOne(
        { _id: unsetOid },
        { $unset: { downtime_deadline: '' } }
      );
      console.log(`Unset downtime_deadline on ${unsetResult.modifiedCount} row.`);
    } else {
      console.log('No unset needed.');
    }

    // ── Verify final state ───────────────────────────────────────────────────
    console.log('\n── Post-cleanup state (game_sessions sorted by date) ──');
    const remaining = await col
      .find({})
      .project({ session_date: 1, game_number: 1, doors_open: 1, downtime_deadline: 1 })
      .sort({ session_date: 1 })
      .toArray();
    for (const r of remaining) {
      console.log(`  ${r._id} — ${r.session_date} game ${r.game_number} doors=${r.doors_open || '—'} deadline=${r.downtime_deadline || '—'}`);
    }
    console.log(`\nTotal sessions: ${remaining.length}`);
  } finally {
    await client.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
