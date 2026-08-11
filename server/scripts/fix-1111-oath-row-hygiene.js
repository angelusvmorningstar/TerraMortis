/**
 * OATH-A (issue #1111, ADR-010 D8 / AC8) — make the live oath rows validate.
 *
 * The ten `purchasable_powers` rows carrying `cost_model` fail
 * `purchasablePowerSchema` on three undeclared properties. Two of those are
 * now declared by this story (`cost_model`, `rating_basis`); the other two
 * are stray legacy keys that must be removed from the DOCUMENTS, because the
 * instruction is to fix the rows and NOT to loosen the validator.
 *
 *   selected  — retired by issue #5; superseded by a render-time holder count
 *   special   — never declared, never read
 *
 * It also seeds the two ADR-010 D4 `rating_basis` values, which are absent
 * from all 673 rows.
 *
 * ── SCOPE, AND WHY IT IS DELIBERATELY NARROW ─────────────────────────────
 * `selected` is on 666 of 673 rows and `special` on 527 — this is
 * COLLECTION-WIDE debt, not oath-row hygiene as ADR-010 D8 assumed. Cleaning
 * all 666 does not belong inside a purchase-flow story, so this script
 * touches ONLY the ten `cost_model` rows: the ones OATH-A must make
 * POST-able. The remainder is filed separately.
 *
 * Note there is already a purpose-built, backup-taking, collection-wide
 * cleanup at `server/scripts/archive/strip-selected-from-purchasable-powers.js`.
 * It was archived, not deleted, and `selected` is still on 666 rows — so
 * either it never ran or something re-seeds the field. That question must be
 * answered before anyone writes a broader script; this one is not it.
 *
 * ── SAFETY ───────────────────────────────────────────────────────────────
 * DRY-RUN BY DEFAULT. `--apply` writes a full-document JSON backup to
 * server/scripts/_backups/ BEFORE issuing any update, and aborts if the
 * backup write throws.
 *
 * Usage:
 *   cd server && node scripts/fix-1111-oath-row-hygiene.js
 *   cd server && node scripts/fix-1111-oath-row-hygiene.js --apply
 */

import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectDb, getCollection, closeDb } from '../db.js';
import { purchasablePowerSchema } from '../schemas/purchasable_power.schema.js';
import Ajv from 'ajv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = join(__dirname, '_backups');
const APPLY = process.argv.includes('--apply');

// ADR-010 D4 — the two derived rating bases. Keyed by rule `key`.
const RATING_BASIS = {
  'oath-of-abstinence':        { type: 'blood_potency_multiple', factor: 2 },
  'oath-of-the-model-prisoner': { type: 'highest_status', pools: ['covenant', 'clan'] },
};

const STRAY_KEYS = ['selected', 'special'];

async function main() {
  await connectDb();
  const col = getCollection('purchasable_powers');
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(purchasablePowerSchema);

  const rows = await col.find({ cost_model: { $exists: true } }).toArray();
  console.log('Mode:    ' + (APPLY ? 'APPLY (backup then write)' : 'DRY-RUN'));
  console.log('Matched: ' + rows.length + ' rows carrying cost_model\n');

  const plan = [];
  for (const doc of rows) {
    const unset = STRAY_KEYS.filter(k => k in doc);
    const set = {};
    if (RATING_BASIS[doc.key] && !doc.rating_basis) set.rating_basis = RATING_BASIS[doc.key];

    const before = validate(doc) ? 'PASS' : 'FAIL';
    const after = { ...doc, ...set };
    for (const k of unset) delete after[k];
    const afterState = validate(after) ? 'PASS' : 'FAIL';

    plan.push({ doc, unset, set, before, afterState });
    console.log('  ' + doc.key);
    console.log('      cost_model : ' + doc.cost_model);
    console.log('      $unset     : ' + (unset.length ? unset.join(', ') : '(none)'));
    console.log('      $set       : ' + (Object.keys(set).length ? JSON.stringify(set) : '(none)'));
    console.log('      validates  : ' + before + ' -> ' + afterState);
    if (afterState !== 'PASS') {
      console.log('      REMAINING  : ' + JSON.stringify(
        (validate.errors || []).map(e => e.params?.additionalProperty || e.message)));
    }
  }

  const willPass = plan.filter(p => p.afterState === 'PASS').length;
  console.log('\nSummary: ' + willPass + '/' + plan.length + ' rows validate after this change.');

  // Collection-wide context, so the narrow scope is visible rather than implied.
  const total = await col.countDocuments({});
  const stillSelected = await col.countDocuments({ selected: { $exists: true }, cost_model: { $exists: false } });
  const stillSpecial = await col.countDocuments({ special: { $exists: true }, cost_model: { $exists: false } });
  console.log('Out of scope (filed separately): ' + stillSelected + ' rows keep `selected` and '
    + stillSpecial + ' keep `special`, of ' + total + ' total.');

  if (!APPLY) {
    console.log('\nDRY RUN - nothing written. Re-run with --apply to write.');
    return;
  }

  mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = join(BACKUP_DIR, 'fix-1111-oath-rows-' + stamp + '.json');
  writeFileSync(backupPath, JSON.stringify(rows, null, 2));
  console.log('\nBackup written: ' + backupPath);

  let n = 0;
  for (const { doc, unset, set } of plan) {
    const update = {};
    if (unset.length) update.$unset = Object.fromEntries(unset.map(k => [k, '']));
    if (Object.keys(set).length) update.$set = set;
    if (!Object.keys(update).length) continue;
    await col.updateOne({ _id: doc._id }, update);
    n++;
  }
  console.log('Updated ' + n + ' documents.');
}

main()
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => closeDb());
