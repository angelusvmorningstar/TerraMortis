// Record Lord Wan Yelong's Covenant (Invictus) engagement grade + feedback.
// marking.answers keyed by rubric index; status='in_progress' (no XP). DRY-RUN; --apply.
import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';
const APPLY = process.argv.includes('--apply');
const now = new Date().toISOString();
const ID = '6a3601beefee90c8c11fff73';
const overall = 'Strong, consistent engagement - 20 of 23, with a genuine grasp of Invictus power-through-obligation. Three answers to develop (see notes) before this completes.';
const answers = [
  { question_index: 6,  result: 'near', feedback: "Shortest answer of the set - you say methods adapt while principles hold, but don't show the tension. Develop a concrete example of something the covenant changed in order to preserve something it refused to lose." },
  { question_index: 15, result: 'near', feedback: 'The question asks you to pick ONE covenant and name what specifically collapses without Invictus patronage - you gave a general stability answer. Commit to a single covenant and trace the dependency.' },
  { question_index: 21, result: 'near', feedback: 'Your answer trails off and only covers the cost-benefit calculus. Finish the thought - what does the Invictus actually owe those outside the First Estate?' },
];
const c = new MongoClient(process.env.MONGODB_URI); await c.connect();
const db = c.db('tm_suite');
console.log(`Lord Wan Yelong (Covenant): ${answers.length} notes (3 near) -> in_progress`);
if (APPLY) {
  await db.collection('ordeal_responses').updateOne({ _id: new ObjectId(ID) },
    { $set: { 'marking.status': 'in_progress', 'marking.overall_feedback': overall, 'marking.answers': answers, 'marking.marked_at': now } });
  console.log('APPLIED (in_progress; no completion, no XP).');
} else { console.log('DRY-RUN. Re-run with --apply.'); }
await c.close();
