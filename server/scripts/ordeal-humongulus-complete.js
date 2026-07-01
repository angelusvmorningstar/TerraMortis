// Mark Humongulus's (now stock-correct) Rules ordeal complete and cascade the
// player-level XP to the player's characters, mirroring cascadePlayerOrdealXp in
// server/routes/ordeal-responses.js. Default DRY-RUN; pass --apply. Run from root.
import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';

const APPLY = process.argv.includes('--apply');
const RESP_ID = '6a1d61d2220a74385450165b';
const now = new Date().toISOString();

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db('tm_suite');

const resp = await db.collection('ordeal_responses').findOne({ _id: new ObjectId(RESP_ID) });
if (!resp) { console.error('response not found'); process.exit(1); }
const playerId = resp.player_id;
const player = await db.collection('players').findOne({ _id: playerId }, { projection: { character_ids: 1 } });
const charIds = player?.character_ids || [];

const chars = await db.collection('characters')
  .find({ _id: { $in: charIds } }, { projection: { name: 1, moniker: 1, ordeals: 1 } }).toArray();

console.log(`Response ${RESP_ID} | player ${playerId} | ${charIds.length} character(s)`);
console.log('Will set marking.status=complete, status=approved, xp_awarded=3, and rules ordeal complete=true on:');
for (const c of chars) {
  const has = (c.ordeals || []).some(o => /rule/i.test(o.name || ''));
  console.log(`  - ${c.moniker || c.name} (${has ? 'update existing rules entry' : 'push new rules entry'})`);
}

if (APPLY) {
  await db.collection('ordeal_responses').updateOne(
    { _id: new ObjectId(RESP_ID) },
    { $set: { status: 'approved', approved_at: now, updated_at: now, 'marking.status': 'complete', 'marking.marked_at': now, 'marking.xp_awarded': 3, 'marking.overall_feedback': 'Completed with stock answers (ST character).' } }
  );
  for (const charId of charIds) {
    const upd = await db.collection('characters').updateOne(
      { _id: charId, 'ordeals.name': 'rules' },
      { $set: { 'ordeals.$.complete': true, 'ordeals.$.approved_at': now } }
    );
    if (upd.matchedCount === 0) {
      await db.collection('characters').updateOne(
        { _id: charId },
        { $push: { ordeals: { name: 'rules', complete: true, approved_at: now } } }
      );
    }
  }
  console.log('\nAPPLIED: marked complete + cascaded rules-complete to the player\'s characters.');
} else {
  console.log('\nDRY-RUN. Re-run with --apply to write.');
}
await client.close();
