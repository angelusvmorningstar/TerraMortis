#!/usr/bin/env node

/**
 * Epic ECM — equipment catalogue migration script
 * (specs/epic-ecm-equipment-catalogue-migration.md).
 *
 * Two steps in one script:
 *
 *   Step 1 (ECM-2 / issue #869) — Seed the `equipment_catalogue` collection
 *     from the static EQUIPMENT_CATALOGUE module. Refuses non-empty without
 *     `--force`; `--force` does NOT drop. DRY-RUN reports counts + first 3
 *     sample entries.
 *
 *   Step 2 (ECM-3 / issue #870) — Backfill `character.equipment[].catalogue_id`
 *     from slug strings to ObjectId references. Rebuilds the slug→ObjectId map
 *     fresh from the equipment_catalogue collection (the ECM-2 in-memory map
 *     is gone by the time this runs). Walks every character document; for
 *     each item:
 *       • String slug → look up in map → replace with ObjectId.
 *       • Already ObjectId / non-string → skip (idempotent).
 *       • Unresolved slug → drop the item AND log it for ST review.
 *
 *     **HALT-DAR pin (epic D7, ECM-3 dispatch)**: the DRY-RUN orphan-slug list
 *     is product-relevant, not just operational. Peter signs off on the
 *     orphan list before any `--apply` runs against production.
 *
 * Default mode is DRY-RUN unless `--apply` is passed. Step selection:
 *   `--step=seed`     → step 1 only (ECM-2 behaviour).
 *   `--step=backfill` → step 2 only (ECM-3 behaviour).
 *   default           → step 2 only (ECM-3 is the current dispatch; step 1
 *                       has already shipped, and running both would refuse
 *                       on a populated collection anyway).
 *
 * Usage:
 *   cd server && node scripts/ecm-migrate.js                                  # dry-run backfill
 *   cd server && node scripts/ecm-migrate.js --apply                          # live backfill
 *   cd server && node scripts/ecm-migrate.js --step=seed                      # dry-run seed
 *   cd server && node scripts/ecm-migrate.js --step=seed --apply              # live seed
 *   cd server && node scripts/ecm-migrate.js --step=seed --apply --force      # re-seed
 *
 * dotenv path note: must be run from `server/` so dotenv/config picks up
 * server/.env. See memory [[feedback_server_scripts_dotenv_path]].
 */

import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';
import { EQUIPMENT_CATALOGUE } from '../data/equipment-catalogue.js';

