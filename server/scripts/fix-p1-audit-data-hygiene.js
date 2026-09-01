/**
 * P1 data-hygiene fixes from the 2026-09-01 general audit (four-domain
 * workflow audit, data-integrity dimension, all four findings independently
 * adversarially verified against live tm_game data).
 *
 * Four small, unrelated, low-risk fixes bundled into one script since each
 * is a single targeted field write:
 *
 *   1. Orenthal Lamar McGillicuddy (69cce5a2aa132fdfb0dc4ace's sole character,
 *      _id 6a83e31e0d903bf99b21007d) — player field is "" though the linked
 *      player doc's display_name is "Arnold W". Sets player: "Arnold W".
 *   2. Sister DJ (_id 6a8f857112e9143190e6ffa0) — same shape, linked player
 *      doc (_id 6a8905ad4878bc6175eda31f) display_name is "Kelly-Lee".
 *      Sets player: "Kelly-Lee".
 *   3. Yusuf Kalusicj (_id 69d720427fdd1b1f9498b0d4) — skills.Brawl is a bare
 *      {} (no dots/bonus/specs/nine_again), violating schema_v2_proposal.md's
 *      own convention ("Only skills with dots > 0, bonus > 0, specs, or
 *      nine_again are stored. Absent keys = 0 dots"). $unset skills.Brawl.
 *   4. st_mods _id 6a83f1590d903bf99b210081 (Ivana Horvat, stat_path
 *      "merits.11.dots") — a pre-#1119 mod using a shape the server now
 *      explicitly rejects for new mods (MERIT_DOTS_REJECTED_RE — no merit
 *      reader ever consults a dots field), and Ivana's merits array has
 *      since reordered so index 11 is now a different, unrelated merit
 *      ("Opening The Void") than the one the mod's own reason text names
 *      ("Mother-Daughter Bond", now at index 1). Sets active: false rather
 *      than deleting, preserving the audit trail per this app's own
 *      tombstone-before-destroy convention — an ST can reactivate or
 *      recreate it correctly against the right merit index if still wanted.
 *
 * ── SAFETY ───────────────────────────────────────────────────────────────
 * DRY-RUN BY DEFAULT. `--apply` writes a full-document JSON backup of every
 * touched document to server/scripts/_backups/ BEFORE issuing any update,
 * and aborts if the backup write throws.
 *
 * Usage:
 *   cd server && node scripts/fix-p1-audit-data-hygiene.js
 *   cd server && node scripts/fix-p1-audit-data-hygiene.js --apply
 */

import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ObjectId } from 'mongodb';
import { connectDb, getCollection, closeDb } from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = join(__dirname, '_backups');
const APPLY = process.argv.includes('--apply');

async function main() {
  await connectDb();
  const chars = getCollection('characters');
  const mods = getCollection('st_mods');

  console.log('Mode: ' + (APPLY ? 'APPLY (backup then write)' : 'DRY-RUN') + '\n');

  const plan = [];

  // 1 & 2 — blank player fields on live, non-retired, uniquely-linked characters.
  const playerFixes = [
    { id: '6a83e31e0d903bf99b21007d', name: 'Orenthal Lamar McGillicuddy', newPlayer: 'Arnold W' },
    { id: '6a8f857112e9143190e6ffa0', name: 'Sister DJ', newPlayer: 'Kelly-Lee' },
  ];
  for (const f of playerFixes) {
    const doc = await chars.findOne({ _id: new ObjectId(f.id) });
    if (!doc) { console.log(`  SKIP ${f.name} (${f.id}) — not found`); continue; }
    if (doc.player === f.newPlayer) { console.log(`  SKIP ${f.name} — player already "${f.newPlayer}"`); continue; }
    console.log(`  ${f.name} (${f.id}): player "${doc.player}" -> "${f.newPlayer}"`);
    plan.push({ col: chars, doc, collectionName: 'characters', filter: { _id: doc._id }, update: { $set: { player: f.newPlayer } } });
  }

  // 3 — Yusuf Kalusicj's bare-{} Brawl skill entry.
  {
    const id = '69d720427fdd1b1f9498b0d4';
    const doc = await chars.findOne({ _id: new ObjectId(id) });
    if (!doc) {
      console.log(`  SKIP Yusuf Kalusicj (${id}) — not found`);
    } else if (!doc.skills || !doc.skills.Brawl || Object.keys(doc.skills.Brawl).length > 0) {
      console.log(`  SKIP Yusuf Kalusicj — skills.Brawl is not a bare {} any more (already fixed or changed)`);
    } else {
      console.log(`  Yusuf Kalusicj (${id}): $unset skills.Brawl (currently {})`);
      plan.push({ col: chars, doc, collectionName: 'characters', filter: { _id: doc._id }, update: { $unset: { 'skills.Brawl': '' } } });
    }
  }

  // 4 — Ivana Horvat's dead merits.11.dots st_mod.
  {
    const id = '6a83f1590d903bf99b210081';
    const doc = await mods.findOne({ _id: new ObjectId(id) });
    if (!doc) {
      console.log(`  SKIP st_mod ${id} — not found`);
    } else if (doc.stat_path !== 'merits.11.dots' || doc.active === false) {
      console.log(`  SKIP st_mod ${id} — no longer matches the finding (stat_path or active state changed)`);
    } else {
      console.log(`  st_mod ${id} (Ivana Horvat, stat_path "merits.11.dots", reason "${doc.reason}"): active true -> false`);
      plan.push({ col: mods, doc, collectionName: 'st_mods', filter: { _id: doc._id }, update: { $set: { active: false } } });
    }
  }

  console.log(`\n${plan.length} document(s) to update.`);

  if (!APPLY) {
    console.log('\nDRY RUN - nothing written. Re-run with --apply to write.');
    return;
  }
  if (plan.length === 0) {
    console.log('Nothing to apply.');
    return;
  }

  mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = join(BACKUP_DIR, 'fix-p1-audit-data-hygiene-' + stamp + '.json');
  writeFileSync(backupPath, JSON.stringify(plan.map(p => ({ collection: p.collectionName, doc: p.doc })), null, 2));
  console.log('\nBackup written: ' + backupPath);

  let n = 0;
  for (const { col, filter, update } of plan) {
    await col.updateOne(filter, update);
    n++;
  }
  console.log('Updated ' + n + ' documents.');
}

main()
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => closeDb());
