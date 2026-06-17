#!/usr/bin/env node

/**
 * ECM-2 (issue #869) — Equipment catalogue seed script (step 1 of the
 * Epic ECM migration; see specs/epic-ecm-equipment-catalogue-migration.md).
 *
 * Reads the static EQUIPMENT_CATALOGUE from server/data/equipment-catalogue.js
 * (the parity-tested mirror of public/js/data/equipment-data.js; both are
 * deleted in ECM-7, so reading the server mirror avoids cross-package
 * ESM/CJS boundary nonsense without losing any data — they are identical
 * by construction). Inserts each entry into the `equipment_catalogue`
 * collection with a fresh ObjectId, dropping the legacy `id` slug per
 * epic D1 ("_id: ObjectId is the only identity — no slug field").
 *
 * Step 1 ONLY — does NOT touch `character.equipment[].catalogue_id`. That
 * backfill is ECM-3, which consumes the slug→ObjectId map this script
 * emits at INFO level so the next stage can reuse it without re-deriving.
 *
 * Idempotency contract (per Khepri dispatch):
 *   • refuses to seed if equipment_catalogue.countDocuments() > 0 without
 *     `--force`. exit status 1, descriptive message naming the count and
 *     suggesting the drop-first remediation path.
 *   • `--force` proceeds even if non-empty. It does **NOT drop** the
 *     collection — the safety call is deliberate. STs who want a true
 *     re-seed must drop the collection manually first; with --force
 *     against a non-empty collection the resulting state has duplicates
 *     by name+bucket but unique _ids, and the operator owns that.
 *
 * DRY-RUN (`--dry-run`, the default unless `--apply` is passed): reports
 * intended seed count + the first 3 sample entries. No DB writes. Exit 0.
 *
 * Usage:
 *   cd server && node scripts/ecm-migrate.js                  # dry-run
 *   cd server && node scripts/ecm-migrate.js --apply          # live seed
 *   cd server && node scripts/ecm-migrate.js --apply --force  # re-seed on non-empty
 *
 * dotenv path note: must be run from `server/` so dotenv/config picks up
 * server/.env. See memory [[feedback_server_scripts_dotenv_path]].
 */

import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';
import { EQUIPMENT_CATALOGUE } from '../data/equipment-catalogue.js';

const DB_NAME = process.env.MONGODB_DB || 'tm_suite';
const SAMPLE_SIZE = 3;

/**
 * Convert a static-source catalogue entry into the document shape inserted
 * into `equipment_catalogue`. Strips the legacy `id` slug; captures the
 * timestamps for audit-light metadata per epic D1.
 */
export function toCatalogueDoc(srcEntry, now = new Date().toISOString()) {
  const { id: _slug, ...rest } = srcEntry;
  return { ...rest, created_at: now, updated_at: now };
}

/**
 * Build the in-memory slug→ObjectId map from a list of source entries
 * and a parallel list of inserted ObjectIds. Used to log the map at
 * INFO level (epic D7 / AC#5) and as the return value for ECM-3.
 */
export function buildSlugMap(srcEntries, insertedIds) {
  if (srcEntries.length !== insertedIds.length) {
    throw new Error(
      `ECM-2 internal: entry count (${srcEntries.length}) ≠ inserted id count (${insertedIds.length})`
    );
  }
  const map = new Map();
  for (let i = 0; i < srcEntries.length; i++) {
    map.set(srcEntries[i].id, insertedIds[i]);
  }
  return map;
}

/**
 * Format the slug→ObjectId map for human-readable INFO log output.
 * One slug per line, padded for grep-ability.
 */
