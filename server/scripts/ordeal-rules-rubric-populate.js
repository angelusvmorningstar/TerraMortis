// Populate the rules_mastery rubric expected-answers from the approved key.
// Default DRY-RUN (prints the key for eyeball); pass --apply to write.
// Q34 corrected (boons = 1e artifact), Q49 corrected (Willpower + Theban
// sacrament), Q51 retired (non-scoring). Indices align to the rubric doc:
// 0-8 => Q1-9, 9/10 => Q10 a/b, 11-55 => Q11-55.
// Run from repo root:  node server/scripts/ordeal-rules-rubric-populate.js [--apply]
import 'dotenv/config';
import { MongoClient } from 'mongodb';

const APPLY = process.argv.includes('--apply');
const uri = process.env.MONGODB_URI;
if (!uri) { console.error('MONGODB_URI not set'); process.exit(1); }

// Expected answers in rubric-doc INDEX order (0..55).
const KEY = [
  /* 0  Q1  */ `Attribute + Skill + modifiers.`,
  /* 1  Q2  */ `5+ successes.`,
  /* 2  Q3  */ `Adds +3, or +2 for defensive (to a Resistance trait).`,
  /* 3  Q4  */ `Re-roll until a winner is determined.`,
  /* 4  Q5  */ `TRUE.`,
  /* 5  Q6  */ `Blood Potency 6.`,
  /* 6  Q7  */ `Each Vitae taken is 1 lethal damage to the vessel. Taking more Vitae than their Stamina imposes the Drained Condition. A mortal's Vitae depends on Size and Stamina (averaged to 7). For feeding rolls we allow 2 Vitae to be taken without risk to the vessel.`,
  /* 7  Q8  */ `Feed the mortal 1 Vitae and invest 1 Willpower.`,
  /* 8  Q9  */ `The vinculum grows through imbibing a kindred's vitae three times across three separate nights; it can be resisted by spending 1 Willpower and rolling Blood Potency - Vitae ingested.`,
  /* 9  Q10a*/ `TRUE.`,
  /* 10 Q10b*/ `FALSE.`,
  /* 11 Q11 */ `Attribute + Skill + Discipline + modifiers.`,
  /* 12 Q12 */ `A Clash of Wills: all contestants roll off Blood Potency + relevant Discipline (Devotions use the highest-rated relevant Discipline). Ties re-roll until one has more successes. The winner's effect resolves as usual; all others fail.`,
  /* 13 Q13 */ `Animalism, Celerity, Obfuscate, Resilience and Vigour can be self-taught. Auspex, Dominate, Majesty, Nightmare and Protean require a teacher (a vampire with more dots than the student) and the student must imbibe 1 Vitae from a vampire with that Discipline. Cruac and Theban require a teacher but no imbibed Vitae.`,
  /* 14 Q14 */ `Their Blood Potency.`,
  /* 15 Q15 */ `No.`,
  /* 16 Q16 */ `Sunlight, fire, damage, hunger, provocation, humiliation, or intense blood sympathy.`,
  /* 17 Q17 */ `The Bestial Triad is how a vampire approaches confrontation and determines the Condition imposed on another, and which Power Attribute is used when lashing out. Monstrous uses Strength and imposes Bestial; Seductive uses Presence and imposes Wanton; Competitive uses Intelligence and imposes Competitive.`,
  /* 18 Q18 */ `Spend 1 Willpower and roll Resolve + Composure. Successes hold off frenzy for a turn. Repeat until you run out of Willpower (and immediately frenzy) or reach 5 successes. Hitting the threshold gives the benefits of frenzy but you choose the Beast's target and desire.`,
  /* 19 Q19 */ `No specific threshold; any damage can trigger a frenzy check. Penalties increase with more severe damage types and damage to the right-most health boxes.`,
  /* 20 Q20 */ `TRUE.`,
  /* 21 Q21 */ `An experience that threatens to detach the vampire, leading to a potential loss of Humanity.`,
  /* 22 Q22 */ `Dramatic failure: loss of Humanity and the Jaded Condition. Failure: loss of Humanity and the Triad Condition. Success: no loss of Humanity but gain the Triad Condition. Exceptional success: no loss of Humanity and gain the Inspired Condition.`,
  /* 23 Q23 */ `Touchstones only help when attached. An attached Touchstone gives +2 to detachment rolls (+3 for multiple attached); no attached Touchstones gives -2. Losing the final Touchstone can impose the Languid Condition.`,
  /* 24 Q24 */ `They become a draugr, lost to the Beast; the character can no longer be played.`,
  /* 25 Q25 */ `Sunlight and fire.`,
  /* 26 Q26 */ `Roll 1d10 + Initiative Modifier (Dexterity + Composure + modifiers).`,
  /* 27 Q27 */ `Defence is the lower of Wits or Dexterity, + Athletics. Spend 1 Willpower to increase Defence by 2 against the first attacker. Each attacker after the first offsets one point of Defence.`,
  /* 28 Q28 */ `Bashing, lethal and aggravated. Mundane weapons/damage are bashing by default; certain powers and fighting styles inflict lethal, as does sunlight to vampires of Humanity 5+; sunlight, fire and some supernatural powers cause aggravated.`,
  /* 29 Q29 */ `Based on the size and heat of the fire, each on a roughly 0-3 aggravated scale, summed together.`,
  /* 30 Q30 */ `1 Vitae heals 2 bashing or 1 lethal. 1 aggravated requires 5 Vitae and a full day's sleep.`,
  /* 31 Q31 */ `The Social Manoeuvring system.`,
  /* 32 Q32 */ `Resolve a temporary Condition to gain a Beat. A Persistent Condition gives a Beat once per session when it impacts the character.`,
  /* 33 Q33 */ `Fulfilling the easier (Mask) condition regains 1 Willpower; fulfilling the harsher (Dirge) condition regains all Willpower. Each can only be invoked once per session.`,
  /* 34 Q34 */ `Boons are an artifact of 1st Edition; in 2nd Edition they are not a real mechanic. (Question is meant to guide players to recognise boons are not a 2e thing.)`,
  /* 35 Q35 */ `TRUE.`,
  /* 36 Q36 */ `A stake through the heart, starvation of Vitae, or the last health box filled with lethal damage.`,
  /* 37 Q37 */ `Once Removed (childe/sire): +3, no range limit. Twice Removed (siblings, grandchilder, grandsires): +2, same continent. Thrice Removed (cousins, aunts/uncles, great-grandsires/childer): +1, same city. Everyone else (clanmates): no modifier, within a kilometre.`,
  /* 38 Q38 */ `Add a die bonus based on the degree of sympathy; this is doubled for Cruac.`,
  /* 39 Q39 */ `Blood Potency and Humanity together: Humanity sets the baseline duration and Blood Potency multiplies it.`,
  /* 40 Q40 */ `Automatically on torpor or Final Death; through emotional intensity at Storyteller discretion; otherwise initiated by spending 1 Willpower and rolling Wits + Blood Sympathy bonus.`,
  /* 41 Q41 */ `Put into torpor until the stake is extracted; while staked they are unaware of their surroundings.`,
  /* 42 Q42 */ `Depends on Blood Potency, initially 1:1, becoming 10 and 15 at Blood Potency 9 and 10 respectively.`,
  /* 43 Q43 */ `Drinking all the Vitae from another vampire, and thus their soul, causing Final Death.`,
  /* 44 Q44 */ `The Kiss is non-violent feeding: it induces euphoria/invigoration, leaves an unclear memory, and imposes the Swooning Condition on the mortal.`,
  /* 45 Q45 */ `Amount/kind depends on Humanity (1 lethal up to 5 aggravated); frequency depends on Blood Potency (once every ten minutes up to 5 times a turn).`,
  /* 46 Q46 */ `Rites are acquired by buying dots of Cruac or Theban Sorcery as a Discipline, then acquiring rites of that level or lower. Performing a Rite has a target number of successes, rolled over a number of rolls equal to the dice pool; once reached, the next roll sets the potency.`,
  /* 47 Q47 */ `No inherent mechanical impact, but specific mechanics can apply: e.g. Oubliette (Obfuscate 5), Lord of the Land (Animalism 5), Lex Terrae, Oath of Serfdom.`,
  /* 48 Q48 */ `A dice pool bonus to feeding rolls.`,
  /* 49 Q49 */ `Willpower. Theban rites additionally require a sacrament/offering (different books use different terms).`,
  /* 50 Q50 */ `Yes.`,
  /* 51 Q51 */ `[RETIRED: not scored - duplicates Q12 Clash of Wills]`,
  /* 52 Q52 */ `0-5 dots.`,
  /* 53 Q53 */ `Both are game states. Conditions attach to a character and have character-driven resolutions or expire over time. Tilts are situational scene modifiers and affect combat only.`,
  /* 54 Q54 */ `Specialised applications of a Discipline (or combination). They operate like a Discipline and may only be purchased with the correct prerequisite Discipline dots.`,
  /* 55 Q55 */ `Several shared merits typically (but not explicitly) require a coterie - chiefly Safe Place and Haven.`,
];

