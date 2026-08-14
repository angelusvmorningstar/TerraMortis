
/**
 * Issue #811 — Phase 2: cleanup of free-channel contamination from the
 * pre-Phase-1 sumChannels bug.
 *
 * Mechanism (see specs/investigations/2026-06-16-free-channel-contamination.md):
 * pre-Phase-1, `server/lib/normalize-character.js` `sumChannels` summed only
 * the legacy flat channels and ignored `m.free_grants`. Post-N-2 backfill, a
 * merit with map-only data looked like sum=0 to the normalizer; the
 * `sum === 0 && rating > 0` branch fired and backfilled `m.free = rating`
 * (or `m.free_<slug>` via `granted_by`) on EVERY save. The map then
 * coexisted with the populated legacy field — client `meritFreeSum` union-
 * sums both, doubling the displayed dot count.
 *
 * Patterns covered:
 *
 *   Pattern A — `m.free` populated AND any `m.free_grants.<slug>` populated.
 *     Cause: backfill via `backfillChannel` defaulting to `'free'` when no
 *     `granted_by` is set. Fix: zero `m.free`.
 *
 *   Pattern B — `m.free_<slug>` populated AND `m.free_grants.<slug>`
 *     populated (same slug). Cause: backfill via `backfillChannel` resolving
 *     `granted_by` to a specific slug channel. Fix: zero the legacy flat
 *     field `m.free_<slug>`.
 *
 *   Pattern C (ambiguous, NOT cleaned by this script) — `m.free` populated
 *     and NO `m.free_grants.*` populated. Could be a legitimate ST-granted
 *     "bonus dots" allocation, or pre-N-1 contamination that was never
 *     mirrored to the map. The script leaves these untouched; manual audit
 *     required if a specific case surfaces.
 *
 * Idempotent: re-running with `--apply` after a clean pass touches 0 docs.
 * Default mode is `--dry-run` (no writes). Pass `--apply` to commit.
 *
 * Usage:
 *   cd server && node scripts/cleanup-free-channel-contamination.js
 *   cd server && node scripts/cleanup-free-channel-contamination.js --apply
 *
 * dotenv path note: must be run from `server/` so `dotenv/config` picks up
 * `server/.env`. See memory [[feedback_server_scripts_dotenv_path]].
 */

import 'dotenv/config';
import { MongoClient } from 'mongodb';

const DB_NAME = process.env.MONGODB_DB || 'tm_suite';

// 14 legacy free_<slug> fields (matches LEGACY_FREE_SLUGS in
// public/js/data/rules-helpers.js — kept in parallel until Phase 4
// consolidates channel enumeration).
const LEGACY_FREE_SLUGS = [
  'attache', 'bloodline', 'carthian', 'fwb', 'inv', 'lk', 'mci', 'mdb',
  'ohm', 'pet', 'pt', 'retainer', 'sw', 'vm',
];

/**
 * Classify and clean a single merit. Mutates in place. Returns a diagnostics
 * object describing what changed (or null if no change).
 */
export function cleanupMerit(merit) {
  if (!merit || typeof merit !== 'object') return null;
  const fg = (merit.free_grants && typeof merit.free_grants === 'object') ? merit.free_grants : null;
  const mapSlugs = fg ? Object.keys(fg).filter(k => (fg[k] || 0) > 0) : [];
  const hasMapData = mapSlugs.length > 0;

  const changes = [];

  // Pattern A: m.free > 0 AND map populated. Zero m.free.
  if ((merit.free || 0) > 0 && hasMapData) {
    changes.push({ pattern: 'A', field: 'free', before: merit.free, after: 0 });
    merit.free = 0;
  }

  // Pattern B: m.free_<slug> > 0 AND m.free_grants[<slug>] > 0 (same slug).
  // Zero the legacy flat field.
  if (fg) {
    for (const slug of LEGACY_FREE_SLUGS) {
      const flat = 'free_' + slug;
      const flatVal = merit[flat] || 0;
      const mapVal = fg[slug] || 0;
      if (flatVal > 0 && mapVal > 0) {
        changes.push({ pattern: 'B', field: flat, slug, before: flatVal, after: 0 });
        merit[flat] = 0;
      }
    }
  }

  if (!changes.length) return null;
  return {
    name: merit.name || '(unnamed)',
    category: merit.category || null,
    qualifier: merit.qualifier || merit.area || null,
    changes,
  };
}

export async function main() {
  // Issue #826: compute APPLY / DRY_RUN inside main so integration tests can
  // toggle without re-importing the module (pre-fix these were module-scoped
  // and frozen on first import).
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
    let patternA = 0;
    let patternB = 0;

    console.log(`\n${DRY_RUN ? '[DRY RUN]' : '[APPLY]'} cleanup-free-channel-contamination.js`);
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
          for (const ch of r.changes) {
            if (ch.pattern === 'A') patternA++;
            else if (ch.pattern === 'B') patternB++;
          }
          charChanges.push(r);
        }
      }
      if (charDirty) {
        charsTouched++;
        const charLabel = `${doc.name || '(unnamed)'} [${doc._id}]`;
        console.log(`  ${charLabel}`);
        for (const meritChange of charChanges) {
          const meritLabel = meritChange.qualifier
            ? `${meritChange.name} (${meritChange.qualifier})`
            : meritChange.name;
          for (const ch of meritChange.changes) {
            const fieldLabel = ch.slug ? `${ch.field} (slug: ${ch.slug})` : ch.field;
            console.log(`    ${meritLabel.padEnd(40)} Pattern ${ch.pattern}  ${fieldLabel.padEnd(20)} ${ch.before} → ${ch.after}`);
          }
        }
        if (!DRY_RUN) {
          // Issue #826 (HOTFIX): write ONLY the merits field via $set. The
          // pre-fix `replaceOne({_id}, doc)` was destructive because `doc` is
          // a projection (only _id + name + merits) — `replaceOne` overwrote
          // each character document with the projected shape, deleting every
          // unprojected field (attributes / skills / disciplines / clan /
          // covenant / status / xp / humanity / blood_potency / aspirations
          // / etc). Hit prod 2026-06-16 — 13 characters required JSON-backup
          // recovery. Same blind-spot class as N-7c (helpers tested in
          // isolation; integration path not). See memory
          // [[feedback_script_integration_test]] for the discipline going
          // forward.
          await characters.updateOne(
            { _id: doc._id },
            { $set: { merits: doc.merits } }
          );
        }
      }
    }

    console.log('');
    console.log(`Summary: ${charsTouched} character${charsTouched === 1 ? '' : 's'}, ${meritsTouched} merit${meritsTouched === 1 ? '' : 's'} affected.`);
    console.log(`  Pattern A (m.free + map populated): ${patternA}`);
    console.log(`  Pattern B (m.free_<slug> + map populated): ${patternB}`);
    console.log(`  Pattern C ambiguous (m.free alone, no map): NOT cleaned by this script.`);
    if (DRY_RUN) {
      console.log('\n[DRY RUN] Re-run with --apply to write.');
    } else {
      console.log('\n[APPLY] Idempotency check: re-run with no flag (dry-run) and confirm "0 characters, 0 merits affected".');
    }
  } finally {
    await client.close();
  }
}

// Run main() only when invoked directly. Importable for tests.
const _invokedDirectly = import.meta.url === `file://${process.argv[1]}`;
if (_invokedDirectly) {
  main().catch(err => { console.error(err); process.exit(1); });
}
