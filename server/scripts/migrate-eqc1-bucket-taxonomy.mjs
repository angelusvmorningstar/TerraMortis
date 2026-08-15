/**
 * EQC-1 (issue #1152, epic #1038) — equipment_catalogue bucket re-partition.
 *
 * Maps every live `equipment_catalogue` document from the OLD four-bucket
 * taxonomy to the NEW five-value one:
 *
 *   weapon    → combat_gear   (weapon-shaped: damage_mod/damage_type/weapon_type)
 *   armour    → combat_gear   (armour-shaped: armour_value/defence_penalty)
 *   equipment → skill_gear    (unchanged meaning — skill_domain + bonus_dice)
 *   asset     → container     ("assets are containers... no stat-stacking
 *                              on the asset itself" — epic #1038)
 *
 * `combat_gear` absorbs both old weapon and armour buckets, distinguished at
 * read time by WHICH stat fields are populated on the item — not by a new
 * subtype field. This mirrors the epic's own wording ("combat gear
 * (weapons/armour, distinct stat fields)") and needs no new schema field.
 *
 * WHY THIS CANNOT SHIP INDEPENDENTLY OF THE SCHEMA CHANGE. Unlike
 * backfill-free-grants.js's union-sum runtime guard, nothing in this codebase
 * reads BOTH the old and new bucket vocabulary simultaneously (a deliberate
 * choice — see the EQC-1 story's "Migration shape" decision, atomic not
 * dual-support). So an un-migrated document is invisible to every consumer
 * (armourDefencePenalty, roll calculator weapon/skill chips, sheet renderer,
 * DT form dropdown) the moment the new-taxonomy-aware code lands. This script
 * and the schema/consumer changes in the same story MUST land together on
 * this branch before merge — there is no safe "schema first, migrate later"
 * window here, unlike the free-grants case.
 *
 * Idempotent: re-running matches zero docs the second time (every document's
 * `bucket` is already one of the new five values after the first apply).
 * Dry-run default, mirrors backfill-free-grants.js's own CLI shape.
 *
 * Usage:
 *   # preview (default — no writes):
 *   node server/scripts/migrate-eqc1-bucket-taxonomy.mjs
 *
 *   # apply:
 *   node server/scripts/migrate-eqc1-bucket-taxonomy.mjs --apply
 *
 *   # target the test DB:
 *   MONGODB_DB=tm_suite_test node server/scripts/migrate-eqc1-bucket-taxonomy.mjs --apply
 *
 * Locally, run from `server/` so cwd-relative `dotenv/config` picks up
 * `server/.env`. On Render env vars are pre-set (no-op).
 */

import 'dotenv/config';
import { pathToFileURL } from 'url';
import { connectDb, getCollection, closeDb } from '../db.js';

/** Old bucket → new bucket. The one-to-one mapping this whole script exists to apply. */
export const BUCKET_MAP = Object.freeze({
  weapon: 'combat_gear',
  armour: 'combat_gear',
  equipment: 'skill_gear',
  asset: 'container',
});

const NEW_BUCKETS = new Set(['combat_gear', 'skill_gear', 'tool_utility', 'narrative', 'container']);

/**
 * Compute the migration plan for a single catalogue document. Pure — no DB
 * access, no module-level state.
 *
 * @param {object} doc - an equipment_catalogue document
 * @returns {{ touched: boolean, fromBucket: string|undefined, toBucket: string|undefined, reason: string|null }}
 */
export function planBucketMigration(doc) {
  if (!doc || typeof doc !== 'object') {
    return { touched: false, fromBucket: undefined, toBucket: undefined, reason: 'malformed document' };
  }
  const from = doc.bucket;
  // EQC-1 review patch (#1152, Codex external review Low finding): a
  // non-string `bucket` (e.g. `['weapon']`) would otherwise reach
  // `BUCKET_MAP[from]` and JS's implicit property-key coercion would stringify
  // it to `'weapon'`, silently normalising a malformed document instead of
  // flagging it for human review per this function's own "flag rather than
  // guess" policy. Reject any non-string bucket explicitly, before either
  // lookup.
  if (typeof from !== 'string') {
    return { touched: false, fromBucket: from, toBucket: undefined, reason: `bucket is not a string (got ${Array.isArray(from) ? 'array' : typeof from})` };
  }
  if (NEW_BUCKETS.has(from)) {
    return { touched: false, fromBucket: from, toBucket: from, reason: null };
  }
  const to = BUCKET_MAP[from];
  if (!to) {
    // Neither a known old value nor a known new one — flag rather than guess.
    return { touched: false, fromBucket: from, toBucket: undefined, reason: `unrecognised bucket value "${from}"` };
  }
  return { touched: true, fromBucket: from, toBucket: to, reason: null };
}

