#!/usr/bin/env node
/**
 * One-off retirement: $unset the legacy `selected` boolean from every
 * document in tm_suite.purchasable_powers.
 *
 * Background (issue #5, 2026-05-07):
 *   The Rule Data table now derives the 'Held by' count at render time from
 *   the live character set (admin → Rule Data column). The stored `selected`
 *   flag drifted out of sync with reality and is no longer read or written
 *   anywhere in the codebase; the schema field has been removed in the same
 *   PR. This script clears the dormant key from existing documents so the
 *   on-disk shape matches the new schema.
 *
 * Behaviour:
 *   - DRY-RUN by default: counts and prints the documents that carry the
 *     field. Exits 0 without touching MongoDB.
 *   - --apply: writes a JSON backup of every targeted document
 *     (full body) to server/scripts/_backups/strip-selected-<ISO>.json
 *     BEFORE issuing the $unset. If the backup write throws, the unset
 *     never runs.
 *   - Idempotent: re-running after success matches zero documents and
 *     writes no backup.
 *
 * Usage:
 *   cd server && node scripts/strip-selected-from-purchasable-powers.js
 *   cd server && node scripts/strip-selected-from-purchasable-powers.js --apply
 *
 * Companion changes (this PR):
 *   - server/schemas/purchasable_power.schema.js — `selected` removed from
 *     properties; with `additionalProperties: false`, future POSTs that
 *     include the field will fail validation
 *   - public/js/admin/rules-view.js — 'Held by' column derives count from
 *     live characters, never reads `selected`
 */

import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const APPLY = process.argv.includes('--apply');
const HELP = process.argv.includes('--help') || process.argv.includes('-h');

if (HELP) {
  console.log('Usage: node scripts/strip-selected-from-purchasable-powers.js [--apply]');
  console.log('  Default is DRY-RUN. --apply writes a backup then $unsets `selected` across the collection.');
  process.exit(0);
}

const URI = process.env.MONGODB_URI;
if (!URI) {
  console.error('MONGODB_URI missing — populate server/.env before running.');
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = join(__dirname, '_backups');

const client = new MongoClient(URI);

async function main() {
  await client.connect();
  const db = client.db('tm_suite');
  const col = db.collection('purchasable_powers');

  // Match docs that carry the legacy field. Using $exists rather than
  // matching on value so we catch both `selected: true` and `selected: false`.
  const filter = { selected: { $exists: true } };
  const matches = await col.find(filter).toArray();

  console.log('Mode:    ' + (APPLY ? 'APPLY (will backup + unset)' : 'DRY-RUN'));
  console.log('Matched: ' + matches.length + ' documents with `selected` field');

  if (!matches.length) {
    console.log('already-clean: true   updated: 0');
    await client.close();
    process.exit(0);
  }

  if (!APPLY) {
    // Print a sample so the operator can sanity-check before --apply.
    const sample = matches.slice(0, 5).map(d => ({ key: d.key, name: d.name, selected: d.selected }));
    console.log('Sample (first 5):');
    for (const s of sample) console.log('  - ' + s.key + ' (' + s.name + ') selected=' + s.selected);
    if (matches.length > 5) console.log('  ... and ' + (matches.length - 5) + ' more');
    console.log('Run with --apply to back up and unset.');
    await client.close();
    process.exit(0);
  }

  // Apply path: backup first, then unset.
  mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = join(BACKUP_DIR, 'strip-selected-' + stamp + '.json');
  writeFileSync(backupPath, JSON.stringify(matches, null, 2));
  console.log('Backup written: ' + backupPath);

  const result = await col.updateMany(filter, { $unset: { selected: '' } });
  console.log('updated:       ' + result.modifiedCount);

  // Verify post-state.
  const remaining = await col.countDocuments(filter);
  console.log('remaining:     ' + remaining + ' (expected 0)');
  if (remaining !== 0) {
    console.error('SAFETY: residual documents with `selected` after $unset. Investigate before re-running.');
    await client.close();
    process.exit(2);
  }

  await client.close();
  process.exit(0);
}

main().catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
