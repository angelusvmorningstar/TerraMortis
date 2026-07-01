// Record per-answer grades + feedback for the three graded-but-incomplete LORE
// submissions. marking.answers keyed by RUBRIC INDEX; status='in_progress'
// (no completion, no XP). Feedback is directional only. Default DRY-RUN; --apply.
import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';

const APPLY = process.argv.includes('--apply');
const now = new Date().toISOString();

const GRADES = [
  {
    collection: 'ordeal_responses', id: '6a35f289efee90c8c11fff70', label: 'Lord Wan Yelong (Lore)',
    overall: '38 of 43 correct - strong. A handful to tidy: the third weakness, Elysium clarity, out-of-clan learning, two mind Disciplines, and Blood Sympathy. See the notes; resubmit those before this completes.',
    answers: [
      { question_index: 6,  result: 'near', feedback: "Third traditional weakness is wrong - it's about what physically destroys a vampire, not a feeding need." },
      { question_index: 19, result: 'near', feedback: "The rules give a clear yes/no on Disciplines in Elysium - state it plainly rather than 'depends if caught'." },
      { question_index: 24, result: 'near', feedback: 'You cited only blood sympathy / vitae-sharing - distinguish self-teaching a non-exclusive Discipline from the extra requirements for a clan-exclusive one.' },
      { question_index: 29, result: 'near', feedback: 'One of your two picks is a perception Discipline, not a mind-affecting one - re-check which actually control or alter the mind.' },
      { question_index: 40, result: 'no',   feedback: 'Your definition conflates Blood Sympathy with vitae-sharing - revisit what connection it actually describes, and between whom.' },
    ],
  },
  {
    collection: 'ordeal_submissions', id: '6a0a4ad443e244c74345a336', label: 'Jack Fallow (Lore)',
    overall: '37 of 43 correct. Strong on the basics; a few real misses (the Beast vs frenzy, the Daeva curse) and a couple that need more detail. See the notes; resubmit those before this completes.',
    answers: [
      { question_index: 1,  result: 'no',   feedback: 'You named the result of losing control, not the underlying primal force itself - re-read the distinction.' },
      { question_index: 6,  result: 'near', feedback: 'Third weakness is wrong - the three traditional ones are external/physical, not internal.' },
      { question_index: 24, result: 'near', feedback: "You covered the clan-exclusive case partially - add how non-exclusive Disciplines are learned and the teacher's dot requirement." },
      { question_index: 38, result: 'near', feedback: "Bare hedge - specify what actually happens to each covenant's powers when switching." },
      { question_index: 39, result: 'near', feedback: 'You named the mechanical form but missed the central political-vs-personal nature of covenant powers.' },
      { question_index: 44, result: 'no',   feedback: "That names mortals, not a clan - identify which clan's curse drives obsession with feeding victims." },
    ],
  },
  {
    collection: 'ordeal_submissions', id: '6a0a4ad443e244c74345a333', label: 'Tegan Groves (Lore)',
    overall: '31 of 43 correct. A reasonable base, but several real gaps (Elysium/Disciplines, domain vs haven, covenant powers) and a few answers that need you to show your work. See the notes; resubmit those before this completes.',
    answers: [
      { question_index: 6,  result: 'near', feedback: "Third weakness is wrong - re-check the classic trio of vampire vulnerabilities (it's not claws/fangs)." },
      { question_index: 12, result: 'near', feedback: 'Categories are right, but revisit the approximate year ranges for Ancillae and Elders.' },
      { question_index: 14, result: 'near', feedback: "'Shunned' is on-topic but thin - explain what protection and standing the Unaligned actually lose." },
      { question_index: 17, result: 'near', feedback: "Don't just gesture at politics - say what court actually offers a vampire." },
      { question_index: 18, result: 'no',   feedback: "A feeding/controlled territory isn't a haven - recheck the term for the area a vampire holds and feeds from." },
      { question_index: 19, result: 'no',   feedback: 'Re-read the 2e Elysium rules on whether Disciplines are permitted there.' },
      { question_index: 24, result: 'near', feedback: "'Be taught' is incomplete - distinguish self-teachable Disciplines from clan-exclusive ones and what the latter additionally requires." },
      { question_index: 27, result: 'near', feedback: "You named one resource - there's a second standard activation cost too." },
      { question_index: 35, result: 'near', feedback: 'Membership is part of it, but revisit whether there is a strict mechanical bar and which Status/merit actually unlocks it.' },
      { question_index: 36, result: 'no',   feedback: "That isn't the mechanical fuel - recheck what covenant powers spend besides Vitae." },
      { question_index: 38, result: 'near', feedback: 'Too bare - explain what happens per covenant to already-learned vs new powers when switching.' },
      { question_index: 39, result: 'near', feedback: 'True, but not the core distinction - focus on how covenant powers are political/organisational rather than personal.' },
    ],
  },
];

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db('tm_suite');
for (const g of GRADES) {
  const near = g.answers.filter(a => a.result === 'near').length, no = g.answers.filter(a => a.result === 'no').length;
  console.log(`${g.label}: ${g.answers.length} notes (${near} near, ${no} no) -> in_progress`);
  if (APPLY) {
    await db.collection(g.collection).updateOne({ _id: new ObjectId(g.id) },
      { $set: { 'marking.status': 'in_progress', 'marking.overall_feedback': g.overall, 'marking.answers': g.answers, 'marking.marked_at': now } });
    console.log('  APPLIED.');
  }
}
console.log(APPLY ? '\nDone (in_progress; no completion, no XP).' : '\nDRY-RUN. Re-run with --apply.');
await client.close();
