// Set René St. Dominique's rules ordeal to NOT complete (it was a 34/55 partial
// erroneously flagged complete). Default DRY-RUN; pass --apply to write.
// Reports player-cascade context first. Run from repo root.
import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';

const APPLY = process.argv.includes('--apply');
const CHAR_ID = '69d73ea49162ece35897a496'; // Primogen René St. Dominique
const ORDEAL = 'rules';

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db('tm_suite');
const chars = db.collection('characters');

const c = await chars.findOne({ _id: new ObjectId(CHAR_ID) }, { projection: { name: 1, moniker: 1, ordeals: 1 } });
if (!c) { console.error('character not found'); process.exit(1); }
const entry = (c.ordeals || []).find(o => o.name === ORDEAL);
console.log(`Character: ${c.moniker || c.name}`);
console.log(`Current rules ordeal entry: ${JSON.stringify(entry) || '(none)'}`);

// Player-cascade context: rules is player-level, so check whether the owning
// player has OTHER characters also flagged rules-complete (which this does not touch).
const player = await db.collection('players').findOne({ character_ids: new ObjectId(CHAR_ID) }, { projection: { character_ids: 1 } });
if (player) {
  const sibs = await chars.find(
    { _id: { $in: player.character_ids.filter(id => String(id) !== CHAR_ID) }, 'ordeals.name': ORDEAL },
    { projection: { name: 1, moniker: 1, ordeals: 1 } }
  ).toArray();
  const sibComplete = sibs.filter(s => (s.ordeals || []).some(o => o.name === ORDEAL && o.complete));
  console.log(`Owning player has ${player.character_ids.length} character(s). Other characters flagged rules-complete: ${sibComplete.map(s => s.moniker || s.name).join(', ') || 'none'}`);
}

if (!entry) { console.log('Nothing to change.'); process.exit(0); }
if (entry.complete !== true) { console.log('Already not complete.'); process.exit(0); }

if (APPLY) {
  await chars.updateOne({ _id: new ObjectId(CHAR_ID), 'ordeals.name': ORDEAL }, { $set: { 'ordeals.$.complete': false } });
  console.log('APPLIED: rules ordeal complete -> false. (Earned XP is derived from completed ordeals, so it drops by 3 at render; no stored XP field to touch.)');
} else {
  console.log('DRY-RUN: would set rules ordeal complete -> false. Re-run with --apply.');
}
await client.close();
