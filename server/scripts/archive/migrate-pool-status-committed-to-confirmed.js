#!/usr/bin/env node

/**
 * Rename pool_status 'committed' → 'confirmed' across all downtime submissions.
 *
 * feature.310 renamed the intermediate pool state. The value is stored in nested
 * subdocuments: feeding_review, projects_resolved[n], merit_actions_resolved[n],
 * sorcery_review[n], st_actions_resolved[n].
 *
 * Also renames pool_committed_by → pool_confirmed_by wherever found.
 *
 * Idempotent: re-running produces zero updates.
 *
 * Usage:
 *   node server/scripts/migrate-pool-status-committed-to-confirmed.js --dry-run
 *   node server/scripts/migrate-pool-status-committed-to-confirmed.js --apply
 */

import 'dotenv/config';
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI not set.');
  process.exit(1);
}

const APPLY   = process.argv.includes('--apply');
const DRY_RUN = !APPLY;

function migrateReview(rev) {
  if (!rev || typeof rev !== 'object') return { changed: false, obj: rev };
  let changed = false;
  const out = { ...rev };
  if (out.pool_status === 'committed') {
    out.pool_status = 'confirmed';
    changed = true;
  }
  if ('pool_committed_by' in out) {
    out.pool_confirmed_by = out.pool_committed_by;
    delete out.pool_committed_by;
    changed = true;
  }
  return { changed, obj: out };
}

function migrateArray(arr) {
  if (!Array.isArray(arr)) return { changed: false, arr };
  let anyChanged = false;
  const out = arr.map(item => {
    const { changed, obj } = migrateReview(item);
    if (changed) anyChanged = true;
    return obj;
  });
  return { changed: anyChanged, arr: out };
}

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (will write)' : 'DRY RUN (read only)'}`);
  const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  try {
    await client.connect();
    const db   = client.db(process.env.MONGODB_DB || 'tm_suite');
    const coll = db.collection('downtime_submissions');

    const subs = await coll.find({}).toArray();
    console.log(`Loaded ${subs.length} downtime submissions\n`);

    let totalUpdated = 0;

    for (const sub of subs) {
      const update = {};
      let touched = false;

      const fr = migrateReview(sub.feeding_review);
      if (fr.changed) { update.feeding_review = fr.obj; touched = true; }

      const pr = migrateArray(sub.projects_resolved);
      if (pr.changed) { update.projects_resolved = pr.arr; touched = true; }

      const mr = migrateArray(sub.merit_actions_resolved);
      if (mr.changed) { update.merit_actions_resolved = mr.arr; touched = true; }

      const sar = migrateArray(sub.st_actions_resolved);
      if (sar.changed) { update.st_actions_resolved = sar.arr; touched = true; }

      if (sub.sorcery_review && typeof sub.sorcery_review === 'object') {
        const srcOut = {};
        let srcChanged = false;
        for (const [k, v] of Object.entries(sub.sorcery_review)) {
          const { changed, obj } = migrateReview(v);
          srcOut[k] = obj;
          if (changed) srcChanged = true;
        }
        if (srcChanged) { update.sorcery_review = srcOut; touched = true; }
      }

      if (touched) {
        totalUpdated++;
        const label = sub._id;
        console.log(`${label}: ${Object.keys(update).join(', ')}`);
        if (APPLY) {
          await coll.updateOne({ _id: sub._id }, { $set: update });
        }
      }
    }

    console.log(`\n${DRY_RUN ? '[DRY RUN] Would update' : 'Updated'} ${totalUpdated} submissions.`);
  } finally {
    await client.close();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
