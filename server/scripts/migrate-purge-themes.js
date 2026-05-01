#!/usr/bin/env node
/* migrate-purge-themes.js
 * Removes legacy Cruac Theme keys from every character's disciplines map.
 * Themes (Creation, Destruction, Divination, Protection, Transmutation) were
 * retired in code at commit fc5af08 but the data was never cleaned.
 * No CP reconciliation required — these are pure import artefacts.
 *
 * Also runs a read-only audit pass on purchasable_powers and reports any
 * Theme entries found there (does NOT auto-delete — see output for counts).
 *
 * Idempotent — safe to re-run.
 *
 * Usage:
 *   cd server
 *   node scripts/migrate-purge-themes.js          # dry-run (default — no writes)
 *   node scripts/migrate-purge-themes.js --apply  # write changes
 */

import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '.env') });

const THEME_KEYS = ['Creation', 'Destruction', 'Divination', 'Protection', 'Transmutation'];

const applyMode = process.argv.includes('--apply');

async function migrate() {
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error('MONGODB_URI not set'); process.exit(1); }

  const dbName = process.env.DB_NAME || 'tm_suite';
  console.log(`Connecting to ${dbName}... (mode: ${applyMode ? 'APPLY' : 'DRY-RUN'})`);

  const uri_clean = uri.replace(/[&?]ssl=[^&]*/g, '');
  const client = new MongoClient(uri_clean, { serverSelectionTimeoutMS: 5000, tls: true });
  await client.connect();
  const db = client.db(dbName);
  const col = db.collection('characters');

  // ── Pass 1: characters ──

  const themeFilter = { $or: THEME_KEYS.map(k => ({ [`disciplines.${k}`]: { $exists: true } })) };
  const affected = await col.find(themeFilter).toArray();
  console.log(`\nFound ${affected.length} character(s) with Theme keys in disciplines.\n`);

  let totalKeysRemoved = 0;

  for (const c of affected) {
    const discs = c.disciplines || {};
    const themeKeysPresent = THEME_KEYS.filter(k => k in discs);
    const remainingKeys = Object.keys(discs).filter(k => !THEME_KEYS.includes(k));
    const name = c.moniker || c.name || String(c._id);

    console.log(`  ${name.padEnd(28)} removing [${themeKeysPresent.join(', ')}]  kept [${remainingKeys.join(', ')}]`);

    if (applyMode) {
      const unsetDoc = Object.fromEntries(THEME_KEYS.map(k => [`disciplines.${k}`, '']));
      await col.updateOne({ _id: c._id }, { $unset: unsetDoc });
    }

    totalKeysRemoved += themeKeysPresent.length;
  }

  console.log(`\nCharacters pass: touched ${affected.length}, total Theme keys ${applyMode ? 'removed' : 'to remove'}: ${totalKeysRemoved}`);

  // ── Pass 2: purchasable_powers audit (read-only always) ──

  const ppCol = db.collection('purchasable_powers');
  const ppThemeCount = await ppCol.countDocuments({
    category: 'discipline',
    name: { $in: THEME_KEYS },
  });

  console.log(`\npurchasable_powers audit: ${ppThemeCount} Theme discipline entries found.`);
  if (ppThemeCount > 0) {
    console.log('  (These were NOT deleted. If removal is desired, re-run with manual confirmation or a targeted $deleteMany.)');
  }

  if (!applyMode) {
    console.log('\nDry-run complete — no changes written. Re-run with --apply to commit.');
  } else {
    console.log('\nApply complete.');
  }

  await client.close();
}

migrate().catch(err => { console.error(err); process.exit(1); });