const NON_SCORING = new Set([51]); // Q51 retired

// expected leading question number per index, for a sanity check before writing
const expectedNum = i => (i <= 8 ? i + 1 : i === 9 || i === 10 ? 10 : i);

const client = new MongoClient(uri);
await client.connect();
const db = client.db('tm_suite');

const doc = await db.collection('ordeal_rubrics').findOne({ ordeal_type: 'rules_mastery' });
if (!doc) { console.error('No rules_mastery rubric doc found'); process.exit(1); }
const qs = doc.questions || [];
if (qs.length !== KEY.length) { console.error(`MISMATCH: rubric has ${qs.length} questions, key has ${KEY.length}. Aborting.`); process.exit(1); }

// Sanity-check alignment: each slot's leading number must match the index map.
for (const q of qs) {
  const i = q.index;
  const lead = parseInt(String(q.question).match(/^\s*(\d+)/)?.[1] ?? '', 10);
  if (lead !== expectedNum(i)) {
    console.error(`ALIGNMENT FAIL at index ${i}: question starts "${String(q.question).slice(0, 40)}" (got ${lead}, expected ${expectedNum(i)}). Aborting.`);
    process.exit(1);
  }
}

const updated = qs.map(q => ({
  ...q,
  expected_answer: KEY[q.index],
  scored: !NON_SCORING.has(q.index),
}));

console.log(`Rubric: rules_mastery, ${qs.length} questions. Scored: ${updated.filter(q => q.scored).length}, non-scoring: ${[...NON_SCORING].join(', ') || 'none'}.`);
console.log('--- key to be written (index | scored | answer) ---');
for (const q of updated) {
  console.log(`${String(q.index).padStart(2)} | ${q.scored ? 'Y' : '-'} | ${q.expected_answer.slice(0, 90)}`);
}

if (APPLY) {
  await db.collection('ordeal_rubrics').updateOne({ _id: doc._id }, { $set: { questions: updated } });
  console.log('\nAPPLIED: expected-answers written.');
} else {
  console.log('\nDRY-RUN. Re-run with --apply to write.');
}
await client.close();
