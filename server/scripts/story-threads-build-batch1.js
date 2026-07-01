import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { readFileSync } from 'node:fs';
const c = new MongoClient(process.env.MONGODB_URI); await c.connect();
const db = c.db('tm_suite');
const now = '2026-06-21T00:00:00Z';
const by = { type: 'st', id: 'dt1-thread-build' };

let links = [];
for (const b of ['A','B','C','D']) links = links.concat(JSON.parse(readFileSync(`server/scripts/_dt1-links-${b}.json`,'utf-8')));

// canonical character names -> normalise for participant refs
const norm = s => String(s||'').trim();

// --- Batch 1 headers (authored). truth grounded in canon; emergent where play hasn't settled it. ---
const HEADERS = {
  'crone-mortal-surge': { title:'The Crone Mortal Surge', type:'political', status:'active', mode:'authored',
    logline:'The Circle of the Crone has saturated Sydney\'s mortal world faster than any covenant.',
    truth:'CANON: the Crone built grassroots mortal infrastructure (mystery cults, wellness, occult, community groups) ahead of everyone; they backed Eve\'s Praxis and she gave them room to grow in return.', tstate:'fixed' },
  'contested-port': { title:'The Contested Port', type:'conflict', status:'active', mode:'hybrid',
    logline:'Three covenants move on the Dockyards and none has secured it.',
    truth:'Carthian street networks, Invictus money and a Lance presence near the naval base all contest the Port; a cold war as of DT1.', tstate:'provisional' },
  'aoa-vs-prince': { title:'AOA vs the Prince', type:'political', status:'active', mode:'authored',
    logline:'Renee Meyer\'s AOA recruited the very Prince now building the mortal entanglements AOA exists to destroy.',
    truth:'CANON: the AOA (a Carthian extremist faction, London) opposes Kindred mortal entanglement; Renee is its Sydney agent and converted Eve; Eve is now building exactly that. A slow-burn contradiction. Doc is told to watch Renee.', tstate:'fixed' },
  'empty-city': { title:'The Empty City (the Dead Zone)', type:'metaplot', status:'active', mode:'authored',
    logline:'Something erased every Kindred in Australia ~25 years ago; the city remembers in echoes.',
    truth:'CANON: the Dead Zone eradicated all Blood Potency across Australia (pre-2000); the barrier now admits only BP 1-2. Treated as solved/unfixable - players are not meant to undo it. Alice has the only pre-Sydney history; Keeper is a Mnemosyne in a city with no memory.', tstate:'fixed' },
  'jack-moulding-room': { title:'Jack and the Moulding Room', type:'mystery', status:'active', mode:'authored',
    logline:'"Slick" the sleazy filmmaker is a Moulding Room operative running intelligence ops.',
    truth:'CANON: Jack Fallow is a Moulding Room operative and a significant intelligence threat; the bottom-feeder presentation is cover.', tstate:'fixed' },
  'first-hunt-callan-park': { title:'The First Hunt and Callan Park', type:'mystery', status:'resolved', mode:'authored',
    logline:'A Crone group hunt permanently consecrated Callan Park; something unsettled lingers.',
    truth:'CANON: Anichka (Cruac Rain) + Keeper (Predator\'s Taint) ran a group Crone hunt. Callan Park (old asylum, former Crone HQ) is now permanently consecrated Crone ground. A deliberate fog/rain drove mortals indoors across several territories for one night (also hit Redfern werewolf turf - ST-only). Afterward Anichka senses something unsettled in the city\'s spiritual texture that is not hers.', tstate:'fixed' },
  'invictus-oath-machine': { title:'The Invictus Oath-Machine', type:'political', status:'active', mode:'authored',
    logline:'The First Estate formalises power through oaths under Notary Rene St. Dominique.',
    truth:'CANON: Rene St. Dominique (Notary, presides over Invictus Oaths) is building the Invictus as the institution through which all formal business flows, while everyone else watches the throne.', tstate:'fixed' },
  'yusuf-brandy-lineage': { title:'Yusuf and Brandy (the Hidden Lineage)', type:'personal', status:'active', mode:'authored',
    logline:'Yusuf secretly shepherds Brandy, his great-granddaughter; neither knows the tie.',
    truth:'CANON: Brandy is Yusuf\'s great-granddaughter via his Daeva wife\'s dhampir line; she is the image of his wedding-day bride (his touchstone). He secretly follows and supports her. Nobody on-screen knows. Foreshadowed in Anichka\'s vision V4.', tstate:'fixed' },
  'praxis-vacuum': { title:'The Praxis Vacuum', type:'political', status:'active', mode:'authored',
    logline:'Eve holds Praxis but has not declared how she will govern; the court maneuvers in the gap.',
    truth:'CANON: Eve holds Praxis as the "Carthian Prince experiment"; the Crone backed her claim (a debt). She is weighing an advisory board with veto power while building mortal entanglements. Every Game-1 dossier carries a Praxis angle by design.', tstate:'fixed' },
  'mac-vs-kirk': { title:'Mac vs Kirk', type:'conflict', status:'dormant', mode:'hybrid',
    logline:'Mac ran covert surveillance on Kirk out of hostility; vacated when Kirk\'s player left after Game 1.',
    truth:'Mac (and Doc) covertly watched Kirk through DT1. The thread lost its other half when Kirk Grimm (Phil Gee) departed after Game 1.', tstate:'provisional' },
  'edna-heretic': { title:'Edna, the Secret Heretic', type:'mystery', status:'active', mode:'authored',
    logline:'Edna pursues the office of Bishop while concealing that she is a heretic with shaken faith.',
    truth:'CANON: Edna Judge is a secret heretic. Yusuf has noticed "something doesn\'t ring true" but cannot place it; the Cacophony whispers "someone in the Lance is not what they appear."', tstate:'fixed' },
  'cyrus-helena-shadow': { title:'Cyrus and Helena\'s Shadow', type:'mystery', status:'active', mode:'hybrid',
    logline:'Cyrus serves as the eyes of his globally-influential sire Helena De Witt; misfortune trails him.',
    truth:'Cyrus reports to his sire Helena De Witt and acts as her eyes/ears; some blame him (or her) for misfortune at past courts. He let her name slip to Alice in DT1. Whether the misfortune is his fault or her shadow is unresolved.', tstate:'provisional' },
  'alice-missing-sire': { title:'Alice\'s Missing Sire', type:'mystery', status:'active', mode:'hybrid',
    logline:'Alice\'s sire vanished chasing a "big truth" he feared was hunting him; she holds the key to his deleted logs.',
    truth:'CANON + emergent: Alice (Embraced London NYE 1999) was a 1990s occult-forum archivist; her sire met her online, was obsessed with a "big truth", grew paranoid something hunted them, then vanished. Whether he was killed for what he knew or merely deluded is the open question that drives her.', tstate:'provisional' },
  'tegan-spy-crone': { title:'Tegan: Spy and the Crone Pull', type:'personal', status:'active', mode:'authored',
    logline:'A Lance spy for her sire, genuinely drawn toward the Crone.',
    truth:'CANON: Tegan is a spy for her sire (the Brigadier-General) reporting on the Praxis, while genuinely curious about the Crone. Anichka wants to convert her and asked to dream of her; Conrad has taken an interest in her "education".', tstate:'fixed' },
  'grimalkin': { title:'The Grimalkin', type:'mystery', status:'dormant', mode:'emergent',
    logline:'An inactive PC seen converging in Anichka\'s vision; the Lance hunter chasing her has since left.',
    truth:'CANON: the Grimalkin is a player character not yet in play; in Anichka\'s vision she converges on Anichka (not conflict), to become the connection when the player joins. Kirk hunted her as a "Crone assassin"; that pursuit vacated when Kirk departed after Game 1.', tstate:'fixed' },
  'melissa-legacy': { title:'Melissa\'s Legacy', type:'personal', status:'seeded', mode:'emergent',
    logline:'Ludica (her ward) and Livia (heir to her library) both orbit a torpid elder who would be proud when she wakes.',
    truth:'EMERGENT: the torpid Invictus elder Melissa connects Ludica (her ward/patron link) and Livia (inherited her library). Her legacy and eventual waking are undefined, for play to settle.', tstate:'emergent' },
};

