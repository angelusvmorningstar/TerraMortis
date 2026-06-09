#!/usr/bin/env node

/**
 * STM-13 (issue #441, ADR-004 Rev 4 §D19) — idempotent cleanliness backfill.
 *
 * Sets `active: true` on every pre-Rev 4 `st_mods` document that lacks the
 * field. Correctness does NOT depend on this running — the live query uses
 * `active !== false` and the audit reader uses `event ?? 'created'`, so
 * pre-Rev 4 docs already behave correctly. This script is purely cosmetic:
 * it makes the stored shape uniform so the DB matches the Rev 4 schema.
 *
 * Shipped separately from STM-10's lifecycle backend (Imhotep's discipline)
 * so it is independently revertible: if the backfill surfaces an issue it can
 * be rolled back without disturbing the merged lifecycle logic.
 *
 * IDEMPOTENT — the filter is `{ active: { $exists: false } }`, so a second
 * run matches zero documents and updates nothing.
 *
 * WRITES ARE LIVE BY DEFAULT. Pass --dry-run to preview without writing.
 *
 * Usage:
 *   # preview first (no writes):
 *   node server/scripts/stm-13-backfill-active.js --dry-run
 *   # then apply (writes active:true to st_mods):
 *   node server/scripts/stm-13-backfill-active.js
 *   # also backfill the audit event field (event ?? 'created') on legacy rows:
 *   node server/scripts/stm-13-backfill-active.js --audit
 *   node server/scripts/stm-13-backfill-active.js --audit --dry-run
 *
 * Production (Render one-off shell): run the exact command above against the
 * Render service shell — the script reads MONGODB_URI from the environment,
 * so no code modification is needed to point it at Atlas.
 */

// Load env before db.js/config.js resolve MONGODB_URI. Locally, run from the
// server/ dir so this picks up server/.env; on Render the env vars are already
// set in the process, so this is a no-op there.
import 'dotenv/config';
import { pathToFileURL } from 'url';
import { connectDb, getCollection, closeDb } from '../db.js';

/**
 * Backfill a single collection: $set the given field on docs that lack it.
 * Idempotent — the filter targets only missing-field docs, so a second run
 * matches zero. Returns { scanned, updated, skipped }.
 *
 * @param {string} collName
 * @param {object} missingFilter — selects docs lacking the field, e.g. { active: { $exists: false } }
 * @param {object} setDoc — the $set payload, e.g. { active: true }
 * @param {{ dryRun?: boolean, log?: boolean }} [opts]
 */
export async function backfill(collName, missingFilter, setDoc, opts = {}) {
  const { dryRun = false, log = true } = opts;
  const coll = getCollection(collName);
  const scanned = await coll.countDocuments({});
  const needing = await coll.countDocuments(missingFilter);
  const skipped = scanned - needing;

  let updated = 0;
  if (dryRun) {
    updated = needing; // would-update count
  } else if (needing > 0) {
    const res = await coll.updateMany(missingFilter, { $set: setDoc });
    updated = res.modifiedCount;
  }

  if (log) {
    const verb = dryRun ? '[DRY RUN] would update' : 'updated';
    console.log(
      `  ${collName}: scanned ${scanned}, ${verb} ${updated}, ` +
      `skipped ${skipped} (field already present)`,
    );
  }
  return { scanned, updated, skipped };
}

export async function main({ dryRun, withAudit } = {}) {
  const t0 = Date.now();
  console.log(`Mode: ${dryRun ? 'DRY RUN (read only)' : 'LIVE (writing)'}`);
  console.log(`Targets: st_mods${withAudit ? ' + st_mod_audit' : ''}\n`);

  await connectDb();
  try {
    await backfill('st_mods', { active: { $exists: false } }, { active: true }, { dryRun });

    if (withAudit) {
      // Pre-Rev 4 audit rows were all creation rows (no lifecycle events
      // existed yet), so the canonical event for a missing field is 'created'
      // (matches the reader's `event ?? 'created'` default, §D19).
      await backfill('st_mod_audit', { event: { $exists: false } }, { event: 'created' }, { dryRun });
    }
  } finally {
    await closeDb();
  }

  console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(2)}s.`);
}

// Auto-run only when invoked directly (not when imported by a test).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main({
    dryRun: process.argv.includes('--dry-run'),
    withAudit: process.argv.includes('--audit'),
  }).catch(err => { console.error(err); process.exit(1); });
}
