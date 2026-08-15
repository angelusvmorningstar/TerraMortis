/**
 * DBO-1 — strip the dead `selected` field and the dead half of `special` from
 * `purchasable_powers`. Manual, ST-invoked, one-off. Nothing calls this on
 * server boot and nothing calls it in test setup; the vitest suite imports
 * its exported functions and runs them against `tm_suite_test` only.
 *
 * NOTE FOR ANYONE TIDYING THIS FILE: there is deliberately NO
 * `#!/usr/bin/env node` shebang, for the same reason
 * `migrate-office-purchases-to-seats.mjs` has none — a shebang breaks
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
 *   Per epic-dbo's own hard constraint, do not run `--apply` against live
 *   `tm_suite` before the 2026-08-15 game (no migration/backfill/restructure
 *   against production before it).
 *
 * BACKGROUND (specs/epic-dbo-database-ownership.md, DBO-1): `selected` is a
 * fully dead field (issue #5, 2026-05-07) — nothing reads it anywhere.
 * `special` is NOT fully dead: `isMeritEventGranted(rule)`
 * (public/js/editor/merits.js) reads `rule.special === 'standing'`, live in
 * production since DBO-3 (2026-08-14). Exactly two rows (Mystery Cult
 * Initiation, Professional Training) carry that value; the rest carry `null`
 * or are absent.
 *
 * WHAT IT DOES, per document in `purchasable_powers`:
 *   - `selected` exists (any value)              -> $unset it, unconditionally.
 *   - `special` exists AND is not the literal
 *     string `'standing'` (covers `null` and any
 *     other stray value)                         -> $unset it.
 *   - `special === 'standing'`                    -> NEVER touched. This is
 *     the one thing this script exists to get right; see `planCleanup`'s own
 *     comment for how the guard is written.
 *
 * A document needing neither unset is omitted from the plan entirely — an
 * empty plan means nothing to do, matching `migrate-office-purchases-to-
 * seats.mjs`'s own "empty = clean" contract.
 *
 * SAFETY: DRY-RUN BY DEFAULT. `--apply` writes a full-document JSON backup to
 * `server/scripts/_backups/dbo-1-field-cleanup-<ISO>.json` BEFORE issuing any
 * update, and aborts (writes nothing) if the backup write throws.
 * Idempotent: re-running `planCleanup` after a successful `--apply` returns
 * an empty array — nothing left to clean.
 *
 * Usage, from `server/` so that cwd-relative `dotenv/config` picks up
 * `server/.env`:
 *
 *   # preview against the configured database, no writes (the default):
 *   node scripts/dbo-1-purchasable-powers-field-cleanup.mjs
 *
 *   # write:
 *   node scripts/dbo-1-purchasable-powers-field-cleanup.mjs --apply
 *
 *   # write to the throwaway test database instead of live:
 *   MONGODB_DB=tm_suite_test node scripts/dbo-1-purchasable-powers-field-cleanup.mjs --apply
 */

import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { connectDb, getCollection, closeDb } from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = join(__dirname, '_backups');

/**
 * Classify every document in `purchasable_powers`. PURE: reads only, no
 * writes, no side effects, so `main()` can print the whole plan before
 * anyone decides whether to run it.
 *
 * The collection is taken as an ARGUMENT rather than resolved internally, so
 * a test can hand over a `tm_suite_test` collection and this can never reach
 * live data by accident.
 *
 * The `special` guard is deliberately an exact-string equality check against
 * the literal `'standing'` — not a case-insensitive or trimmed comparison —
 * so a malformed value like `'Standing'` or `'standing '` is treated as
 * cleanup-eligible (matching how `isMeritEventGranted` itself reads the
 * field: `rule.special === 'standing'`, the same exact match). A doc this
 * script would preserve is, by construction, a doc the live filter would
 * also recognise.
 *
 * @param {import('mongodb').Collection} collection
 * @returns {Promise<Array<{_id:*, key:string, unsetSelected:boolean, unsetSpecial:boolean}>>}
 */
