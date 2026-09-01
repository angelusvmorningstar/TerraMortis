/**
 * P1 cleanup from the 2026-09-01 general audit (data-integrity dimension,
 * adversarially verified): the live st_mods collection is 86% (75 of 87
 * docs) orphaned load-test fixtures from a June 2026 automated test run,
 * not real ST play.
 *
 * Fingerprint: character_id is one of two bogus ids that resolve to no real
 * `characters` document ("6a2a278ee48cab4f8a309c40" — 44 docs,
 * "6a30b3bb0f020e9282bd23fb" — 31 docs), all stat_path
 * "attributes.Wits.dots", delta 1, reason "P0".."P43",
 * created_by.discord_name "test_st"/"test-st-001", dated 2026-06-11 /
 * 2026-06-16. Matching rows exist in st_mod_audit under the same fingerprint.
 *
 * These are functionally inert today (GET /api/st_mods requires the caller
 * own the character_id, and nobody owns these two fake ids), but they
 * permanently pollute the production st_mod_audit ledger — an ST paging
 * through GET /api/st_mod_audit unfiltered sees 75 fake rows mixed into
 * ~12 real ones — and any future feature that scans st_mods/st_mod_audit
 * without a character filter will trip over them.
 *
 * This DELETES both the st_mods docs and their matching st_mod_audit rows
 * (rather than deactivating) since they are not real ST actions with any
 * legitimate audit-trail value — they are test-run debris. The full-fidelity
 * backup below is the safety net if that judgement turns out to be wrong.
 *
 * Re-verifies the fingerprint against LIVE data at run time rather than a
 * hardcoded id list, so if real ST activity has since touched either bogus
 * id (unlikely, but the script should not silently delete something that
 * changed shape since the audit ran) it will refuse and tell you why.
 *
 * ── SAFETY ───────────────────────────────────────────────────────────────
 * DRY-RUN BY DEFAULT. `--apply` writes a full-document JSON backup of every
 * matched st_mods AND st_mod_audit document to server/scripts/_backups/
 * BEFORE issuing any delete, and aborts if the backup write throws.
 *
 * Usage:
 *   cd server && node scripts/cleanup-p1-orphaned-test-stmods.js
 *   cd server && node scripts/cleanup-p1-orphaned-test-stmods.js --apply
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

const BOGUS_CHARACTER_IDS = ['6a2a278ee48cab4f8a309c40', '6a30b3bb0f020e9282bd23fb'];
const EXPECTED_CREATED_BY = new Set(['test_st', 'test-st-001']);

async function main() {
  await connectDb();
  const chars = getCollection('characters');
  const mods = getCollection('st_mods');
  const audit = getCollection('st_mod_audit');

  console.log('Mode: ' + (APPLY ? 'APPLY (backup then delete)' : 'DRY-RUN') + '\n');

  // Re-verify neither bogus id resolves to a real character before touching anything.
  for (const cid of BOGUS_CHARACTER_IDS) {
    const oid = ObjectId.isValid(cid) ? new ObjectId(cid) : null;
    const hit = oid ? await chars.findOne({ _id: oid }) : null;
    if (hit) {
      console.error(`ABORT: character_id ${cid} now resolves to a real character ("${hit.name}") — `
        + 'this no longer matches the audit finding. Re-investigate before touching this data.');
      process.exitCode = 1;
      return;
    }
  }

  const modDocs = await mods.find({ character_id: { $in: BOGUS_CHARACTER_IDS } }).toArray();
  const auditDocs = await audit.find({ character_id: { $in: BOGUS_CHARACTER_IDS } }).toArray();

  const badFingerprint = modDocs.filter(d =>
    d.stat_path !== 'attributes.Wits.dots' || !EXPECTED_CREATED_BY.has(d.created_by?.discord_name));
  if (badFingerprint.length) {
    console.error(`ABORT: ${badFingerprint.length} matched st_mods doc(s) do not match the expected `
      + 'test-fixture fingerprint (stat_path/created_by). Re-investigate before touching this data.');
    console.error(JSON.stringify(badFingerprint.slice(0, 3), null, 2));
    process.exitCode = 1;
    return;
  }

  console.log(`st_mods matching the orphaned-test-fixture fingerprint: ${modDocs.length}`);
  console.log(`st_mod_audit rows matching the same character_ids: ${auditDocs.length}`);
  for (const cid of BOGUS_CHARACTER_IDS) {
    const n = modDocs.filter(d => d.character_id === cid).length;
    console.log(`  ${cid}: ${n} st_mods doc(s)`);
  }

  if (!APPLY) {
    console.log('\nDRY RUN - nothing deleted. Re-run with --apply to delete.');
    return;
  }
  if (modDocs.length === 0 && auditDocs.length === 0) {
    console.log('Nothing to apply.');
    return;
  }

  mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = join(BACKUP_DIR, 'cleanup-p1-orphaned-test-stmods-' + stamp + '.json');
  writeFileSync(backupPath, JSON.stringify({ st_mods: modDocs, st_mod_audit: auditDocs }, null, 2));
  console.log('\nBackup written: ' + backupPath);

  const modResult = await mods.deleteMany({ character_id: { $in: BOGUS_CHARACTER_IDS } });
  const auditResult = await audit.deleteMany({ character_id: { $in: BOGUS_CHARACTER_IDS } });
  console.log(`Deleted ${modResult.deletedCount} st_mods document(s), ${auditResult.deletedCount} st_mod_audit document(s).`);
}

main()
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => closeDb());
