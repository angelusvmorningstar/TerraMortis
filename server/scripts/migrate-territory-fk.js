#!/usr/bin/env node
/**
 * One-off migration: rewrite slug-keyed FKs across tm_suite to use territory
 * _id strings, and rename the legacy `id` field on territory documents to
 * `slug`. Implements ADR-002 step 3 (specs/architecture/adr-002-territory-fk.md).
 *
 * ADR decisions honoured:
 *   - Q1 retain-as-slug:  $rename territories.id → territories.slug
 *   - Q2 strict cutover:  post-apply, no slug FKs anywhere on disk in scope
 *   - Q5 migrate residency: $rename territory_residency.territory → territory_id
 *                           (resolved via territories.name → _id)
 *   - Q4 leave submissions: feeding_territories keys NOT touched
 *
 * Targets:
 *   - territories:                                 $rename id → slug
 *   - downtime_cycles.regent_confirmations[].territory_id:  slug → _idstr
 *   - downtime_cycles.confirmed_ambience:          rekey slug → _idstr
 *   - downtime_cycles.discipline_profile:          rekey slug → _idstr
 *   - downtime_cycles.territory_pulse:             rekey slug → _idstr
 *   - territory_residency:                         $rename territory → territory_id
 *                                                  (value: name → _idstr via name match)
 *
 * Usage:
 *   cd server && node scripts/migrate-territory-fk.js          # dry-run (default)
 *   cd server && node scripts/migrate-territory-fk.js --apply  # actual mutation
 *
 * Behaviour:
 *   - Always writes a backup BEFORE applying mutations. Sequential await chain
 *     means a backup-write throw aborts the script before any DB write fires.
 *   - Idempotent re-run: detects already-migrated state by checking that no
 *     territory has a legacy `id` field, no cycle's object maps have non-OID-
 *     shaped keys, and no residency doc still has a `territory` field. Exits
 *     0 with `already-migrated: true` and no backup file.
 *   - Safety guard: any slug-shaped key in a cycle that doesn't resolve via
 *     the slug→_id map aborts with exit 2 BEFORE any write.
 *   - Safety guard: any residency doc whose `territory` value doesn't match
 *     a territory's `name` aborts with exit 2.
 *
 * Exit codes:
 *   0  success / dry-run / already-migrated
 *   1  config error (MONGODB_URI missing)
 *   2  safety abort (data shape divergence from audit)
 *
 * Run history:
 *   - <yet to run> — first --apply in production. Update with date + commit
 *     SHA + per-mutation counts after SM executes the apply step.
 */
import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const APPLY = process.argv.includes('--apply');
const HELP  = process.argv.includes('--help') || process.argv.includes('-h');

if (HELP) {
  console.log('Usage: node scripts/migrate-territory-fk.js [--apply]');
  console.log('  Default is DRY-RUN. --apply writes a backup then mutates.');
  process.exit(0);
}

const URI = process.env.MONGODB_URI;
if (!URI) {
  console.error('MONGODB_URI missing — populate server/.env before running.');
  process.exit(1);
}

const HEX24 = /^[0-9a-f]{24}$/i;
const isOidShaped = s => typeof s === 'string' && HEX24.test(s);

const client = new MongoClient(URI);
await client.connect();
const db = client.db('tm_suite');

// ── Step 1: build slug → _idstr map from territories ────────────────────────
const territories = await db.collection('territories').find().toArray();
const slugToOid = new Map();
for (const t of territories) {
  // Read `id ?? slug` so the script tolerates partial-state docs (some renamed,
  // some not) during a re-run or interrupted previous attempt.
  const slug = t.id ?? t.slug;
  if (slug) slugToOid.set(slug, String(t._id));
}

console.log('slug → _id map:');
for (const [s, o] of slugToOid) console.log(`  '${s}' → ${o}`);

// ── Step 2: audit pass (count expected mutations) ───────────────────────────
const cycles = await db.collection('downtime_cycles').find().toArray();
const residency = await db.collection('territory_residency').find().toArray();

const plan = {
  territories: { rename: 0 },
  cycles: [],
  residency: { rename: 0, total: residency.length },
  alreadyMigrated: true,
};

// Territory rename count
plan.territories.rename = territories.filter(t => t.id !== undefined).length;
if (plan.territories.rename > 0) plan.alreadyMigrated = false;

// Cycle audit (with safety abort on unresolvable slugs)
for (const cycle of cycles) {
  const cyclePlan = {
    _id: String(cycle._id),
    label: cycle.label,
    confirmations: 0,
    ambience: 0,
    profile: 0,
    pulse: 0,
  };

  for (const c of (cycle.regent_confirmations || [])) {
    if (slugToOid.has(c.territory_id)) cyclePlan.confirmations++;
    else if (!isOidShaped(c.territory_id)) {
      console.error(`SAFETY ABORT: cycle ${cycle._id} regent_confirmations has unresolved territory_id="${c.territory_id}"`);
      await client.close();
      process.exit(2);
    }
  }

  for (const [field, label] of [['confirmed_ambience','ambience'], ['discipline_profile','profile'], ['territory_pulse','pulse']]) {
    if (!cycle[field]) continue;
    for (const k of Object.keys(cycle[field])) {
      if (slugToOid.has(k)) cyclePlan[label]++;
      else if (!isOidShaped(k)) {
        console.error(`SAFETY ABORT: cycle ${cycle._id} ${field} has unresolved key="${k}"`);
        await client.close();
        process.exit(2);
      }
    }
  }

  if (cyclePlan.confirmations + cyclePlan.ambience + cyclePlan.profile + cyclePlan.pulse > 0) {
    plan.cycles.push(cyclePlan);
    plan.alreadyMigrated = false;
  }
}

