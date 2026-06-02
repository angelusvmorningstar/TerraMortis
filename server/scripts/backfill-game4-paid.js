/**
 * backfill-game4-paid.js
 *
 * Backfills the `paid` boolean on Game 4 attendance entries based on
 * the payment.method values written by the check-in tab (fin.2 schema).
 *
 * Sets paid=true  for: cash, payid, paypal
 * Sets paid=false for: waived, exiles, '' (unrecorded)
 *
 * Run: node --env-file=../.env scripts/backfill-game4-paid.js
 *      node --env-file=../.env scripts/backfill-game4-paid.js --apply
 */

import { MongoClient, ObjectId } from 'mongodb';

const DRY_RUN  = !process.argv.includes('--apply');
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!MONGO_URI) { console.error('MONGO_URI not set'); process.exit(1); }

const DB_NAME      = 'tm_suite';
const GAME4_ID     = new ObjectId('69e998779061c095792fd40c');
const PAID_METHODS = new Set(['cash', 'payid', 'paypal']);

async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  const session = await db.collection('game_sessions').findOne({ _id: GAME4_ID });
  if (!session) {
    console.error(`ABORT: Game 4 session (${GAME4_ID}) not found.`);
    process.exit(1);
  }

  const attendance = session.attendance || [];
  console.log(`${DRY_RUN ? '[DRY RUN] ' : '[APPLY] '}Game 4 (${GAME4_ID}) — ${attendance.length} entries`);

  let trueCount = 0, falseCount = 0;
  const updated = attendance.map(entry => {
    const method = entry?.payment?.method || '';
    const paid = PAID_METHODS.has(method);
    if (paid) trueCount++; else falseCount++;
    return { ...entry, paid };
  });

  if (DRY_RUN) {
    console.log(`  Would set paid=true:  ${trueCount} entries (cash/payid/paypal)`);
    console.log(`  Would set paid=false: ${falseCount} entries (waived/exiles/unrecorded)`);
    console.log('\nRun with --apply to execute.');
  } else {
    await db.collection('game_sessions').updateOne(
      { _id: GAME4_ID },
      { $set: { attendance: updated } }
    );
    console.log(`  paid=true:  ${trueCount} entries`);
    console.log(`  paid=false: ${falseCount} entries`);
    console.log('Done.');
  }

  await client.close();
}

main().catch(err => { console.error(err); process.exit(1); });
