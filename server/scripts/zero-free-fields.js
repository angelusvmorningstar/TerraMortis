#!/usr/bin/env node

/**
 * Zero generic `free` dot fields across all character documents.
 *
 * The old schema used a generic `free` bucket on attributes, skills,
 * disciplines, merits, and fighting styles to represent grant dots from
 * various sources. This has been replaced with named pool fields:
 *   free_mci, free_bloodline, free_retainer, free_vm, free_lk, free_ohm,
 *   free_inv, free_pt, free_mdb, free_ots
 *
 * What this script does per character:
 *   attributes.*    — zero `free` (base 1-dot is now derived at render time)
 *   skills.*        — zero `free` (was folded into cp on re-import)
 *   disciplines.*   — fold `free` into `cp`, then zero `free`
 *                     (preserves grant dots as explicit cp, matches import logic)
 *   merits[*]       — zero `free` (named pools set by applyDerivedMerits at render)
 *   fighting_styles — zero `free` (replaced by free_mci / free_ots)
 *
 * Usage:
 *   node scripts/zero-free-fields.js --dry-run   # default, no writes
 *   node scripts/zero-free-fields.js --apply     # actually write
 *
 *   # Override the database (default: tm_suite)
 *   DB_NAME=tm_suite_dev node scripts/zero-free-fields.js --apply
 */

import 'dotenv/config';
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI not set in environment.');
  process.exit(1);
}

const DB_NAME = process.env.DB_NAME || 'tm_suite';
const APPLY = process.argv.includes('--apply');

function processCharacter(c) {
  const updates = {};
  let changeCount = 0;

  // ── Attributes ──
  for (const [attr, ao] of Object.entries(c.attributes || {})) {
    if (ao && (ao.free || 0) !== 0) {
      updates[`attributes.${attr}.free`] = 0;
      changeCount++;
    }
  }

  // ── Skills ──
  for (const [sk, so] of Object.entries(c.skills || {})) {
    if (so && (so.free || 0) !== 0) {
      updates[`skills.${sk}.free`] = 0;
      changeCount++;
    }
  }

  // ── Disciplines — fold free into cp ──
  for (const [disc, dObj] of Object.entries(c.disciplines || {})) {
    if (typeof dObj !== 'object' || dObj === null) continue;
    const f = dObj.free || 0;
    if (f !== 0) {
      updates[`disciplines.${disc}.cp`] = (dObj.cp || 0) + f;
      updates[`disciplines.${disc}.free`] = 0;
      changeCount++;
    }
  }

  // ── Merits ──
  (c.merits || []).forEach((m, i) => {
    if ((m.free || 0) !== 0) {
      updates[`merits.${i}.free`] = 0;
      changeCount++;
    }
  });

  // ── Fighting styles ──
  (c.fighting_styles || []).forEach((fs, i) => {
    if ((fs.free || 0) !== 0) {
      updates[`fighting_styles.${i}.free`] = 0;
      changeCount++;
    }
  });

  return { updates, changeCount };
}

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (will write)' : 'DRY RUN (no writes)'}`);
  console.log(`Database: ${DB_NAME}\n`);

  const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  try {
    await client.connect();
    const col = client.db(DB_NAME).collection('characters');

    const chars = await col.find({}).toArray();
    console.log(`Found ${chars.length} characters.\n`);

    let totalDocs = 0, totalChanges = 0;

    for (const c of chars) {
      const { updates, changeCount } = processCharacter(c);
      if (changeCount === 0) continue;

      totalDocs++;
      totalChanges += changeCount;
      console.log(`  ${c.name || c._id}  (${changeCount} field${changeCount === 1 ? '' : 's'})`);
      if (process.argv.includes('--verbose')) {
        for (const [k, v] of Object.entries(updates)) console.log(`    ${k} = ${v}`);
      }

      if (APPLY) {
        await col.updateOne({ _id: c._id }, { $set: updates });
      }
    }

    console.log(`\n${totalDocs} document${totalDocs === 1 ? '' : 's'} affected, ${totalChanges} field${totalChanges === 1 ? '' : 's'} changed.`);
    if (!APPLY) console.log('\nDry run — no changes written. Re-run with --apply to commit.');
  } finally {
    await client.close();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
