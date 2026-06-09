#!/usr/bin/env node

/**
 * One-shot cleanup: remove stale benefit_grants from MCI merits that already
 * have a canonical tier_grants array.
 *
 * Background: migrateBenefitGrantsToTierGrants() skips characters where
 * tier_grants already exists, leaving stale benefit_grants behind after
 * re-edits. detectMerits() in downtime-form.js now prefers tier_grants, so
 * benefit_grants on migrated MCI merits is unreachable dead data.
 *
 * Safe: only touches MCI merits with BOTH tier_grants (non-empty) AND
 * benefit_grants (non-empty). MCI merits with only benefit_grants (untouched
 * legacy characters) are left alone.
 *
 * Usage:
 *   node server/scripts/clean-mci-benefit-grants.js --dry-run
 *   node server/scripts/clean-mci-benefit-grants.js --apply
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
        if (m.name !== 'Mystery Cult Initiation') continue;
        if (!Array.isArray(m.tier_grants) || !m.tier_grants.length) continue;
        if (!Array.isArray(m.benefit_grants) || !m.benefit_grants.filter(Boolean).length) continue;

        console.log(`${c._id} (${c.name || '—'}) — MCI "${m.cult_name || '(no cult name)'}"`);
        console.log(`  benefit_grants (stale): ${JSON.stringify(m.benefit_grants)}`);
        console.log(`  tier_grants   (canonical): ${JSON.stringify(m.tier_grants)}`);
        delete m.benefit_grants;
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
