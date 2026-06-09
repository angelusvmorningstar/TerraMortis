/**
 * migrate-submission-character-id-to-oid.js — migration (DRY-RUN by default).
 *
 * Issue #558. downtime_submissions.character_id is stored as both string and
 * ObjectId (type fragmentation — type-strict queries silently drop the string
 * ones). The write paths already coerce on create/update (POST routes
 * downtime.js:625-627, PUT :797-798, added with #497), so this one-time
 * migration coerces the remaining historical string values; after it, the field
 * is uniformly ObjectId and cannot regrow.
 *
 * Safety:
 *   - DRY-RUN by default. --apply backs up affected docs first.
 *   - GUARD: every string character_id must be a 24-hex string AND resolve to an
 *     existing character. Aborts (exit 2) if any value is non-hex or orphaned —
 *     an orphan should be triaged (relink/delete), not blindly coerced.
 *   - Idempotent: ObjectId-typed values are left untouched.
 *
 * Run:
 *   node server/scripts/migrate-submission-character-id-to-oid.js          # dry-run
 *   node server/scripts/migrate-submission-character-id-to-oid.js --apply  # execute
 */

import { MongoClient, ObjectId } from 'mongodb';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
try { await import('dotenv/config'); } catch { /* env already set */ }

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!MONGO_URI) { console.error('MONGO_URI / MONGODB_URI not set'); process.exit(1); }
const DB_NAME = 'tm_suite';
const APPLY = process.argv.includes('--apply');
const HEX24 = /^[a-f0-9]{24}$/i;

async function main() {
  const client = new MongoClient(MONGO_URI); await client.connect();
  const db = client.db(DB_NAME);

  const charIds = new Set((await db.collection('characters').find({}, { projection: { _id: 1 } }).toArray()).map(c => String(c._id)));
  const subs = await db.collection('downtime_submissions').find({}).project({ character_id: 1 }).toArray();

  const stringTyped = subs.filter(d => typeof d.character_id === 'string');
  const nonHex = stringTyped.filter(d => !HEX24.test(d.character_id));
  const orphaned = stringTyped.filter(d => HEX24.test(d.character_id) && !charIds.has(d.character_id));
  const coercible = stringTyped.filter(d => HEX24.test(d.character_id) && charIds.has(d.character_id));

  console.log('downtime_submissions.character_id migration (string -> ObjectId)');
  console.log(`  string-typed total : ${stringTyped.length}`);
  console.log(`  coercible (hex + resolves) : ${coercible.length}`);
  console.log(`  non-hex   : ${nonHex.length}`, nonHex.length ? nonHex.map(d => String(d._id).slice(-6) + '=' + JSON.stringify(d.character_id)).join(' ') : '');
  console.log(`  orphaned (hex but no character) : ${orphaned.length}`, orphaned.length ? orphaned.map(d => String(d._id).slice(-6) + '->' + String(d.character_id).slice(-6)).join(' ') : '');

  if (nonHex.length || orphaned.length) {
    console.error('\nABORT: non-hex or orphaned string character_id present. Triage these (relink/delete) before coercing.');
    await client.close();
    process.exit(2);
  }
  if (!coercible.length) { console.log('\nNothing to migrate — character_id already uniformly ObjectId.'); await client.close(); return; }

  if (!APPLY) { console.log(`\nDRY-RUN. --apply backs up + coerces ${coercible.length} string character_id values to ObjectId.`); await client.close(); return; }

  const stamp = new Date().toISOString().slice(0, 10);
  const backup = `st-working/audit/migrate-character-id-${stamp}.json`;
  mkdirSync(dirname(backup), { recursive: true });
  writeFileSync(backup, JSON.stringify(coercible.map(d => ({ sub: String(d._id), character_id: d.character_id })), null, 2));

  let n = 0;
  for (const d of coercible) {
    await db.collection('downtime_submissions').updateOne({ _id: d._id }, { $set: { character_id: new ObjectId(d.character_id) } });
    n++;
  }
  // post-check
  const after = await db.collection('downtime_submissions').find({}).project({ character_id: 1 }).toArray();
  const stillStr = after.filter(d => typeof d.character_id === 'string').length;
  console.log(`\nCoerced ${n}. Backup: ${backup}`);
  console.log(`Post-check: ${stillStr} string-typed character_id remaining (expected 0).`);
  await client.close();
}
main().catch(e => { console.error(e); process.exit(1); });
