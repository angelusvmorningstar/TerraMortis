// STM-14b curated migration. READ-ONLY unless --live passed.
// Brandy LaRoux: st_mod Presence +2 "Amourous Fire"; zero base bonus.
// Keeper:        st_mod Presence +5 "Amourous Fire"; zero base bonus.
// Maibh Urquhart: zero base Presence bonus only (no mod).
// Targeted $set only; st_mod + audit inserts match server/routes/st_mods.js shapes.
import { MongoClient, ObjectId } from 'mongodb';
import { readFileSync } from 'fs';

const LIVE = process.argv.includes('--live');
const envTxt = readFileSync(new URL('./.env', import.meta.url), 'utf8');
const uri = (envTxt.match(/^MONGODB_URI=(.+)$/m) || [])[1]?.trim();
const dbName = (envTxt.match(/^MONGODB_DB=(.+)$/m) || [])[1]?.trim() || 'tm_suite';

const PLAN = [
  { match: 'Brandy LaRoux', delta: 2, mod: true },
  { match: 'Keeper',        delta: 5, mod: true },
  { match: 'Màibh Urquhart', delta: 0, mod: false },
];
const STAT_PATH = 'attributes.Presence.bonus';
const REASON = 'Amourous Fire';
const ACTOR = { discord_id: 'system-migration', discord_name: 'STM-14b migration' };
const nowIso = () => new Date().toISOString();

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);
const chars = db.collection('characters');
const mods = db.collection('st_mods');
const audit = db.collection('st_mod_audit');

console.log(`MODE: ${LIVE ? 'LIVE WRITE' : 'DRY-RUN (no writes)'}\n`);
for (const p of PLAN) {
  const c = await chars.findOne({ $or: [{ name: p.match }, { moniker: p.match }] });
  if (!c) { console.log(`!! NOT FOUND: ${p.match}`); continue; }
  const curBonus = c.attributes?.Presence?.bonus || 0;
  console.log(`${p.match} (${c._id})  current Presence.bonus = ${curBonus}`);

  if (p.mod) {
    const existing = await mods.findOne({ character_id: String(c._id), stat_path: STAT_PATH, reason: REASON });
    if (existing) {
      console.log(`   st_mod already exists (${existing._id}) delta=${existing.delta} — skip insert`);
    } else {
      console.log(`   -> CREATE st_mod ${STAT_PATH} +${p.delta} "${REASON}" (active, show_reason_to_player=false)`);
      if (LIVE) {
        const at = nowIso();
        const modDoc = { character_id: String(c._id), stat_path: STAT_PATH, delta: p.delta, reason: REASON,
          show_reason_to_player: false, active: true, created_by: ACTOR, created_at: at };
        const r = await mods.insertOne(modDoc);
        await audit.insertOne({ st_mod_id: r.insertedId, character_id: String(c._id), stat_path: STAT_PATH,
          delta: p.delta, reason: REASON, event: 'created', by: ACTOR, at });
        console.log(`      inserted st_mod ${r.insertedId} + audit event`);
      }
    }
  }

  if (curBonus === 0) {
    console.log(`   base bonus already 0 — skip zero`);
  } else {
    console.log(`   -> ZERO base attributes.Presence.bonus (${curBonus} -> 0)`);
    if (LIVE) {
      await chars.updateOne({ _id: c._id }, { $set: { 'attributes.Presence.bonus': 0 } });
      console.log(`      zeroed`);
    }
  }
  console.log('');
}
await client.close();
console.log(LIVE ? 'LIVE migration complete.' : 'Dry-run complete. Re-run with --live to apply.');
