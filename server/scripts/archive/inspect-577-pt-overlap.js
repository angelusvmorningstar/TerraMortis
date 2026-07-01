/**
 * inspect-577-pt-overlap.js — READ ONLY. (issue #577)
 * For the 3 traits with dots = cp + free, determine whether the SAME skill is
 * also the PT dot4_skill (which would add an ephemeral _pt_dot4_bonus_skills
 * hollow dot on top of the materialized `free` dot — a double-count).
 */
import { MongoClient } from 'mongodb';
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGO_URI) { console.error('MONGODB_URI not set'); process.exit(1); }
const DB_NAME = process.env.MONGODB_DB || 'tm_suite';
const TARGETS = [
  { name: 'Edna Judge', skill: 'Intimidation' },
  { name: 'Ludica Lachramore', skill: 'Intimidation' },
  { name: 'Macheath', skill: 'Brawl' },
];
async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  for (const t of TARGETS) {
    const c = await db.collection('characters').findOne({ name: t.name }, { projection: { name: 1, skills: 1, merits: 1 } });
    if (!c) { console.log(`\n${t.name}: NOT FOUND`); continue; }
    const so = (c.skills || {})[t.skill] || {};
    const pts = (c.merits || []).filter(m => m.name === 'Professional Training');
    console.log('\n' + '='.repeat(70));
    console.log(`${t.name} — ${t.skill}: dots=${so.dots} cp=${so.cp||0} xp=${so.xp||0} free=${so.free||0} bonus=${so.bonus||0}`);
    if (!pts.length) { console.log('  PT merit: NONE -> free dot is from a non-PT source'); continue; }
    for (const pt of pts) {
      console.log(`  PT: rating=${pt.rating} cp=${pt.cp||0} xp=${pt.xp||0} free=${pt.free||0} dot4_skill=${JSON.stringify(pt.dot4_skill)} asset_skills=${JSON.stringify(pt.asset_skills)}`);
      const isDot4 = pt.dot4_skill === t.skill;
      const isAsset = (pt.asset_skills || []).includes(t.skill);
      console.log(`    -> ${t.skill} is dot4_skill? ${isDot4}   is asset_skill (9-again only)? ${isAsset}`);
      if (isDot4) console.log(`    *** DOUBLE-COUNT RISK: skill has free=${so.free||0} in dots AND is the PT dot4_skill (would add ephemeral ptBn hollow +1) ***`);
    }
  }
  await client.close();
}
main().catch(e => { console.error(e); process.exit(1); });
