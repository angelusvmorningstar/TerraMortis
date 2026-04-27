#!/usr/bin/env node

/**
 * Backfill attendance[].player with real display names.
 *
 * Many attendance entries hold placeholder strings like "Player A", "Player B"
 * (seeded by an early redacted import) instead of the real player display name.
 * This script walks every game_sessions[*].attendance[] entry, resolves
 * character_id → players.character_ids → players.display_name, and rewrites
 * attendance[i].player when the current value is missing, empty, or matches
 * the placeholder pattern.
 *
 * Idempotent: real-looking names are left alone. Re-running produces zero
 * further updates.
 *
 * Database: tm_suite (override with MONGODB_URI / MONGODB_DB)
 *
 * Usage:
 *   node server/scripts/backfill-attendance-player.js --dry-run   # show what would change
 *   node server/scripts/backfill-attendance-player.js --apply     # actually write
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

const PLACEHOLDER_RE = /^Player [A-Z]{1,2}$/;

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (will write)' : 'DRY RUN (read only)'}`);
  const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DB || 'tm_suite');

    const players = await db.collection('players')
      .find({}, { projection: { display_name: 1, username: 1, character_ids: 1 } })
      .toArray();
    console.log(`Loaded ${players.length} players`);

    const byCharId = new Map();
    for (const p of players) {
      const name = p.display_name || p.username || '';
      if (!name) continue;
      for (const cid of (p.character_ids || [])) {
        if (cid) byCharId.set(String(cid), name);
      }
    }
    console.log(`Built character_id lookup with ${byCharId.size} entries\n`);

    const sessions = await db.collection('game_sessions').find({}).toArray();
    console.log(`Loaded ${sessions.length} game sessions\n`);

    let totalRows = 0;
    let totalUpdated = 0;
    let totalSkippedReal = 0;
    let totalSkippedNoMatch = 0;
    const noMatchSamples = [];

    for (const session of sessions) {
      if (!Array.isArray(session.attendance)) continue;

      let updated = 0;
      let skippedReal = 0;
      let skippedNoMatch = 0;

      const next = session.attendance.map(a => {
        totalRows++;
        const cur = (a.player || '').trim();
        if (cur && !PLACEHOLDER_RE.test(cur)) {
          skippedReal++;
          return a;
        }
        const resolved = byCharId.get(String(a.character_id));
        if (!resolved) {
          skippedNoMatch++;
          if (noMatchSamples.length < 10) {
            noMatchSamples.push({
              session: session.title || session.session_date || String(session._id),
              character_id: a.character_id,
              current: cur || '(empty)',
            });
          }
          return a;
        }
        updated++;
        return { ...a, player: resolved };
      });

      totalUpdated += updated;
      totalSkippedReal += skippedReal;
      totalSkippedNoMatch += skippedNoMatch;

      const label = session.title || session.session_date || String(session._id);
      console.log(`${label}: updated=${updated} skipped-real=${skippedReal} skipped-no-match=${skippedNoMatch}`);

      if (updated > 0 && APPLY) {
        await db.collection('game_sessions').updateOne(
          { _id: session._id },
          { $set: { attendance: next, updated_at: new Date().toISOString() } }
        );
      }
    }

    console.log('\n── Summary ──');
    console.log(`Total attendance rows:       ${totalRows}`);
    console.log(`${APPLY ? 'Updated' : 'Would update'}:                ${totalUpdated}`);
    console.log(`Skipped (already real):      ${totalSkippedReal}`);
    console.log(`Skipped (no player match):   ${totalSkippedNoMatch}`);

    if (noMatchSamples.length) {
      console.log('\nUnmatched samples (first 10):');
      for (const s of noMatchSamples) {
        console.log(`  ${s.session}: character_id=${s.character_id} player="${s.current}"`);
      }
    }

    if (DRY_RUN && totalUpdated > 0) {
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
