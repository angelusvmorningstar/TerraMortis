#!/usr/bin/env node
/**
 * One-off retirement: back up tm_suite.territory_residency to JSON, then drop
 * the collection.
 *
 * Rationale (per audit 2026-05-05):
 *   - Story fix.39 (2026-04-11) declared `territories.feeding_rights` canonical;
 *     `territory_residency` was kept "in place but no longer used for feeding
 *     rights". The collection has been orphaned since.
 *   - ADR-002 Q5 (2026-05-05) parked the collection as "revivable" but a
 *     follow-up audit found 4 stale documents from 2026-04-04 to 2026-04-06
 *     with zero character-ID overlap with `territories.feeding_rights` for the
 *     same territory, and residents arrays mixing character _ids with plain
 *     name strings ("Ryan Ambrose", "Margaret Kane", "Keeper").
 *   - The only client consumer (public/js/tabs/downtime-form.js) populates a
 *     cache that is never read. Confirmed dead code.
 *
 * Companion code removals (separate commits, this branch):
 *   - server/routes/territory-residency.js (deleted)
 *   - server/schemas/territory.schema.js (territoryResidencySchema removed)
 *   - server/index.js (route mount removed)
 *   - server/tests/helpers/test-app.js (route mount removed)
 *   - server/tests/api-players-sessions-residency.test.js (residency block removed)
 *   - public/js/tabs/downtime-form.js (dead consumer block removed)
 *   - specs/architecture/system-map.md, specs/reference-data-ssot.md (row removed)
 *
 * Usage:
 *   cd server && node scripts/retire-territory-residency.js          # dry-run (default)
 *   cd server && node scripts/retire-territory-residency.js --apply  # actual drop
 *
 * Behaviour:
 *   - DRY-RUN by default: prints the collection contents and exits 0.
 *   - --apply: writes a JSON backup of the entire collection to
 *     server/scripts/_backups/territory-residency-retirement-<ISO>.json
 *     BEFORE issuing the drop. If the backup write throws, the drop never runs.
 *   - Idempotent: if the collection does not exist, exits 0 with
 *     `already-dropped: true` and writes no backup file.
 */
import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const APPLY = process.argv.includes('--apply');
const HELP  = process.argv.includes('--help') || process.argv.includes('-h');

if (HELP) {
  console.log('Usage: node scripts/retire-territory-residency.js [--apply]');
  console.log('  Default is DRY-RUN. --apply writes a backup then drops the collection.');
  process.exit(0);
}

const URI = process.env.MONGODB_URI;
if (!URI) {
  console.error('MONGODB_URI missing — populate server/.env before running.');
  process.exit(1);
}

const client = new MongoClient(URI);
await client.connect();
const db = client.db('tm_suite');

const exists = await db.listCollections({ name: 'territory_residency' }).toArray();
if (exists.length === 0) {
  console.log('already-dropped: true   collection does not exist');
  await client.close();
  process.exit(0);
}

const docs = await db.collection('territory_residency').find().toArray();
console.log(`Collection 'territory_residency' has ${docs.length} document(s):\n`);
for (const d of docs) {
  console.log(JSON.stringify(d, null, 2));
}

if (!APPLY) {
  console.log('\nDRY-RUN — re-run with --apply to back up and drop.');
  await client.close();
  process.exit(0);
}

const here = dirname(fileURLToPath(import.meta.url));
const backupDir = join(here, '_backups');
mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = join(backupDir, `territory-residency-retirement-${stamp}.json`);
writeFileSync(backupPath, JSON.stringify(docs, null, 2));
console.log(`\nBackup → ${backupPath}`);

await db.collection('territory_residency').drop();
console.log('Collection dropped.');

const postExists = await db.listCollections({ name: 'territory_residency' }).toArray();
console.log(`Post-state: collection exists = ${postExists.length > 0} (expected false)`);

await client.close();
