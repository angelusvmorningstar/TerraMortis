// player_id backfill for Rules ordeal_submissions. Default DRY-RUN; pass --apply
// to write. Only fills player_id where it is currently blank AND the character
// resolves to exactly one owning player (via players.character_ids reverse
// lookup). See ordeal-playerid-backfill-dryrun.js for the rationale.
// Run from repo root:  node server/scripts/ordeal-playerid-backfill.js [--apply]
import 'dotenv/config';
import { MongoClient } from 'mongodb';

const APPLY = process.argv.includes('--apply');
const uri = process.env.MONGODB_URI;
if (!uri) { console.error('MONGODB_URI not set'); process.exit(1); }
const client = new MongoClient(uri);
await client.connect();
const db = client.db('tm_suite');

const chars = await db.collection('characters')
  .find({}, { projection: { name: 1, moniker: 1, honorific: 1 } }).toArray();
const dispName = (() => {
  const m = new Map(chars.map(c => [String(c._id), [c.honorific, c.moniker || c.name].filter(Boolean).join(' ')]));
  return id => m.get(String(id)) || '(unknown)';
})();

const players = await db.collection('players')
  .find({}, { projection: { character_ids: 1 } }).toArray();
const charToPlayers = new Map();
for (const p of players) for (const cid of (p.character_ids || [])) {
  const k = String(cid);
  if (!charToPlayers.has(k)) charToPlayers.set(k, []);
  charToPlayers.get(k).push(p._id);
}

const subs = await db.collection('ordeal_submissions')
  .find({ ordeal_type: 'rules_mastery' })
  .project({ character_id: 1, player_id: 1 }).toArray();

let applied = 0, skipped = 0;
for (const s of subs) {
  if (s.player_id) { console.log(`skip  ${dispName(s.character_id)} — already has player_id`); skipped++; continue; }
  const owners = charToPlayers.get(String(s.character_id)) || [];
  if (owners.length !== 1) { console.log(`SKIP  ${dispName(s.character_id)} — ${owners.length} owners (ambiguous)`); skipped++; continue; }
  const playerId = owners[0];
  if (APPLY) {
    await db.collection('ordeal_submissions').updateOne({ _id: s._id }, { $set: { player_id: playerId } });
    console.log(`set   ${dispName(s.character_id)} -> player_id ${String(playerId)}`);
  } else {
    console.log(`would ${dispName(s.character_id)} -> player_id ${String(playerId)}`);
  }
  applied++;
}

console.log(`\n${APPLY ? 'APPLIED' : 'DRY-RUN'}: ${applied} ${APPLY ? 'written' : 'to write'}, ${skipped} skipped.`);
if (!APPLY) console.log('Re-run with --apply to write.');
await client.close();
