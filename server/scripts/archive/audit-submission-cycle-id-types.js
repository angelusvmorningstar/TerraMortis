#!/usr/bin/env node
/**
 * Read-only audit: report the BSON-type breakdown of the top-level foreign-key
 * fields on downtime_submissions (issue #497, story 497).
 *
 * Some submissions store `cycle_id` (and historically `character_id`) as a
 * plain string, others as an ObjectId. MongoDB BSON comparison is type-strict,
 * so a query keyed on a cycle's ObjectId `_id` silently drops string-typed
 * submissions. This script quantifies that split so the one-time migration
 * (migrate-submission-cycle-id-to-oid.js) can be run with confidence.
 *
 * READ-ONLY: this script never writes to the database.
 *
 * Usage:
 *   cd server && node scripts/audit-submission-cycle-id-types.js
 *
 * Env:
 *   MONGODB_URI  (required) — Atlas connection string
 *   MONGODB_DB   (optional) — database name; defaults to 'tm_suite'
 *
 * Exit codes:
 *   0  audit printed
 *   1  config error (MONGODB_URI missing)
 */
import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { fileURLToPath } from 'node:url';

const FK_FIELDS = ['cycle_id', 'character_id'];

/**
 * Aggregate the count of submissions per (field BSON type) for one field.
 * @param {import('mongodb').Db} db
 * @param {string} field
 * @returns {Promise<{ _id: string, count: number }[]>}  type → count, sorted
 */
export async function typeBreakdown(db, field) {
  return db.collection('downtime_submissions').aggregate([
    { $group: { _id: { $type: `$${field}` }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]).toArray();
}

/**
 * Per-cycle breakdown of cycle_id type. Groups by the stringified cycle_id so
 * an objectId cycle and its string twin (if any) line up under the same value.
 * @param {import('mongodb').Db} db
 * @returns {Promise<{ value: string, type: string, count: number }[]>}
 */
export async function cycleIdByValue(db) {
  const rows = await db.collection('downtime_submissions').aggregate([
    {
      $group: {
        _id: { value: { $toString: '$cycle_id' }, type: { $type: '$cycle_id' } },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.value': 1, '_id.type': 1 } },
  ]).toArray();
  return rows.map(r => ({ value: r._id.value, type: r._id.type, count: r.count }));
}

// ── CLI entry point ─────────────────────────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const URI = process.env.MONGODB_URI;
  if (!URI) {
    console.error('MONGODB_URI missing — populate server/.env before running.');
    process.exit(1);
  }
  const DB_NAME = process.env.MONGODB_DB || 'tm_suite';
  const client = new MongoClient(URI);

  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const total = await db.collection('downtime_submissions').countDocuments();

    console.log(`Database: ${DB_NAME}`);
    console.log(`downtime_submissions total: ${total}\n`);

    for (const field of FK_FIELDS) {
      const rows = await typeBreakdown(db, field);
      console.log(`--- ${field} type breakdown ---`);
      for (const { _id, count } of rows) {
        console.log(`  ${String(_id).padEnd(10)} ${count}`);
      }
      console.log('');
    }

    console.log('--- cycle_id by value (type-tagged) ---');
    for (const { value, type, count } of await cycleIdByValue(db)) {
      console.log(`  ${value}  [${type}]  ${count}`);
    }
  } finally {
    await client.close();
  }
}
