#!/usr/bin/env node

/**
 * Fix attendance entries to point at the correct character _id.
 *
 * Many attendance entries in game_sessions hold stale character_id values
 * (from prior migrations) but the character_name field is stable. This
 * script matches each attendance entry by character_name to the live
 * characters collection and rewrites character_id to the current _id.
 *
 * Database: tm_suite
 *
 * Usage:
 *   node scripts/fix-attendance-character-ids.js --dry-run   # show what would change
 *   node scripts/fix-attendance-character-ids.js --apply     # actually write
 */

import 'dotenv/config';
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI not set.');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const DRY_RUN = process.argv.includes('--dry-run') || !APPLY;

function nameKey(s) {
  return (s || '').trim().toLowerCase();
}

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (will write)' : 'DRY RUN (read only)'}`);
  const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  try {
    await client.connect();
    const db = client.db('tm_suite');

    // Build name → _id map from characters collection
    const characters = await db.collection('characters')
      .find({}, { projection: { _id: 1, name: 1 } }).toArray();
    console.log(`Loaded ${characters.length} characters`);

    const nameToId = new Map();
    for (const c of characters) {
      if (c.name) nameToId.set(nameKey(c.name), String(c._id));
    }

    // Walk every game session
    const sessions = await db.collection('game_sessions').find({}).toArray();
    console.log(`Loaded ${sessions.length} game sessions\n`);

    let totalEntries = 0;
    let matched = 0;
    let alreadyCorrect = 0;
    let updated = 0;
    let noMatch = 0;
    const noMatchSamples = [];

    for (const session of sessions) {
      if (!Array.isArray(session.attendance)) continue;
      const updates = [];

      for (let i = 0; i < session.attendance.length; i++) {
        const entry = session.attendance[i];
        totalEntries++;

        const name = entry.character_name || entry.name || '';
        if (!name) { noMatch++; continue; }

        const correctId = nameToId.get(nameKey(name));
        if (!correctId) {
          noMatch++;
          if (noMatchSamples.length < 10) noMatchSamples.push({ session: session.title || session.session_date, name });
          continue;
        }

        matched++;
        const currentId = entry.character_id != null ? String(entry.character_id) : null;
        if (currentId === correctId) {
          alreadyCorrect++;
          continue;
        }

        updated++;
        updates.push({ idx: i, name, oldId: currentId, newId: correctId });
      }

      if (updates.length) {
        const label = session.title || session.session_date || String(session._id);
        console.log(`Session: ${label}`);
        for (const u of updates) {
          console.log(`  [${u.idx}] ${u.name}: ${u.oldId || '(none)'} -> ${u.newId}`);
        }

        if (APPLY) {
          const newAttendance = session.attendance.map((entry, i) => {
            const u = updates.find(x => x.idx === i);
            if (!u) return entry;
            return { ...entry, character_id: u.newId };
          });
          await db.collection('game_sessions').updateOne(
            { _id: session._id },
            { $set: { attendance: newAttendance, updated_at: new Date().toISOString() } }
          );
        }
      }
    }

    console.log('\n── Summary ──');
    console.log(`Total attendance entries: ${totalEntries}`);
    console.log(`Matched by name:          ${matched}`);
    console.log(`  Already correct:        ${alreadyCorrect}`);
    console.log(`  ${APPLY ? 'Updated' : 'Would update'}:           ${updated}`);
    console.log(`Unmatched (no character): ${noMatch}`);

    if (noMatchSamples.length) {
      console.log('\nUnmatched samples (first 10):');
      for (const s of noMatchSamples) {
        console.log(`  ${s.session}: "${s.name}"`);
      }
    }

    if (DRY_RUN && updated > 0) {
      console.log('\nDRY RUN — no changes written. Re-run with --apply to commit.');
    }

  } finally {
    await client.close();
  }
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
