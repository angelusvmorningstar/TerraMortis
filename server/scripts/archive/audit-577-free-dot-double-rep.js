/**
 * audit-577-free-dot-double-rep.js — READ ONLY. (issue #577, re-scoped)
 *
 * The real issue: a materialized `free` dot on a SKILL (folded into `dots`)
 * can overlap the RDE rule-engine's ephemeral grant for the SAME dot, so the
 * dot is represented twice. The clearest case: PT dot-4 free skill dot stored
 * as `free:1` AND the skill set as the PT `dot4_skill` (-> _pt_dot4_bonus_skills).
 *
 * Categories per skill with free > 0:
 *   D (double) — skill is a PT.dot4_skill on this char -> dot counted in `dots`
 *                AND re-granted ephemerally (sheet renders filled + hollow = +1 too many)
 *   O (orphan) — free > 0 but no PT dot4_skill match -> materialized free dot of
 *                unknown rule provenance (needs a per-trait call)
 *
 * Also dumps attributes with free > 2 (clan attr legitimately carries free:2 as
 * the base clan dot; anything beyond that is suspect).
 */
import { MongoClient } from 'mongodb';
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGO_URI) { console.error('MONGODB_URI not set'); process.exit(1); }
const DB_NAME = process.env.MONGODB_DB || 'tm_suite';

async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  const chars = await db.collection('characters')
    .find({}, { projection: { name: 1, retired: 1, skills: 1, attributes: 1, merits: 1 } }).toArray();

  const doubleFolded = [], staleMarker = [], orphanFolded = [], attrFree = [];
  for (const c of chars) {
    const pts = (c.merits || []).filter(m => m.name === 'Professional Training');
    const dot4Skills = new Set(pts.map(p => p.dot4_skill).filter(Boolean));
    for (const [s, so] of Object.entries(c.skills || {})) {
      if (!so || !(so.free > 0)) continue;
      const expectInherent = (so.cp || 0) + Math.floor((so.xp || 0) / 2);
      const folded = (so.dots || 0) > expectInherent; // free dot baked into dots?
      const hasRule = dot4Skills.has(s);
      const rec = `${c.retired ? '[ret] ' : ''}${c.name} — ${s}: dots=${so.dots} cp=${so.cp||0} xp=${so.xp||0} free=${so.free} | folded=${folded} ruleGrant(PT dot4)=${hasRule}`;
      if (folded && hasRule) doubleFolded.push(rec);        // renders dots(+free) filled AND ptBn hollow = +1 too many
      else if (folded && !hasRule) orphanFolded.push(rec);  // free dot in dots, no rule source -> provenance unknown
      else staleMarker.push(rec);                           // free>0 but NOT in dots (dots=cp+xp): harmless stale marker
    }
    for (const [a, ao] of Object.entries(c.attributes || {})) {
      if (ao && (ao.free || 0) > 2) attrFree.push(`${c.name} — ${a}: dots=${ao.dots} free=${ao.free}`);
    }
  }

  console.log('='.repeat(95));
  console.log(`FREE-DOT DOUBLE-REPRESENTATION AUDIT — ${chars.length} characters`);
  console.log('='.repeat(95));
  console.log(`\n[D] TRUE DOUBLE-COUNT (free folded INTO dots AND skill is PT dot4_skill -> renders +1 too many): ${doubleFolded.length}`);
  doubleFolded.forEach(r => console.log('   ' + r));
  console.log(`\n[O] ORPHAN folded free (free in dots, no PT dot4 rule source): ${orphanFolded.length}`);
  orphanFolded.forEach(r => console.log('   ' + r));
  console.log(`\n[S] STALE marker (free>0 but NOT folded into dots; renders correctly): ${staleMarker.length}`);
  staleMarker.forEach(r => console.log('   ' + r));
  console.log(`\n[A] Attributes with free > 2 (beyond clan base dot): ${attrFree.length}`);
  attrFree.forEach(r => console.log('   ' + r));
  console.log('\n' + '='.repeat(95));
  await client.close();
}
main().catch(e => { console.error(e); process.exit(1); });
