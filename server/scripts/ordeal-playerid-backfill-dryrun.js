// player_id backfill DRY-RUN for Rules ordeal_submissions — READ-ONLY.
// ordeal_submissions are character-keyed with blank player_id; Rules is a
// player-level ordeal, so the cascade needs player_id. Reverse-lookup each
// submission's character via players.character_ids. Writes nothing.
// Run from repo root:  node server/scripts/ordeal-playerid-backfill-dryrun.js
import 'dotenv/config';
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
if (!uri) { console.error('MONGODB_URI not set'); process.exit(1); }
const client = new MongoClient(uri);
await client.connect();
const db = client.db('tm_suite');

const chars = await db.collection('characters')
  .find({}, { projection: { name: 1, moniker: 1, honorific: 1 } }).toArray();
const charById = new Map(chars.map(c => [String(c._id), c]));
const dispName = id => {
  const c = charById.get(String(id));
  return c ? [c.honorific, c.moniker || c.name].filter(Boolean).join(' ') : '(unknown char)';
};

const players = await db.collection('players')
  .find({}, { projection: { character_ids: 1, name: 1, display_name: 1, discord_username: 1, username: 1 } }).toArray();
const plabel = p => p.display_name || p.username || p.discord_username || p.name || String(p._id);

// reverse index: character_id -> [players that own it]
const charToPlayers = new Map();
for (const p of players) for (const cid of (p.character_ids || [])) {
  const k = String(cid);
  if (!charToPlayers.has(k)) charToPlayers.set(k, []);
  charToPlayers.get(k).push(p);
}

const subs = await db.collection('ordeal_submissions')
  .find({ ordeal_type: 'rules_mastery' })
  .project({ character_id: 1, player_id: 1, character_name: 1 }).toArray();

const rows = subs.map(s => {
  const owners = charToPlayers.get(String(s.character_id)) || [];
  return {
    sub_id: String(s._id),
    character: dispName(s.character_id),
    current_player_id: s.player_id ? String(s.player_id) : '(blank)',
    resolved_players: owners.map(p => ({ player_id: String(p._id), label: plabel(p) })),
    owner_count: owners.length,
  };
});

// flag any character that maps to 0 or >1 players (ambiguous), and any player
// that owns more than one backlog submission (player-level => redundant grading)
const ambiguous = rows.filter(r => r.owner_count !== 1);
const byPlayer = {};
for (const r of rows) for (const p of r.resolved_players) (byPlayer[p.player_id] ||= []).push(r.character);
const shared_players = Object.entries(byPlayer).filter(([, v]) => v.length > 1)
  .map(([pid, cs]) => ({ player_id: pid, characters: cs }));

console.log(JSON.stringify({
  total_submissions: rows.length,
  clean_single_owner: rows.length - ambiguous.length,
  rows,
  ambiguous,
  shared_players_across_backlog: shared_players,
}, null, 2));
await client.close();
