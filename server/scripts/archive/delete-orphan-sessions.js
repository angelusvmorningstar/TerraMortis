/**
 * Deletes game sessions that have no title and no attendance records.
 * Run once to clean up the 2026-04-18 orphan session.
 * Usage: cd server && node scripts/delete-orphan-sessions.js
 */

import 'dotenv/config';
import { connectDb, getDb, closeDb } from '../db.js';

await connectDb();
const db = getDb();
const col = db.collection('game_sessions');

const orphans = await col.find({
  $and: [
    { $or: [{ title: { $exists: false } }, { title: '' }] },
    { $or: [{ attendance: { $size: 0 } }, { attendance: { $exists: false } }] }
  ]
}).toArray();

if (!orphans.length) {
  console.log('No orphan sessions found.');
} else {
  for (const s of orphans) {
    console.log(`Deleting: ${s.session_date} (${s._id})`);
  }
  const ids = orphans.map(s => s._id);
  const result = await col.deleteMany({ _id: { $in: ids } });
  console.log(`Deleted ${result.deletedCount} session(s).`);
}

await closeDb();