export function formatSlugMap(map) {
  const lines = ['slug→ObjectId map (preserve for ECM-3 backfill):'];
  // Sort by slug so the log is stable across runs.
  const entries = [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  const pad = entries.reduce((w, [s]) => Math.max(w, s.length), 0);
  for (const [slug, id] of entries) {
    lines.push(`  ${slug.padEnd(pad)}  →  ${id}`);
  }
  return lines.join('\n');
}

/**
 * Refusal error raised when the collection is non-empty and --force is
 * not supplied. Carries a stable `code` so callers / tests can react.
 */
class RefuseNonEmptyError extends Error {
  constructor(count) {
    super(
      `equipment_catalogue is non-empty (${count} document${count === 1 ? '' : 's'}). ` +
      `Refusing to seed without --force. If you really want to re-seed, drop the collection ` +
      `manually first, then re-run without --force; --force does NOT drop and will produce ` +
      `duplicates by name+bucket.`
    );
    this.name = 'RefuseNonEmptyError';
    this.code = 'REFUSE_NONEMPTY';
    this.count = count;
  }
}

export async function main() {
  // Compute mode + flags inside main so integration tests can toggle via
  // process.argv (per the #826 lesson now ingrained as
  // [[feedback_script_integration_test]]).
  const APPLY = process.argv.includes('--apply');
  const DRY_RUN = !APPLY;
  const FORCE = process.argv.includes('--force');

  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI not set. Ensure server/.env is present and the script is run from server/.');
  }

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  try {
    const db = client.db(DB_NAME);
    const col = db.collection('equipment_catalogue');

    console.log(`\n${DRY_RUN ? '[DRY RUN]' : '[APPLY]'} ecm-migrate.js (ECM-2: seed only)`);
    console.log(`Database: ${DB_NAME}`);
    console.log(`Source entries: ${EQUIPMENT_CATALOGUE.length}`);

    const existing = await col.countDocuments();
    console.log(`Existing equipment_catalogue documents: ${existing}`);

    if (DRY_RUN) {
      console.log('\nFirst sample entries (no writes):');
      for (const e of EQUIPMENT_CATALOGUE.slice(0, SAMPLE_SIZE)) {
        console.log(`  - [${e.bucket}] ${e.name}  (slug=${e.id})`);
      }
      console.log(`\n[DRY RUN] Would insert ${EQUIPMENT_CATALOGUE.length} document${EQUIPMENT_CATALOGUE.length === 1 ? '' : 's'}.`);
      if (existing > 0 && !FORCE) {
        console.log('[DRY RUN] NOTE: a live run without --force would REFUSE (collection non-empty).');
      }
      console.log('\n[DRY RUN] Re-run with --apply to write.');
      return {
        mode: 'dry-run',
        sourceCount: EQUIPMENT_CATALOGUE.length,
        existingCount: existing,
        wouldRefuse: existing > 0 && !FORCE,
        sample: EQUIPMENT_CATALOGUE.slice(0, SAMPLE_SIZE).map(e => ({ id: e.id, bucket: e.bucket, name: e.name })),
      };
    }

    // ── Live run ──

    if (existing > 0 && !FORCE) {
      throw new RefuseNonEmptyError(existing);
    }
    if (existing > 0 && FORCE) {
      console.log(`[APPLY] --force set; appending ${EQUIPMENT_CATALOGUE.length} entries to non-empty collection. ` +
                  `Operator accepts duplicate name+bucket consequences.`);
    }

    // Build the docs with shared `now` so created_at == updated_at across
    // the batch — gives ECM-6's "recently added" filters a stable handle.
    const now = new Date().toISOString();
    const docs = EQUIPMENT_CATALOGUE.map(e => toCatalogueDoc(e, now));
    const result = await col.insertMany(docs, { ordered: true });

    const insertedIds = Object.values(result.insertedIds);
    const slugMap = buildSlugMap(EQUIPMENT_CATALOGUE, insertedIds);

    console.log(`[APPLY] Inserted ${result.insertedCount} document${result.insertedCount === 1 ? '' : 's'}.`);
    console.log('');
    console.log(formatSlugMap(slugMap));
    console.log('');
    console.log(`[APPLY] Idempotency check: re-run without --force and confirm "Refusing to seed".`);

    return {
      mode: 'apply',
      sourceCount: EQUIPMENT_CATALOGUE.length,
      insertedCount: result.insertedCount,
      slugMap,
      forced: FORCE,
    };
  } finally {
    await client.close();
  }
}

const _invokedDirectly = import.meta.url === `file://${process.argv[1]}`;
if (_invokedDirectly) {
  main().catch(err => {
    if (err?.code === 'REFUSE_NONEMPTY') {
      console.error(`\n[REFUSE] ${err.message}`);
      process.exit(1);
    }
    console.error(err);
    process.exit(1);
  });
}
