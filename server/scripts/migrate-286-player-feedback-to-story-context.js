/**
 * Issue #286 — rename player_feedback → story_context across all review sub-objects
 * in downtime_submissions.
 *
 * Sub-arrays migrated:
 *   feeding_review (object)
 *   projects_resolved[*]
 *   merit_actions_resolved[*]
 *   sorcery_review (object keyed by index strings)
 *   st_actions_resolved[*]
 *   acquisitions_resolved[*]
 *
 * Run: node server/scripts/migrate-286-player-feedback-to-story-context.js
 */

import { MongoClient } from 'mongodb';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env') });

const ARRAY_FIELDS = [
  'projects_resolved',
  'merit_actions_resolved',
  'st_actions_resolved',
  'acquisitions_resolved',
];

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set');

  const client = new MongoClient(uri);
  await client.connect();

  const db   = client.db(process.env.DB_NAME || 'tm_suite');
  const coll = db.collection('downtime_submissions');

  const subs = await coll.find({}).toArray();
  let updated = 0;

  for (const sub of subs) {
    const $set   = {};
    const $unset = {};

    // feeding_review (object, not array)
    if (sub.feeding_review?.player_feedback !== undefined) {
      $set['feeding_review.story_context']    = sub.feeding_review.player_feedback;
      $unset['feeding_review.player_feedback'] = '';
    }

    // Array sub-fields
    for (const field of ARRAY_FIELDS) {
      (sub[field] || []).forEach((item, i) => {
        if (item && item.player_feedback !== undefined) {
          $set[`${field}.${i}.story_context`]    = item.player_feedback;
          $unset[`${field}.${i}.player_feedback`] = '';
        }
      });
    }

    // sorcery_review (object keyed by index strings)
    for (const [k, v] of Object.entries(sub.sorcery_review || {})) {
      if (v && v.player_feedback !== undefined) {
        $set[`sorcery_review.${k}.story_context`]    = v.player_feedback;
        $unset[`sorcery_review.${k}.player_feedback`] = '';
      }
    }

    const hasChanges = Object.keys($set).length > 0 || Object.keys($unset).length > 0;
    if (!hasChanges) continue;

    const op = {};
    if (Object.keys($set).length)   op.$set   = $set;
    if (Object.keys($unset).length) op.$unset = $unset;

    await coll.updateOne({ _id: sub._id }, op);
    updated++;
  }

  console.log(`Migration complete. Updated ${updated} of ${subs.length} documents.`);
  await client.close();
}

run().catch(err => { console.error(err); process.exit(1); });
