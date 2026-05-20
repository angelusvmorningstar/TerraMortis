#!/usr/bin/env node
/**
 * One-shot cleanup: remove stale `benefits` array from all standing merits.
 *
 * The `benefits` field was prototyped to store dot-tier descriptive text per
 * standing merit dot (5 empty strings). No UI ever emitted the 'benefit'
 * field name to shEditStandMerit, so no character ever had non-empty values.
 * The orphan writer in edit-domain.js has been removed (issue #268).
 *
 * Usage:
 *   node server/scripts/remove-benefits-from-standing-merits.js --dry-run
 *   node server/scripts/remove-benefits-from-standing-merits.js --apply
 */

import 'dotenv/config';
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI not set.');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (will write)' : 'DRY RUN (read only)'}`);

  const uri = MONGODB_URI.replace(/[&?]ssl=[^&]*/g, '');
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000, tls: true });

  try {
    await client.connect();
    const dbName = process.env.MONGODB_DB || 'tm_suite';
    const db = client.db(dbName);
    const col = db.collection('characters');

    const characters = await col.find({}).toArray();
    console.log(`Loaded ${characters.length} characters from ${dbName}.characters\n`);

    const toUpdate = [];

    for (const c of characters) {
      const merits = c.merits || [];
      let changed = false;

      for (const m of merits) {
        if (!Object.prototype.hasOwnProperty.call(m, 'benefits')) continue;
        console.log(`${c._id} (${c.name || '—'}) — merit "${m.name || '(unnamed)'}"`);
        console.log(`  benefits (dead field): ${JSON.stringify(m.benefits)}`);
        delete m.benefits;
        changed = true;
      }

      if (changed) toUpdate.push(c);
    }

    console.log(`\nCharacters to update: ${toUpdate.length}`);

    if (DRY_RUN) {
      console.log('DRY RUN — no writes. Re-run with --apply to commit.');
      return;
    }

    if (toUpdate.length === 0) {
      console.log('0 mutations — nothing to write.');
      return;
    }

    let updated = 0;
    for (const c of toUpdate) {
      const result = await col.updateOne({ _id: c._id }, { $set: { merits: c.merits } });
      updated += result.modifiedCount;
    }
    console.log(`\nWrote ${updated} characters.`);

  } finally {
    await client.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
