#!/usr/bin/env node
/**
 * One-time migration: normalise downtime_submissions.cycle_id from string to
 * canonical ObjectId (issue #497, story 497).
 *
 * Some submissions (DT1) store the top-level `cycle_id` FK as a plain string;
 * others (DT2+) store it as an ObjectId. MongoDB BSON comparison is
 * type-strict, so a query keyed on a cycle's ObjectId `_id` silently drops
 * string-typed submissions. This script rewrites every string `cycle_id` that
 * parses to a valid 24-hex ObjectId as an ObjectId.
 *
 * SCOPE: cycle_id ONLY (PO decision 2026-06-01). character_id has the same
 * split but is already tolerated on both read and write, so it is left alone.
 *
 * Usage:
 *   cd server && node scripts/migrate-submission-cycle-id-to-oid.js          # dry-run (default)
 *   cd server && node scripts/migrate-submission-cycle-id-to-oid.js --apply  # backup + mutate
 *
 * Behaviour:
 *   - Dry-run by default. --apply writes a JSON backup then mutates.
 *   - Idempotent: already-ObjectId / null / missing cycle_id are skipped
 *     (counted as already-migrated). A second --apply run is a no-op.
 *   - Backup written to server/scripts/_backups/ BEFORE any DB mutation.
 *   - Safety abort (exit 2) if any string cycle_id does NOT parse to a valid
 *     ObjectId (it would be silently dropped by the query — surface it instead
 *     of guessing), or if downtime_cycles is empty (wrong/empty DB guard).
 *
 * Env:
 *   MONGODB_URI  (required)
 *   MONGODB_DB   (optional) — database name; defaults to 'tm_suite'
 *
 * Exit codes:
 *   0  success / dry-run / already-migrated
 *   1  config error (MONGODB_URI missing)
 *   2  safety abort (unparseable string cycle_id, or empty cycles collection)
 *
 * Run history:
 *   (populated on each --apply run)
 */
import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HEX24 = /^[a-f0-9]{24}$/i;

/** True if `s` is a 24-char hex ObjectId string. */
export const isOidShaped = s => typeof s === 'string' && HEX24.test(s);

/**
 * Classify a submission's cycle_id for migration.
 *   - ObjectId / null / undefined / missing → skip (already-migrated)
 *   - string that is valid 24-hex            → migrate to ObjectId
 *   - string that is NOT valid 24-hex        → unresolvable (safety abort)
 *
 * @param {*} cycleId  the raw cycle_id value from the document
 * @returns {{ needsMigration: boolean, newValue: ObjectId|null, unresolvable: boolean }}
 */
export function classifyCycleId(cycleId) {
  if (cycleId == null) return { needsMigration: false, newValue: null, unresolvable: false };
  if (cycleId instanceof ObjectId) return { needsMigration: false, newValue: null, unresolvable: false };
  if (typeof cycleId === 'string') {
    if (isOidShaped(cycleId)) {
      return { needsMigration: true, newValue: new ObjectId(cycleId), unresolvable: false };
    }
    return { needsMigration: false, newValue: null, unresolvable: true };
  }
  // Any other BSON type is unexpected — treat as unresolvable so it surfaces.
  return { needsMigration: false, newValue: null, unresolvable: true };
}

/**
 * Audit all submissions and build the migration plan. Read-only.
 *
 * Throws an error with `code: 'SAFETY_ABORT'` if:
 *   - The downtime_cycles collection is empty (wrong/empty DB guard).
 *   - Any string cycle_id does not parse to a valid ObjectId.
 *
 * @param {import('mongodb').Db} db
 * @returns {Promise<{ plan, submissionUpdates, submissions }>}
 */
export async function auditSubmissions(db) {
  const cycleCount = await db.collection('downtime_cycles').countDocuments();
  if (cycleCount < 1) {
    throw Object.assign(
      new Error('Safety check failed: downtime_cycles is empty. Are you connected to the right database?'),
      { code: 'SAFETY_ABORT' },
    );
  }

  const submissions = await db.collection('downtime_submissions')
    .find({}, { projection: { cycle_id: 1 } }).toArray();

  const plan = { total: submissions.length, toMigrate: 0, alreadyMigrated: 0 };
  const submissionUpdates = []; // { _id, newCycleId }
  const safetyAborts = [];      // { _id, cycle_id }

  for (const sub of submissions) {
    const { needsMigration, newValue, unresolvable } = classifyCycleId(sub.cycle_id);
    if (unresolvable) {
      safetyAborts.push({ _id: String(sub._id), cycle_id: sub.cycle_id });
      continue;
    }
    if (needsMigration) {
      plan.toMigrate++;
      submissionUpdates.push({ _id: sub._id, newCycleId: newValue });
    } else {
      plan.alreadyMigrated++;
    }
  }

  if (safetyAborts.length > 0) {
    throw Object.assign(
      new Error(`Safety check failed: ${safetyAborts.length} submission(s) have an unparseable string cycle_id`),
      { code: 'SAFETY_ABORT', safetyAborts },
    );
  }

  return { plan, submissionUpdates, submissions };
}

