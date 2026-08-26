#!/usr/bin/env node
/* migrate-allies-to-sway.js
 * Renames the 'Allies' merit to 'Sway' on every character document.
 *
 * Scope, confirmed live before this script was written (2026-08-26):
 *   - purchasable_powers already has the catalogue entry as {key:'allies', name:'Sway'} —
 *     only the display name changed there; this script brings characters.merits[] into line.
 *   - Zero characters currently hold a merit named 'Status' — Symon's own fold of Status into
 *     Allies is already complete on live data, so this is a straight rename, not a merge. No
 *     collision-resolution logic is needed or included.
 *   - `rule_key` on each merit instance is left untouched (stays 'allies'), matching the
 *     catalogue's own stable-key/display-name-only-changes shape.
 *   - Only `merits[].name === 'Allies'` is touched. Every other field on the merit object
 *     (rating, area, cp, xp, free, free_vm, free_lk, free_ohm, free_inv, free_pt, free_mdb,
 *     free_sw, free_mci, free_grants, bonus, rule_key) is preserved byte-for-byte.
 *   - Does NOT touch: the unrelated `status.covenant`/`status.city` numeric standing fields
 *     (a different, homonymous "Status" — see server/scripts/archive/migrate-status-unification.js,
 *     which is that field's own already-run, unrelated migration), the MCI merit (becoming its
 *     own "Organisation" category per Angelus's ruling, out of this script's scope), or the
 *     `rule_grant` document / rule_engine evaluator JS files that also hardcode 'Allies' — those
 *     are a separate, coordinated code+data change that must land in the same deploy window as
 *     this script's --write run, not before or after it.
 *
 * Idempotent — safe to run multiple times. A character already renamed to 'Sway' is skipped.
 *
 * Usage:
 *   cd server
 *   MONGODB_URI="mongodb+srv://..." node scripts/migrate-allies-to-sway.js            # dry run (default)
 *   MONGODB_URI="mongodb+srv://..." node scripts/migrate-allies-to-sway.js --write    # apply
 */

import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { writeFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '.env') });

const WRITE = process.argv.includes('--write');

async function migrate() {
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error('MONGODB_URI not set'); process.exit(1); }

  const dbName = process.env.DB_NAME || 'tm_game';
  console.log(`Connecting to ${dbName}... (${WRITE ? 'WRITE MODE' : 'DRY RUN — no writes'})`);

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const col = db.collection('characters');

  const chars = await col.find({ 'merits.name': { $in: ['Allies', 'Status'] } }).toArray();
  console.log(`Found ${chars.length} characters with an Allies or (unexpectedly) Status merit`);

  const snapshot = [];
  let charsUpdated = 0, meritsRenamed = 0, statusFound = 0;

  for (const c of chars) {
    const merits = c.merits || [];
    let changed = false;
    const before = JSON.parse(JSON.stringify(merits));

    for (const m of merits) {
      if (m.name === 'Status') {
        // Should not happen — live check on 2026-08-26 found zero. Surface loudly rather than
        // silently renaming, since a Status merit here means this script's no-collision
        // assumption is stale and it must not proceed on this character un-reviewed.
        statusFound++;
        console.warn(`  ⚠ ${c.moniker || c.name}: STILL HOLDS a 'Status' merit (${m.area || m.qualifier || '?'}) — skipped, needs manual review`);
        changed = false;
        break;
      }
      if (m.name === 'Allies') {
        m.name = 'Sway';
        meritsRenamed++;
        changed = true;
      }
    }

    if (!changed) continue;

    snapshot.push({ _id: c._id, name: c.name, before, after: JSON.parse(JSON.stringify(merits)) });
    charsUpdated++;
    console.log(`  ${(c.moniker || c.name || '').padEnd(25)} — ${merits.filter(m => m.name === 'Sway').length} Sway merit(s)`);

    if (WRITE) {
      await col.updateOne({ _id: c._id }, { $set: { merits } });
    }
  }

  const snapPath = resolve(__dirname, '..', '..', 'ops', 'db-backups', `allies-to-sway-${WRITE ? 'applied' : 'dryrun'}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  try {
    writeFileSync(snapPath, JSON.stringify(snapshot, null, 2));
    console.log(`\nPer-character before/after snapshot written to ${snapPath}`);
  } catch (err) {
    console.warn(`\nCould not write snapshot file (${err.message}) — printing summary only.`);
  }

  console.log(`\nDone. ${WRITE ? '(applied)' : '(dry run — nothing written; re-run with --write to apply)'}`);
  console.log(`  Characters updated: ${charsUpdated}`);
  console.log(`  Merit instances renamed Allies → Sway: ${meritsRenamed}`);
  console.log(`  Characters unexpectedly still holding 'Status' (skipped, needs review): ${statusFound}`);

  await client.close();
}

migrate().catch(err => { console.error(err); process.exit(1); });