const DB_NAME = process.env.MONGODB_DB || 'tm_suite';
const SAMPLE_SIZE = 3;

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 helpers (ECM-2, unchanged from #883)
// ─────────────────────────────────────────────────────────────────────────────

export function toCatalogueDoc(srcEntry, now = new Date().toISOString()) {
  const { id: _slug, ...rest } = srcEntry;
  return { ...rest, created_at: now, updated_at: now };
}

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

export function formatSlugMap(map) {
  const lines = ['slug→ObjectId map:'];
  const entries = [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  const pad = entries.reduce((w, [s]) => Math.max(w, s.length), 0);
  for (const [slug, id] of entries) {
    lines.push(`  ${slug.padEnd(pad)}  →  ${id}`);
  }
  return lines.join('\n');
}

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

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 helpers (ECM-3)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the slug→ObjectId map by reading the equipment_catalogue collection.
 * The ECM-2 in-memory map is gone by the time ECM-3 runs (different process),
 * so we re-derive from current Mongo state.
 *
 * Strategy: match each EQUIPMENT_CATALOGUE source entry's name+bucket against
 * a catalogue document. Name+bucket is the only stable join key — slug is
 * gone from the new docs per epic D1.
 *
 * Returns { map: Map<slug, ObjectId>, missingSlugs: string[] }. missingSlugs
 * are source slugs that have no matching catalogue doc (indicates a partial
 * ECM-2 seed or mid-flight catalogue mutation; surfaced in the DRY-RUN report).
 */
export async function buildSlugMapFromCollection(catalogueColl) {
  const docs = await catalogueColl.find({}, { projection: { _id: 1, name: 1, bucket: 1 } }).toArray();
  // Index by `name|bucket` for O(1) lookups.
  const byKey = new Map();
  for (const d of docs) {
    byKey.set(`${d.name}|${d.bucket}`, d._id);
  }
  const map = new Map();
  const missingSlugs = [];
  for (const src of EQUIPMENT_CATALOGUE) {
    const key = `${src.name}|${src.bucket}`;
    const oid = byKey.get(key);
    if (oid) map.set(src.id, oid);
    else missingSlugs.push(src.id);
  }
  return { map, missingSlugs };
}

/**
 * Classify a single character.equipment[] item against the slug map. Returns
 * the action shape the backfill engine will take.
 *
 *   { action: 'convert', newId }   — slug string resolved → store ObjectId.
 *   { action: 'skip' }             — already ObjectId or non-string (idempotent).
 *   { action: 'drop', slug }       — slug string with no matching ObjectId in
 *                                    the map (orphan; log + drop).
 */
export function classifyItem(item, slugMap) {
  if (!item || typeof item !== 'object') return { action: 'skip' };
  const cid = item.catalogue_id;
  // Already an ObjectId instance, or a serialized 24-hex string (already
  // backfilled by a prior run), or anything that isn't a string — all skip.
  if (cid instanceof ObjectId) return { action: 'skip' };
  if (typeof cid !== 'string') return { action: 'skip' };
  // A 24-hex string is an ObjectId in transit (from a re-fetched doc). Skip.
  if (/^[a-f0-9]{24}$/.test(cid)) return { action: 'skip' };
  // Slug shape. Look it up.
  const oid = slugMap.get(cid);
  if (oid) return { action: 'convert', newId: oid };
  return { action: 'drop', slug: cid };
}

/**
 * Walk a character document and apply backfill actions. Mutates the equipment
 * array in place; returns diagnostics for the per-character log + report
 * aggregation. Does NOT touch the database.
 */
export function backfillCharEquipment(charDoc, slugMap) {
  if (!Array.isArray(charDoc.equipment)) {
    return { converted: 0, skipped: 0, dropped: [] };
  }
  const kept = [];
  let converted = 0;
  let skipped = 0;
  const dropped = [];
  for (const item of charDoc.equipment) {
    const decision = classifyItem(item, slugMap);
    if (decision.action === 'convert') {
      kept.push({ ...item, catalogue_id: decision.newId });
      converted++;
    } else if (decision.action === 'skip') {
      kept.push(item);
      skipped++;
    } else {
      // 'drop'
      dropped.push({ slug: decision.slug, item });
    }
  }
  charDoc.equipment = kept;
  return { converted, skipped, dropped };
}

// ─────────────────────────────────────────────────────────────────────────────
// main()
// ─────────────────────────────────────────────────────────────────────────────

function parseStep(argv) {
  const arg = argv.find(a => a.startsWith('--step='));
  // Default step is `seed` to preserve the ECM-2 CLI contract — ECM-3 callers
  // pass --step=backfill explicitly. Switching the default mid-epic would
  // break the existing ECM-2 integration suite + any operator muscle memory.
  if (!arg) return 'seed';
  const v = arg.slice('--step='.length);
  if (v !== 'seed' && v !== 'backfill') {
    throw new Error(`Unknown --step value: ${v}. Expected 'seed' or 'backfill'.`);
  }
  return v;
}

export async function main() {
  const APPLY = process.argv.includes('--apply');
  const DRY_RUN = !APPLY;
  const FORCE = process.argv.includes('--force');
  const STEP = parseStep(process.argv);

  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI not set. Ensure server/.env is present and the script is run from server/.');
  }

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  try {
    const db = client.db(DB_NAME);
    if (STEP === 'seed') return await runSeed(db, { DRY_RUN, FORCE });
    if (STEP === 'backfill') return await runBackfill(db, { DRY_RUN });
    throw new Error(`Internal: unhandled step ${STEP}`);
  } finally {
    await client.close();
  }
}

// ── Step 1 runner (unchanged behaviour from ECM-2) ──────────────────────────

async function runSeed(db, { DRY_RUN, FORCE }) {
  const col = db.collection('equipment_catalogue');
  console.log(`\n${DRY_RUN ? '[DRY RUN]' : '[APPLY]'} ecm-migrate.js (--step=seed)`);
  console.log(`Database: ${DB_NAME}`);
  console.log(`Source entries: ${EQUIPMENT_CATALOGUE.length}`);
  const existing = await col.countDocuments();
  console.log(`Existing equipment_catalogue documents: ${existing}`);

  if (DRY_RUN) {
    console.log('\nFirst sample entries (no writes):');
    for (const e of EQUIPMENT_CATALOGUE.slice(0, SAMPLE_SIZE)) {
      console.log(`  - [${e.bucket}] ${e.name}  (slug=${e.id})`);
    }
    console.log(`\n[DRY RUN] Would insert ${EQUIPMENT_CATALOGUE.length} documents.`);
    if (existing > 0 && !FORCE) {
      console.log('[DRY RUN] NOTE: a live run without --force would REFUSE (collection non-empty).');
    }
    console.log('\n[DRY RUN] Re-run with --apply to write.');
    return {
      mode: 'dry-run', step: 'seed',
      sourceCount: EQUIPMENT_CATALOGUE.length,
      existingCount: existing,
      wouldRefuse: existing > 0 && !FORCE,
      sample: EQUIPMENT_CATALOGUE.slice(0, SAMPLE_SIZE).map(e => ({ id: e.id, bucket: e.bucket, name: e.name })),
    };
  }

  if (existing > 0 && !FORCE) throw new RefuseNonEmptyError(existing);
  if (existing > 0 && FORCE) {
    console.log(`[APPLY] --force set; appending ${EQUIPMENT_CATALOGUE.length} entries to non-empty collection. ` +
                `Operator accepts duplicate name+bucket consequences.`);
  }
  const now = new Date().toISOString();
  const docs = EQUIPMENT_CATALOGUE.map(e => toCatalogueDoc(e, now));
  const result = await col.insertMany(docs, { ordered: true });
  const insertedIds = Object.values(result.insertedIds);
  const slugMap = buildSlugMap(EQUIPMENT_CATALOGUE, insertedIds);
  console.log(`[APPLY] Inserted ${result.insertedCount} documents.`);
  console.log('');
  console.log(formatSlugMap(slugMap));
  return {
    mode: 'apply', step: 'seed',
    sourceCount: EQUIPMENT_CATALOGUE.length,
    insertedCount: result.insertedCount,
    slugMap, forced: FORCE,
  };
}

// ── Step 2 runner (ECM-3) ───────────────────────────────────────────────────

async function runBackfill(db, { DRY_RUN }) {
  const catalogueColl = db.collection('equipment_catalogue');
  const charsColl = db.collection('characters');

  console.log(`\n${DRY_RUN ? '[DRY RUN]' : '[APPLY]'} ecm-migrate.js (--step=backfill)`);
  console.log(`Database: ${DB_NAME}`);

  // Re-derive the slug→ObjectId map from the current catalogue collection.
  const { map: slugMap, missingSlugs } = await buildSlugMapFromCollection(catalogueColl);
  console.log(`equipment_catalogue size: ${slugMap.size + missingSlugs.length} (${slugMap.size} resolved, ${missingSlugs.length} unresolved by name+bucket)`);

  if (missingSlugs.length > 0) {
    console.log('\nSource slugs with no matching catalogue doc (catalogue partial-seeded or mid-flight mutation):');
    for (const s of missingSlugs) console.log(`  - ${s}`);
  }

  // Walk every character document.
  let charsTouched = 0;
  let itemsConverted = 0;
  let itemsSkipped = 0;
  const orphans = [];   // { charId, charName, slug, item }
  const perCharLog = [];

  const cursor = charsColl.find({}, { projection: { _id: 1, name: 1, equipment: 1 } });
  for await (const doc of cursor) {
    if (!Array.isArray(doc.equipment) || doc.equipment.length === 0) continue;
    const { converted, skipped, dropped } = backfillCharEquipment(doc, slugMap);
    if (converted === 0 && dropped.length === 0) {
      itemsSkipped += skipped;
      continue;
    }
    itemsConverted += converted;
    itemsSkipped += skipped;
    for (const d of dropped) {
      orphans.push({ charId: String(doc._id), charName: doc.name || '(unnamed)', slug: d.slug, item: d.item });
    }
    perCharLog.push({
      charId: String(doc._id),
      charName: doc.name || '(unnamed)',
      converted, skipped, droppedCount: dropped.length,
      nextEquipment: doc.equipment,
    });
    charsTouched++;
    if (!DRY_RUN) {
      await charsColl.updateOne(
        { _id: doc._id },
        { $set: { equipment: doc.equipment } }
      );
    }
  }

  // ── Report ──
  console.log('');
  console.log('────────── ECM-3 BACKFILL REPORT ──────────');
  console.log(`Characters touched : ${charsTouched}`);
  console.log(`Items converted    : ${itemsConverted}  (slug → ObjectId)`);
  console.log(`Items skipped      : ${itemsSkipped}  (already ObjectId / 24-hex / non-string)`);
  console.log(`Orphans            : ${orphans.length}  (slug with no catalogue match — dropped from character)`);
  console.log('───────────────────────────────────────────');

  if (orphans.length > 0) {
    console.log('\nOrphan-slug detail (HALT-DAR — Peter sign-off required before --apply):');
    for (const o of orphans) {
      console.log(`  ${o.charName.padEnd(28)}  [${o.charId}]  slug=${o.slug}  state=${o.item.state || '?'}  acquired_cycle=${o.item.acquired_cycle ?? '?'}`);
    }
  }

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Re-run with --apply to write the changes above.');
  } else {
    console.log('\n[APPLY] Idempotency check: re-run without --apply (dry-run) and confirm "Items converted: 0".');
  }

  return {
    mode: DRY_RUN ? 'dry-run' : 'apply',
    step: 'backfill',
    catalogueResolved: slugMap.size,
    catalogueMissingSlugs: missingSlugs,
    charsTouched,
    itemsConverted,
    itemsSkipped,
    orphans,
    perCharLog,
  };
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
