/**
 * Migration: rename early_access_player_ids → out_of_window_player_ids
 * on all documents in downtime_cycles.
 *
 * Run once against the live DB after deploying the code changes.
 *   node server/scripts/rename-early-access-to-out-of-window.js
 */

import 'dotenv/config';
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
if (!uri) { console.error('MONGODB_URI not set'); process.exit(1); }

const client = new MongoClient(uri);
await client.connect();

const db = client.db('tm_suite');
const col = db.collection('downtime_cycles');

const result = await col.updateMany(
  { early_access_player_ids: { $exists: true } },
  { $rename: { early_access_player_ids: 'out_of_window_player_ids' } }
);

console.log(`Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}`);
await client.close();