export async function planCleanup(collection) {
  const docs = await collection.find({}).toArray();
  const rows = [];

  for (const doc of docs) {
    const unsetSelected = Object.prototype.hasOwnProperty.call(doc, 'selected');
    const unsetSpecial = Object.prototype.hasOwnProperty.call(doc, 'special') && doc.special !== 'standing';

    if (!unsetSelected && !unsetSpecial) continue;
    rows.push({ _id: doc._id, key: doc.key, unsetSelected, unsetSpecial });
  }

  return rows;
}

/**
 * Carry out (or, by default, merely narrate) the plan.
 *
 * @param {import('mongodb').Collection} collection
 * @param {Array<object>} rows - the output of `planCleanup`
 * @param {{ apply?: boolean, log?: Function }} opts
 * @returns {Promise<{cleaned:number, backedUp:number}>}
 */
export async function applyCleanup(collection, rows, { apply = false, log = () => {} } = {}) {
  if (!rows.length) {
    log('Nothing to clean — 0 documents carry a stray field.');
    return { cleaned: 0, backedUp: 0 };
  }

  if (!apply) {
    for (const row of rows) {
      const fields = [row.unsetSelected && 'selected', row.unsetSpecial && 'special'].filter(Boolean);
      log(`  [DRY RUN] would $unset ${fields.join(', ')} on ${row.key || row._id}`);
    }
    log(`\n${rows.length} document(s) would change. Re-run with --apply to write.`);
    return { cleaned: 0, backedUp: 0 };
  }

  mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = join(BACKUP_DIR, `dbo-1-field-cleanup-${stamp}.json`);
  const originals = await collection.find({ _id: { $in: rows.map(r => r._id) } }).toArray();
  writeFileSync(backupPath, JSON.stringify(originals, null, 2));
  log(`Backup written: ${backupPath}`);

  // Re-derive what to unset from `originals` (fetched just now), not from
  // `rows` (fetched by planCleanup, which may be stale by the time we get
  // here). Without this, a document that gained special:'standing' in the
  // gap between planning and writing would still lose it — exactly the value
  // this script exists to protect. The `special: { $ne: 'standing' }` filter
  // is a second, DB-level guard against the same gap between this re-read and
  // the write itself.
  const byId = new Map(originals.map(doc => [String(doc._id), doc]));

  let cleaned = 0;
  for (const row of rows) {
    const current = byId.get(String(row._id));
    if (!current) continue; // deleted since planning — nothing left to clean

    const unsetSelected = Object.prototype.hasOwnProperty.call(current, 'selected');
    const unsetSpecial = Object.prototype.hasOwnProperty.call(current, 'special') && current.special !== 'standing';
    if (!unsetSelected && !unsetSpecial) continue; // state moved on since planning

    const unset = {};
    if (unsetSelected) unset.selected = '';
    if (unsetSpecial) unset.special = '';

    const filter = { _id: row._id };
    if (unsetSpecial) filter.special = { $ne: 'standing' };

    const result = await collection.updateOne(filter, { $unset: unset });
    if (result.modifiedCount === 1) {
      cleaned += 1;
      log(`  cleaned: ${row.key || row._id}`);
    }
  }

  return { cleaned, backedUp: originals.length };
}

export async function main(argv = process.argv) {
  const apply = argv.includes('--apply');
  const dbName = process.env.MONGODB_DB || 'tm_suite';

  console.log(`Mode     : ${apply ? 'APPLY (will backup + write)' : 'DRY RUN (read only; pass --apply to write)'}`);
  console.log(`Target DB: ${dbName}`);
  console.log('');

  await connectDb();
  try {
    const collection = getCollection('purchasable_powers');
    const rows = await planCleanup(collection);
    console.log(`purchasable_powers: ${rows.length} document(s) need cleanup.`);
    console.log('');

    const result = await applyCleanup(collection, rows, { apply, log: msg => console.log(msg) });
    console.log('');
    console.log(`Totals: ${result.cleaned} cleaned, ${result.backedUp} backed up.`);
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
