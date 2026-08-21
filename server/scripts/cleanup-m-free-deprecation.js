/**
 * Issue #834 — Phase 3: cleanup of `m.free` contamination on character merits.
 *
 * The `m.free` channel was deprecated in #834 (writer deleted from
 * normalize-character.js; readers removed from domain.js / admin
 * surfaces). This script zeros any residual `m.free > 0` on existing
 * character merits.
 *
 * Two patterns covered:
 *
 *   Pattern D — `m.free > 0` AND another channel ALSO populated (legacy
 *     contamination from the pre-#834 backfill bug). Six instances in
 *     prod 2026-06-17: Eve / René / René / Wan / Xavier / Yusuf, all
 *     Feeding Grounds + Contacts shapes. Action: zero `m.free`; the
 *     real source channel is preserved.
 *
 *   Pattern C — `m.free > 0` and NO other channel populated. One instance
 *     in prod: Wan Yelong's Professional Training (m.free=3, no slug).
 *     Per Peter's 2026-06-17 Option B, this is treated as orphan
 *     contamination — drop the 3 dots, Wan's PT rating goes 8→5. Action:
 *     zero `m.free`; the merit's rating will drop on the next normalize
 *     pass since no canonical channel carries the dots.
 *
 * Idempotent (re-running after a clean pass touches 0 docs). `--dry-run`
 * default. `--apply` to write.
 *
 * Write shape: `updateOne({_id}, {$set: {merits: doc.merits}})` per #826's
 * HOTFIX pattern (replaceOne would strip every unprojected field — that's
 * what destroyed 13 character docs 2026-06-16). `main()` is exported and
 * direct-invocation guarded so the integration test can call it without
 * connecting on import.
 *
 * Usage:
 *   cd server && node scripts/cleanup-m-free-deprecation.js
 *   cd server && node scripts/cleanup-m-free-deprecation.js --apply
 *
 * dotenv path note: must be run from `server/` so dotenv/config picks up
 * server/.env. See memory [[feedback_server_scripts_dotenv_path]].
 */

import 'dotenv/config';
import { MongoClient } from 'mongodb';

const DB_NAME = process.env.MONGODB_DB || 'tm_game';

/**
 * Classify and clean a single merit. Mutates in place. Returns a diagnostics
 * object describing what changed (or null if no change).
 */
export function cleanupMerit(merit) {
  if (!merit || typeof merit !== 'object') return null;
  const before = merit.free || 0;
  if (before <= 0) return null;

  // Determine pattern by looking at other channels (D = at least one other
  // channel populated, C = none).
  const otherChannelSum =
    (merit.cp || 0) + (merit.xp || 0)
    + (merit.free_mci || 0) + (merit.free_vm || 0) + (merit.free_lk || 0)
    + (merit.free_ohm || 0) + (merit.free_inv || 0) + (merit.free_pt || 0)
    + (merit.free_mdb || 0) + (merit.free_sw || 0) + (merit.free_bloodline || 0)
    + (merit.free_pet || 0) + (merit.free_attache || 0) + (merit.free_carthian || 0)
    + (merit.free_fwb || 0) + (merit.free_retainer || 0)
    + (merit.free_grants ? Object.values(merit.free_grants).reduce((s, n) => s + (n || 0), 0) : 0);
  const pattern = otherChannelSum > 0 ? 'D' : 'C';
  merit.free = 0;
  return {
    name: merit.name || '(unnamed)',
    category: merit.category || null,
    qualifier: merit.qualifier || merit.area || null,
    pattern,
    before,
    after: 0,
  };
}

export async function main() {
  // Issue #826 lesson: compute APPLY / DRY_RUN inside main so integration
  // tests can toggle via process.argv without re-importing the module.
  const APPLY = process.argv.includes('--apply');
  const DRY_RUN = !APPLY;
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.error('MONGODB_URI not set. Ensure server/.env is present and the script is run from server/.');
    process.exit(1);
  }
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  try {
    const db = client.db(DB_NAME);
    const characters = db.collection('characters');
    const cursor = characters.find({}, { projection: { _id: 1, name: 1, merits: 1 } });

    let charsTouched = 0;
    let meritsTouched = 0;
    let patternC = 0;
    let patternD = 0;

    console.log(`\n${DRY_RUN ? '[DRY RUN]' : '[APPLY]'} cleanup-m-free-deprecation.js`);
    console.log(`Database: ${DB_NAME}`);
    console.log('');

    for await (const doc of cursor) {
      if (!Array.isArray(doc.merits)) continue;
      const charChanges = [];
      let charDirty = false;
      for (const m of doc.merits) {
        const r = cleanupMerit(m);
        if (r) {
          charDirty = true;
          meritsTouched++;
          if (r.pattern === 'C') patternC++;
          else patternD++;
          charChanges.push(r);
        }
      }
      if (charDirty) {
        charsTouched++;
        const charLabel = `${doc.name || '(unnamed)'} [${doc._id}]`;
        console.log(`  ${charLabel}`);
        for (const ch of charChanges) {
          const meritLabel = ch.qualifier ? `${ch.name} (${ch.qualifier})` : ch.name;
          console.log(`    ${meritLabel.padEnd(40)} Pattern ${ch.pattern}  m.free  ${ch.before} → ${ch.after}`);
        }
        if (!DRY_RUN) {
          // Issue #826 lesson: $set on merits only — replaceOne would strip
          // every unprojected field.
          await characters.updateOne(
            { _id: doc._id },
            { $set: { merits: doc.merits } }
          );
        }
      }
    }

    console.log('');
    console.log(`Summary: ${charsTouched} character${charsTouched === 1 ? '' : 's'}, ${meritsTouched} merit${meritsTouched === 1 ? '' : 's'} affected.`);
    console.log(`  Pattern D (m.free + other channel): ${patternD}`);
    console.log(`  Pattern C (m.free alone — Peter Option B drops the rating): ${patternC}`);
    if (DRY_RUN) {
      console.log('\n[DRY RUN] Re-run with --apply to write.');
    } else {
      console.log('\n[APPLY] Idempotency check: re-run with no flag (dry-run) and confirm "0 characters, 0 merits affected".');
    }
  } finally {
    await client.close();
  }
}

const _invokedDirectly = import.meta.url === `file://${process.argv[1]}`;
if (_invokedDirectly) {
  main().catch(err => { console.error(err); process.exit(1); });
}
