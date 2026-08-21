/**
 * Issue #840 — set sub_category:'influence' on the Contacts merit rule.
 *
 * The Contacts rule in `purchasable_powers` has `sub_category: null` while every
 * other influence merit (Allies/Mentor/Resources/Retainer/Staff/Status/Attaché)
 * has `sub_category: 'influence'`. The editor's influence-merit type dropdown is
 * built by buildSubCategoryMeritOptions() which filters `sub_category === 'influence'`,
 * so Contacts is the only influence merit missing from the picker — making it
 * impossible to add a Contacts merit from the editor. This corrects the data.
 *
 * Idempotent: re-running after the fix touches 0 docs. `--dry-run` is the default;
 * pass `--apply` to write. Run from `server/` so dotenv picks up server/.env.
 *
 * Write shape: updateOne({key:'contacts'}, {$set:{sub_category:'influence'}}) —
 * targeted single-field set; nothing else on the doc is touched.
 *
 * Usage:
 *   cd server && node scripts/set-contacts-influence-subcategory.js
 *   cd server && node scripts/set-contacts-influence-subcategory.js --apply
 */

import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { pathToFileURL } from 'node:url';

const DB_NAME = process.env.MONGODB_DB || 'tm_game';

export async function main() {
  const APPLY = process.argv.includes('--apply');
  const DRY_RUN = !APPLY;
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.error('MONGODB_URI not set. Ensure server/.env is present and run from server/.');
    process.exit(1);
  }
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  try {
    const powers = client.db(DB_NAME).collection('purchasable_powers');

    console.log(`\n${DRY_RUN ? '[DRY RUN]' : '[APPLY]'} set-contacts-influence-subcategory.js`);
    console.log(`Database: ${DB_NAME}\n`);

    const before = await powers.findOne(
      { key: 'contacts' },
      { projection: { _id: 1, name: 1, category: 1, sub_category: 1 } }
    );

    if (!before) {
      console.error("No purchasable_powers doc with key 'contacts' found. Aborting (nothing to do).");
      process.exitCode = 1;
      return;
    }

    console.log(`  Found: ${before.name} (category=${before.category}, sub_category=${before.sub_category === null ? 'null' : `'${before.sub_category}'`})`);

    if (before.sub_category === 'influence') {
      console.log('  Already sub_category=\'influence\' — nothing to do (idempotent no-op).');
      return;
    }

    if (DRY_RUN) {
      console.log("  Would set sub_category -> 'influence'.");
      console.log('\n[DRY RUN] Re-run with --apply to write.');
      return;
    }

    const res = await powers.updateOne({ key: 'contacts' }, { $set: { sub_category: 'influence' } });
    const after = await powers.findOne({ key: 'contacts' }, { projection: { sub_category: 1 } });
    console.log(`  matched=${res.matchedCount} modified=${res.modifiedCount} — sub_category now '${after?.sub_category}'.`);
    console.log('\n[APPLY] Done. Re-run with no flag (dry-run) to confirm the idempotent no-op.');
  } finally {
    await client.close();
  }
}

// Cross-platform direct-invocation guard (pathToFileURL handles Windows paths +
// spaces; the naive `file://${argv[1]}` form silently no-ops on Windows).
const _invokedDirectly = import.meta.url === pathToFileURL(process.argv[1]).href;
if (_invokedDirectly) {
  main().catch(err => { console.error(err); process.exit(1); });
}
