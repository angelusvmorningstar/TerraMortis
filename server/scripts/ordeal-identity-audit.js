// Ordeal identity-divergence audit — READ-ONLY. Shows how each Rules ordeal
// links to player/character, and where character_id is blank or unresolved.
// Run from repo root:  node server/scripts/ordeal-identity-audit.js
import 'dotenv/config';
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
if (!uri) { console.error('MONGODB_URI not set'); process.exit(1); }
const client = new MongoClient(uri);
await client.connect();
const db = client.db('tm_suite');

const chars = await db.collection('characters')
  .find({}, { projection: { name: 1, moniker: 1, honorific: 1, player_id: 1 } }).toArray();
const charById = new Map(chars.map(c => [String(c._id), c]));
const charByName = new Map(); // lowercased name/moniker -> id
for (const c of chars) {
  for (const n of [c.name, c.moniker]) if (n) charByName.set(String(n).toLowerCase().trim(), String(c._id));
}
const dispName = id => {
  const c = charById.get(String(id));
  return c ? [c.honorific, c.moniker || c.name].filter(Boolean).join(' ') : null;
};

const players = await db.collection('players')
  .find({}, { projection: { character_ids: 1, name: 1, display_name: 1, discord_username: 1, username: 1 } }).toArray();
const playerById = new Map(players.map(p => [String(p._id), p]));

const nameFromResponses = (responses) => {
  if (!responses) return null;
  if (Array.isArray(responses)) {
    const hit = responses.find(x => /name/i.test(x.question || ''));
    return hit ? hit.answer : null;
  }
  for (const k of Object.keys(responses)) if (/name/i.test(k)) return responses[k];
  return null;
};

const resolveByName = (nm) => nm ? (charByName.get(String(nm).toLowerCase().trim()) || null) : null;

const out = { characters_total: chars.length, players_total: players.length };

const resp = await db.collection('ordeal_responses')
  .find({ $or: [{ type: 'rules' }, { ordeal_type: 'rules' }] }).toArray();
out.ordeal_responses = resp.map(r => {
  const p = r.player_id ? playerById.get(String(r.player_id)) : null;
  const nm = nameFromResponses(r.responses);
  return {
    id: String(r._id),
    status: r.status,
    player_id: r.player_id ? String(r.player_id) : null,
    player_found: !!p,
    player_character_ids: p?.character_ids?.map(String) || null,
    character_id: r.character_id ? String(r.character_id) : '(blank)',
    character_id_resolves_to: r.character_id ? dispName(r.character_id) : null,
    name_in_responses: nm,
    name_resolves_to_char: dispName(resolveByName(nm)),
    fixable_via_player: p?.character_ids?.[0] ? dispName(p.character_ids[0]) : null,
  };
});

const subs = await db.collection('ordeal_submissions')
  .find({ ordeal_type: 'rules_mastery' }).toArray();
out.ordeal_submissions = subs.map(s => {
  const nm = nameFromResponses(s.responses);
  return {
    id: String(s._id),
    player_id: s.player_id ? String(s.player_id) : '(blank)',
    character_id: s.character_id ? String(s.character_id) : '(blank)',
    character_id_resolves_to: s.character_id ? dispName(s.character_id) : null,
    character_name_field: s.character_name || null,
    name_in_responses: nm,
    name_resolves_to_char: dispName(resolveByName(nm)),
  };
});

// Bidirectionality check: do characters carry a player_id back-link?
out.characters_with_player_id = chars.filter(c => c.player_id).length;

console.log(JSON.stringify(out, null, 2));
await client.close();