/**
 * Apply cycle_id updates to the database.
 * @param {import('mongodb').Db} db
 * @param {{ _id, newCycleId }[]} updates
 * @returns {Promise<number>} count of applied updates
 */
export async function applyUpdates(db, updates) {
  for (const { _id, newCycleId } of updates) {
    await db.collection('downtime_submissions').updateOne({ _id }, { $set: { cycle_id: newCycleId } });
  }
  return updates.length;
}

/**
 * Count submissions whose cycle_id is still a string (post-state check).
 * @param {import('mongodb').Db} db
 * @returns {Promise<number>}
 */
export async function countStringCycleIdsRemaining(db) {
  return db.collection('downtime_submissions').countDocuments({ cycle_id: { $type: 'string' } });
}

// ── CLI entry point ─────────────────────────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const APPLY = process.argv.includes('--apply');
  const HELP  = process.argv.includes('--help') || process.argv.includes('-h');

  if (HELP) {
    console.log('Usage: node scripts/migrate-submission-cycle-id-to-oid.js [--apply]');
    console.log('  Default is DRY-RUN. --apply writes a backup then mutates the database.');
    console.log('  Scope: downtime_submissions.cycle_id string → ObjectId (issue #497).');
    process.exit(0);
  }

  const URI = process.env.MONGODB_URI;
  if (!URI) {
    console.error('MONGODB_URI missing — populate server/.env before running.');
    process.exit(1);
  }
  const DB_NAME = process.env.MONGODB_DB || 'tm_suite';
  const client = new MongoClient(URI);

  try {
    await client.connect();
    const db = client.db(DB_NAME);

    // Step 1: audit pass (read-only)
    let auditResult;
    try {
      auditResult = await auditSubmissions(db);
    } catch (err) {
      if (err.code === 'SAFETY_ABORT') {
        console.error(`\nSAFETY ABORT: ${err.message}`);
        if (err.safetyAborts) {
          for (const { _id, cycle_id } of err.safetyAborts) {
            console.error(`  ${_id}  cycle_id=${JSON.stringify(cycle_id)}`);
          }
        }
        process.exit(2);
      }
      throw err;
    }

    const { plan, submissionUpdates, submissions } = auditResult;

    console.log(`Database: ${DB_NAME}`);
    console.log(`Submissions loaded: ${submissions.length}`);
    console.log('\n--- Audit ---');
    console.log(JSON.stringify(plan, null, 2));

    if (plan.toMigrate === 0) {
      console.log('\nalready-migrated: true   nothing to do.');
      process.exit(0);
    }

    if (!APPLY) {
      console.log(`\nDRY-RUN — ${plan.toMigrate} submission(s) would be converted. Re-run with --apply to execute.`);
      process.exit(0);
    }

    // Step 2: write backup BEFORE any mutation
    const here = dirname(fileURLToPath(import.meta.url));
    const backupDir = join(here, '_backups');
    mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = join(backupDir, `cycle-id-migration-${stamp}.json`);
    // Re-fetch full documents for the backup (the audit projected cycle_id only).
    const fullDocs = await db.collection('downtime_submissions').find().toArray();
    writeFileSync(backupPath, JSON.stringify({ capturedAt: stamp, submissions: fullDocs }, null, 2));
    console.log(`\nBackup → ${backupPath}`);

    // Step 3: apply mutations
    const applied = await applyUpdates(db, submissionUpdates);
    console.log(`\nApplied ${applied} cycle_id conversions.`);

    // Step 4: post-state validation
    const remaining = await countStringCycleIdsRemaining(db);
    console.log(`\nPost-state: ${remaining} docs still have string cycle_id (expected 0).`);

  } finally {
    await client.close();
  }
}
