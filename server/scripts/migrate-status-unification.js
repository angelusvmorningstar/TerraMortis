#!/usr/bin/env node
/* migrate-status-unification.js
 * Converts status.covenant from integer to object keyed by full covenant name.
 * Merges covenant_standings entries (short-key → full-name mapping).
 * Removes covenant_standings field.
 * Idempotent — safe to run multiple times.
 *
 * Usage:
 *   cd server
 *   MONGODB_URI="mongodb+srv://..." node scripts/migrate-status-unification.js
 *   # Or with explicit db name:
 *   MONGODB_URI="mongodb+srv://..." DB_NAME=tm_suite_dev node scripts/migrate-status-unification.js
 */

import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '.env') });

const COVENANTS = [
  'Carthian Movement', 'Circle of the Crone',
  'Invictus', 'Lancea et Sanctum', 'Ordo Dracul',
];

const COV_SHORT_TO_FULL = {
  'Carthian': 'Carthian Movement',
  'Crone':    'Circle of the Crone',
  'Invictus': 'Invictus',
  'Lance':    'Lancea et Sanctum',
  'Ordo':     'Ordo Dracul',
};

function zeroCovObject() {
  return Object.fromEntries(COVENANTS.map(c => [c, 0]));
}

async function migrate() {
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error('MONGODB_URI not set'); process.exit(1); }

  const dbName = process.env.DB_NAME || 'tm_suite_dev';
  console.log(`Connecting to ${dbName}...`);

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const col = db.collection('characters');

  const chars = await col.find({}).toArray();
  console.log(`Found ${chars.length} characters`);

  let updated = 0, skipped = 0, orphansDiscarded = 0, mappingsApplied = 0;

  for (const c of chars) {
    const st = c.status || {};

    // Idempotency guard: if status.covenant is already an object, skip
    if (st.covenant !== null && st.covenant !== undefined && typeof st.covenant === 'object') {
      skipped++;
      continue;
    }

    const ownCovInt = typeof st.covenant === 'number' ? st.covenant : 0;
    const ownCovName = c.covenant || '';
    const standings = c.covenant_standings || {};

    // Build new covenant object
    const newCov = zeroCovObject();

    // Set own covenant status from the authoritative integer
    if (ownCovName && COVENANTS.includes(ownCovName)) {
      newCov[ownCovName] = ownCovInt;
    }

    // Merge covenant_standings entries (short-key → full-name)
    for (const [shortKey, val] of Object.entries(standings)) {
      const fullName = COV_SHORT_TO_FULL[shortKey] || shortKey;

      // Skip own-covenant duplicates
      if (fullName === ownCovName) {
        if (val !== ownCovInt) {
          console.log(`  ${c.moniker || c.name}: discarding own-covenant duplicate ${shortKey}=${val} (authoritative: ${ownCovInt})`);
        }
        orphansDiscarded++;
        continue;
      }

      // Map to full name
      if (COVENANTS.includes(fullName)) {
        newCov[fullName] = val || 0;
        if (shortKey !== fullName) mappingsApplied++;
      } else {
        console.warn(`  ${c.moniker || c.name}: unknown covenant_standings key "${shortKey}" — skipped`);
      }
    }

    // Write update
    await col.updateOne(
      { _id: c._id },
      {
        $set: { 'status.covenant': newCov },
        $unset: { covenant_standings: '' },
      }
    );
    updated++;
    console.log(`  ${(c.moniker || c.name).padEnd(25)} → ${JSON.stringify(newCov)}`);
  }

  console.log(`\nDone.`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped (already migrated): ${skipped}`);
  console.log(`  Own-covenant orphans discarded: ${orphansDiscarded}`);
  console.log(`  Short-key → full-name mappings: ${mappingsApplied}`);

  await client.close();
}

migrate().catch(err => { console.error(err); process.exit(1); });
