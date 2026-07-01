import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { readFileSync } from 'node:fs';
const c = new MongoClient(process.env.MONGODB_URI); await c.connect();
const db = c.db('tm_suite');
const now = new Date().toISOString();
const chars = await db.collection('characters').find({}).project({ name:1, moniker:1, touchstones:1 }).toArray();
const norm = s => String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const STOP = new Set(['lord','lady','madam','miss','mr','mrs','inquisitor','preacher','don','sir','the','of','captain']);
function matchChar(nm){
  const toks = String(nm).replace(/["'’]/g,' ').split(/[\s,]+/).map(t=>norm(t)).filter(t=>t&&!STOP.has(t));
  let best=null, bestScore=0;
  for (const ch of chars){
    const hay = norm(ch.name)+' '+norm(ch.moniker);
    let score=0;
    for (const t of toks) if (t.length>2 && hay.includes(t)) score+=t.length;
    if (norm(ch.moniker) && toks.includes(norm(ch.moniker))) score+=10;
    if (score>bestScore){ bestScore=score; best=ch; }
  }
  return bestScore>=3?best:null;
}
const TAGMAP = { clan_goal:'aspiration', clan_goals:'aspiration', covenant_goal:'aspiration' };
let all=[];
for (const b of ['A','B','C','D']) all=all.concat(JSON.parse(readFileSync(`server/scripts/_facts-${b}.json`,'utf-8')));

let wrote=0, unmatched=[], skippedExisting=[];
const EXISTING = new Set((await db.collection('character_dossier').find({}).project({character_id:1}).toArray()).map(d=>String(d.character_id)));
for (const rec of all){
  const ch = matchChar(rec.name);
  if (!ch){ unmatched.push(rec.name); continue; }
  if (EXISTING.has(String(ch._id))){ skippedExisting.push(ch.moniker||ch.name); continue; } // don't clobber merge-cases
  const sheetTs = JSON.stringify((ch.touchstones||[]).map(t=>t.desc||t.name).filter(Boolean));
  const facts = (rec.facts||[]).map(f=>{
    const g = { ...f, source:'excel' };
    if (TAGMAP[g.tag]) g.tag = TAGMAP[g.tag];
    if (g.tag==='secret'){ if (g.compromised==null) g.compromised=false; g.st_hidden=true; }
    if (g.tag==='boon'||g.tag==='debt'){ g.st_hidden=true; if(!g.status) g.status='outstanding'; }
    if (g.tag==='touchstone'){ g.sheet_field='touchstones'; g.sheet_value=sheetTs; if(g.clash==null) g.clash=false; }
    return g;
  });
  await db.collection('character_dossier').updateOne({ character_id: ch._id }, { $set:{ character_id: ch._id, facts, source:'excel', updated_at: now } }, { upsert:true });
  wrote++;
}
console.log(`Wrote ${wrote} dossiers from the Excel batch.`);
if (skippedExisting.length) console.log(`Skipped (already have a dossier - would need merge): ${skippedExisting.join(', ')}`);
if (unmatched.length) console.log(`UNMATCHED (no character / not written): ${unmatched.join(' | ')}`);

// total dossier coverage now
const total = await db.collection('character_dossier').countDocuments();
console.log(`\ncharacter_dossier now covers ${total} characters.`);
await c.close();