/**
 * Drive the migration against MongoDB. Returns the aggregate summary.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.dryRun]
 * @param {boolean} [opts.log]
 */
export async function migrate(opts = {}) {
  const { dryRun = true, log = true } = opts;
  const col = getCollection('equipment_catalogue');
  const docs = await col.find({}).toArray();

  const totals = {
    scanned: docs.length,
    touched: 0,
    written: 0,
    perMapping: Object.create(null),
    unrecognised: [],
    failedAt: null,
  };

  // EQC-1 review patch (#1152, Codex external review Medium finding): the
  // original version incremented `totals.touched` and logged the summary
  // ONLY after the full loop completed, so a mid-loop `updateOne` failure
  // (e.g. a transient Mongo disconnect) threw before an operator saw ANY
  // record of what had already been written. `written` now tracks
  // confirmed-successful writes separately from `touched` (planned writes),
  // and the summary logs from inside a catch block too, so a partial-apply
  // state is always visible even on failure.
  try {
    for (const doc of docs) {
      const plan = planBucketMigration(doc);
      if (plan.reason && !plan.touched) {
        totals.unrecognised.push({ id: String(doc._id), name: doc.name || '(unnamed)', bucket: plan.fromBucket });
        continue;
      }
      if (!plan.touched) continue;

      const key = `${plan.fromBucket} → ${plan.toBucket}`;
      totals.perMapping[key] = (totals.perMapping[key] || 0) + 1;
      totals.touched += 1;

      if (!dryRun) {
        await col.updateOne({ _id: doc._id }, { $set: { bucket: plan.toBucket, updated_at: new Date().toISOString() } });
        totals.written += 1;
      }
    }
  } catch (err) {
    totals.failedAt = { scannedSoFar: totals.touched, writtenSoFar: totals.written, error: String(err && err.message || err) };
    if (log) logSummary(totals, dryRun);
    throw err;
  }

  if (log) logSummary(totals, dryRun);
  return totals;
}

export function logSummary(totals, dryRun) {
  const verb = dryRun ? '[DRY RUN] would touch' : 'touched';
  console.log(`Scanned ${totals.scanned} catalogue item(s); ${verb} ${totals.touched}.`);
  if (totals.failedAt) {
    console.log(`\nFAILED mid-run: ${totals.failedAt.writtenSoFar} write(s) confirmed committed before the error; ` +
      `${totals.failedAt.scannedSoFar - totals.failedAt.writtenSoFar} more were planned but not yet attempted or did not complete. ` +
      `This script is idempotent — re-run it (dry-run first) to pick up where it left off, rather than assuming a full re-apply is needed.`);
    console.log(`Error: ${totals.failedAt.error}`);
  }
  if (Object.keys(totals.perMapping).length) {
    console.log('Per-mapping:');
    for (const [k, n] of Object.entries(totals.perMapping)) console.log(`  ${k.padEnd(24)} ${n}`);
  }
  if (totals.unrecognised.length) {
    console.log(`\nUNRECOGNISED bucket values (${totals.unrecognised.length}) — SKIPPED, need human review:`);
    for (const u of totals.unrecognised) console.log(`  ${u.name} (${u.id}): bucket="${u.bucket}"`);
  }
}

export async function main(argv = process.argv) {
  const dryRun = !argv.includes('--apply');
  console.log(`Mode: ${dryRun ? 'DRY RUN (read only; pass --apply to write)' : 'APPLY (will write)'}`);
  console.log(`Target DB: ${process.env.MONGODB_DB || 'tm_suite'}`);
  console.log('');

  await connectDb();
  try {
    await migrate({ dryRun });
  } finally {
    await closeDb();
  }

  console.log('\nIdempotency check (after --apply): re-run with no flag and confirm "touched 0".');
}

// Auto-run only when invoked directly (not when imported by a test).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => { console.error(err); process.exit(1); });
}
