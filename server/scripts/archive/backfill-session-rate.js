#!/usr/bin/env node

/**
 * Backfill session_rate on existing game_sessions.
 *
 * FIN-7 introduced a single per-session door fee (`session_rate`). This
 * script writes `session_rate: 15` on every session that doesn't already
 * carry one. Existing per-row `payment.amount` values are NOT modified —
 * historical record is preserved.
 *
 * Idempotent: re-running produces zero updates.
 *
 * Database: tm_suite (override with MONGODB_URI / MONGODB_DB)
 *
 * Usage:
 *   node server/scripts/backfill-session-rate.js --dry-run
 *   node server/scripts/backfill-session-rate.js --apply
 */

import 'dotenv/config';
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI not set.');
  process.exit(1);
}

const DEFAULT_RATE = 15;
const APPLY = process.argv.includes('--apply');
const DRY_RUN = process.argv.includes('--dry-run') || !APPLY;

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (will write)' : 'DRY RUN (read only)'}`);
  const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DB || 'tm_suite');

    const filter = { session_rate: { $exists: false } };
    const targets = await db.collection('game_sessions').find(filter).toArray();
    console.log(`Sessions missing session_rate: ${targets.length}`);

    for (const s of targets) {
      const label = s.title || s.session_date || String(s._id);
      console.log(`  ${label}`);
    }

    if (APPLY && targets.length > 0) {
      const result = await db.collection('game_sessions').updateMany(
        filter,
        { $set: { session_rate: DEFAULT_RATE } }
      );
      console.log(`\nUpdated ${result.modifiedCount} sessions to session_rate=${DEFAULT_RATE}`);
    } else if (DRY_RUN && targets.length > 0) {
      console.log(`\nDRY RUN — would set session_rate=${DEFAULT_RATE} on ${targets.length} sessions. Re-run with --apply to commit.`);
    } else {
      console.log('\nAll sessions already carry session_rate. Nothing to do.');
    }

  } finally {
    await client.close();
  }
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
