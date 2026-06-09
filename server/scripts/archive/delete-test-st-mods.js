/**
 * delete-test-st-mods.js — destructive (DRY-RUN by default).
 *
 * Issue #565 (reduced scope). The st_mods / st_mod_audit collections are
 * polluted with test fixtures created by `discord_id: "test-st-001"`
 * ("test_st"). These were the entire source of the audit's `created_by.discord_id`
 * "misnaming" — the real entries correctly hold a Discord snowflake. The test
 * st_mods target a single non-existent character and none are applied to live
 * data; safe to remove.
 *
 * EXCLUDED: the display-name attribution fields (pool_*_by, territory_reports
 * author, tickets.submitted_by). Those are intentional free-text "who did it"
 * labels for different real people — not fragmentation (closed as false positive).
 *
 * Guard: targets ONLY created_by.discord_id === "test-st-001"; for st_mods it
 * also verifies none target a current character (abort if any does, so a real
 * mod can never be deleted). Backs up both collections' matched docs on --apply.
 *
 * Run:
 *   node server/scripts/delete-test-st-mods.js          # dry-run
 *   node server/scripts/delete-test-st-mods.js --apply  # execute
 */

import { MongoClient } from 'mongodb';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
try { await import('dotenv/config'); } catch { /* env already set */ }

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!MONGO_URI) { console.error('MONGO_URI / MONGODB_URI not set'); process.exit(1); }
const DB_NAME = 'tm_suite';
const APPLY = process.argv.includes('--apply');
const TEST_ID = 'test-st-001';
const FILTER = { 'created_by.discord_id': TEST_ID };

async function main() {
  const client = new MongoClient(MONGO_URI); await client.connect();
  const db = client.db(DB_NAME);

  const charIds = new Set((await db.collection('characters').find({}, { projection: { _id: 1 } }).toArray()).map(c => String(c._id)));
  const mods = await db.collection('st_mods').find(FILTER).toArray();
  const audit = await db.collection('st_mod_audit').find(FILTER).toArray();

  console.log(`Test rows (created_by.discord_id === "${TEST_ID}"):`);
  console.log(`  st_mods      : ${mods.length}`);
  console.log(`  st_mod_audit : ${audit.length}`);

  // Guard: no test st_mod may target a CURRENT character.
  const hitsReal = mods.filter(m => charIds.has(String(m.character_id)));
  console.log(`  st_mods targeting a current character: ${hitsReal.length} (must be 0)`);
  if (hitsReal.length) {
    console.error('\nABORT: a test-tagged st_mod targets a live character. Inspect before deleting.');
    hitsReal.slice(0, 5).forEach(m => console.error(`   ${String(m._id).slice(-6)} -> char ${String(m.character_id).slice(-8)} ${m.stat_path}`));
    await client.close();
    process.exit(2);
  }

  if (!mods.length && !audit.length) { console.log('\nNothing to delete.'); await client.close(); return; }
  if (!APPLY) { console.log(`\nDRY-RUN. --apply backs up + deletes ${mods.length} st_mods and ${audit.length} st_mod_audit rows.`); await client.close(); return; }

  const stamp = new Date().toISOString().slice(0, 10);
  const backup = `st-working/audit/deleted-test-st-mods-${stamp}.json`;
  mkdirSync(dirname(backup), { recursive: true });
  writeFileSync(backup, JSON.stringify({ st_mods: mods, st_mod_audit: audit }, null, 2));

  const r1 = await db.collection('st_mods').deleteMany(FILTER);
  const r2 = await db.collection('st_mod_audit').deleteMany(FILTER);
  console.log(`\nDeleted ${r1.deletedCount} st_mods + ${r2.deletedCount} st_mod_audit. Backup: ${backup}`);
  const remMods = await db.collection('st_mods').countDocuments({});
  console.log(`st_mods now holds ${remMods} docs (the real, snowflake-attributed mods).`);
  await client.close();
}
main().catch(e => { console.error(e); process.exit(1); });
