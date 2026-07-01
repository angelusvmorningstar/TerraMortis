// Retire the Lore Qextra (index 26, "Can you use Disciplines on other vampires
// in Elysium?") - mark non-scoring. Targeted: touches only scored, not the
// calibrated expected_answers. Default DRY-RUN; --apply.
import 'dotenv/config';
import { MongoClient } from 'mongodb';
const APPLY = process.argv.includes('--apply');
const c = new MongoClient(process.env.MONGODB_URI); await c.connect();
const db = c.db('tm_suite');
const doc = await db.collection('ordeal_rubrics').findOne({ ordeal_type: 'lore_mastery' });
const q = doc.questions.find(x => x.index === 26);
console.log(`index 26: ${JSON.stringify(q.question)}`);
console.log(`  scored: ${q.scored} -> false`);
if (APPLY) {
  await db.collection('ordeal_rubrics').updateOne(
    { _id: doc._id }, { $set: { 'questions.$[q].scored': false } }, { arrayFilters: [{ 'q.index': 26 }] });
  const n = (await db.collection('ordeal_rubrics').findOne({ _id: doc._id })).questions.filter(x => x.scored !== false).length;
  console.log(`APPLIED. Lore now ${n} scored questions.`);
} else { console.log('DRY-RUN. Re-run with --apply.'); }
await c.close();
