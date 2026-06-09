/**
 * migrate-577-pt-dot4-free-cleanup.js  (issue #577)
 *
 * Resolves all free-dot fragmentation found by audit-577-free-dot-double-rep.js.
 * Decisions confirmed by Angelus 2026-06-07:
 *
 *   [D] Double-count (free folded into dots + PT ephemeral grant)
 *       → Option A: ephemeral rule grant is SSOT; migrate `free` out of `dots`.
 *       → set dots = cp + floor(xp/2),  free = 0
 *         Edna Judge    / Intimidation
 *         Macheath      / Brawl
 *
 *   [O] Orphan free dot (no PT source)
 *       → Option C: data entry error; reduce dots to cp value.
 *       → set dots = cp,  free = 0
 *         Ludica Lachramore / Intimidation
 *
 *   [S] Stale free marker (free>0 but NOT folded into dots; renders correctly)
 *       → cosmetic clean: set free = 0  (dots unchanged)
 *         Charlie Ballsack / Weaponry
 *         René Meyer       / Occult
 *
 * Usage:
 *   node migrate-577-pt-dot4-free-cleanup.js           # dry-run (default)
 *   node migrate-577-pt-dot4-free-cleanup.js --apply   # execute writes
 *
 * Idempotent: re-running after --apply produces 0 changes.
 * Angelus runs this against live tm_suite; Claude never executes writes.
 */
import { MongoClient } from 'mongodb';

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGO_URI) { console.error('MONGODB_URI not set'); process.exit(1); }
const DB_NAME = process.env.MONGODB_DB || 'tm_suite';
const DRY_RUN = !process.argv.includes('--apply');

const PATCHES = [
  // [D] True double-counts — remove free from dots (dots = cp + floor(xp/2))
  { charName: 'Edna Judge',          skill: 'Intimidation', type: 'D' },
  { charName: 'Macheath',            skill: 'Brawl',        type: 'D' },
  // [O] Orphan free dot — data entry error, reduce to cp value
  { charName: 'Ludica Lachramore',   skill: 'Intimidation', type: 'O' },
  // [S] Stale free marker — zero out free only, dots unchanged
  { charName: 'Charlie Ballsack',    skill: 'Weaponry',     type: 'S' },
  { charName: 'René Meyer',          skill: 'Occult',       type: 'S' },
];

async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  const col = db.collection('characters');

  console.log('='.repeat(80));
  console.log(`migrate-577-pt-dot4-free-cleanup  [${DRY_RUN ? 'DRY RUN — pass --apply to write' : 'LIVE WRITE'}]`);
  console.log('='.repeat(80));

  let changeCount = 0;

  for (const p of PATCHES) {
    const c = await col.findOne({ name: p.charName });
    if (!c) { console.warn(`  WARN: character not found — "${p.charName}"`); continue; }

    const so = (c.skills || {})[p.skill];
    if (!so) { console.warn(`  WARN: skill not found — "${p.charName}" / ${p.skill}`); continue; }

    const cp  = so.cp  || 0;
    const xp  = so.xp  || 0;
    const inherent = cp + Math.floor(xp / 2);
    const oldDots  = so.dots  || 0;
    const oldFree  = so.free  || 0;

    let newDots, newFree, reason;
    if (p.type === 'D' || p.type === 'O') {
      // Remove materialized free dot — dots becomes pure inherent
      newDots = inherent;
      newFree = 0;
      reason  = p.type === 'D'
        ? `[D] double-count: dots ${oldDots}→${newDots}, free ${oldFree}→0 (PT dot-4 is ephemeral SSOT)`
        : `[O] orphan: dots ${oldDots}→${newDots}, free ${oldFree}→0 (decision C: error)`;
    } else {
      // [S] stale marker — dots is already inherent, just zero out free
      newDots = oldDots;
      newFree = 0;
      reason  = `[S] stale: free ${oldFree}→0 (dots ${oldDots} unchanged)`;
    }

    const alreadyClean = oldDots === newDots && oldFree === 0;
    const status = alreadyClean ? 'SKIP (already clean)' : (DRY_RUN ? 'WOULD UPDATE' : 'UPDATED');

    console.log(`\n  ${p.charName} / ${p.skill}`);
    console.log(`    ${reason}`);
    console.log(`    → ${status}`);

    if (!alreadyClean) {
      changeCount++;
      if (!DRY_RUN) {
        await col.updateOne(
          { _id: c._id },
          { $set: { [`skills.${p.skill}.dots`]: newDots, [`skills.${p.skill}.free`]: newFree } }
        );
      }
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log(`  Total changes ${DRY_RUN ? 'pending' : 'applied'}: ${changeCount}`);
  if (DRY_RUN && changeCount > 0) {
    console.log('  Re-run with --apply to execute.');
  }
  if (!DRY_RUN) {
    console.log('  Re-run audit-577-free-dot-double-rep.js to verify [D]=0, [O]=0.');
  }
  console.log('='.repeat(80));

  await client.close();
}
main().catch(e => { console.error(e); process.exit(1); });
