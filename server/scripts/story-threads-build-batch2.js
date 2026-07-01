import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { readFileSync } from 'node:fs';
const c = new MongoClient(process.env.MONGODB_URI); await c.connect();
const db = c.db('tm_suite');
const now = '2026-06-21T00:00:00Z';
const by = { type: 'st', id: 'dt1-thread-build' };
const norm = s => String(s||'').trim();
let links = [];
for (const b of ['A','B','C','D']) links = links.concat(JSON.parse(readFileSync(`server/scripts/_dt1-links-${b}.json`,'utf-8')));
const slugOf = t => String(t).replace(/^new:/,'');

// Batch 2: emergent threads play surfaced. `slugs` = source emergent slug(s) feeding each (some merge fragments).
const HEADERS = {
  'lhl-transport-front': { slugs:['lhl-transport-front'], title:'LHL Transport (Eve\'s Front)', type:'mystery', status:'active', mode:'emergent',
    logline:'Eve\'s company "LHL Transport" is a professionally-obscured front; Conrad is the watcher she detected.',
    truth:'EMERGENT: LHL Transport hides something not yet identified. Conrad\'s "Temptation of Eve" surveillance is the watcher Eve clocked during "Corporate Training". Feeds praxis-vacuum and aoa-vs-prince.', tstate:'emergent', related:['praxis-vacuum','aoa-vs-prince'] },
  'cazz-false-memory': { slugs:['cazz-false-memory'], title:'Cazz\'s False Memories', type:'personal', status:'active', mode:'authored',
    logline:'Cazz\'s Derangement manufactures memories; what he "learns" can be false.',
    truth:'CANON: Cazz (Malkovian) has a Derangement (personal lunacy, not supernatural insight). In DT1 he came away "certain" he learned something significant at the Academy and "productively understood Einar" - both false. His intelligence is unreliable at the source.', tstate:'fixed' },
  'carthian-recruiter': { slugs:['carthian-recruiter','alice-qr-tell'], title:'The Carthian Recruiter', type:'mystery', status:'active', mode:'emergent',
    logline:'A Carthian operator works the Court via QR codes and social engineering; Alice was approached and does not remember.',
    truth:'EMERGENT: a Carthian recruiter is working the Court broadly. Alice scanned a QR code in DT1 she does not remember deciding to scan, and believes "nothing odd happened" (misleading). Who the recruiter is, and what the QR did, is open.', tstate:'emergent', related:['alice-missing-sire'] },
  'conrad-grandsire-threat': { slugs:['conrad-grandsire-threat'], title:'Conrad and the Grandsire', type:'personal', status:'seeded', mode:'emergent',
    logline:'Conrad has marked his grandsire as a threat he would rather face unseen.',
    truth:'EMERGENT: Conrad (sire Dr Thomas Flanders) regards his grandsire as a threat and prefers to operate unseen against them. (His grandsire line runs toward Keeper per the canon.)', tstate:'emergent' },
  'kane-belfast-past': { slugs:['kane-belfast-past'], title:'Doc Kane\'s Belfast Past', type:'personal', status:'active', mode:'emergent',
    logline:'Doc Kane has a buried IRA / Belfast history; Conrad has begun digging it up.',
    truth:'EMERGENT: Doc (Margaret Kane), Irish ex-military night doctor, has a Belfast / IRA past. Conrad investigated it through Irish-mob contacts in DT1.', tstate:'emergent', related:['praxis-vacuum'] },
  'north-shore-night-market': { slugs:['north-shore-night-market'], title:'The North Shore Night Market', type:'mystery', status:'active', mode:'emergent',
    logline:'Activity on the North Shore that Carver and Charles both probed.',
    truth:'EMERGENT: a night-market / gathering on the North Shore drew the attention of Carver and Charles Mercer-Willows in DT1; its nature is undefined.', tstate:'emergent' },
  'sydney-nightlife-map': { slugs:['sydney-nightlife-map'], title:'Mapping Sydney Nightlife', type:'political', status:'active', mode:'emergent',
    logline:'Cyrus and Einar map a nightlife scene that does not yet have a Kindred shape.',
    truth:'EMERGENT: Cyrus and Einar (and others at the Manning Bar rave) are mapping Sydney\'s nightlife, which currently has no Kindred control - contested ground to claim.', tstate:'emergent', related:['cyrus-helena-shadow','contested-port'] },
  'dockyard-rats': { slugs:['dockyard-rats'], title:'The Dockyard Rats', type:'mystery', status:'active', mode:'emergent',
    logline:'A rat infestation at the Dockyards traces to Ivana and Charles, and is independently reported by Cyrus and Eve.',
    truth:'EMERGENT: a Dockyard rat infestation originates with Ivana + Charles (their "VILF" working), surfaced separately by Cyrus (Street contacts) and Eve (Street allies). A shared consequence rippling out from one action.', tstate:'emergent', related:['contested-port'] },
  'pre-placed-infrastructure': { slugs:['pre-placed-infrastructure'], title:'The Pre-Placed Infrastructure', type:'metaplot', status:'active', mode:'hybrid',
    logline:'Someone cultivated Sydney\'s mortal infrastructure before the court arrived.',
    truth:'CANON + emergent: the city was prepared over time by ghouls and retainers, with districts cultivated for predation before the PCs arrived (Tranche 1). Ludica and Yusuf both clocked deliberate pre-placed mortal infrastructure in DT1. Who placed it is open.', tstate:'provisional', related:['empty-city','crone-mortal-surge'] },
  'new-underworld-consolidator': { slugs:['new-underworld-consolidator'], title:'The Underworld Consolidator', type:'mystery', status:'active', mode:'emergent',
    logline:'A single well-funded operator is consolidating Sydney\'s underworld.',
    truth:'EMERGENT: Mac and Yusuf both detected one deliberate, well-funded operator building reach across the underworld. Identity undefined.', tstate:'emergent', related:['contested-port'] },
  'palleon-international': { slugs:['palleon-international','reed-justice-corporate'], title:'Palleon International (Reed\'s Machine)', type:'political', status:'active', mode:'emergent',
    logline:'Reed Justice\'s mortal corporate operation, and the Retainer he is Conditioning.',
    truth:'EMERGENT: Reed runs Palleon International as his mortal engine and is pursuing the Conditioning Devotion on a Retainer for permanent loyalty. Yusuf, Renee and Charlie Ballsack all probed him; whoever IDs the Retainer first gains a pressure point.', tstate:'emergent', related:['invictus-oath-machine'] },
  'red-night-radio': { slugs:['red-night-radio'], title:'Red Night Radio', type:'political', status:'active', mode:'emergent',
    logline:'Renee\'s broadcasts double as AOA messaging and apply quiet feeding pressure.',
    truth:'CANON: Renee Meyer runs Red Night Radio safety broadcasts; a side effect is slow feeding pressure on Kindred who rely on isolated or careless mortals. An AOA instrument.', tstate:'fixed', related:['aoa-vs-prince','crone-mortal-surge'] },
  'shore-vigilante': { slugs:['shore-vigilante','charlie-haven-trackers'], title:'The Shore Vigilante', type:'personal', status:'active', mode:'emergent',
    logline:'Charlie Ballsack works the Shore as a disguised "caped crusader," and plants trackers at Court.',
    truth:'EMERGENT: Charlie Ballsack (Invictus, Order of Sir Martin) used Familiar Stranger to operate as a costumed vigilante in the Shore, and planted physical trackers on Eve, Brandy and Einar at Court.', tstate:'emergent' },
  'kindred-library': { slugs:['carver-occult-library','kindred-church-history','occult-survey-academy'], title:'The Kindred Library', type:'political', status:'active', mode:'emergent',
    logline:'Carver wants to rebuild the Kindred library; he and Wan Yelong survey the Academy\'s occult holdings.',
    truth:'EMERGENT: Carver (Lance lore specialist) aims to restore the lost Kindred library and researches Kindred church history; Wan Yelong independently surveys/maps the Academy\'s occult library for acquisition. A quiet contest over knowledge.', tstate:'emergent', related:['empty-city'] },
};