// Residency audit (with safety abort on unresolvable names)
for (const doc of residency) {
  if (doc.territory_id !== undefined) continue; // already migrated
  if (doc.territory === undefined) continue;     // shape unknown; nothing to do
  // Resolve name → territory _id via territories.name match.
  const terr = territories.find(t => t.name === doc.territory);
  if (!terr) {
    console.error(`SAFETY ABORT: residency doc ${doc._id} territory='${doc.territory}' has no matching territory by name`);
    await client.close();
    process.exit(2);
  }
  plan.residency.rename++;
}
if (plan.residency.rename > 0) plan.alreadyMigrated = false;

console.log('\n--- Audit ---');
console.log(JSON.stringify(plan, null, 2));

if (plan.alreadyMigrated) {
  console.log('\nalready-migrated: true   nothing to do.');
  await client.close();
  process.exit(0);
}

if (!APPLY) {
  console.log('\nDRY-RUN — re-run with --apply to execute.');
  await client.close();
  process.exit(0);
}

// ── Step 3: backup BEFORE any mutation ──────────────────────────────────────
const here = dirname(fileURLToPath(import.meta.url));
const backupDir = join(here, '_backups');
mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = join(backupDir, `territory-fk-migration-${stamp}.json`);
writeFileSync(backupPath, JSON.stringify({
  capturedAt: stamp,
  territories,
  cycles,
  residency,
}, null, 2));
console.log(`\nBackup → ${backupPath}`);

// ── Step 4: apply mutations ─────────────────────────────────────────────────
const counts = { confirmations: 0, ambience: 0, profile: 0, pulse: 0, terrRename: 0, residencyRename: 0 };

// 4a: cycle rewrites
for (const cycle of cycles) {
  const updates = {};
  let dirty = false;

  // regent_confirmations[].territory_id
  if (cycle.regent_confirmations?.length) {
    let changed = false;
    const newConfirms = cycle.regent_confirmations.map(c => {
      const oid = slugToOid.get(c.territory_id);
      if (oid && !isOidShaped(c.territory_id)) {
        counts.confirmations++;
        changed = true;
        return { ...c, territory_id: oid };
      }
      return c;
    });
    if (changed) {
      updates.regent_confirmations = newConfirms;
      dirty = true;
    }
  }

  // Object rekeys
  for (const [field, label] of [['confirmed_ambience','ambience'], ['discipline_profile','profile'], ['territory_pulse','pulse']]) {
    if (!cycle[field]) continue;
    const old = cycle[field];
    const next = {};
    let changed = false;
    for (const [k, v] of Object.entries(old)) {
      const oid = slugToOid.get(k);
      if (oid && !isOidShaped(k)) {
        next[oid] = v;
        counts[label]++;
        changed = true;
      } else {
        next[k] = v;
      }
    }
    if (changed) {
      updates[field] = next;
      dirty = true;
    }
  }

  if (dirty) {
    await db.collection('downtime_cycles').updateOne({ _id: cycle._id }, { $set: updates });
  }
}

// 4b: territory $rename id → slug
if (plan.territories.rename > 0) {
  const r = await db.collection('territories').updateMany(
    { id: { $exists: true } },
    { $rename: { id: 'slug' } }
  );
  counts.terrRename = r.modifiedCount;
}

// 4c: residency $rename + name resolution
for (const doc of residency) {
  if (doc.territory_id !== undefined) continue;
  if (doc.territory === undefined) continue;
  const terr = territories.find(t => t.name === doc.territory);
  // Map was confirmed in audit pass; safety abort handled there. Re-check
  // defensively in case territories drifted between audit and apply (paranoia).
  if (!terr) {
    console.error(`POST-AUDIT SAFETY ABORT: residency doc ${doc._id} territory='${doc.territory}' lost its match`);
    await client.close();
    process.exit(2);
  }
  await db.collection('territory_residency').updateOne(
    { _id: doc._id },
    { $set: { territory_id: String(terr._id) }, $unset: { territory: '' } }
  );
  counts.residencyRename++;
}

console.log('\n--- Apply counts ---');
console.log(JSON.stringify(counts, null, 2));

// ── Step 5: re-audit ────────────────────────────────────────────────────────
const postT = await db.collection('territories').find({ id: { $exists: true } }).toArray();
console.log(`\nPost-state: territories with legacy 'id' field = ${postT.length} (expected 0)`);

const postCyc = await db.collection('downtime_cycles').find().toArray();
let postSlugKeys = 0;
for (const cycle of postCyc) {
  for (const field of ['confirmed_ambience','discipline_profile','territory_pulse']) {
    if (!cycle[field]) continue;
    for (const k of Object.keys(cycle[field])) {
      if (!isOidShaped(k)) postSlugKeys++;
    }
  }
  for (const c of (cycle.regent_confirmations || [])) {
    if (!isOidShaped(c.territory_id)) postSlugKeys++;
  }
}
console.log(`Post-state: cycle map keys + confirmation territory_ids that are still slug-shaped = ${postSlugKeys} (expected 0)`);

const postRes = await db.collection('territory_residency').find({ territory: { $exists: true } }).toArray();
console.log(`Post-state: residency docs with legacy 'territory' field = ${postRes.length} (expected 0)`);

await client.close();
