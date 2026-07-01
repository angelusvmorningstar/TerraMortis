/**
 * inspect-577-drift-traits.js — READ ONLY. (issue #577)
 * Classify the 3 cp/xp-vs-dots drift traits: is the extra dot an inherent dot
 * with missing provenance, or a bonus dot misfiled into `dots`?
 * Dumps the affected skill object (dots/cp/xp/bonus) plus any merit that could
 * grant a skill dot (Professional Training, etc.) for context.
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
    const c = await db.collection('characters').findOne({ name: t.name }, { projection: { name: 1, skills: 1, merits: 1, _pt: 1 } });
    if (!c) { console.log(`\n${t.name}: NOT FOUND`); continue; }
    const so = (c.skills || {})[t.skill] || {};
    console.log('\n' + '='.repeat(70));
    console.log(`${t.name} — ${t.skill}`);
    console.log(`  skill obj: ${JSON.stringify(so)}`);
    const expectedInherent = (so.cp || 0) + Math.floor((so.xp || 0) / 2);
    console.log(`  inherent expected from cp/xp = ${expectedInherent}; stored dots = ${so.dots}; bonus field = ${so.bonus || 0}`);
    console.log(`  -> extra over cp/xp = ${(so.dots || 0) - expectedInherent}`);
    const meritNames = (c.merits || []).map(m => `${m.name}${m.rating ? ' ' + m.rating : ''}${m.asset_skills ? ' assets=[' + (m.asset_skills || []).join(',') + ']' : ''}`);
    const ptish = meritNames.filter(n => /Professional|Training|Common Sense|Trained|Skill/i.test(n));
    console.log(`  merits possibly granting skill dots: ${ptish.length ? ptish.join(' | ') : '(none obvious)'}`);
  }
  await client.close();
}
main().catch(e => { console.error(e); process.exit(1); });
