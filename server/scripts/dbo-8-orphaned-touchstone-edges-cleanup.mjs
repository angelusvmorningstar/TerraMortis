/**
 * DBO-8 — delete `relationships` documents with `kind: 'touchstone'`. Manual,
 * ST-invoked, one-off. Nothing calls this on server boot and nothing calls it
 * in test setup; the vitest suite imports its exported functions and runs
 * them against `tm_suite_test` only.
 *
 * NOTE FOR ANYONE TIDYING THIS FILE: there is deliberately NO
 * `#!/usr/bin/env node` shebang, for the same reason
 * `dbo-1-purchasable-powers-field-cleanup.mjs` has none — a shebang breaks
 * vitest's transform for any file importing this one.
 *
 * ==========================================================================
 *   RUNNING THIS FOR REAL IS ANGELUS'S ACTION, NOT AN AGENT'S.
 * ==========================================================================
 *
 *   Connection comes from `../db.js` (MONGODB_URI via config.js, database
 *   name from MONGODB_DB, defaulting to `tm_suite`). Running this bare from
 *   `server/` with `server/.env` in place therefore targets LIVE Atlas. What
 *   makes that survivable is the DRY-RUN DEFAULT: without `--apply` this only
 *   reads, and prints exactly what it would do.
 *
 * BACKGROUND (specs/stories/dbo-8-touchstone-mechanic-identity-split.md):
 * DBO-8 retired `characters.touchstones[].edge_id` and the linked
 * `relationships` shape (`kind: 'touchstone'`, `touchstone_meta`) — issue
 * #162 removed the only code path that ever created a linked touchstone, and
 * live data confirmed zero of 44 touchstones used it. `'touchstone'` is no
 * longer a valid `kind` in `relationship.schema.js`'s `KIND_ENUM`, so any
 * document carrying it now fails its own schema. This script finds and
 * removes them.
 *
 * WHAT IT DOES: every document in `relationships` with `kind: 'touchstone'`
 * -> DELETE, after a full-document JSON backup, IF its `kind` still reads
 * 'touchstone' at write time (re-checked against a fresh read taken
 * immediately before the backup - a row an ST successfully edited away from
 * 'touchstone' between planning and apply is silently skipped, not deleted).
 * Nothing else in the collection is touched — every other `kind` value is
 * left exactly as-is.
 *
 * SAFETY: DRY-RUN BY DEFAULT. `--apply` writes a full-document JSON backup to
 * `server/scripts/_backups/dbo-8-orphaned-touchstone-edges-<ISO>.json` BEFORE
 * issuing any delete, and aborts (deletes nothing) if the backup write
 * throws. Idempotent: re-running `planCleanup` after a successful `--apply`
 * returns an empty array — nothing left to clean.
 *
 * Usage, from `server/` so that cwd-relative `dotenv/config` picks up
 * `server/.env`:
 *
 *   # preview against the configured database, no writes (the default):
 *   node scripts/dbo-8-orphaned-touchstone-edges-cleanup.mjs
 *
 *   # write:
 *   node scripts/dbo-8-orphaned-touchstone-edges-cleanup.mjs --apply
 *
 *   # write to the throwaway test database instead of live:
 *   MONGODB_DB=tm_suite_test node scripts/dbo-8-orphaned-touchstone-edges-cleanup.mjs --apply
 */

import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { connectDb, getCollection, closeDb } from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = join(__dirname, '_backups');

/**
 * Classify every document in `relationships` carrying `kind: 'touchstone'`.
 * PURE: reads only, no writes, no side effects, so `main()` can print the
 * whole plan before anyone decides whether to run it.
 *
 * The collection is taken as an ARGUMENT rather than resolved internally, so
 * a test can hand over a `tm_suite_test` collection and this can never reach
 * live data by accident.
 *
 * @param {import('mongodb').Collection} collection
 * @returns {Promise<Array<{_id:*, doc:object}>>}
 */
export async function planCleanup(collection) {
  const docs = await collection.find({ kind: 'touchstone' }).toArray();
  return docs.map(doc => ({ _id: doc._id, doc }));
}

/**
 * Carry out (or, by default, merely narrate) the plan.
 *
 * @param {import('mongodb').Collection} collection
 * @param {Array<object>} rows - the output of `planCleanup`
 * @param {{ apply?: boolean, log?: Function }} opts
 * @returns {Promise<{deleted:number, backedUp:number}>}
 */
export async function applyCleanup(collection, rows, { apply = false, log = () => {} } = {}) {
  if (!rows.length) {
    log("Nothing to clean — 0 documents carry kind: 'touchstone'.");
    return { deleted: 0, backedUp: 0 };
  }

  if (!apply) {
    for (const row of rows) {
      log(`  [DRY RUN] would delete relationships/${row._id} (status: ${row.doc.status || 'unknown'})`);
    }
    log(`\n${rows.length} document(s) would be deleted. Re-run with --apply to write.`);
    return { deleted: 0, backedUp: 0 };
  }

  mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = join(BACKUP_DIR, `dbo-8-orphaned-touchstone-edges-${stamp}.json`);
  const originals = await collection.find({ _id: { $in: rows.map(r => r._id) } }).toArray();
  writeFileSync(backupPath, JSON.stringify(originals, null, 2));
  log(`Backup written: ${backupPath}`);

  // Codex review, DBO-8 (2026-08-14): deleting by `_id` alone trusted the
  // stale plan from `planCleanup` - if an ST successfully edited a row's
  // `kind` away from 'touchstone' between planning and here (a legitimate
  // reconciliation PUT), the delete would still fire and destroy a document
  // that is no longer the shape this script exists to clean up. The filter
  // now re-checks `kind: 'touchstone'` against the SAME fresh read the
  // backup already took, so a changed document is silently skipped rather
  // than deleted - same fix shape as migrate-office-purchases-to-seats.mjs's
  // own concurrent-modification guard.
  const byId = new Map(originals.map(doc => [String(doc._id), doc]));

  let deleted = 0;
  for (const row of rows) {
    const current = byId.get(String(row._id));
    if (!current || current.kind !== 'touchstone') continue; // changed or gone since planning

    const result = await collection.deleteOne({ _id: row._id, kind: 'touchstone' });
    if (result.deletedCount === 1) {
      deleted += 1;
      log(`  deleted: ${row._id}`);
    }
  }

  return { deleted, backedUp: originals.length };
}

export async function main(argv = process.argv) {
  const apply = argv.includes('--apply');
  const dbName = process.env.MONGODB_DB || 'tm_suite';

  console.log(`Mode     : ${apply ? 'APPLY (will backup + write)' : 'DRY RUN (read only; pass --apply to write)'}`);
  console.log(`Target DB: ${dbName}`);
  console.log('');

  await connectDb();
  try {
    const collection = getCollection('relationships');
    const rows = await planCleanup(collection);
    console.log(`relationships: ${rows.length} document(s) need cleanup.`);
    console.log('');

    const result = await applyCleanup(collection, rows, { apply, log: msg => console.log(msg) });
    console.log('');
    console.log(`Totals: ${result.deleted} deleted, ${result.backedUp} backed up.`);
    if (apply) {
      console.log('Idempotency check: re-run with --apply and confirm "0 document(s) need cleanup".');
    }
  } finally {
    await closeDb();
  }
}

// Auto-run only when invoked directly, never when imported by a test.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => { console.error(err.message); process.exit(1); });
}
