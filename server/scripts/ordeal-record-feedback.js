// Record per-answer grades + feedback for the two graded-but-incomplete Rules
// submissions. Writes marking.answers (keyed by RUBRIC INDEX), overall_feedback,
// and marking.status='in_progress' (NOT complete - no XP cascade). Feedback is
// directional only - it names the gap without giving the answer. Default
// DRY-RUN; pass --apply to write. Run from repo root.
//
// NOTE: the player feedback renderer (tabs/ordeals-view.js) currently only shows
// feedback when marking.status==='complete' and pairs by responses[question_index].
// So this record is for ST reference / out-of-band delivery until that renderer
// is fixed to show in-progress feedback and pair by rubric index.
import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';

const APPLY = process.argv.includes('--apply');
const now = new Date().toISOString();

const GRADES = [
  {
    collection: 'ordeal_responses',
    id: '6a35ffeaefee90c8c11fff72',
    label: 'Lord Wan Yelong',
    overall: 'Strong submission - 48 of 55 correct. Seven answers need a small tidy-up before this completes; see the notes.',
    answers: [
      { question_index: 0,  result: 'near', feedback: 'You named two of the three components; supernatural pools add a third. Take another look at how those pools are built.' },
      { question_index: 3,  result: 'near', feedback: 'Your tie answer follows an earlier edition; check the 2e rule for what a tied contested roll produces, and double-check your contested-vs-resisted split.' },
      { question_index: 6,  result: 'near', feedback: "You've covered the damage, but there's a further consequence once you take too much from a vessel. Revisit the feeding rules." },
      { question_index: 13, result: 'near', feedback: "Out-of-clan Disciplines aren't all learned the same way - some can be picked up alone, and the two sorceries differ again. Re-read the learning rules." },
      { question_index: 16, result: 'near', feedback: "You've got the emotional triggers; there are environmental ones too. What else forces a frenzy check?" },
      { question_index: 41, result: 'near', feedback: "'Into torpor' is right but incomplete: how long does it last, and what is the staked vampire aware of?" },
      { question_index: 42, result: 'near', feedback: "You've got the low end; the question wants the full scaling at the highest Blood Potencies." },
    ],
  },
  {
    collection: 'ordeal_submissions',
    id: '6a0a4ad443e244c74345a340',
    label: 'Charles Mercer-Willows',
    overall: '35 of 55 correct. A solid grasp of the basics, with a cluster of real gaps. The notes below flag each; resubmit those before this completes.',
    answers: [
      { question_index: 2,  result: 'no',   feedback: 'Your contested and resisted definitions are swapped, and the tie outcome is missing. Re-read both terms.' },
      { question_index: 8,  result: 'no',   feedback: "You named who's involved but not how the bond actually forms. Revisit the creation steps." },
      { question_index: 12, result: 'near', feedback: "You've got the shape but not the named mechanic or what's rolled. Look it up." },
      { question_index: 13, result: 'no',   feedback: "Learning out-of-clan Disciplines isn't one-size-fits-all - re-read the rules." },
      { question_index: 17, result: 'no',   feedback: 'This is the Bestial Triad, not frenzy triggers. Look up the Triad’s three aspects and what each uses and imposes.' },
      { question_index: 22, result: 'near', feedback: "You've got the Humanity loss; there's also something the character gains on a failed roll. Check the detachment outcomes." },
      { question_index: 23, result: 'near', feedback: 'Right idea, but it needs the actual numbers and the downside when you have none.' },
      { question_index: 26, result: 'near', feedback: 'Close, but reconsider what Defence actually reduces.' },
      { question_index: 27, result: 'near', feedback: "Your Defence formula and the multi-attacker rule aren't quite right; the dodge doubling is good." },
      { question_index: 30, result: 'near', feedback: 'Your healing rates are off. Revisit the cost for each damage type.' },
      { question_index: 31, result: 'near', feedback: "You described it well but didn't name the system." },
      { question_index: 36, result: 'near', feedback: 'Be specific about the damage condition that forces torpor (you’ve already got staking and starvation).' },
      { question_index: 37, result: 'near', feedback: 'Tiers are right; each one also carries a range limit. Add those.' },
      { question_index: 39, result: 'near', feedback: 'You named one factor; there’s a second, and they play different roles. Which sets the baseline and which scales it?' },
      { question_index: 42, result: 'near', feedback: 'Right at the low end; give the high-Blood-Potency scaling.' },
      { question_index: 44, result: 'near', feedback: "Right that it's pleasurable; name the mechanical effects and what happens to memory." },
      { question_index: 45, result: 'no',   feedback: "It's not a flat value; both how much and how often vary. What drives each?" },
      { question_index: 47, result: 'no',   feedback: "Entering itself isn't the issue; consider what feeding without permission costs, and what powers punish trespassers." },
      { question_index: 48, result: 'no',   feedback: 'Reconsider what Feeding Grounds actually modifies.' },
      { question_index: 50, result: 'no',   feedback: 'Re-check whether Disciplines are allowed in Elysium, and what the etiquette actually restricts.' },
    ],
  },
];

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db('tm_suite');

for (const g of GRADES) {
  const nearN = g.answers.filter(a => a.result === 'near').length;
  const noN = g.answers.filter(a => a.result === 'no').length;
  console.log(`\n=== ${g.label} (${g.collection}) ===`);
  console.log(`answers to record: ${g.answers.length} (${nearN} near, ${noN} no) | status -> in_progress (NOT complete)`);
  if (APPLY) {
    await db.collection(g.collection).updateOne(
      { _id: new ObjectId(g.id) },
      { $set: { 'marking.status': 'in_progress', 'marking.overall_feedback': g.overall, 'marking.answers': g.answers, 'marking.marked_at': now } }
    );
    console.log('APPLIED.');
  }
}
console.log(APPLY ? '\nDone (status in_progress; no completion, no XP).' : '\nDRY-RUN. Re-run with --apply to write.');
await client.close();