let count = 0;
const promoted = new Set(Object.values(HEADERS).flatMap(h => h.slugs));
for (const [slug, h] of Object.entries(HEADERS)) {
  const recs = links.filter(l => (l.threads||[]).some(t => h.slugs.includes(slugOf(t))));
  const events = recs.map(l => ({ at:'DT1', title:l.title||'(action)', detail:[l.intent,l.outcome].filter(Boolean).join(' -> '),
    involved:[{type:'pc',name:norm(l.character)}, ...((l.involved||[]).map(n=>({type:'pc',name:norm(n)})))], source:'downtime' }));
  const knowledge = recs.flatMap(l => (l.knowledge||[]).filter(k=>k.believes).map(k => ({ claim:k.believes, truth_state:k.truth_state||'unknown', held_by:[{type:'pc',name:norm(l.character)}], origin:'downtime', since:'DT1' })));
  const pcNames = [...new Set(recs.map(l=>norm(l.character)))];
  const subj = [...new Set(recs.flatMap(l=>(l.involved||[]).map(norm)))].filter(n=>!pcNames.includes(n));
  const participants = [...pcNames.map(n=>({ref:{type:'pc',name:n},role:'actor'})), ...subj.map(n=>({ref:{type:'pc',name:n},role:'subject'}))];
  const doc = { title:h.title, slug, type:h.type, status:h.status, mode:h.mode, logline:h.logline,
    truth:{ summary:h.truth, facts:[{value:h.truth, state:h.tstate}], st_hidden:true }, knowledge, events, participants,
    related:h.related||[], source_window:'DT1 (Feb/Mar 2026)',
    note:'Emergent thread surfaced by Downtime 1 play. Status as of DT1; may have evolved through DT2-4 / Games 2-5.',
    created_by:by, created_at:now, updated_at:now };
  await db.collection('story_threads').updateOne({ slug }, { $set: doc }, { upsert:true });
  console.log(`${slug.padEnd(28)} ${h.status.padEnd(8)} | ${events.length} ev | ${knowledge.length} bel | ${participants.length} part`);
  count++;
}

// report folded singletons (documented as notes, not promoted to threads)
const allEmergent = [...new Set(links.flatMap(l => (l.threads||[]).filter(t=>t.startsWith('new:')).map(slugOf)))];
const folded = allEmergent.filter(s => !promoted.has(s));
console.log(`\nBatch 2: wrote ${count} threads. story_threads now: ${await db.collection('story_threads').countDocuments()}`);
console.log(`\nFOLDED as notes/elements (minor leads, character-detail, not promoted): ${folded.join(', ')}`);
await c.close();
