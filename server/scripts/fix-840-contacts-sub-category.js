/**
 * Fix #840 — Contacts missing from influence merit dropdown.
 *
 * `Contacts` in `purchasable_powers` has `sub_category: null` in prod.
 * `buildSubCategoryMeritOptions(c, 'influence', ...)` at
 * public/js/editor/merits.js:363 filters by `rule.sub_category === subCategory`,
 * so Contacts is silently excluded from the influence picker.
 *
 * The original migration script (server/scripts/archive/migrate-merit-sub-category.js)
 * listed Contacts in INFLUENCE_NAMES but the prod document was never updated.
 *
 * This script is scoped to the single Contacts document only. No other
 * purchasable_powers documents are touched.
 *
 * Idempotent. Dry-run default; pass --apply to write.
 */

import 'dotenv/config';
import { MongoClient } from 'mongodb';

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || 'tm_game';

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (will write)' : 'DRY RUN (read only; pass --apply to write)'}`);
  console.log(`Target DB: ${DB_NAME}\n`);

  const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 10000, tls: true });
  try {
    await client.connect();
    const col = client.db(DB_NAME).collection('purchasable_powers');

    const doc = await col.findOne({ name: 'Contacts' }, { projection: { name: 1, sub_category: 1 } });

    if (!doc) {
      console.error('  Contacts  NOT FOUND — aborting');
      process.exit(1);
    }

    if (doc.sub_category === 'influence') {
      console.log('  Contacts  already correct (sub_category=\'influence\') — no-op');
      process.exit(0);
    }

    console.log(`  Contacts  sub_category=${doc.sub_category ?? 'null'} → 'influence'`);

    if (APPLY) {
      await col.updateOne({ name: 'Contacts' }, { $set: { sub_category: 'influence' } });
      console.log('\nWrote 1 doc.');
    } else {
      console.log('\n[DRY RUN] Pass --apply to write.');
    }
  } finally {
    await client.close();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
