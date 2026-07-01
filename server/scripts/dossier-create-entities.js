import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { readFileSync } from 'node:fs';
const c = new MongoClient(process.env.MONGODB_URI); await c.connect();
const db = c.db('tm_suite');
const now = new Date().toISOString();
const by = { type: 'st', id: 'questionnaire-ingest' };
const chars = await db.collection('characters').find({}).project({ name: 1, moniker: 1 }).toArray();
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const STOP = new Set(['lord','lady','madam','miss','mr','mrs','inquisitor','preacher','don','sir','the','of','captain','dr']);
function matchChar(nm) {
  const toks = String(nm).replace(/["'’]/g, ' ').split(/[\s,]+/).map(t => norm(t)).filter(t => t && !STOP.has(t));
  let best = null, bestScore = 0;
  for (const ch of chars) {
    const hay = norm(ch.name) + ' ' + norm(ch.moniker);
    let score = 0;
    for (const t of toks) if (t.length > 2 && hay.includes(t)) score += t.length;
    if (norm(ch.moniker) && toks.includes(norm(ch.moniker))) score += 10;
    if (score > bestScore) { bestScore = score; best = ch; }
  }
  return bestScore >= 5 ? best : null; // stricter for PC resolution
}
const vague = s => !s || /\bpcs?\b|various|others|someone|several|\band\b|\bthe\b|\bor\b|etc|extant|talking about/i.test(s) || String(s).split(/\s+/).length > 5 || !/[A-Z]/.test(String(s));

const created = { npcs: 0, edges: 0, skipped: [] };
async function upsertNpc(name, desc, pcId) {
  let npc = await db.collection('npcs').findOne({ name, linked_character_ids: pcId });
  if (!npc) { const r = await db.collection('npcs').insertOne({ name, description: desc || '', status: 'active', linked_character_ids: [pcId], linked_cycle_id: null, notes: '', is_correspondent: false, created_at: now, updated_at: now }); npc = { _id: r.insertedId }; created.npcs++; }
  return String(npc._id);
}
async function edge(a, b, kind, disp, label) {
  const ex = await db.collection('relationships').findOne({ kind, $or: [{ 'a.id': a.id, 'b.id': b.id }, { 'a.id': b.id, 'b.id': a.id }] });
  if (ex) return;
  const doc = { a, b, kind, direction: kind === 'sire' ? 'a_to_b' : 'mutual', disposition: disp, st_hidden: false, status: 'active', created_by: by, history: [{ at: now, by, change: 'created (questionnaire ingest)' }], created_at: now, updated_at: now };
  if (kind === 'other' && label) doc.custom_label = label;
  await db.collection('relationships').insertOne(doc); created.edges++;
}

let recs = [];
for (const b of ['A', 'B', 'C', 'D']) recs = recs.concat(JSON.parse(readFileSync(`server/scripts/_facts-${b}.json`, 'utf-8')));
// validation-batch entities (not in the _facts files)
recs.push({ name: 'Carver', proposed_entities: { sire: 'Violet West' } });
recs.push({ name: 'Einar Solveig', proposed_entities: { sire: 'Captain Olga Andersson', pc_allies: ['Doc', 'Mac'], pc_coterie: ['René Meyer'] } });
recs.push({ name: 'Anichka', proposed_entities: { pc_allies: ['Keeper', 'René Meyer', 'Ivana'], pc_enemies: ['Cyrus'] } });

for (const rec of recs) {
  const ch = matchChar(rec.name);
  if (!ch) { created.skipped.push(`NO-CHAR:${rec.name}`); continue; }
  const pcId = String(ch._id);
  const lbl = ch.moniker || ch.name;
  const pe = rec.proposed_entities || {};
  if (pe.sire && !vague(pe.sire)) {
    const sid = await upsertNpc(pe.sire, `${lbl}'s sire.`, pcId);
    await edge({ type: 'npc', id: sid }, { type: 'pc', id: pcId }, 'sire', 'neutral');
    await db.collection('character_dossier').updateOne({ character_id: ch._id, 'facts.tag': 'sire' }, { $set: { 'facts.$.npc_id': sid } });
  }
  if (pe.brood_sibling && !vague(pe.brood_sibling)) {
    const bid = await upsertNpc(pe.brood_sibling, `${lbl}'s brood-sibling.`, pcId);
    await edge({ type: 'npc', id: bid }, { type: 'pc', id: pcId }, 'other', 'neutral', 'brood-sibling');
  }
  for (const fam of (pe.family || [])) {
    if (vague(fam)) { created.skipped.push(`${lbl} family:${String(fam).slice(0,30)}`); continue; }
    const fid = await upsertNpc(fam, `${lbl}'s family.`, pcId);
    await edge({ type: 'npc', id: fid }, { type: 'pc', id: pcId }, 'family', 'positive');
  }
  for (const [key, kind, disp] of [['pc_allies', 'ally', 'positive'], ['pc_coterie', 'coterie', 'positive'], ['pc_enemies', 'rival', 'negative']]) {
    for (const nm of (pe[key] || [])) {
      if (vague(nm)) { created.skipped.push(`${lbl} ${key}:${String(nm).slice(0,30)}`); continue; }
      const other = matchChar(nm);
      if (other && String(other._id) !== pcId) await edge({ type: 'pc', id: pcId }, { type: 'pc', id: String(other._id) }, kind, disp);
      else { const nid = await upsertNpc(nm, `${lbl}'s ${kind}.`, pcId); await edge({ type: 'pc', id: pcId }, { type: 'npc', id: nid }, kind, disp); }
    }
  }
}
console.log(`Created ${created.npcs} NPCs, ${created.edges} relationship edges.`);
console.log(`Skipped vague/unresolved (${created.skipped.length}):\n  ${created.skipped.join('\n  ')}`);
await c.close();