const slugOf = t => String(t).replace(/^new:/,'');
let count = 0;
for (const [slug, h] of Object.entries(HEADERS)) {
  const recs = links.filter(l => (l.threads||[]).some(t => slugOf(t) === slug));
  const events = recs.map(l => ({
    at: 'DT1', title: l.title || '(action)',
    detail: [l.intent, l.outcome].filter(Boolean).join(' -> '),
    involved: [{ type:'pc', name: norm(l.character) }, ...((l.involved||[]).map(n => ({ type:'pc', name: norm(n) })))],
    source: 'downtime',
  }));
  const knowledge = recs.flatMap(l => (l.knowledge||[]).filter(k=>k.believes).map(k => ({
    claim: k.believes, truth_state: k.truth_state || 'unknown',
    held_by: [{ type:'pc', name: norm(l.character) }], origin:'downtime', since:'DT1',
  })));
  const pcNames = [...new Set(recs.map(l => norm(l.character)))];
  const subjNames = [...new Set(recs.flatMap(l => (l.involved||[]).map(norm)))].filter(n => !pcNames.includes(n));
  const participants = [
    ...pcNames.map(n => ({ ref:{ type:'pc', name:n }, role:'actor' })),
    ...subjNames.map(n => ({ ref:{ type:'pc', name:n }, role:'subject' })),
  ];
  const doc = {
    title: h.title, slug, type: h.type, status: h.status, mode: h.mode, logline: h.logline,
    truth: { summary: h.truth, facts: [{ value: h.truth, state: h.tstate }], st_hidden: true },
    knowledge, events, participants,
    source_window: 'DT1 (Feb/Mar 2026)',
    note: 'Documented from Downtime 1 (Game 1 era). Status as of DT1; may have evolved through DT2-4 / Games 2-5.',
    created_by: by, created_at: now, updated_at: now,
  };
  await db.collection('story_threads').updateOne({ slug }, { $set: doc }, { upsert: true });
  console.log(`${slug.padEnd(26)} ${h.status.padEnd(9)} | ${events.length} events | ${knowledge.length} beliefs | ${participants.length} participants`);
  count++;
}
console.log(`\nBatch 1: wrote ${count} story_threads. Collection now: ${await db.collection('story_threads').countDocuments()}`);
await c.close();
