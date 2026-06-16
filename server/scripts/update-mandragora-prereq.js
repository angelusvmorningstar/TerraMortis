#!/usr/bin/env node

/**
 * N-8 (issue #761, Peter decisions C + D 2026-06-15) — Mandragora Garden
 * prereq amendment.
 *
 * Replaces the `mandragora-garden` rule's `prereq` block in the
 * `purchasable_powers` collection with the new OR-of-AND structure that
 * accepts:
 *
 *   - Either a Safe Place OR a Necropolis Sepulcher at the same dot level
 *     ("same level" qualifier on both branches — Sepulcher's dot count
 *     gates Mandragora the same way Safe Place does)
 *   - Either Crúac discipline 1+ OR Fucking Thief merit (permissive — any
 *     qualifier state; FT-purchased merits enter via dedicated
 *     buildFThiefOptions, so the general dropdown filter doesn't need a
 *     FT carve-out)
 *
 * Idempotent — re-running matches the same doc and writes the same prereq.
 * --dry-run default, --apply to write. Mirrors the N-3 / STM-13 / N-2
 * seeder pattern.
 *
 * Usage:
 *   node server/scripts/update-mandragora-prereq.js               # dry-run preview
 *   node server/scripts/update-mandragora-prereq.js --apply       # write
 *   MONGODB_DB=tm_suite_test node server/scripts/update-mandragora-prereq.js --apply
 *
 * Locally, run from `server/` so cwd-relative `dotenv/config` picks up
 * `server/.env`. On Render env vars are pre-set (no-op).
 */

import 'dotenv/config';
import { MongoClient } from 'mongodb';

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || 'tm_suite';

if (!MONGODB_URI) {
  console.error('MONGODB_URI not set. Ensure server/.env is present and run from server/.');
  process.exit(1);
}

// 'Crúac' carries U+00FA — preserved verbatim per existing codebase usage
// (downtime-data.js, print/layout.js); prereq.js:56 has an accent-normalised
// fallback so 'Cruac' (ASCII) would also match if needed.
export const MANDRAGORA_PREREQ = {
  all: [
    {
      any: [
        { type: 'merit', name: 'Safe Place',           dots: 1, qualifier: 'same level' },
        { type: 'merit', name: 'Necropolis Sepulcher', dots: 1, qualifier: 'same level' },
      ],
    },
    {
      any: [
        { type: 'discipline', name: 'Crúac', dots: 1 },
        { type: 'merit',      name: 'Fucking Thief' },
      ],
    },
  ],
};

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (will write)' : 'DRY RUN (read only; pass --apply to write)'}`);
  console.log(`Target DB: ${DB_NAME}\n`);

  const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 10000, tls: true });
  try {
    await client.connect();
    const col = client.db(DB_NAME).collection('purchasable_powers');

    const existing = await col.findOne({ key: 'mandragora-garden' });
    if (!existing) {
      console.error('mandragora-garden rule doc not found in purchasable_powers. Aborting.');
      process.exit(2);
    }

    const same = JSON.stringify(existing.prereq) === JSON.stringify(MANDRAGORA_PREREQ);
    if (same) {
      console.log('mandragora-garden prereq already matches the target shape. No-op.');
      return;
    }

    console.log('Current prereq:');
    console.log(JSON.stringify(existing.prereq, null, 2));
    console.log('\nTarget prereq:');
    console.log(JSON.stringify(MANDRAGORA_PREREQ, null, 2));

    if (DRY_RUN) {
      console.log('\n[DRY RUN] Would replace prereq with the target shape. Pass --apply to write.');
      return;
    }

    await col.updateOne({ key: 'mandragora-garden' }, { $set: { prereq: MANDRAGORA_PREREQ } });
    console.log('\nWrote new prereq. Idempotency check: re-run with no flag and confirm "already matches".');
  } finally {
    await client.close();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
