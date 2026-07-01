// Populate the lore_mastery rubric expected-answers from the approved key.
// Index 7 (Q8) is non-scoring (redundant with Q2). Default DRY-RUN; --apply.
// Run from repo root: node server/scripts/ordeal-lore-rubric-populate.js [--apply]
import 'dotenv/config';
import { MongoClient } from 'mongodb';

const APPLY = process.argv.includes('--apply');

// Expected answers by rubric-doc INDEX (0..44).
const KEY = [
  /*0  Q1 */ 'Vitae.',
  /*1  Q2 */ 'The Beast.',
  /*2  Q3 */ 'Torpor.',
  /*3  Q4 */ 'Blood Potency.',
  /*4  Q5 */ 'The Mask and the Dirge.',
  /*5  Q6 */ 'Touchstones.',
  /*6  Q7 */ 'Sunlight, fire, and a stake to the heart.',
  /*7  Q8 */ 'The Beast.',
  /*8  Q9 */ 'A ghoul.',
  /*9  Q10*/ 'They enter Frenzy.',
  /*10 Q11*/ 'Masquerade, Progeny, and Amaranth.',
  /*11 Q12*/ 'The Carthian Movement, the Circle of the Crone, the Invictus, and the Lancea et Sanctum.',
  /*12 Q13*/ 'Neonates (under 50 years), Ancillae (50-150 years), and Elders (150+ years).',
  /*13 Q14*/ 'Elysium.',
  /*14 Q15*/ "They become Unaligned, with none of a covenant's benefits or protections, and tend to be widely distrusted by the Court.",
  /*15 Q16*/ 'Praxis.',
  /*16 Q17*/ 'Three of: Head of State, Primogen, Socialite, Enforcer, Administrator (any of their versions).',
  /*17 Q18*/ 'Political theatre - court offers diversion, and more fundamentally the power and relevance most vampires crave.',
  /*18 Q19*/ 'Their domain.',
  /*19 Q20*/ 'Yes.',
  /*20 Q21*/ 'Celerity, Resilience, and Vigour.',
  /*21 Q22*/ 'Daeva: Majesty; Gangrel: Protean; Mekhet: Auspex; Nosferatu: Nightmare; Ventrue: Dominate.',
  /*22 Q23*/ '5.',
  /*23 Q24*/ 'Devotions.',
  /*24 Q25*/ 'Non-exclusive Disciplines can be self-taught; a clan-exclusive one needs a teacher with more dots and imbibing 1 Vitae from a vampire with that Discipline. Crúac and Theban only need a teacher.',
  /*25 Q26*/ 'Their Blood Potency.',
  /*26 Qx */ 'No prohibition on Disciplines themselves, but the ban on violence has implications for physical Disciplines.',
  /*27 Q27*/ 'Vitae and/or Willpower.',
  /*28 Q28*/ 'False.',
  /*29 Q29*/ 'Two of: Dominate, Majesty, Obfuscate, Nightmare.',
  /*30 Q30*/ 'Carthian Law, Crúac, Invictus Oaths, and Theban Sorcery.',
  /*31 Q31*/ 'Carthian Law.',
  /*32 Q32*/ 'Crúac.',
  /*33 Q33*/ 'Theban Sorcery.',
  /*34 Q34*/ 'Invictus Oaths.',
  /*35 Q35*/ "No strict mechanical bar to learning Crúac or Theban (you just need a teacher), but the Covenants don't teach outsiders - so in practice you need a dot of Covenant Status, or the Chorister or Laity merit.",
  /*36 Q36*/ 'Carthian Law imposes rules/protocols with metaphysical weight; Invictus Oaths are mystically-binding agreements; Crúac is blood sorcery drawing on the Beast through blood; Theban Sorcery works miracles through faith and a sacrament.',
  /*37 Q37*/ 'Crúac.',
  /*38 Q38*/ 'Former Crone keep rites already learned but learn no new ones; former Lancea learn no new miracles; Invictus Oaths are temporary and expire. Many Oath/Law merits require Covenant Status, so they are lost (Sanctity of Merits applies).',
  /*39 Q39*/ 'Covenant powers are political rather than personal - tools that give a Covenant a competitive advantage.',
  /*40 Q40*/ 'The inherent blood connection between members of the same clan/lineage, stronger the closer the relationship; through it Kindred sense things about their relatives and affect them more easily with powers.',
  /*41 Q41*/ "Clans are the broad 'ethnic groupings' of vampires; bloodlines are specific lineages within them (though some bloodlines break this, being covenant- or multi-clan-based).",
  /*42 Q42*/ 'Daeva: serpents/succubi; Gangrel: savages/beasts; Mekhet: shadows/masterminds; Nosferatu: haunts/uggos; Ventrue: lords/masters.',
  /*43 Q43*/ 'The Kindred.',
  /*44 Q44*/ 'The Daeva.',
];

const NON_SCORING = new Set([7]); // Q8 - redundant with Q2

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db('tm_suite');
const doc = await db.collection('ordeal_rubrics').findOne({ ordeal_type: 'lore_mastery' });
if (!doc) { console.error('No lore_mastery rubric'); process.exit(1); }
const qs = doc.questions || [];
if (qs.length !== KEY.length) { console.error(`MISMATCH: rubric ${qs.length} vs key ${KEY.length}. Aborting.`); process.exit(1); }
// Spot-check the offset region so a drifted doc aborts.
if (!/other vampires in Elysium/i.test(qs[26].question) || !/resources/i.test(qs[27].question)) {
  console.error('ALIGNMENT FAIL at index 26/27. Aborting.'); process.exit(1);
}

const updated = qs.map(q => ({ ...q, expected_answer: KEY[q.index], scored: !NON_SCORING.has(q.index) }));
console.log(`lore_mastery | ${qs.length} questions | scored ${updated.filter(q => q.scored).length} | non-scoring ${[...NON_SCORING].join(',')}`);
for (const q of updated) console.log(`${String(q.index).padStart(2)} | ${q.scored ? 'Y' : '-'} | ${q.expected_answer.slice(0, 80)}`);

if (APPLY) {
  await db.collection('ordeal_rubrics').updateOne({ _id: doc._id }, { $set: { questions: updated } });
  console.log('\nAPPLIED.');
} else {
  console.log('\nDRY-RUN. Re-run with --apply to write.');
}
await client.close();
