#!/usr/bin/env node
/**
 * One-off cleanup: delete five duplicate documents from tm_suite.territories
 * that were inserted between #3b/#3c deploy and #3d deploy on 2026-05-05.
 *
 * Root cause: the pre-#3d client at public/js/admin/downtime-views.js:10010,
 * 10028 (commit 5fbeb8b) called apiPost('/api/territories', { id: ... }). The
 * post-#3b server's territorySchema has additionalProperties: true, so the
 * unknown legacy `id` field was silently accepted and a fresh document was
 * inserted instead of an update. Result: 5 dupe rows, one per real territory,
 * all carrying `id` (legacy field name) instead of `slug`.
 *
 * Targets (verified by audit on 2026-05-05; April keepers retain the canonical
 * `slug` field plus all cross-references in downtime_cycles + territory_residency):
 *   69f98d1f3951dfbb3b2b7ecc — id=harbour     (keeper 69d5dc6a00815d47150397c6)
 *   69f98d453951dfbb3b2b7ece — id=northshore  (keeper 69d9e54b00815d471503bea6)
 *   69f98d0a3951dfbb3b2b7eca — id=academy     (keeper 69d9e54b00815d471503bea7)
 *   69f98d613951dfbb3b2b7ecf — id=secondcity  (keeper 69d9e54c00815d471503bea8)
 *   69f98d143951dfbb3b2b7ecb — id=dockyards   (keeper 69d9e54c00815d471503bea9)
 *
 * Per user decision (2026-05-05 chat): April data is canon for lieutenants and
 * feeding rights; do NOT fold any dupe-side edits (lieutenant changes, +Yusuf
 * feeding entries) back into the keepers. Straight delete.
 *
 * Usage:
 *   cd server && node scripts/cleanup-territory-id-dupes.js          # dry-run (default)
 *   cd server && node scripts/cleanup-territory-id-dupes.js --apply  # actual delete
 *
 * Behaviour:
 *   - DRY-RUN by default: prints the targeted documents in full and exits 0.
 *   - --apply: writes a JSON backup of the matched docs to
 *     server/scripts/_backups/territory-id-dupes-<ISO>.json BEFORE issuing
 *     deleteMany. If the backup write throws, the delete never runs.
 *   - Idempotent: if no targeted _ids remain, exits 0 with `already-clean: true`
 *     and writes no backup file.
 *   - Safety guard: aborts with exit 2 if any targeted doc carries a `slug`
 *     field (post-migration shape) or lacks the `id` field (legacy shape).
 *     The fingerprint that singles out a dupe row is "has legacy `id`, not
 *     `slug`" — losing it means a real document was reshaped under one of
 *     these _ids and deleting would destroy live data.
 *   - Safety guard: aborts with exit 2 if any cross-collection FK references
 *     a target _id (downtime_cycles map keys, regent_confirmations,
 *     territory_residency.territory_id). Audit confirmed zero refs at run
 *     time; a non-zero count here means the data drifted.
 *
 * Run history:
 *   - 2026-05-05 — first --apply in production. Backup:
 *     server/scripts/_backups/territory-id-dupes-2026-05-05T06-46-53-651Z.json.
 *     Deleted: 5. Post-state: territories.count = 5, all carrying canonical
 *     `slug` field, no doc has legacy `id`. Idempotency confirmed (second run
 *     returned `already-clean: true   deleted: 0`).
 */
import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const TARGET_IDS = [
  '69f98d1f3951dfbb3b2b7ecc', // harbour
  '69f98d453951dfbb3b2b7ece', // northshore
  '69f98d0a3951dfbb3b2b7eca', // academy
  '69f98d613951dfbb3b2b7ecf', // secondcity
  '69f98d143951dfbb3b2b7ecb', // dockyards
];

const APPLY = process.argv.includes('--apply');
const HELP  = process.argv.includes('--help') || process.argv.includes('-h');

if (HELP) {
  console.log('Usage: node scripts/cleanup-territory-id-dupes.js [--apply]');
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
const db = client.db('tm_suite');
const col = db.collection('territories');

const oids = TARGET_IDS.map(s => new ObjectId(s));
const docs = await col.find({ _id: { $in: oids } }).toArray();

if (docs.length === 0) {
  console.log('already-clean: true   deleted: 0');
  await client.close();
  process.exit(0);
}

// Shape guard — every target must still match the dupe fingerprint.
for (const d of docs) {
  if (d.slug !== undefined || d.id === undefined) {
    console.error('SAFETY ABORT: targeted document no longer matches dupe fingerprint (must have legacy `id`, must NOT have `slug`).');
    console.error(JSON.stringify(d, null, 2));
    await client.close();
    process.exit(2);
  }
}

// Cross-reference guard — none of these _ids may be referenced anywhere.
const targetSet = new Set(TARGET_IDS);
const refs = [];
const cycles = await db.collection('downtime_cycles').find().toArray();
for (const c of cycles) {
  for (const field of ['confirmed_ambience', 'discipline_profile', 'territory_pulse']) {
    if (!c[field]) continue;
    for (const k of Object.keys(c[field])) {
      if (targetSet.has(k)) refs.push(`downtime_cycles[${c.label || c._id}].${field}.${k}`);
    }
  }
  for (const rc of (c.regent_confirmations || [])) {
    if (targetSet.has(rc.territory_id)) refs.push(`downtime_cycles[${c.label || c._id}].regent_confirmations.territory_id=${rc.territory_id}`);
  }
}
const residency = await db.collection('territory_residency').find().toArray();
for (const r of residency) {
  if (targetSet.has(r.territory_id)) refs.push(`territory_residency[${r._id}].territory_id=${r.territory_id}`);
}
if (refs.length > 0) {
  console.error('SAFETY ABORT: cross-references to target _ids found. Refusing to delete:');
  for (const r of refs) console.error('  ' + r);
  await client.close();
  process.exit(2);
}

console.log(`Found ${docs.length}/${TARGET_IDS.length} targeted dupe docs:\n`);
for (const d of docs) {
  const fr = Array.isArray(d.feeding_rights) ? d.feeding_rights.length : 0;
  console.log(`  _id=${d._id}  id=${d.id}  name="${d.name}"  regent_id=${d.regent_id}  feeding_rights=${fr}  updated=${d.updated_at}`);
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

// --apply: backup BEFORE delete.
const here = dirname(fileURLToPath(import.meta.url));
const backupDir = join(here, '_backups');
mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = join(backupDir, `territory-id-dupes-${stamp}.json`);
writeFileSync(backupPath, JSON.stringify(docs, null, 2));
console.log(`\nBackup → ${backupPath}`);

const result = await col.deleteMany({ _id: { $in: oids } });
console.log(`Deleted: ${result.deletedCount}`);

const newCount = await col.countDocuments();
console.log(`territories.count now: ${newCount}`);

await client.close();
