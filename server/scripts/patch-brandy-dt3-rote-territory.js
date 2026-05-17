/**
 * One-shot: correct Brandy LaRoux's DT3 rote territory grid.
 *
 * Root cause: player submitted feeding_territories_rote with all entries set to 'none',
 * but her main feeding_territories correctly declares the_north_shore as 'feeding_rights'.
 * This patch updates her rote grid to match, producing count=2 → OO in the feeding matrix.
 *
 * Submission: 69ff11e7de8056d135a7557b (Brandy LaRoux, DT3)
 *
 * Run from project root:
 *   node server/scripts/patch-brandy-dt3-rote-territory.js
 */

import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';

const SUBMISSION_ID = '69ff11e7de8056d135a7557b';
const CHAR_NAME     = 'Brandy LaRoux';

const client = new MongoClient(process.env.MONGODB_URI);

try {
  await client.connect();
  const db   = client.db('tm_suite');
  const coll = db.collection('downtime_submissions');

  const before = await coll.findOne(
    { _id: new ObjectId(SUBMISSION_ID) },
    { projection: { character_name: 1, 'responses.feeding_territories_rote': 1 } }
  );

  if (!before) {
    console.error(`ERROR: submission ${SUBMISSION_ID} not found — aborting.`);
    process.exit(1);
  }

  if (before.character_name !== CHAR_NAME) {
    console.error(`ABORT: character_name is "${before.character_name}", expected "${CHAR_NAME}".`);
    process.exit(1);
  }

  const currentRaw = before.responses?.feeding_territories_rote || '{}';
  const current = JSON.parse(currentRaw);
  console.log('Before rote grid:', JSON.stringify(current, null, 2));

  if (current.the_north_shore === 'feeding_rights') {
    console.log('Already correct — no write needed.');
    process.exit(0);
  }

  const patched = { ...current, the_north_shore: 'feeding_rights' };
  const result = await coll.updateOne(
    { _id: new ObjectId(SUBMISSION_ID) },
    { $set: { 'responses.feeding_territories_rote': JSON.stringify(patched) } }
  );

  console.log(`Updated ${result.modifiedCount} document(s).`);

  const after = await coll.findOne(
    { _id: new ObjectId(SUBMISSION_ID) },
    { projection: { 'responses.feeding_territories_rote': 1 } }
  );
  console.log('After rote grid:', JSON.parse(after.responses.feeding_territories_rote));

} finally {
  await client.close();
}
