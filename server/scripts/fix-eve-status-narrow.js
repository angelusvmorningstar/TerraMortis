/**
 * One-shot migration — fix Eve Lockridge's Status merit (Issue #19)
 *
 * Eve's Status merit currently has area: "LGL - Logistics" (free-text, not a
 * canonical sphere). Under the new data model, area must be a canonical sphere
 * from INFLUENCE_SPHERES and narrow must be a non-empty string descriptor.
 *
 * Fix: set area = "Transportation", narrow = "LGL - Logistics" on the Status
 * merit belonging to character _id 69d73ea49162ece35897a488.
 *
 * Idempotent: no-op if the record already has the correct values.
 *
 * Usage:
 *   node server/scripts/fix-eve-status-narrow.js          # dry-run
 *   node server/scripts/fix-eve-status-narrow.js --write  # apply fix
 */

import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config';

const DRY_RUN = !process.argv.includes('--write');

const EVE_ID = new ObjectId('69d73ea49162ece35897a488');
const TARGET_AREA = 'Transportation';
const TARGET_NARROW = 'LGL - Logistics';

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db('tm_suite');
  const col = db.collection('characters');

  const eve = await col.findOne({ _id: EVE_ID }, { projection: { name: 1, merits: 1 } });

  if (!eve) {
    console.log(`ERROR: Character ${EVE_ID} not found.`);
    await client.close();
    process.exit(1);
  }

  const statusIdx = (eve.merits || []).findIndex(m => m.name === 'Status');

  if (statusIdx === -1) {
    console.log(`No Status merit found on ${eve.name} — nothing to do.`);
    await client.close();
    return;
  }

  const m = eve.merits[statusIdx];

  console.log(`\nCharacter: ${eve.name} (${EVE_ID})`);
  console.log(`Status merit [index ${statusIdx}]:`);
  console.log(`  Current area:   ${JSON.stringify(m.area)}`);
  console.log(`  Current narrow: ${JSON.stringify(m.narrow)}`);

  if (m.area === TARGET_AREA && m.narrow === TARGET_NARROW) {
    console.log('\nAlready correct — no-op.');
    await client.close();
    return;
  }

  console.log(`\nProposed fix:`);
  console.log(`  area:   ${JSON.stringify(m.area)} → ${JSON.stringify(TARGET_AREA)}`);
  console.log(`  narrow: ${JSON.stringify(m.narrow)} → ${JSON.stringify(TARGET_NARROW)}`);

  if (DRY_RUN) {
    console.log(`\nDRY RUN — no changes written. Re-run with --write to apply.`);
    await client.close();
    return;
  }

  const result = await col.updateOne(
    { _id: EVE_ID, 'merits.name': 'Status' },
    { $set: {
      [`merits.${statusIdx}.area`]: TARGET_AREA,
      [`merits.${statusIdx}.narrow`]: TARGET_NARROW
    } }
  );

  console.log(`\nDone. Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}`);
  await client.close();
}

run().catch(err => { console.error(err); process.exit(1); });
