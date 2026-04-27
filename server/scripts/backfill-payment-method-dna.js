#!/usr/bin/env node

/**
 * Normalise legacy 'did_not_attend' payment-method values.
 *
 * FIN-6 dropped 'did_not_attend' from the payment-method enum; the attendance
 * checkbox is the canonical signal for "wasn't there". This script rewrites
 * any historical attendance row that holds payment.method === 'did_not_attend'
 * (or the legacy payment_method mirror) to method='' and amount=0.
 *
 * The row's `attended` boolean is NOT modified — preserve whatever the source
 * said about attendance.
 *
 * Idempotent: re-running produces zero updates.
 *
 * Database: tm_suite (override with MONGODB_URI / MONGODB_DB)
 *
 * Usage:
 *   node server/scripts/backfill-payment-method-dna.js --dry-run
 *   node server/scripts/backfill-payment-method-dna.js --apply
 */

import 'dotenv/config';
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI not set.');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const DRY_RUN = process.argv.includes('--dry-run') || !APPLY;

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (will write)' : 'DRY RUN (read only)'}`);
  const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DB || 'tm_suite');

    const sessions = await db.collection('game_sessions').find({}).toArray();
    console.log(`Loaded ${sessions.length} game sessions\n`);

    let totalRows = 0;

    for (const session of sessions) {
      if (!Array.isArray(session.attendance)) continue;

      let touched = 0;
      const next = session.attendance.map(a => {
        const m  = a.payment?.method;
        const lm = a.payment_method;
        if (m !== 'did_not_attend' && lm !== 'did_not_attend') return a;
        touched++;
        return {
          ...a,
          payment: { ...(a.payment || {}), method: '', amount: 0 },
          payment_method: '',
        };
      });

      if (touched > 0) {
        const label = session.title || session.session_date || String(session._id);
        console.log(`${label}: touched=${touched}`);
        totalRows += touched;
        if (APPLY) {
          await db.collection('game_sessions').updateOne(
            { _id: session._id },
            { $set: { attendance: next, updated_at: new Date().toISOString() } }
          );
        }
      }
    }

    console.log('\n── Summary ──');
    console.log(`${APPLY ? 'Updated' : 'Would update'}: ${totalRows} attendance rows`);

    if (DRY_RUN && totalRows > 0) {
      console.log('\nDRY RUN — no changes written. Re-run with --apply to commit.');
    }

  } finally {
    await client.close();
  }
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
