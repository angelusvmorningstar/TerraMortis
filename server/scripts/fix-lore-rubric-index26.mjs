// fix-lore-rubric-index26.mjs — remove the unlabelled scored:false entry at array index 26
// from ordeal_rubrics.lore_mastery, then decrement question_index > badEntry.index in all
// ordeal_responses lore marking docs by 1. Fixes Q27-Q44 verdict display in the player lore
// ordeal view.
//
// Background: lore_mastery rubric has 45 entries (indices 0-44) instead of 44. The extra entry
// at position 26 is a retired duplicate of Q20 ("Can you use Disciplines on other vampires in
// Elysium?", scored:false, unlabelled). LORE_SECTIONS has 44 form questions; ordeal-form.js uses
// a running counter qi that matches flat form positions (Q27 -> qi=26), but the cockpit wrote
// Q27 verdicts at question_index:27. Result: Q27-Q44 verdicts are invisible or mismatched.
//
// SAFETY: dry-run by default — prints what would change, writes nothing.
// Pass --apply to commit changes to the database.
//
//   Dry run:   node server/scripts/fix-lore-rubric-index26.mjs
//   Apply:     node server/scripts/fix-lore-rubric-index26.mjs --apply
//
// IDEMPOTENCY: the bad-entry check in step 1 is the gate. If the rubric is already clean, the
// script exits cleanly before touching markings. Safe to re-run after --apply.
//
// RECOVERY: if --apply cleans the rubric but crashes mid-marking-loop, re-run will exit at the
// "already clean" gate before patching the remaining docs. Use --force-mark-patch to skip the
// rubric gate and patch markings only:
//
//   node server/scripts/fix-lore-rubric-index26.mjs --apply --force-mark-patch
//
// WARNING: --force-mark-patch is a one-time recovery tool. Running it after a fully successful
// --apply will double-decrement Q28+ indices. Only use it if --apply partially failed (rubric
// cleaned, marking loop crashed before finishing all docs).

import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MongoClient } from 'mongodb';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '..', '.env') });

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const FORCE_MARK_PATCH = args.includes('--force-mark-patch');

const URI = process.env.MONGODB_URI;
if (!URI) { console.error('No MONGODB_URI (root .env or env var).'); process.exit(1); }

// Detect the bad entry: scored:false AND no leading "N." in question text.
const hasLeadingNumber = (text) => /^\s*\d+\./.test(String(text || ''));

const client = new MongoClient(URI, { serverSelectionTimeoutMS: 10000 });
let nRubricRemoved = 0;
let nMarkingPatched = 0;

