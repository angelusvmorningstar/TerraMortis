#!/usr/bin/env node
/**
 * One-off cleanup: delete the four RFR-Test residue documents from
 * tm_suite.territories that share id='secondcity' with the legitimate
 * 'The Second City' record.
 *
 * Targets (verified by audit on 2026-05-05):
 *   69e997e6dca10b9a697c6817 — regent-lock
 *   69e997e6dca10b9a697c6819 — regent-override
 *   69e997e6dca10b9a697c681b — regent-noscope
 *   69e997e7dca10b9a697c681d — regent-clean
 *
 * Usage:
 *   cd server && node scripts/cleanup-rfr-territory-residue.js          # dry-run (default)
 *   cd server && node scripts/cleanup-rfr-territory-residue.js --apply  # actual delete
 *
 * Behaviour:
 *   - DRY-RUN by default: prints the four targeted documents in full and exits 0.
 *   - --apply: writes a JSON backup of the matched docs to
 *     server/scripts/_backups/rfr-territory-residue-<ISO>.json BEFORE issuing
 *     deleteMany. If the backup write throws, the delete never runs.
 *   - Idempotent: if no targeted _ids remain, exits 0 with `already-clean: true`
 *     and writes no backup file.
 *   - Safety guard: aborts with exit 2 if any targeted doc's shape has drifted
 *     from the audited fingerprint (id='secondcity', name='RFR Test',
 *     regent_id ∈ the four sentinel values). This bounds blast radius — even
 *     if someone reused one of these _ids for a real document, no delete fires.
 *
 * Run history:
 *   - 2026-05-05 — first --apply in production from script commit 95a7ad1.
 *     Deleted: 4. Backup: server/scripts/_backups/rfr-territory-residue-
 *     2026-05-05T02-46-45-155Z.json. Post-state: territories.count = 5,
 *     all `id` values unique. Idempotency confirmed (second --apply
 *     returned `already-clean: true   deleted: 0`).
 */
import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const TARGET_IDS = [
  '69e997e6dca10b9a697c6817',
  '69e997e6dca10b9a697c6819',
  '69e997e6dca10b9a697c681b',
  '69e997e7dca10b9a697c681d',
];
const ALLOWED_REGENTS = new Set(['regent-lock', 'regent-override', 'regent-noscope', 'regent-clean']);

const APPLY = process.argv.includes('--apply');
const HELP  = process.argv.includes('--help') || process.argv.includes('-h');

if (HELP) {
  console.log('Usage: node scripts/cleanup-rfr-territory-residue.js [--apply]');
  console.log('  Default is DRY-RUN. --apply writes a backup then deleteMany.');
  process.exit(0);
}

const URI = process.env.MONGODB_URI;
if (!URI) {
  console.error('MONGODB_URI missing — populate server/.env before running.');
  process.exit(1);
}

const client = new MongoClient(URI);
await client.connect();
const col = client.db('tm_suite').collection('territories');

const oids = TARGET_IDS.map(s => new ObjectId(s));
const docs = await col.find({ _id: { $in: oids } }).toArray();

if (docs.length === 0) {
  console.log('already-clean: true   deleted: 0');
  await client.close();
  process.exit(0);
}

// Safety guard — abort if anything looks wrong before any delete is even contemplated.
for (const d of docs) {
  if (d.id !== 'secondcity' || d.name !== 'RFR Test' || !ALLOWED_REGENTS.has(d.regent_id)) {
    console.error('SAFETY ABORT: targeted document shape has drifted from audit. Refusing to delete.');
    console.error(JSON.stringify(d, null, 2));
    await client.close();
    process.exit(2);
  }
}

console.log(`Found ${docs.length}/${TARGET_IDS.length} targeted residue docs:\n`);
for (const d of docs) {
  console.log(`  _id=${d._id}  id=${d.id}  regent_id=${d.regent_id}  name=${d.name}  ambience=${d.ambience}`);
}
console.log('\nFull document content:');
for (const d of docs) {
  console.log(JSON.stringify(d, null, 2));
}

if (!APPLY) {
  console.log('\nDRY-RUN — re-run with --apply to execute deletion.');
  await client.close();
  process.exit(0);
}

// --apply: backup BEFORE delete. If the write throws, the await chain aborts
// the process before deleteMany runs.
const here = dirname(fileURLToPath(import.meta.url));
const backupDir = join(here, '_backups');
mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = join(backupDir, `rfr-territory-residue-${stamp}.json`);
writeFileSync(backupPath, JSON.stringify(docs, null, 2));
console.log(`\nBackup → ${backupPath}`);

const result = await col.deleteMany({ _id: { $in: oids } });
console.log(`Deleted: ${result.deletedCount}`);

const newCount = await col.countDocuments();
console.log(`territories.count now: ${newCount}`);

await client.close();
