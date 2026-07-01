/**
 * One-shot: relink orphaned DT2 Keeper submission to the current Keeper character.
 *
 * Orphan:   submission 69da37d4cc5483a3c77027ad
 *           character_id "69d73ea49162ece35897a48e" (deleted "Buggy Keeper")
 * Target:   character 69f98167ed740b3098dc56ff (Henry St. John / moniker "Keeper")
 *
 * Run from project root:
 *   node server/scripts/relink-keeper-dt2-submission.js
 */

import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';

const SUBMISSION_ID  = '69da37d4cc5483a3c77027ad';
const OLD_CHAR_ID    = '69d73ea49162ece35897a48e';
const NEW_CHAR_ID    = '69f98167ed740b3098dc56ff';

const client = new MongoClient(process.env.MONGODB_URI);

try {
  await client.connect();
  const db   = client.db('tm_suite');
  const coll = db.collection('downtime_submissions');

  // Safety: confirm the document still has the old character_id before writing.
  const before = await coll.findOne(
    { _id: new ObjectId(SUBMISSION_ID) },
    { projection: { character_id: 1, character_name: 1, cycle_id: 1 } }
  );

  if (!before) {
    console.error(`ERROR: submission ${SUBMISSION_ID} not found — aborting.`);
    process.exit(1);
  }

  if (before.character_id !== OLD_CHAR_ID) {
    console.error(`ABORT: character_id is "${before.character_id}", expected "${OLD_CHAR_ID}".`);
    console.error('Submission may have already been re-linked or changed. No write performed.');
    process.exit(1);
  }

  console.log('Before:', JSON.stringify(before, null, 2));

  const result = await coll.updateOne(
    { _id: new ObjectId(SUBMISSION_ID) },
    { $set: { character_id: NEW_CHAR_ID } }
  );

  console.log(`Updated ${result.modifiedCount} document(s).`);

  const after = await coll.findOne(
    { _id: new ObjectId(SUBMISSION_ID) },
    { projection: { character_id: 1, character_name: 1 } }
  );
  console.log('After:', JSON.stringify(after, null, 2));

} finally {
  await client.close();
}