try {
  await client.connect();
  const db = client.db('tm_suite');
  const rubricCol = db.collection('ordeal_rubrics');
  const responsesCol = db.collection('ordeal_responses');

  console.log(`\n=== fix-lore-rubric-index26 — ${APPLY ? 'APPLY (writing)' : 'DRY RUN (no writes)'}${FORCE_MARK_PATCH ? ' [--force-mark-patch]' : ''} ===\n`);

  // --- Step 1: Detect the bad rubric entry ---

  const rubric = await rubricCol.findOne({ ordeal_type: 'lore_mastery' });
  if (!rubric) {
    console.error('ordeal_rubrics.lore_mastery document not found. Aborting.');
    process.exitCode = 1;
  } else {
    const questions = rubric.questions || [];
    const badIdx = questions.findIndex((q) => q.scored === false && !hasLeadingNumber(q.question));

    // markThreshold: question_index > markThreshold triggers decrement.
    // Derived from badEntry.index so the range is data-driven, not a magic number.
    let markThreshold = -1;
    let runMarkingPatch = false;

    if (badIdx === -1) {
      if (FORCE_MARK_PATCH) {
        // Recovery path: rubric was already cleaned by a prior --apply that crashed mid-marking.
        // markThreshold hardcoded to 26 (the known bad entry index) since the entry is gone.
        console.log('lore rubric already clean — running marking patch only (--force-mark-patch recovery).');
        console.log(`  (lore_mastery has ${questions.length} questions)`);
        markThreshold = 26;
        runMarkingPatch = true;
      } else {
        // Idempotency gate: rubric is already clean — skip everything including marking patch.
        console.log('lore rubric is already clean — no changes needed.');
        console.log(`  (lore_mastery has ${questions.length} questions; no unlabelled scored:false entry found)`);
      }
    } else {
      const badEntry = questions[badIdx];

      console.log('Found unlabelled scored:false entry in lore_mastery:');
      console.log(`  array position : ${badIdx}`);
      console.log(`  index field    : ${badEntry.index}`);
      console.log(`  question text  : ${String(badEntry.question || '').slice(0, 100)}`);
      console.log(`  scored         : ${badEntry.scored}`);
      console.log('');

      // Threshold is data-driven from the detected entry's index field.
      markThreshold = badEntry.index;
      runMarkingPatch = true;

      // --- Step 2: Remove bad entry from rubric ---

      if (!APPLY) {
        console.log('[DRY RUN] Would remove this entry from lore_mastery.questions');
        console.log(`[DRY RUN] rubric would have ${questions.length - 1} entries (down from ${questions.length})`);
        nRubricRemoved = 1;
      } else {
        const cleaned = questions.filter((_, i) => i !== badIdx);
        const rubricResult = await rubricCol.updateOne(
          { ordeal_type: 'lore_mastery' },
          { $set: { questions: cleaned } }
        );
        console.log(`Rubric updated (modifiedCount: ${rubricResult.modifiedCount})`);
        console.log(`  lore_mastery now has ${cleaned.length} questions`);
        nRubricRemoved = rubricResult.modifiedCount;

        if (nRubricRemoved === 0) {
          console.warn('Warning: rubric updateOne returned modifiedCount=0 — possible concurrent modification. Skipping marking patch.');
          runMarkingPatch = false;
        }
      }
    }

    // --- Step 3: Patch lore marking indices ---

    if (runMarkingPatch) {
      const loreDocs = await responsesCol
        .find({ ordeal_type: 'lore', 'marking.answers': { $exists: true, $not: { $size: 0 } } })
        .toArray();

      const docsToPatch = loreDocs.filter((doc) =>
        (doc.marking?.answers || []).some((a) => a.question_index > markThreshold)
      );

      console.log('');
      console.log(`lore ordeal_responses docs with marking.answers: ${loreDocs.length}`);
      console.log(`  docs with question_index > ${markThreshold} to patch: ${docsToPatch.length}`);

      if (docsToPatch.length === 0) {
        console.log('  (no marking docs need patching — indices already at correct positions)');
      }

      for (const doc of docsToPatch) {
        const original = doc.marking.answers;
        const patched = original.map((a) =>
          a.question_index > markThreshold ? { ...a, question_index: a.question_index - 1 } : a
        );
        const changed = original.filter((a) => a.question_index > markThreshold);

        if (!APPLY) {
          console.log(`\n[DRY RUN] doc ${doc._id} (status: ${doc.status ?? 'unknown'})`);
          console.log(`  ${changed.length} answer(s) would be decremented:`);
          for (const a of changed) {
            console.log(`    question_index ${a.question_index} -> ${a.question_index - 1}  (result: ${a.result})`);
          }
          nMarkingPatched++;
        } else {
          const res = await responsesCol.updateOne(
            { _id: doc._id },
            { $set: { 'marking.answers': patched } }
          );
          console.log(`  doc ${doc._id}: ${changed.length} index(es) decremented (modifiedCount: ${res.modifiedCount})`);
          if (res.modifiedCount > 0) nMarkingPatched++;
        }
      }

      // --- Summary ---
      console.log('');
      if (APPLY) {
        console.log(`Summary: ${nRubricRemoved} rubric entry removed, ${nMarkingPatched} lore marking doc(s) patched.`);
        console.log('');
        console.log('Next steps for Peter:');
        console.log('  1. Regenerate cockpit bundle: node cockpit/scripts/export-ordeals.mjs');
        console.log('  2. Smoke-check Wan Yelong\'s lore ordeal view in the player app');
        console.log('     (nears at Q29, Q36, Q38, Q39, Q40 should now display correctly)');
      } else {
        console.log(`Summary (dry run): ${nRubricRemoved} rubric entry to remove, ${nMarkingPatched} lore marking doc(s) to patch.`);
        console.log('Re-run with --apply to commit.');
      }
    }
  }
} catch (err) {
  console.error('FAILED:', err.message);
  process.exitCode = 1;
} finally {
  await client.close();
}
