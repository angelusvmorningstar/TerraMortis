/**
 * One-shot migration — fix double-counted free_fwb bonus dots (Issue #43)
 *
 * When the free_fwb named channel was introduced (RDE epic), the auto-bonus
 * evaluator began writing FwB grants to free_fwb. Characters who already had
 * the FwB bonus stored in the generic `free` field ended up with both channels
 * set to the same value. meritEffectiveRating sums all free_* channels, so
 * any merit with free === free_fwb (both > 0) was reporting double the dots.
 *
 * Fix: for merits where free > 0 AND free_fwb > 0 AND free === free_fwb,
 * zero the `free` field and resync `rating`.
 *
 * Merits where free !== free_fwb (both non-zero but different values) are
 * flagged as ambiguous — not auto-fixed; require manual review.
 *
 * Usage:
 *   node server/scripts/fix-feeding-grounds-double-free.js          # dry-run
 *   node server/scripts/fix-feeding-grounds-double-free.js --write  # apply fixes
 */

import { MongoClient } from 'mongodb';
import 'dotenv/config';

const DRY_RUN = !process.argv.includes('--write');

function meritFreeSum(m) {
  return (m.free || 0) + (m.free_bloodline || 0) + (m.free_pet || 0)
    + (m.free_mci || 0) + (m.free_vm || 0) + (m.free_lk || 0)
    + (m.free_ohm || 0) + (m.free_inv || 0) + (m.free_pt || 0)
    + (m.free_mdb || 0) + (m.free_sw || 0) + (m.free_fwb || 0)
    + (m.free_attache || 0);
}

function syncMeritRating(m) {
  return (m.cp || 0) + (m.xp || 0) + meritFreeSum(m);
}

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db('tm_suite');
  const col = db.collection('characters');

  const characters = await col.find({}, { projection: { name: 1, merits: 1 } }).toArray();

  const fixes = [];
  const ambiguous = [];

  for (const c of characters) {
    for (let i = 0; i < (c.merits || []).length; i++) {
      const m = c.merits[i];
      const free = m.free || 0;
      const fwb = m.free_fwb || 0;
      if (free > 0 && fwb > 0) {
        if (free === fwb) {
          fixes.push({ charName: c.name, charId: c._id, meritIdx: i, meritName: m.name, free, fwb });
        } else {
          ambiguous.push({ charName: c.name, meritName: m.name, free, fwb });
        }
      }
    }
  }

  console.log(`\n=== Double-entry fixes (free === free_fwb, both > 0) ===`);
  if (fixes.length === 0) {
    console.log('  None found.');
  } else {
    for (const f of fixes) {
      console.log(`  ${f.charName} → ${f.meritName}: free=${f.free}, free_fwb=${f.fwb} → free will be zeroed`);
    }
  }

  console.log(`\n=== Ambiguous (free !== free_fwb, both > 0) — NOT auto-fixed ===`);
  if (ambiguous.length === 0) {
    console.log('  None found.');
  } else {
    for (const a of ambiguous) {
      console.log(`  ${a.charName} → ${a.meritName}: free=${a.free}, free_fwb=${a.fwb} — manual review needed`);
    }
  }

  if (DRY_RUN) {
    console.log(`\nDRY RUN — no changes written. Re-run with --write to apply.`);
    await client.close();
    return;
  }

  let updated = 0;
  for (const f of fixes) {
    const c = characters.find(ch => String(ch._id) === String(f.charId));
    const m = c.merits[f.meritIdx];
    m.free = 0;
    m.rating = syncMeritRating(m);

    const updatePath = `merits.${f.meritIdx}`;
    await col.updateOne(
      { _id: f.charId },
      { $set: { [`${updatePath}.free`]: 0, [`${updatePath}.rating`]: m.rating } }
    );
    console.log(`  Fixed: ${f.charName} → ${f.meritName} (free 0, rating now ${m.rating})`);
    updated++;
  }

  console.log(`\nDone. ${updated} merit(s) updated.`);
  await client.close();
}

run().catch(err => { console.error(err); process.exit(1); });
