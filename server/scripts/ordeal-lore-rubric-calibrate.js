// Calibration ledger for the lore_mastery rubric. Each entry rewrites a
// question's expected_answer per the user's ruling. Default DRY-RUN; --apply.
// Run from repo root: node server/scripts/ordeal-lore-rubric-calibrate.js [--apply]
import 'dotenv/config';
import { MongoClient } from 'mongodb';

const APPLY = process.argv.includes('--apply');

const CALIBRATIONS = [
  {
    index: 14, // Q15
    expected: 'Mostly about the lack of covenant protection and the ostracisation/distrust that comes with being Unaligned.',
  },
  {
    index: 36, // Q36
    expected: 'Willpower (besides Vitae). Theban Sorcery additionally requires a sacrament/offering.',
  },
  // Q31-34: "Which covenant's power...?" - accept the power name OR the covenant
  // that wields it; short-form covenant names are fine.
  {
    index: 31, // Q31
    expected: "Carthian Law - accept the power name or the covenant (the Carthian Movement / Carthians).",
  },
  {
    index: 32, // Q32
    expected: 'Crúac - accept the power name or the covenant (Circle of the Crone / Crone).',
  },
  {
    index: 33, // Q33
    expected: 'Theban Sorcery - accept the power name or the covenant (Lancea et Sanctum / Lancea / the Sanctified).',
  },
  {
    index: 34, // Q34
    expected: 'Invictus Oaths - accept the power name or the covenant (the Invictus).',
  },
];

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db('tm_suite');
const doc = await db.collection('ordeal_rubrics').findOne({ ordeal_type: 'lore_mastery' });
if (!doc) { console.error('No lore_mastery rubric'); process.exit(1); }
const byIndex = new Map(doc.questions.map(q => [q.index, q]));

for (const cal of CALIBRATIONS) {
  const q = byIndex.get(cal.index);
  if (!q) { console.log(`SKIP index ${cal.index}`); continue; }
  console.log(`[${cal.index}] ${q.question.slice(0, 60)}`);
  console.log(`  was: ${q.expected_answer}`);
  console.log(`  now: ${cal.expected}\n`);
  if (APPLY) q.expected_answer = cal.expected;
}

if (APPLY) {
  await db.collection('ordeal_rubrics').updateOne({ _id: doc._id }, { $set: { questions: doc.questions } });
  console.log(`APPLIED ${CALIBRATIONS.length} calibration(s).`);
} else {
  console.log(`DRY-RUN: ${CALIBRATIONS.length} calibration(s). Re-run with --apply.`);
}
await client.close();
