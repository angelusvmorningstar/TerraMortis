// Record a "please finish" note on René St. Dominique's partial Rules ordeal
// (34/55 answered). Record-only: marking.status='in_progress' + overall_feedback,
// no completion, no XP. Won't display in-app (renderer gates on complete) - it's
// an ST-side trail; the player nudge goes out-of-band. Default DRY-RUN; --apply.
import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';

const APPLY = process.argv.includes('--apply');
const ID = '6a0a4ad443e244c74345a341';
const NOTE = "Your Rules ordeal is part-way there - you've answered 34 of the questions and left the rest blank. To get it signed off, jump back into the Rules ordeal, complete the ones you skipped, and resubmit. Give us a shout if any are unclear.";

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db('tm_suite');

console.log('René St. Dominique (ordeal_submissions ' + ID + ')');
console.log('  marking.status -> in_progress');
console.log('  overall_feedback -> ' + NOTE);

if (APPLY) {
  await db.collection('ordeal_submissions').updateOne(
    { _id: new ObjectId(ID) },
    { $set: { 'marking.status': 'in_progress', 'marking.overall_feedback': NOTE, 'marking.marked_at': new Date().toISOString() } }
  );
  console.log('\nAPPLIED (record-only; no completion, no XP).');
} else {
  console.log('\nDRY-RUN. Re-run with --apply to write.');
}
await client.close();
